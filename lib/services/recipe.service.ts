import { db } from '@/lib/firebase/config';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import type { Recipe, InventoryItem, StockMovement } from '@/types';

export const recipeService = {
  async create(recipeData: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const recipeRef = doc(collection(db, 'recipes'));
      await setDoc(recipeRef, {
        ...recipeData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return recipeRef.id;
    } catch (error) {
      console.error('Error creating recipe:', error);
      throw new Error('Failed to create recipe');
    }
  },

  async getById(id: string): Promise<Recipe | null> {
    try {
      const recipeDoc = await getDoc(doc(db, 'recipes', id));
      if (!recipeDoc.exists()) return null;
      return { id: recipeDoc.id, ...recipeDoc.data() } as Recipe;
    } catch (error) {
      console.error('Error fetching recipe:', error);
      return null;
    }
  },

  async getByMenuItemId(menuItemId: string): Promise<Recipe | null> {
    try {
      const q = query(
        collection(db, 'recipes'),
        where('menuItemId', '==', menuItemId),
        where('isActive', '==', true)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() } as Recipe;
    } catch (error) {
      console.error('Error fetching recipe by menu item:', error);
      return null;
    }
  },

  async getAll(): Promise<Recipe[]> {
    try {
      const q = query(collection(db, 'recipes'), where('isActive', '==', true));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recipe));
    } catch (error) {
      console.error('Error fetching recipes:', error);
      return [];
    }
  },

  async update(id: string, updates: Partial<Recipe>): Promise<void> {
    try {
      await updateDoc(doc(db, 'recipes', id), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating recipe:', error);
      throw new Error('Failed to update recipe');
    }
  },

  async delete(id: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'recipes', id), {
        isActive: false,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error deleting recipe:', error);
      throw new Error('Failed to delete recipe');
    }
  },

  /**
   * Check if there's enough inventory to fulfill an order
   */
  async checkInventoryAvailability(
    menuItemId: string,
    quantity: number,
    recipeMultiplier: number = 1.0
  ): Promise<{ available: boolean; missingIngredients: string[] }> {
    try {
      const recipe = await this.getByMenuItemId(menuItemId);
      if (!recipe) {
        return { available: true, missingIngredients: [] }; // No recipe = no inventory check
      }

      const missingIngredients: string[] = [];

      for (const ingredient of recipe.ingredients) {
        const inventoryDoc = await getDoc(doc(db, 'inventory', ingredient.inventoryItemId));
        if (!inventoryDoc.exists()) {
          missingIngredients.push(ingredient.inventoryItemName);
          continue;
        }

        const inventoryItem = inventoryDoc.data() as InventoryItem;
        const recipeYield = recipe.yield || 1;
        const requiredQty = (ingredient.quantity * quantity * recipeMultiplier) / recipeYield;

        if (inventoryItem.currentStock < requiredQty) {
          missingIngredients.push(
            `${ingredient.inventoryItemName} (need ${requiredQty}${ingredient.unit}, have ${inventoryItem.currentStock}${ingredient.unit})`
          );
        }
      }

      return {
        available: missingIngredients.length === 0,
        missingIngredients,
      };
    } catch (error) {
      console.error('Error checking inventory availability:', error);
      return { available: false, missingIngredients: ['Error checking inventory'] };
    }
  },

  /**
   * Deduct inventory when an order is placed
   */
  async deductInventoryForOrder(
    orderId: string,
    items: Array<{ 
      menuItemId: string; 
      quantity: number; 
      name: string;
      modifiers?: Array<{ recipeMultiplier?: number }>;
    }>
  ): Promise<void> {
    try {
      // STEP 1: Fetch all recipes BEFORE starting the transaction
      // This is critical - Firestore transactions require all reads to be done via transaction.get()
      // Recipe queries use where() clauses which aren't transactional, so we do them first
      const recipeData: Array<{ item: typeof items[0]; recipe: Recipe; recipeMultiplier: number }> = [];
      
      for (const item of items) {
        const recipe = await this.getByMenuItemId(item.menuItemId);
        
        if (!recipe) {
          continue;
        }

        // Validate recipe.yield to prevent NaN
        const recipeYield = recipe.yield || 1;
        if (recipeYield <= 0 || recipe.yield === undefined) {
          console.warn(`⚠️ Invalid recipe yield for ${item.name}: ${recipeYield}. Recipe must have yield > 0. Using fallback yield of 1.`);
        }

        // Calculate recipe multiplier from modifiers
        let recipeMultiplier = 1.0;
        if (item.modifiers && item.modifiers.length > 0) {
          const modifierWithMultiplier = item.modifiers.find(m => m.recipeMultiplier && m.recipeMultiplier > 0);
          if (modifierWithMultiplier && modifierWithMultiplier.recipeMultiplier) {
            recipeMultiplier = modifierWithMultiplier.recipeMultiplier;
          }
        }

        recipeData.push({ item, recipe, recipeMultiplier });
      }

      // STEP 2: Execute transaction with all inventory reads and writes
      // Now all reads use transaction.get() and happen before writes
      await runTransaction(db, async (transaction) => {
        const inventoryDocs = new Map<string, { ref: any, data: InventoryItem, cumulativeDeduction: number }>();
        const movements: StockMovement[] = [];

        // PHASE 2a: Perform all reads
        for (const { recipe } of recipeData) {
          for (const ingredient of recipe.ingredients) {
            if (!inventoryDocs.has(ingredient.inventoryItemId)) {
              const inventoryRef = doc(db, 'inventory', ingredient.inventoryItemId);
              const inventoryDoc = await transaction.get(inventoryRef);
              if (inventoryDoc.exists()) {
                inventoryDocs.set(ingredient.inventoryItemId, {
                  ref: inventoryRef,
                  data: inventoryDoc.data() as InventoryItem,
                  cumulativeDeduction: 0,
                });
              }
            }
          }
        }

        // PHASE 2b: Process deductions in memory
        for (const { item, recipe, recipeMultiplier } of recipeData) {
          for (const ingredient of recipe.ingredients) {
            const context = inventoryDocs.get(ingredient.inventoryItemId);
            if (!context) continue;

            const recipeYield = recipe.yield || 1;
            const deductQty = (ingredient.quantity * item.quantity * recipeMultiplier) / recipeYield;
            
            // Safety check: Ensure deductQty is a valid number
            if (!Number.isFinite(deductQty) || deductQty < 0) {
              continue;
            }

            const previousStock = context.data.currentStock - context.cumulativeDeduction;
            context.cumulativeDeduction += deductQty;
            const newStock = previousStock - deductQty;

            movements.push({
              id: '',
              inventoryItemId: ingredient.inventoryItemId,
              inventoryItemName: ingredient.inventoryItemName,
              type: 'DEDUCTION',
              quantity: deductQty,
              unit: ingredient.unit,
              reason: `Order ${orderId} - ${item.name} x${item.quantity}`,
              relatedOrderId: orderId,
              performedBy: 'system',
              timestamp: new Date(), // Local fallback, will be replaced in rendering if needed
              previousStock,
              newStock,
            });
          }
        }

        // PHASE 2c: Perform all writes
        for (const context of Array.from(inventoryDocs.values())) {
          if (context.cumulativeDeduction > 0) {
            // NOTE: Negative stock is intentionally allowed here.
            // Real-world recipe usage has ±10–15% variance so inventory
            // is best-effort tracking only. Orders are never blocked by
            // recipe-layer stock — only item-level hasStockTracking does that.
            transaction.update(context.ref, {
              currentStock: context.data.currentStock - context.cumulativeDeduction,
              updatedAt: serverTimestamp(),
            });
          }
        }

        // Log all stock movements
        for (const movement of movements) {
          const movementRef = doc(collection(db, 'stockMovements'));
          transaction.set(movementRef, {
            ...movement,
            id: movementRef.id,
            timestamp: serverTimestamp(),
          });
        }
      });
    } catch (error) {
      console.error('❌ Error deducting inventory:', error);
      throw error;
    }
  },
};

