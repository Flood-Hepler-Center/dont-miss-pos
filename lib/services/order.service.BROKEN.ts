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
  writeBatch,
  arrayUnion,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { recipeService } from './recipe.service';
import type { Order, OrderStatus, OrderItem, CreateOrderInput } from '@/types';

const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'CANCELLED'],
  SERVED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const orderService = {
  async create(input: CreateOrderInput): Promise<string> {
    try {
      if (!input.items || input.items.length === 0) {
        throw new Error('Cannot submit empty order');
      }

      // ✅ Check inventory availability for all items with recipes
      for (const item of input.items) {
        if (item.menuItemId) {
          const availability = await recipeService.checkInventoryAvailability(
            item.menuItemId,
            item.quantity
          );
          if (!availability.available) {
            throw new Error(
              `Insufficient ingredients: ${availability.missingIngredients.join(', ')}`
            );
          }
        }
      }

      const tableNum = parseInt(input.tableId, 10);
      if (!input.tableId || isNaN(tableNum) || tableNum < 1 || tableNum > 20) {
        throw new Error('Invalid table number');
      }

      let subtotal = 0;
      input.items.forEach((item) => {
        const itemTotal = item.price * item.quantity;
        const modifierTotal = item.modifiers?.reduce(
          (sum, mod) => sum + mod.priceAdjustment * item.quantity,
          0
        ) || 0;
        subtotal += itemTotal + modifierTotal;
      });

      const tax = 0;
      const total = subtotal;

      const orderRef = doc(collection(db, 'orders'));
      await setDoc(orderRef, {
        tableId: input.tableId,
        sessionId: input.sessionId,
        items: input.items,
        subtotal,
        tax,
        total,
        status: 'PLACED' as OrderStatus,
        entryMethod: input.entryMethod || 'QR',
        createdBy: input.createdBy || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'tables', input.tableId), {
        status: 'OCCUPIED',
        activeOrders: arrayUnion(orderRef.id),
        updatedAt: serverTimestamp(),
      });

      // ✅ Deduct inventory for items with recipes
      try {
        await recipeService.deductInventoryForOrder(
          orderRef.id,
          input.items.map(item => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            name: item.name,
          }))
        );
      } catch (inventoryError) {
        console.warn('Inventory deduction failed:', inventoryError);
      }

      return orderRef.id;
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<Order | null> {
    try {
      const docRef = doc(db, 'orders', id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return null;
      return { id: docSnap.id, ...docSnap.data() } as Order;
    } catch (error) {
      console.error('Error fetching order:', error);
      return null;
    }
  },

  async getByTable(tableId: string): Promise<Order[]> {
    try {
      const q = query(
        collection(db, 'orders'),
        where('tableId', '==', tableId),
        where('status', 'in', ['PLACED', 'PREPARING', 'READY'])
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
    } catch (error) {
      console.error('Error fetching orders by table:', error);
      return [];
    }
  },

  async updateStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        throw new Error('Order not found');
      }

      const currentStatus = orderSnap.data().status as OrderStatus;
      const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];

      if (!allowedTransitions.includes(newStatus)) {
        throw new Error(`Cannot transition from ${currentStatus} to ${newStatus}`);
      }

      await updateDoc(orderRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  },

  async voidItem(
    orderId: string,
    itemIndex: number,
    reason: string,
    staffId: string
  ): Promise<void> {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        throw new Error('Order not found');
      }

      const orderData = orderSnap.data() as Order;
      const items = [...orderData.items];

      if (itemIndex < 0 || itemIndex >= items.length) {
        throw new Error('Invalid item index');
      }

      items[itemIndex] = {
        ...items[itemIndex],
        isVoided: true,
        voidReason: reason,
        voidedBy: staffId,
        voidedAt: new Date(),
      };

      let subtotal = 0;
      items.forEach((item) => {
        if (!item.isVoided) {
          const itemTotal = item.price * item.quantity;
          const modifierTotal = item.modifiers?.reduce(
            (sum, mod) => sum + mod.priceAdjustment * item.quantity,
            0
          ) || 0;
          subtotal += itemTotal + modifierTotal;
        }
      });

      const tax = 0;
      const total = subtotal;

      await updateDoc(orderRef, {
        items,
        subtotal,
        tax,
        total,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error voiding item:', error);
      throw error;
    }
  },

  async updateQuantity(
    orderId: string,
    itemIndex: number,
    newQuantity: number
  ): Promise<void> {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        throw new Error('Order not found');
      }

      const orderData = orderSnap.data() as Order;
      const items = [...orderData.items];

      if (itemIndex < 0 || itemIndex >= items.length) {
        throw new Error('Invalid item index');
      }

      items[itemIndex] = {
        ...items[itemIndex],
        quantity: newQuantity,
        subtotal: items[itemIndex].price * newQuantity,
      };

      let subtotal = 0;
      items.forEach((item) => {
        if (!item.isVoided) {
          const itemTotal = item.price * item.quantity;
          const modifierTotal = item.modifiers?.reduce(
            (sum, mod) => sum + mod.priceAdjustment * item.quantity,
            0
          ) || 0;
          subtotal += itemTotal + modifierTotal;
        }
      });

      const tax = 0;
      const total = subtotal;

      await updateDoc(orderRef, {
        items,
        subtotal,
        tax,
        total,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating quantity:', error);
      throw error;
    }
  },

  async removeItem(orderId: string, itemIndex: number): Promise<void> {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        throw new Error('Order not found');
      }

      const orderData = orderSnap.data() as Order;
      const items = [...orderData.items];

      if (itemIndex < 0 || itemIndex >= items.length) {
        throw new Error('Invalid item index');
      }

      items.splice(itemIndex, 1);

      let subtotal = 0;
      items.forEach((item) => {
        if (!item.isVoided) {
          const itemTotal = item.price * item.quantity;
          const modifierTotal = item.modifiers?.reduce(
            (sum, mod) => sum + mod.priceAdjustment * item.quantity,
            0
          ) || 0;
          subtotal += itemTotal + modifierTotal;
        }
      });

      const tax = 0;
      const total = subtotal;

      await updateDoc(orderRef, {
        items,
        subtotal,
        tax,
        total,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error removing item:', error);
      throw error;
    }
  },
};