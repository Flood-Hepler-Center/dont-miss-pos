'use client';

import { useState } from 'react';
import { message } from 'antd';
import { runTransaction, doc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

import { useAuthStore } from '@/lib/stores/authStore';
import { paymentService } from '@/lib/services/payment.service';
import type { Table, Order, Payment } from '@/types';

interface BillCalculation {
  subtotal: number;
  discountAmount: number;
  discountType?: 'PERCENTAGE' | 'FIXED';
  discountPercent?: number;
  discountReason?: string;
  subtotalAfterDiscount: number;
  tax: number;
  total: number;
}

interface CashPaymentProps {
  total: number;
  table?: Table | null;
  orders: Order[];
  billCalculation: BillCalculation;
  onComplete: (payment: Payment) => void;
  onBack: () => void;
}

export function CashPayment({ total, table, orders, billCalculation, onComplete, onBack }: CashPaymentProps) {
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [processing, setProcessing] = useState(false);
  const staffId = useAuthStore((state) => state.staffId);

  const change = amountReceived - total;
  const isValidPayment = amountReceived >= total;

  const handleExactAmount = () => {
    setAmountReceived(Math.ceil(total));
  };

  const handleProcessPayment = async () => {
    if (!isValidPayment) {
      message.error('Insufficient payment amount');
      return;
    }

    setProcessing(true);

    try {
      const receiptNumber = await paymentService.generateReceiptNumber();
      const orderIds = orders.map((o) => o.id);

      const paymentData: Payment = {
        id: '',
        receiptNumber,
        tableId: table?.id || 'no-table',
        orderIds,
        sessionId: table && typeof table.currentSession === 'string' ? table.currentSession : (table?.currentSession?.sessionId || ''),
        subtotal: billCalculation.subtotal,
        discountAmount: billCalculation.discountAmount,
        discountType: billCalculation.discountType,
        discountPercent: billCalculation.discountPercent,
        discountReason: billCalculation.discountReason,
        subtotalAfterDiscount: billCalculation.subtotalAfterDiscount,
        tax: billCalculation.tax,
        total: billCalculation.total,
        paymentMethod: 'CASH',
        amountReceived,
        change,
        isSplit: false,
        processedBy: staffId || 'unknown',
        processedAt: new Date(),
        status: 'COMPLETED' as const,
        createdAt: new Date(),
      };

      await runTransaction(db, async (transaction) => {
        const paymentRef = doc(collection(db, 'payments'));
        paymentData.id = paymentRef.id;

        // Build payment document without undefined fields
        const paymentDoc: Record<string, unknown> = {
          receiptNumber: paymentData.receiptNumber,
          tableId: paymentData.tableId,
          orderIds: paymentData.orderIds,
          subtotal: paymentData.subtotal,
          discountAmount: paymentData.discountAmount || 0,
          tax: paymentData.tax,
          total: paymentData.total,
          paymentMethod: paymentData.paymentMethod,
          amountReceived: paymentData.amountReceived,
          change: paymentData.change,
          status: 'COMPLETED',
          processedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        };

        // Only add optional fields if they exist
        if (paymentData.discountType) paymentDoc.discountType = paymentData.discountType;
        if (paymentData.discountReason) paymentDoc.discountReason = paymentData.discountReason;
        if (paymentData.processedBy) paymentDoc.processedBy = paymentData.processedBy;

        transaction.set(paymentRef, paymentDoc);

        orderIds.forEach((orderId) => {
          const orderRef = doc(db, 'orders', orderId);
          transaction.update(orderRef, {
            status: 'COMPLETED',
            completedAt: serverTimestamp(),
          });
        });

        if (table?.id) {
        const tableRef = doc(db, 'tables', table.id);
        transaction.update(tableRef, {
          status: 'VACANT',
          activeOrders: [],
          currentSessionId: null,
          totalAmount: 0,
        });
      }
      });

      message.success('Payment processed successfully');
      onComplete(paymentData);
    } catch (error) {
      console.error('Payment processing error:', error);
      message.error('Failed to process payment');
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto font-mono">
      <button
        onClick={onBack}
        className="mb-4 px-4 py-2 border-2 border-black bg-white hover:bg-gray-100 text-sm font-bold"
      >
        [← CHANGE PAYMENT METHOD]
      </button>

      <div className="border-2 border-black">
        <div className="border-b-2 border-black p-4 text-center">
          <div className="text-sm"></div>
          <h2 className="text-xl font-bold my-1">CASH PAYMENT</h2>
          <div className="text-sm"></div>
        </div>

        <div className="p-6 space-y-6">
          {/* Amount Due */}
          <div className="border-2 border-black p-6">
            <div className="text-center">
              <p className="text-xs mb-2">AMOUNT DUE</p>
              <p className="text-4xl font-bold">฿{total.toFixed(2)}</p>
            </div>
          </div>

          {/* Amount Received */}
          <div>
            <label className="block text-xs font-bold mb-2">AMOUNT RECEIVED</label>
            <input
              type="number"
              value={amountReceived || ''}
              onChange={(e) => setAmountReceived(Number(e.target.value))}
              min={0}
              step="0.01"
              className="w-full px-4 py-4 border-2 border-black text-center text-3xl focus:outline-none"
              placeholder="฿0.00"
            />
            <button
              onClick={handleExactAmount}
              className="mt-2 text-xs underline hover:no-underline"
            >
              [USE EXACT AMOUNT]
            </button>
          </div>

          {/* Change Display */}
          {amountReceived > 0 && (
            <div className={`border-2 p-6 ${
              isValidPayment ? 'border-black bg-white' : 'border-black bg-gray-100'
            }`}>
              <div className="text-center">
                <p className="text-xs mb-2">CHANGE</p>
                <p className="text-4xl font-bold">
                  ฿{Math.max(0, change).toFixed(2)}
                </p>
                {!isValidPayment && (
                  <p className="text-xs mt-3 border-t-2 border-dashed border-black pt-3">
                    [INSUFFICIENT: SHORT BY ฿{Math.abs(change).toFixed(2)}]
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Complete Button */}
          <button
            disabled={!isValidPayment || processing}
            onClick={handleProcessPayment}
            className="w-full px-6 py-4 border-2 border-black bg-black text-white hover:bg-gray-800 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? '[PROCESSING...]' : '[COMPLETE PAYMENT]'}
          </button>
        </div>
      </div>
    </div>
  );
}
