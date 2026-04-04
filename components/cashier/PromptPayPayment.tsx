'use client';

import { useState, useEffect } from 'react';
import { message } from 'antd';
import { runTransaction, doc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

import { useAuthStore } from '@/lib/stores/authStore';
import Image from 'next/image';
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

interface PromptPayPaymentProps {
  total: number;
  table: Table | null;
  orders: Order[];
  billCalculation: BillCalculation;
  onComplete: (payment: Payment) => void;
  onBack: () => void;
}

export function PromptPayPayment({ total, table, orders, billCalculation, onComplete, onBack }: PromptPayPaymentProps) {
  const [processing, setProcessing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(900);
  const staffId = useAuthStore((state) => state.staffId);
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const FIXED_QR_URL = '/assets/promptpay-qr.jpg'; // Fixed QR image

  useEffect(() => {
    paymentService.generateReceiptNumber().then(setReceiptNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handlePaymentReceived = async () => {
    setProcessing(true);

    try {
      const orderIds = orders.map((o) => o.id);

      const paymentData: Payment = {
        id: '',
        receiptNumber,
        tableId: table?.id || '',
        orderIds,
        sessionId: table ? (typeof table.currentSession === 'string' ? table.currentSession : (table.currentSession?.sessionId || '')) : '',
        subtotal: billCalculation.subtotal,
        discountAmount: billCalculation.discountAmount,
        discountType: billCalculation.discountType,
        discountPercent: billCalculation.discountPercent,
        discountReason: billCalculation.discountReason,
        subtotalAfterDiscount: billCalculation.subtotalAfterDiscount,
        tax: billCalculation.tax,
        total: billCalculation.total,
        paymentMethod: 'PROMPTPAY',
        promptpayReference: receiptNumber,
        promptpayQRGenerated: true,
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
          status: 'COMPLETED',
          processedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        };

        // Only add optional fields if they exist
        if (paymentData.discountType) paymentDoc.discountType = paymentData.discountType;
        if (paymentData.discountPercent) paymentDoc.discountPercent = paymentData.discountPercent;
        if (paymentData.discountReason) paymentDoc.discountReason = paymentData.discountReason;
        if (paymentData.processedBy) paymentDoc.processedBy = paymentData.processedBy;
        if (paymentData.promptpayReference) paymentDoc.promptpayReference = paymentData.promptpayReference;

        transaction.set(paymentRef, paymentDoc);

        orderIds.forEach((orderId) => {
          const orderRef = doc(db, 'orders', orderId);
          transaction.update(orderRef, {
            status: 'COMPLETED',
            completedAt: serverTimestamp(),
          });
        });

        // Only update table if it exists
        if (table) {
          const tableRef = doc(db, 'tables', table.id);
          transaction.update(tableRef, {
            status: 'VACANT',
            activeOrders: [],
            currentSessionId: null,
            totalAmount: 0,
          });
        }
      });

      message.success('Payment confirmed');
      onComplete(paymentData);
    } catch (error) {
      console.error('Payment confirmation error:', error);
      message.error('Failed to confirm payment');
      setProcessing(false);
    }
  };

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

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
          <div className="text-sm">══════════</div>
          <h2 className="text-xl font-bold my-1">PROMPTPAY PAYMENT</h2>
          <div className="text-sm">══════════</div>
        </div>

        <div className="p-6 space-y-6">
          {/* Order Items Summary */}
          <div className="border-2 border-black">
            <div className="border-b-2 border-black p-3 text-center">
              <p className="text-xs font-bold">[ ORDER SUMMARY ]</p>
            </div>
            <div className="p-4 space-y-1">
              {orders.flatMap((o) => o.items || []).filter((item) => !item.isVoided).map((item, idx) => (
                <div key={idx} className="text-sm">
                  <div className="flex justify-between">
                    <div className="flex-1 pr-2">
                      <span>{item.quantity}× {item.name}</span>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="text-xs text-gray-500 ml-4">
                          {item.modifiers.map((mod, mIdx) => (
                            <span key={mIdx} className="block">+ {mod.optionName}</span>
                          ))}
                        </div>
                      )}
                      {item.isComped && (
                        <span className="text-xs text-green-700 ml-2">[COMP]</span>
                      )}
                    </div>
                    <span className="font-bold whitespace-nowrap">
                      {item.isComped ? '฿0.00' : `฿${(item.subtotal || 0).toFixed(2)}`}
                    </span>
                  </div>
                </div>
              ))}
              {orders.flatMap((o) => o.items || []).filter((item) => item.isVoided).length > 0 && (
                <div className="pt-2 mt-2 border-t border-dashed border-gray-300">
                  {orders.flatMap((o) => o.items || []).filter((item) => item.isVoided).map((item, idx) => (
                    <div key={`voided-${idx}`} className="text-sm opacity-40 line-through">
                      <div className="flex justify-between">
                        <span>{item.quantity}× {item.name} <span className="text-xs no-underline">(VOIDED)</span></span>
                        <span>฿{(item.subtotal || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Bill Breakdown */}
            <div className="border-t-2 border-dashed border-black p-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span>SUBTOTAL:</span>
                <span>฿{billCalculation.subtotal.toFixed(2)}</span>
              </div>
              {billCalculation.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>
                    DISCOUNT ({billCalculation.discountType === 'PERCENTAGE'
                      ? `${billCalculation.discountPercent}%`
                      : 'FIXED'}):
                  </span>
                  <span>-฿{billCalculation.discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t-2 border-black pt-2 mt-1">
                <span>TOTAL:</span>
                <span>฿{billCalculation.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Amount to Pay (large display) */}
          <div className="border-2 border-black p-6">
            <div className="text-center">
              <p className="text-xs mb-2">AMOUNT TO PAY</p>
              <p className="text-5xl font-bold">฿{total.toFixed(2)}</p>
            </div>
          </div>

          {/* Fixed QR Code */}
          <div className="border-2 border-black p-6">
            <div className="text-center">
              <p className="text-xs mb-4 font-bold">[ SCAN QR CODE TO PAY ]</p>
              <div className="flex justify-center mb-4 border-2 border-black inline-block p-2">
                <Image 
                  src={FIXED_QR_URL} 
                  alt="PromptPay QR Code" 
                  width={280} 
                  height={280}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/assets/placeholder-qr.png';
                  }}
                />
              </div>
              <div className="text-xs border-t-2 border-dashed border-black pt-3 mt-3">
                <p>REFERENCE: {receiptNumber}</p>
                <p className="mt-1 text-gray-500">AMOUNT: ฿{total.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Timer */}
          <div className="border-2 border-dashed border-black p-4">
            <div className="text-center text-sm">
              <p>⏱ SESSION EXPIRES IN {minutes}:{seconds.toString().padStart(2, '0')}</p>
            </div>
          </div>

          {/* Instructions */}
          <div className="border-2 border-black p-4">
            <p className="text-xs text-center">
              SCAN QR CODE WITH BANKING APP<br />
              ENTER AMOUNT: ฿{total.toFixed(2)}<br />
              AFTER PAYMENT, CONFIRM BELOW
            </p>
          </div>

          {/* Confirm Button */}
          <button
            disabled={processing || timeRemaining === 0}
            onClick={handlePaymentReceived}
            className="w-full px-6 py-4 border-2 border-black bg-black text-white hover:bg-gray-800 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? '[CONFIRMING...]' : '[CONFIRM PAYMENT RECEIVED]'}
          </button>

          {timeRemaining === 0 && (
            <button
              onClick={() => setTimeRemaining(900)}
              className="w-full px-6 py-3 border-2 border-black bg-white hover:bg-gray-100 font-bold text-sm"
            >
              [RESET SESSION]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
