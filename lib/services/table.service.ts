import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Table, TableStatus, Order } from '@/types';

export const tableService = {
  async getAll(): Promise<Table[]> {
    try {
      const q = query(
        collection(db, 'tables'),
        orderBy('tableId', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Table[];
    } catch (error) {
      console.error('Error fetching tables:', error);
      throw new Error('Failed to fetch tables');
    }
  },

  async getById(tableId: string): Promise<Table | null> {
    try {
      const docRef = doc(db, 'tables', tableId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        return null;
      }
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as Table;
    } catch (error) {
      console.error('Error fetching table:', error);
      throw new Error('Failed to fetch table');
    }
  },

  async updateStatus(tableId: string, status: TableStatus): Promise<void> {
    try {
      const docRef = doc(db, 'tables', tableId);
      await updateDoc(docRef, {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating table status:', error);
      throw new Error('Failed to update table status');
    }
  },

  async getActiveOrders(tableId: string): Promise<Order[]> {
    try {
      const q = query(
        collection(db, 'orders'),
        where('tableId', '==', tableId),
        where('status', 'not-in', ['COMPLETED', 'CANCELLED']),
        orderBy('createdAt', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Order[];
    } catch (error) {
      console.error('Error fetching active orders:', error);
      throw new Error('Failed to fetch active orders');
    }
  },

  async calculateTotal(tableId: string): Promise<number> {
    try {
      const orders = await this.getActiveOrders(tableId);
      return orders.reduce((sum, order) => sum + (order.total || 0), 0);
    } catch (error) {
      console.error('Error calculating table total:', error);
      throw new Error('Failed to calculate table total');
    }
  },

  async reset(tableId: string): Promise<void> {
    try {
      const batch = writeBatch(db);

      const tableRef = doc(db, 'tables', tableId);
      batch.update(tableRef, {
        status: 'VACANT',
        activeOrders: [],
        currentSessionId: null,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (error) {
      console.error('Error resetting table:', error);
      throw new Error('Failed to reset table');
    }
  },

  async initializeTables(count: number = 20): Promise<void> {
    try {
      const batch = writeBatch(db);

      for (let i = 1; i <= count; i++) {
        const tableRef = doc(db, 'tables', i.toString());
        batch.set(tableRef, {
          tableId: i.toString(),
          status: 'VACANT',
          activeOrders: [],
          currentSessionId: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
    } catch (error) {
      console.error('Error initializing tables:', error);
      throw new Error('Failed to initialize tables');
    }
  },

  async moveTable(sourceTableId: string, targetTableId: string): Promise<void> {
    try {
      await runTransaction(db, async (transaction) => {
        const sourceRef = doc(db, 'tables', sourceTableId);
        const targetRef = doc(db, 'tables', targetTableId);

        const sourceSnap = await transaction.get(sourceRef);
        const targetSnap = await transaction.get(targetRef);

        if (!sourceSnap.exists()) throw new Error('Source table not found');
        if (!targetSnap.exists()) throw new Error('Target table not found');

        const sourceData = sourceSnap.data() as Table;
        const targetData = targetSnap.data() as Table;

        const orderIds = sourceData.activeOrders || [];
        
        // 1. Update all active orders
        for (const orderId of orderIds) {
          const orderRef = doc(db, 'orders', orderId);
          transaction.update(orderRef, {
            tableId: targetTableId,
            updatedAt: serverTimestamp(),
          });
        }

        // 2. Update target table
        transaction.update(targetRef, {
          status: sourceData.status,
          activeOrders: [...(targetData.activeOrders || []), ...orderIds],
          currentSessionId: sourceData.currentSessionId || targetData.currentSessionId,
          updatedAt: serverTimestamp(),
        });

        // 3. Reset source table
        transaction.update(sourceRef, {
          status: 'VACANT',
          activeOrders: [],
          currentSessionId: null,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      console.error('Error moving table:', error);
      throw error;
    }
  },
};
