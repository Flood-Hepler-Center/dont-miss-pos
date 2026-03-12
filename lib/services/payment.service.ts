import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type {
  Order,
  Payment,
  Receipt,
  BillCalculation,
  DiscountType,
  SplitPayment,
  ProcessPaymentInput,
} from '@/types';

export const paymentService = {
  async calculateBill(orders: Order[]): Promise<BillCalculation> {
    try {
      let subtotal = 0;

      orders.forEach((order) => {
        subtotal += order.subtotal || 0;
      });

      const tax = 0;
      const total = subtotal;

      return {
        subtotal,
        discountAmount: 0,
        subtotalAfterDiscount: subtotal,
        tax,
        total,
      };
    } catch (error) {
      console.error('Error calculating bill:', error);
      throw new Error('Failed to calculate bill');
    }
  },

  applyDiscount(
    subtotal: number,
    discountType: DiscountType,
    amount: number
  ): number {
    if (discountType === 'PERCENTAGE') {
      if (amount < 0 || amount > 100) {
        throw new Error('Discount percentage must be between 0 and 100');
      }
      return Math.round(subtotal * (amount / 100) * 100) / 100;
    } else if (discountType === 'FIXED') {
      if (amount > subtotal) {
        throw new Error('Discount amount cannot exceed subtotal');
      }
      return Math.round(amount * 100) / 100;
    }
    return 0;
  },

  async splitBill(
    orders: Order[],
    splitCount: number
  ): Promise<SplitPayment[]> {
    try {
      if (splitCount < 1) {
        throw new Error('Split count must be at least 1');
      }

      const billCalc = await this.calculateBill(orders);
      const baseAmount = Math.floor((billCalc.total / splitCount) * 100) / 100;
      const remainder = Math.round((billCalc.total - baseAmount * splitCount) * 100) / 100;

      const splits: SplitPayment[] = [];
      for (let i = 0; i < splitCount; i++) {
        const splitAmount = i === 0 ? baseAmount + remainder : baseAmount;
        const splitSubtotal = splitAmount;
        const splitTax = 0;
        
        splits.push({
          splitId: `split-${i + 1}`,
          splitNumber: i + 1,
          orderIds: orders.map(o => o.id),
          subtotal: splitSubtotal,
          tax: splitTax,
          total: splitAmount,
          paymentMethod: 'CASH',
          processedAt: new Date(),
        });
      }

      return splits;
    } catch (error) {
      console.error('Error splitting bill:', error);
      throw new Error('Failed to split bill');
    }
  },

  async getNextReceiptNumber(): Promise<string> {
    try {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

      const q = query(
        collection(db, 'receiptSequences'),
        where('date', '==', dateStr),
        limit(1)
      );
      const snapshot = await getDocs(q);

      let sequence = 1;
      if (!snapshot.empty) {
        const seqDoc = snapshot.docs[0];
        sequence = (seqDoc.data().lastSequence || 0) + 1;
      }

      return `R${dateStr}-${sequence.toString().padStart(4, '0')}`;
    } catch (error) {
      console.error('Error generating receipt number:', error);
      throw new Error('Failed to generate receipt number');
    }
  },

  async processPayment(paymentData: ProcessPaymentInput): Promise<string> {
    try {
      // Get receipt number BEFORE transaction (cannot use getDocs inside transaction)
      const receiptNumber = await this.getNextReceiptNumber();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      // Get current sequence BEFORE transaction
      const seqQuery = query(
        collection(db, 'receiptSequences'),
        where('date', '==', today),
        limit(1)
      );
      const seqSnapshot = await getDocs(seqQuery);
      const currentSequence = seqSnapshot.empty ? 0 : (seqSnapshot.docs[0].data().lastSequence || 0);
      const seqDocId = seqSnapshot.empty ? null : seqSnapshot.docs[0].id;

      return await runTransaction(db, async (transaction) => {
        const paymentRef = doc(collection(db, 'payments'));
        const paymentDoc: any = {
          receiptNumber,
          tableId: paymentData.tableId,
          orderIds: paymentData.orderIds,
          subtotal: paymentData.subtotal,
          discountAmount: paymentData.discountAmount || 0,
          tax: paymentData.tax,
          total: paymentData.total,
          paymentMethod: paymentData.paymentMethod,
          processedBy: paymentData.processedBy,
          status: 'COMPLETED',
          createdAt: serverTimestamp(),
        };

        // Only add optional fields if they have values
        if (paymentData.discountType) {
          paymentDoc.discountType = paymentData.discountType;
        }
        if (paymentData.discountPercent) {
          paymentDoc.discountPercent = paymentData.discountPercent;
        }
        if (paymentData.discountReason) {
          paymentDoc.discountReason = paymentData.discountReason;
        }
        if (paymentData.amountReceived) {
          paymentDoc.amountReceived = paymentData.amountReceived;
        }
        if (paymentData.change) {
          paymentDoc.change = paymentData.change;
        }

        transaction.set(paymentRef, paymentDoc);

        paymentData.orderIds.forEach((orderId) => {
          const orderRef = doc(db, 'orders', orderId);
          transaction.update(orderRef, {
            status: 'COMPLETED',
            completedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

        const tableRef = doc(db, 'tables', paymentData.tableId);
        transaction.update(tableRef, {
          status: 'VACANT',
          activeOrders: [],
          currentSessionId: null,
          updatedAt: serverTimestamp(),
        });

        // Update sequence using pre-fetched data
        if (seqDocId === null) {
          const seqRef = doc(collection(db, 'receiptSequences'));
          transaction.set(seqRef, {
            date: today,
            lastSequence: 1,
            updatedAt: serverTimestamp(),
          });
        } else {
          const seqRef = doc(db, 'receiptSequences', seqDocId);
          transaction.update(seqRef, {
            lastSequence: currentSequence + 1,
            updatedAt: serverTimestamp(),
          });
        }

        const receiptRef = doc(collection(db, 'receipts'));
        transaction.set(receiptRef, {
          receiptNumber,
          paymentId: paymentRef.id,
          tableId: paymentData.tableId,
          orderIds: paymentData.orderIds,
          subtotal: paymentData.subtotal,
          discount: paymentData.discountAmount || 0,
          tax: paymentData.tax,
          total: paymentData.total,
          paymentMethod: paymentData.paymentMethod,
          amountReceived: paymentData.amountReceived || null,
          change: paymentData.change || null,
          processedBy: paymentData.processedBy,
          createdAt: serverTimestamp(),
        });

        return paymentRef.id;
      });
    } catch (error) {
      console.error('Error processing payment:', error);
      throw new Error('Failed to process payment');
    }
  },

  async generateReceipt(paymentId: string): Promise<Receipt | null> {
    try {
      const q = query(
        collection(db, 'receipts'),
        where('paymentId', '==', paymentId),
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const receiptDoc = snapshot.docs[0];
      return {
        id: receiptDoc.id,
        ...receiptDoc.data(),
      } as Receipt;
    } catch (error) {
      console.error('Error generating receipt:', error);
      throw new Error('Failed to generate receipt');
    }
  },

  async getPaymentsByDate(date: string): Promise<Payment[]> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const q = query(
        collection(db, 'payments'),
        where('createdAt', '>=', startOfDay),
        where('createdAt', '<=', endOfDay),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Payment[];
    } catch (error) {
      console.error('Error fetching payments by date:', error);
      throw new Error('Failed to fetch payments');
    }
  },
};
