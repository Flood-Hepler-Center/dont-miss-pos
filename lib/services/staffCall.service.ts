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
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { StaffCall, CreateStaffCallInput, StaffCallStatus, StaffCallType } from '@/types';

const COLLECTION_NAME = 'staffCalls';

export const staffCallService = {
  /**
   * Create a new staff call
   */
  async create(input: CreateStaffCallInput): Promise<string> {
    try {
      // Check for existing pending call from same table
      const existingQuery = query(
        collection(db, COLLECTION_NAME),
        where('tableId', '==', input.tableId),
        where('type', '==', input.type),
        where('status', '==', 'PENDING')
      );
      const existingSnap = await getDocs(existingQuery);
      
      if (!existingSnap.empty) {
        // Return existing call ID instead of creating duplicate
        return existingSnap.docs[0].id;
      }

      const callRef = doc(collection(db, COLLECTION_NAME));
      const callData = {
        tableId: input.tableId,
        orderId: input.orderId || null,
        type: input.type,
        status: 'PENDING' as StaffCallStatus,
        createdAt: serverTimestamp(),
        notes: input.notes || null,
      };

      await setDoc(callRef, callData);
      return callRef.id;
    } catch (error) {
      console.error('Error creating staff call:', error);
      throw new Error('Failed to create staff call');
    }
  },

  /**
   * Acknowledge a staff call
   */
  async acknowledge(callId: string, staffId: string): Promise<void> {
    try {
      const callRef = doc(db, COLLECTION_NAME, callId);
      await updateDoc(callRef, {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: serverTimestamp(),
        acknowledgedBy: staffId,
      });
    } catch (error) {
      console.error('Error acknowledging staff call:', error);
      throw new Error('Failed to acknowledge staff call');
    }
  },

  /**
   * Complete a staff call
   */
  async complete(callId: string): Promise<void> {
    try {
      const callRef = doc(db, COLLECTION_NAME, callId);
      await updateDoc(callRef, {
        status: 'COMPLETED',
        completedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error completing staff call:', error);
      throw new Error('Failed to complete staff call');
    }
  },

  /**
   * Cancel a staff call (by customer)
   */
  async cancel(callId: string): Promise<void> {
    try {
      const callRef = doc(db, COLLECTION_NAME, callId);
      await updateDoc(callRef, {
        status: 'COMPLETED',
        completedAt: serverTimestamp(),
        notes: 'Cancelled by customer',
      });
    } catch (error) {
      console.error('Error cancelling staff call:', error);
      throw new Error('Failed to cancel staff call');
    }
  },

  /**
   * Get all pending calls
   */
  async getPendingCalls(): Promise<StaffCall[]> {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('status', '==', 'PENDING'),
        orderBy('createdAt', 'asc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as StaffCall[];
    } catch (error) {
      console.error('Error fetching pending calls:', error);
      return [];
    }
  },

  /**
   * Get all calls (for history)
   */
  async getAllCalls(limit: number = 50): Promise<StaffCall[]> {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.slice(0, limit).map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as StaffCall[];
    } catch (error) {
      console.error('Error fetching calls:', error);
      return [];
    }
  },

  /**
   * Get a single call by ID
   */
  async getById(callId: string): Promise<StaffCall | null> {
    try {
      const callDoc = await getDoc(doc(db, COLLECTION_NAME, callId));
      if (!callDoc.exists()) {
        return null;
      }
      return {
        id: callDoc.id,
        ...callDoc.data(),
      } as StaffCall;
    } catch (error) {
      console.error('Error fetching staff call:', error);
      return null;
    }
  },

  /**
   * Subscribe to pending calls (real-time)
   */
  subscribeToPending(callback: (calls: StaffCall[]) => void): Unsubscribe {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('status', '==', 'PENDING')
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const calls = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as StaffCall[];
        // Sort in memory to avoid composite index requirement
        const sortedCalls = calls.sort((a, b) => {
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
          return aTime - bTime; // Ascending order
        });
        callback(sortedCalls);
      },
      (error) => {
        console.error('Error subscribing to pending calls:', error);
        callback([]);
      }
    );
  },

  /**
   * Subscribe to a single call (real-time)
   */
  subscribeToCall(callId: string, callback: (call: StaffCall | null) => void): Unsubscribe {
    const callRef = doc(db, COLLECTION_NAME, callId);
    
    return onSnapshot(
      callRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null);
          return;
        }
        callback({
          id: snapshot.id,
          ...snapshot.data(),
        } as StaffCall);
      },
      (error) => {
        console.error('Error subscribing to call:', error);
        callback(null);
      }
    );
  },

  /**
   * Check if table has pending call
   */
  async hasPendingCall(tableId: string, type?: StaffCallType): Promise<boolean> {
    try {
      const baseConditions = [
        where('tableId', '==', tableId),
        where('status', '==', 'PENDING'),
      ];
      if (type) {
        baseConditions.push(where('type', '==', type));
      }
      const q = query(collection(db, COLLECTION_NAME), ...baseConditions);
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error checking pending call:', error);
      return false;
    }
  },

  /**
   * Get pending call for table (if exists)
   */
  async getPendingCallForTable(tableId: string, type?: StaffCallType): Promise<StaffCall | null> {
    try {
      const baseConditions = [
        where('tableId', '==', tableId),
        where('status', '==', 'PENDING'),
      ];
      if (type) {
        baseConditions.push(where('type', '==', type));
      }
      const q = query(collection(db, COLLECTION_NAME), ...baseConditions);
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        return null;
      }
      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data(),
      } as StaffCall;
    } catch (error) {
      console.error('Error fetching pending call:', error);
      return null;
    }
  },
};
