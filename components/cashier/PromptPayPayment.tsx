'use client';

import { useState, useEffect } from 'react';
import { message } from 'antd';
import { runTransaction, doc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { format } from 'date-fns';
import { useAuthStore } from '@/lib/stores/authStore';
import QRCode from 'qrcode';
import Image from 'next/image';
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
  table: Table;
  orders: Order[];
  billCalculation: BillCalculation;
  onComplete: (payment: Payment) => void;
  onBack: () => void;
}

export function PromptPayPayment({ total, table, orders, billCalculation, onComplete, onBack }: PromptPayPaymentProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(900);
  const staffId = useAuthStore((state) => state.staffId);
  const [receiptNumber, setReceiptNumber] = useState<string>('');

  useEffect(() => {
    generateQRCode();
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

  const generateQRCode = async () => {
    try {
      const receipt = await getNextReceiptNumber();
      setReceiptNumber(receipt);

      const qrData = {
        merchantId: 'PROMPTPAY_ID_HERE',
        amount: total,
        reference: receipt,
        currency: 'THB',
      };

      const qrUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
        width: 300,
        margin: 2,
      });
      setQrCodeUrl(qrUrl);
    } catch (error) {
      console.error('QR generation error:', error);
      message.error('Failed to generate QR code');
    }
  };

  const handlePaymentReceived = async () => {
    setProcessing(true);

    try {
      const orderIds = orders.map((o) => o.id);

      const paymentData: Payment = {
        id: '',
        receiptNumber,
        tableId: table.id,
        orderIds,
        sessionId: table.currentSessionId || '',
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
        const paymentDoc: any = {
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

        const tableRef = doc(db, 'tables', table.id);
        transaction.update(tableRef, {
          status: 'VACANT',
          activeOrders: [],
          currentSessionId: null,
          totalAmount: 0,
        });
      });

      message.success('Payment confirmed');
      onComplete(paymentData);
    } catch (error) {
      console.error('Payment confirmation error:', error);
      message.error('Failed to confirm payment');
      setProcessing(false);
    }
  };

  async function getNextReceiptNumber(): Promise<string> {
    const today = format(new Date(), 'yyyyMMdd');
    const sequenceRef = doc(db, 'receiptSequences', today);

    return await runTransaction(db, async (transaction) => {
      const sequenceDoc = await transaction.get(sequenceRef);
      const nextSeq = sequenceDoc.exists()
        ? sequenceDoc.data().currentSequence + 1
        : 1;

      transaction.set(
        sequenceRef,
        {
          currentSequence: nextSeq,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const paddedSeq = String(nextSeq).padStart(4, '0');
      return `R${today}-${paddedSeq}`;
    });
  }

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
          <div className="text-sm"></div>
          <h2 className="text-xl font-bold my-1">PROMPTPAY PAYMENT</h2>
          <div className="text-sm"></div>
        </div>

        <div className="p-6 space-y-6">
          {/* Amount */}
          <div className="border-2 border-black p-6">
            <div className="text-center">
              <p className="text-xs mb-2">AMOUNT TO PAY</p>
              <p className="text-4xl font-bold">฿{total.toFixed(2)}</p>
            </div>
          </div>

          {/* QR Code */}
          {qrCodeUrl && (
            <div className="border-2 border-black p-6">
              <div className="text-center">
                <p className="text-xs mb-4 font-bold">[ SCAN QR CODE TO PAY ]</p>
                <div className="flex justify-center mb-4 border-2 border-black inline-block p-2">
                  <Image src={qrCodeUrl} alt="PromptPay QR Code" width={280} height={280} />
                </div>
                <div className="text-xs border-t-2 border-dashed border-black pt-3 mt-3">
                  <p>REFERENCE: {receiptNumber}</p>
                </div>
              </div>
            </div>
          )}

          {/* Timer */}
          <div className="border-2 border-dashed border-black p-4">
            <div className="text-center text-sm">
              <p>⏱ QR EXPIRES IN {minutes}:{seconds.toString().padStart(2, '0')}</p>
            </div>
          </div>

          {/* Instructions */}
          <div className="border-2 border-black p-4">
            <p className="text-xs text-center">
              AFTER CUSTOMER COMPLETES PAYMENT,<br />VERIFY AND CONFIRM BELOW
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

          {/* Regenerate */}
          {timeRemaining === 0 && (
            <button
              onClick={generateQRCode}
              className="w-full px-6 py-3 border-2 border-black bg-white hover:bg-gray-100 font-bold text-sm"
            >
              [GENERATE NEW QR CODE]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