export const inventoryService = {
  async getAll(): Promise<InventoryItem[]> {
    try {
      const q = query(collection(db, 'inventory'), where('isActive', '==', true));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
    } catch (error) {
      console.error('Error fetching inventory:', error);
      return [];
    }
  },

  async getById(id: string): Promise<InventoryItem | null> {
    try {
      const docSnap = await getDoc(doc(db, 'inventory', id));
      if (!docSnap.exists()) return null;
      return { id: docSnap.id, ...docSnap.data() } as InventoryItem;
    } catch (error) {
      console.error('Error fetching inventory item:', error);
      return null;
    }
  },

  async create(itemData: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const itemRef = doc(collection(db, 'inventory'));
      await setDoc(itemRef, {
        ...itemData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return itemRef.id;
    } catch (error) {
      console.error('Error creating inventory item:', error);
      throw new Error('Failed to create inventory item');
    }
  },

  async update(id: string, updates: Partial<InventoryItem>): Promise<void> {
    try {
      await updateDoc(doc(db, 'inventory', id), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating inventory item:', error);
      throw new Error('Failed to update inventory item');
    }
  },

  async adjustStock(
    id: string,
    quantity: number,
    reason: string,
    performedBy: string
  ): Promise<void> {
    try {
      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'inventory', id);
        const itemDoc = await transaction.get(itemRef);

        if (!itemDoc.exists()) {
          throw new Error('Inventory item not found');
        }

        const item = itemDoc.data() as InventoryItem;
        const newStock = item.currentStock + quantity;

        transaction.update(itemRef, {
          currentStock: newStock,
          updatedAt: serverTimestamp(),
        });

        const movementRef = doc(collection(db, 'stockMovements'));
        transaction.set(movementRef, {
          inventoryItemId: id,
          inventoryItemName: item.name,
          movementType: quantity > 0 ? 'IN' : 'ADJUSTMENT',
          quantity: Math.abs(quantity),
          unit: item.unit,
          reason,
          performedBy,
          timestamp: serverTimestamp(),
          previousStock: item.currentStock,
          newStock,
        });
      });
    } catch (error) {
      console.error('Error adjusting stock:', error);
      throw error;
    }
  },

  async getLowStockItems(): Promise<InventoryItem[]> {
    try {
      const items = await this.getAll();
      return items.filter(item => item.currentStock <= item.reorderPoint);
    } catch (error) {
      console.error('Error fetching low stock items:', error);
      return [];
    }
  },
};
