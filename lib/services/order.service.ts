import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  onSnapshot,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { recipeService } from './recipe.service';
import type { Order, OrderStatus, CreateOrderInput, OrderType } from '@/types';

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

      // Validate orderType
      if (!input.orderType) {
        throw new Error('Order type is required');
      }

      // NOTE: Recipe/inventory layer is intentionally NOT checked here.
      // Real-world recipes have ±10-15% variance, so only item-level stock
      // (hasStockTracking) is enforced. Inventory deduction still happens
      // after the order is created but will never block the order.

      // Validate based on order type
      if (input.orderType === 'DINE_IN') {
        // Table ID is optional for DINE_IN - allows pre-seated ordering
        // If provided, validate table number
        if (input.tableId) {
          const tableNum = parseInt(input.tableId, 10);
          if (isNaN(tableNum) || tableNum < 1 || tableNum > 20) {
            throw new Error('Invalid table number');
          }
        }
      }

      if (input.orderType === 'TAKE_AWAY') {
        if (!input.customerName?.trim()) {
          throw new Error('Customer name is required for take-away orders');
        }
        if (!input.customerPhone?.trim()) {
          throw new Error('Phone number is required for take-away orders');
        }
        // Phone validation: 10 digits starting with 0
        const phoneRegex = /^0\d{9}$/;
        if (!phoneRegex.test(input.customerPhone)) {
          throw new Error('Phone must be 10 digits starting with 0');
        }
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

      // Build order document
      const orderData: Record<string, unknown> = {
        orderType: input.orderType,
        tableId: input.tableId || null,
        sessionId: input.sessionId || null,
        items: input.items,
        subtotal,
        tax,
        total,
        status: 'PLACED' as OrderStatus,
        entryMethod: input.entryMethod || 'QR',
        createdBy: input.createdBy || null,
        placedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Add customer info for take-away
      if (input.orderType === 'TAKE_AWAY') {
        orderData.customerName = input.customerName?.trim();
        orderData.customerPhone = input.customerPhone?.trim();
        if (input.customerEmail?.trim()) {
          orderData.customerEmail = input.customerEmail.trim();
        }
        if (input.pickupTime) {
          orderData.pickupTime = input.pickupTime;
        }
      }

      if (input.specialInstructions?.trim()) {
        orderData.specialInstructions = input.specialInstructions.trim();
      }

      const today = new Date();
      // YYYYMMDD format safely
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const seqRef = doc(db, 'orderSequences', dateStr);

      const orderId = await runTransaction(db, async (transaction) => {
        // --- 1. ALL READS ---
        const seqSnap = await transaction.get(seqRef);
        
        // Prepare arrays to hold item references and data for stock deduction
        const itemRefsData: { ref: ReturnType<typeof doc>; newStock: number }[] = [];
        
        // Read all menu items to check stock
        for (const item of input.items) {
          if (item.menuItemId) {
            const itemRef = doc(db, 'menuItems', item.menuItemId);
            const itemSnap = await transaction.get(itemRef);
            if (!itemSnap.exists()) {
              throw new Error(`Menu item not found: ${item.name}`);
            }
            const itemData = itemSnap.data();
            if (itemData.hasStockTracking) {
              const currentStock = itemData.stock || 0;
              if (currentStock < item.quantity) {
                throw new Error(`Insufficient stock for ${item.name}. Only ${currentStock} left.`);
              }
              itemRefsData.push({ ref: itemRef, newStock: currentStock - item.quantity });
            }
          }
        }

        // --- 2. ALL WRITES ---
        let newSequence = 1;

        if (seqSnap.exists()) {
          newSequence = (seqSnap.data().lastSequence || 0) + 1;
          transaction.update(seqRef, { lastSequence: newSequence, updatedAt: serverTimestamp() });
        } else {
          transaction.set(seqRef, { date: dateStr, lastSequence: newSequence, updatedAt: serverTimestamp() });
        }
        
        // Update stock
        for (const update of itemRefsData) {
          transaction.update(update.ref, { 
            stock: update.newStock, 
            updatedAt: serverTimestamp() 
          });
        }

        const orderNumber = `ORD-${dateStr}-${newSequence.toString().padStart(3, '0')}`;
        orderData.orderNumber = orderNumber;

        const orderRef = doc(collection(db, 'orders'));
        transaction.set(orderRef, orderData);

        // Update table status only for dine-in orders
        if (input.orderType === 'DINE_IN' && input.tableId) {
          const tableRef = doc(db, 'tables', input.tableId);
          transaction.update(tableRef, {
            status: 'OCCUPIED',
            activeOrders: arrayUnion(orderRef.id),
            updatedAt: serverTimestamp(),
          });
        }

        return orderRef.id;
      });

      try {
        await recipeService.deductInventoryForOrder(
          orderId,
          input.items.map(item => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            name: item.name,
            modifiers: item.modifiers,
          }))
        );
      } catch (inventoryError) {
        console.error('❌ Inventory deduction failed:', inventoryError);
        console.error('Order ID:', orderId);
        console.error('Items:', input.items);
        // Don't throw - allow order to be created even if inventory fails
      }

      return orderId;
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

      const updateData: Record<string, unknown> = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      };

      if (newStatus === 'PREPARING') updateData.preparingAt = serverTimestamp();
      if (newStatus === 'READY')     updateData.readyAt = serverTimestamp();
      if (newStatus === 'SERVED')    updateData.servedAt = serverTimestamp();
      if (newStatus === 'COMPLETED') updateData.completedAt = serverTimestamp();

      await updateDoc(orderRef, updateData);
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  },

  /**
   * Advance a single item's status and auto-derive the overall order status.
   * Follows: PLACED → PREPARING → READY → SERVED (per item)
   */
  async updateItemStatus(
    orderId: string,
    itemIndex: number,
    newItemStatus: 'PLACED' | 'PREPARING' | 'READY' | 'SERVED'
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

      items[itemIndex] = { ...items[itemIndex], itemStatus: newItemStatus };

      // Auto-derive overall order status from all non-void items
      const activeItems = items.filter((i) => !i.isVoided);
      const getEffectiveStatus = (s?: string) => s || 'PLACED';

      let derivedStatus: OrderStatus;
      if (activeItems.every((i) => getEffectiveStatus(i.itemStatus) === 'SERVED')) {
        derivedStatus = 'SERVED';
      } else if (activeItems.every((i) => ['READY', 'SERVED'].includes(getEffectiveStatus(i.itemStatus)))) {
        derivedStatus = 'READY';
      } else if (activeItems.some((i) => ['PREPARING', 'READY', 'SERVED'].includes(getEffectiveStatus(i.itemStatus)))) {
        derivedStatus = 'PREPARING';
      } else {
        derivedStatus = 'PLACED';
      }

      const updateData: Record<string, unknown> = {
        items,
        status: derivedStatus,
        updatedAt: serverTimestamp(),
      };

      if (derivedStatus === 'PREPARING' && orderData.status === 'PLACED') {
        updateData.preparingAt = serverTimestamp();
      }
      if (derivedStatus === 'READY') updateData.readyAt = serverTimestamp();
      if (derivedStatus === 'SERVED') updateData.servedAt = serverTimestamp();

      await updateDoc(orderRef, updateData);
    } catch (error) {
      console.error('Error updating item status:', error);
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

  // Query methods for take-away orders
  async getByOrderType(orderType: OrderType): Promise<Order[]> {
    try {
      const q = query(
        collection(db, 'orders'),
        where('orderType', '==', orderType),
        where('status', 'in', ['PLACED', 'PREPARING', 'READY'])
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
    } catch (error) {
      console.error('Error fetching orders by type:', error);
      return [];
    }
  },

  async getPendingTakeAways(): Promise<Order[]> {
    try {
      const q = query(
        collection(db, 'orders'),
        where('orderType', '==', 'TAKE_AWAY'),
        where('status', 'in', ['PLACED', 'PREPARING', 'READY'])
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
    } catch (error) {
      console.error('Error fetching pending take-aways:', error);
      return [];
    }
  },

  async getTakeAwaysForCashier(): Promise<Order[]> {
    try {
      const q = query(
        collection(db, 'orders'),
        where('orderType', '==', 'TAKE_AWAY'),
        where('status', 'in', ['READY', 'COMPLETED'])
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
    } catch (error) {
      console.error('Error fetching take-aways for cashier:', error);
      return [];
    }
  },

  /**
   * Get incomplete orders by session ID (for customer order history)
   */
  async getIncompleteOrdersBySession(sessionId: string): Promise<Order[]> {
    try {
      const q = query(
        collection(db, 'orders'),
        where('sessionId', '==', sessionId),
        where('status', 'in', ['PLACED', 'PREPARING', 'READY', 'SERVED'])
      );
      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      // Sort in memory to avoid composite index requirement
      return orders.sort((a, b) => {
        // Handle both Firestore Timestamp and Date types
        const getTime = (date: unknown): number => {
          if (!date) return 0;
          if (typeof date === 'object' && date !== null && 'toMillis' in date && typeof (date as { toMillis: () => number }).toMillis === 'function') {
            return (date as { toMillis: () => number }).toMillis();
          }
          return new Date(date as string | number).getTime();
        };
        const aTime = getTime(a.createdAt);
        const bTime = getTime(b.createdAt);
        return bTime - aTime;
      });
    } catch (error) {
      console.error('Error fetching incomplete orders by session:', error);
      return [];
    }
  },

  /**
   * Subscribe to incomplete orders by session ID (real-time)
   */
  subscribeToIncompleteOrdersBySession(
    sessionId: string,
    callback: (orders: Order[]) => void
  ): Unsubscribe {
    const q = query(
      collection(db, 'orders'),
      where('sessionId', '==', sessionId),
      where('status', 'in', ['PLACED', 'PREPARING', 'READY', 'SERVED'])
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        // Sort in memory to avoid composite index requirement
        const sortedOrders = orders.sort((a, b) => {
          // Handle both Firestore Timestamp and Date types
          const getTime = (date: unknown): number => {
            if (!date) return 0;
            if (typeof date === 'object' && date !== null && 'toMillis' in date && typeof (date as { toMillis: () => number }).toMillis === 'function') {
              return (date as { toMillis: () => number }).toMillis();
            }
            return new Date(date as string | number).getTime();
          };
          const aTime = getTime(a.createdAt);
          const bTime = getTime(b.createdAt);
          return bTime - aTime;
        });
        callback(sortedOrders);
      },
      (error) => {
        console.error('Error subscribing to orders:', error);
        callback([]);
      }
    );
  },

  /**
   * Subscribe to orders by table ID (real-time)
   */
  subscribeToTableOrders(
    tableId: string,
    callback: (orders: Order[]) => void
  ): Unsubscribe {
    const q = query(
      collection(db, 'orders'),
      where('tableId', '==', tableId),
      where('status', 'in', ['PLACED', 'PREPARING', 'READY', 'SERVED'])
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        callback(orders);
      },
      (error) => {
        console.error('Error subscribing to table orders:', error);
        callback([]);
      }
    );
  },
};
