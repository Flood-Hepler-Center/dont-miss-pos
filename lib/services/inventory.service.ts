import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { 
  InventoryItem, 
  StockAdjustmentInput,
  Order,
} from '@/types';

export const inventoryService = {
  async getAll(): Promise<InventoryItem[]> {
    try {
      const q = query(
        collection(db, 'inventoryItems'),
        where('isActive', '==', true),
        orderBy('name', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as InventoryItem[];
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      throw new Error('Failed to fetch inventory items');
    }
  },

  async getById(id: string): Promise<InventoryItem | null> {
    try {
      const docRef = doc(db, 'inventoryItems', id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        return null;
      }
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as InventoryItem;
    } catch (error) {
      console.error('Error fetching inventory item:', error);
      throw new Error('Failed to fetch inventory item');
    }
  },

  async getLowStock(): Promise<InventoryItem[]> {
    try {
      const allItems = await this.getAll();
      return allItems.filter(
        (item) => item.currentStock <= item.reorderPoint
      );
    } catch (error) {
      console.error('Error fetching low stock items:', error);
      throw new Error('Failed to fetch low stock items');
    }
  },

  async adjustStock(
    itemId: string,
    adjustment: StockAdjustmentInput
  ): Promise<void> {
    try {
      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'inventoryItems', itemId);
        const itemSnap = await transaction.get(itemRef);

        if (!itemSnap.exists()) {
          throw new Error('Inventory item not found');
        }

        const itemData = itemSnap.data();
        const previousStock = itemData.currentStock || 0;
        const newStock = adjustment.type === 'SET_EXACT' 
          ? adjustment.quantity 
          : previousStock + adjustment.quantity;

        if (newStock < 0) {
          throw new Error('Insufficient stock');
        }

        transaction.update(itemRef, {
          currentStock: newStock,
          updatedAt: serverTimestamp(),
        });

        const movementRef = doc(collection(db, 'stockMovements'));
        transaction.set(movementRef, {
          inventoryItemId: itemId,
          inventoryItemName: itemData.name,
          type: adjustment.type,
          quantity: adjustment.quantity,
          reason: adjustment.reason || '',
          performedBy: adjustment.performedBy || 'system',
          timestamp: serverTimestamp(),
          previousStock,
          newStock,
        });
      });
    } catch (error) {
      console.error('Error adjusting stock:', error);
      throw new Error('Failed to adjust stock');
    }
  },

  async deductFromOrder(order: Order): Promise<void> {
    try {
      const batch = writeBatch(db);
      const menuItemsSnapshot = await getDocs(collection(db, 'menuItems'));
      const menuItemsMap = new Map(
        menuItemsSnapshot.docs.map((d) => [d.id, d.data()])
      );

      for (const orderItem of order.items) {
        const menuItem = menuItemsMap.get(orderItem.menuItemId);
        if (!menuItem || !menuItem.recipe || menuItem.recipe.length === 0) {
          continue;
        }

        for (const ingredient of menuItem.recipe) {
          const inventoryRef = doc(db, 'inventoryItems', ingredient.inventoryItemId);
          const inventorySnap = await getDoc(inventoryRef);

          if (!inventorySnap.exists()) {
            continue;
          }

          const inventoryData = inventorySnap.data();
          const previousStock = inventoryData.currentStock || 0;
          const deductionAmount = ingredient.quantity * orderItem.quantity;
          const newStock = previousStock - deductionAmount;

          if (newStock < 0) {
            throw new Error(`Insufficient stock for ${ingredient.inventoryItemId}`);
          }

          batch.update(inventoryRef, {
            currentStock: newStock,
            updatedAt: serverTimestamp(),
          });

          const movementRef = doc(collection(db, 'stockMovements'));
          batch.set(movementRef, {
            inventoryItemId: ingredient.inventoryItemId,
            inventoryItemName: inventoryData.name,
            type: 'DEDUCTION',
            quantity: -deductionAmount,
            reason: 'Order deduction',
            relatedOrderId: order.id,
            performedBy: 'system',
            timestamp: serverTimestamp(),
            previousStock,
            newStock,
          });
        }
      }

      await batch.commit();
    } catch (error) {
      console.error('Error deducting inventory from order:', error);
      throw new Error('Failed to deduct inventory from order');
    }
  },

  async reverseVoid(order: Order): Promise<void> {
    try {
      const batch = writeBatch(db);
      const menuItemsSnapshot = await getDocs(collection(db, 'menuItems'));
      const menuItemsMap = new Map(
        menuItemsSnapshot.docs.map((d) => [d.id, d.data()])
      );

      for (const orderItem of order.items) {
        const menuItem = menuItemsMap.get(orderItem.menuItemId);
        if (!menuItem || !menuItem.recipe || menuItem.recipe.length === 0) {
          continue;
        }

        for (const ingredient of menuItem.recipe) {
          const inventoryRef = doc(db, 'inventoryItems', ingredient.inventoryItemId);
          const inventorySnap = await getDoc(inventoryRef);

          if (!inventorySnap.exists()) {
            continue;
          }

          const inventoryData = inventorySnap.data();
          const previousStock = inventoryData.currentStock || 0;
          const reversalAmount = ingredient.quantity * orderItem.quantity;
          const newStock = previousStock + reversalAmount;

          batch.update(inventoryRef, {
            currentStock: newStock,
            updatedAt: serverTimestamp(),
          });

          const movementRef = doc(collection(db, 'stockMovements'));
          batch.set(movementRef, {
            inventoryItemId: ingredient.inventoryItemId,
            inventoryItemName: inventoryData.name,
            type: 'VOID_REVERSAL',
            quantity: reversalAmount,
            reason: 'Order void reversal',
            relatedOrderId: order.id,
            performedBy: 'system',
            timestamp: serverTimestamp(),
            previousStock,
            newStock,
          });
        }
      }

      await batch.commit();
    } catch (error) {
      console.error('Error reversing void:', error);
      throw new Error('Failed to reverse void');
    }
  },

  async createItem(data: Partial<InventoryItem>): Promise<string> {
    try {
      const docRef = doc(collection(db, 'inventoryItems'));
      await setDoc(docRef, {
        ...data,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating inventory item:', error);
      throw new Error('Failed to create inventory item');
    }
  },

  async updateItem(id: string, data: Partial<InventoryItem>): Promise<void> {
    try {
      const docRef = doc(db, 'inventoryItems', id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating inventory item:', error);
      throw new Error('Failed to update inventory item');
    }
  },
};
