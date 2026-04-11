import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Booking, BookingStatus, BookingSource, CreateBookingInput, UpdateBookingInput } from '@/types';

const COLLECTION_NAME = 'bookings';

export const bookingService = {
  /**
   * Create a new booking
   */
  async create(input: CreateBookingInput): Promise<string> {
    // Validate phone format (Thai: 10 digits starting with 0)
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(input.phone)) {
      throw new Error('Phone must be 10 digits starting with 0');
    }

    // Remove undefined fields (Firebase doesn't allow undefined)
    const data: Record<string, unknown> = {
      name: input.name,
      phone: input.phone,
      amount: input.amount,
      time: input.time,
      status: 'PENDING' as BookingStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    // Only add optional fields if they have values
    if (input.source) data.source = input.source;
    if (input.tableId) data.tableId = input.tableId;
    if (input.notes) data.notes = input.notes;

    const docRef = await addDoc(collection(db, COLLECTION_NAME), data);

    return docRef.id;
  },

  /**
   * Update a booking
   */
  async update(id: string, input: UpdateBookingInput): Promise<void> {
    // Validate phone if provided
    if (input.phone) {
      const phoneRegex = /^0\d{9}$/;
      if (!phoneRegex.test(input.phone)) {
        throw new Error('Phone must be 10 digits starting with 0');
      }
    }

    // Remove undefined fields (Firebase doesn't allow undefined)
    const data: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    
    // Only add fields that are defined
    if (input.name !== undefined) data.name = input.name;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.time !== undefined) data.time = input.time;
    if (input.source !== undefined) data.source = input.source;
    if (input.tableId !== undefined) data.tableId = input.tableId;
    if (input.notes !== undefined) data.notes = input.notes;

    const ref = doc(db, COLLECTION_NAME, id);
    await updateDoc(ref, data);
  },

  /**
   * Update booking status
   */
  async updateStatus(id: string, status: BookingStatus): Promise<void> {
    const ref = doc(db, COLLECTION_NAME, id);
    await updateDoc(ref, {
      status,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Delete a booking
   */
  async delete(id: string): Promise<void> {
    const ref = doc(db, COLLECTION_NAME, id);
    await deleteDoc(ref);
  },

  /**
   * Get a single booking by ID
   */
  async getById(id: string): Promise<Booking | null> {
    const ref = doc(db, COLLECTION_NAME, id);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      return null;
    }

    return this.fromFirestore(snap);
  },

  /**
   * Get bookings for a specific date
   */
  async getByDate(date: Date): Promise<Booking[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, COLLECTION_NAME),
      where('time', '>=', startOfDay),
      where('time', '<=', endOfDay),
      orderBy('time', 'asc')
    );

    const snap = await getDocs(q);
    return snap.docs.map((doc) => this.fromFirestore(doc));
  },

  /**
   * Subscribe to bookings for a specific date (real-time)
   */
  subscribeByDate(date: Date, callback: (bookings: Booking[]) => void): Unsubscribe {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, COLLECTION_NAME),
      where('time', '>=', startOfDay),
      where('time', '<=', endOfDay),
      orderBy('time', 'asc')
    );

    return onSnapshot(q, (snap) => {
      const bookings = snap.docs.map((doc) => this.fromFirestore(doc));
      callback(bookings);
    });
  },

  /**
   * Subscribe to all bookings (real-time)
   */
  subscribeAll(callback: (bookings: Booking[]) => void): Unsubscribe {
    const q = query(collection(db, COLLECTION_NAME), orderBy('time', 'desc'));

    return onSnapshot(q, (snap) => {
      const bookings = snap.docs.map((doc) => this.fromFirestore(doc));
      callback(bookings);
    });
  },

  /**
   * Get today's bookings
   */
  async getToday(): Promise<Booking[]> {
    return this.getByDate(new Date());
  },

  /**
   * Subscribe to today's bookings (real-time)
   */
  subscribeToday(callback: (bookings: Booking[]) => void): Unsubscribe {
    return this.subscribeByDate(new Date(), callback);
  },

  /**
   * Convert Firestore document to Booking type
   */
  fromFirestore(doc: { id: string; data: () => Record<string, unknown> }): Booking {
    const data = doc.data();
    
    // Helper to safely convert Firestore timestamp to Date
    const toDate = (timestamp: unknown): Date => {
      if (!timestamp) return new Date(); // Handle null/undefined from serverTimestamp()
      if (timestamp instanceof Date) return timestamp;
      if (typeof timestamp === 'object' && 'seconds' in timestamp) {
        return new Date((timestamp as { seconds: number }).seconds * 1000);
      }
      return new Date();
    };
    
    return {
      id: doc.id,
      name: data.name as string,
      phone: data.phone as string,
      amount: data.amount as number,
      time: toDate(data.time),
      status: data.status as BookingStatus,
      source: data.source as BookingSource | undefined,
      notes: data.notes as string | undefined,
      tableId: data.tableId as string | undefined,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  },

  /**
   * Get booking statistics for a date
   */
  getStats(bookings: Booking[]): {
    total: number;
    pending: number;
    confirmed: number;
    seated: number;
    cancelled: number;
    totalPeople: number;
  } {
    return {
      total: bookings.length,
      pending: bookings.filter((b) => b.status === 'PENDING').length,
      confirmed: bookings.filter((b) => b.status === 'CONFIRMED').length,
      seated: bookings.filter((b) => b.status === 'SEATED').length,
      cancelled: bookings.filter((b) => b.status === 'CANCELLED').length,
      totalPeople: bookings
        .filter((b) => b.status !== 'CANCELLED' && b.status !== 'NO_SHOW')
        .reduce((sum, b) => sum + b.amount, 0),
    };
  },
};
