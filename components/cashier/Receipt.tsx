'use client';

import { Card, Button, Divider } from 'antd';
import { format } from 'date-fns';
import type { Payment } from '@/types';
import { Printer, ArrowRight } from 'lucide-react';

interface ReceiptProps {
  payment: Payment;
  onNewTransaction: () => void;
}

export function Receipt({ payment, onNewTransaction }: ReceiptProps) {
  const handlePrint = () => {
    window.print();
  };

  const receiptDate = payment.processedAt instanceof Date
    ? payment.processedAt
    : new Date((payment.processedAt as { seconds: number }).seconds * 1000);

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="border-gray-200 shadow-soft-sm receipt-card">
        <div className="receipt-content font-mono text-sm">
          <div className="text-center mb-4">
            <div className="text-xl font-bold"></div>
            <h2 className="text-2xl font-bold my-2">DON&apos;T MISS THIS SATURDAY</h2>
            <p className="text-sm">123 Bangkok Street</p>
            <p className="text-sm">Tax ID: 1234567890123</p>
            <div className="text-xl font-bold"></div>
          </div>

          <div className="mb-4 space-y-1">
            <div className="flex justify-between">
              <span>Receipt #:</span>
              <span className="font-bold">{payment.receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{format(receiptDate, 'dd MMM yyyy, HH:mm')}</span>
            </div>
            <div className="flex justify-between">
              <span>Table:</span>
              <span>{payment.tableId}</span>
            </div>
            <div className="flex justify-between">
              <span>Cashier:</span>
              <span>{payment.processedBy}</span>
            </div>
          </div>

          <Divider className="my-3" style={{ borderColor: '#666' }} />

          <div className="mb-4">
            <p className="text-xs text-gray-600 mb-2">Order Items (from system records)</p>
          </div>

          <Divider className="my-3" style={{ borderColor: '#666' }} />

          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>฿{payment.subtotal.toFixed(2)}</span>
            </div>
            {payment.discountAmount > 0 && (
              <div className="flex justify-between text-orange-600">
                <span>
                  Discount ({payment.discountType === 'PERCENTAGE' ? `${payment.discountPercent}%` : 'Fixed'}):
                </span>
                <span>-฿{payment.discountAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <Divider className="my-3" style={{ borderColor: '#666' }} />

          <div className="flex justify-between text-lg font-bold mb-4">
            <span>TOTAL:</span>
            <span>฿{payment.total.toFixed(2)}</span>
          </div>

          <div className="text-xl font-bold mb-4"></div>

          <div className="space-y-1 mb-4">
            <div className="flex justify-between">
              <span>Payment:</span>
              <span className="font-bold">{payment.paymentMethod}</span>
            </div>
            {payment.paymentMethod === 'CASH' && (
              <>
                <div className="flex justify-between">
                  <span>Received:</span>
                  <span>฿{payment.amountReceived?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Change:</span>
                  <span>฿{payment.change?.toFixed(2)}</span>
                </div>
              </>
            )}
            {payment.paymentMethod === 'PROMPTPAY' && (
              <div className="flex justify-between">
                <span>Reference:</span>
                <span>{payment.promptpayReference}</span>
              </div>
            )}
          </div>

          <div className="text-xl font-bold mb-4"></div>

          <div className="text-center my-4">
            <p className="text-lg font-bold">Thank you! Come again!</p>
          </div>

          <div className="text-xl font-bold"></div>
        </div>

        <Divider />

        <div className="flex gap-3 no-print">
          <Button
            icon={<Printer size={16} />}
            size="large"
            block
            onClick={handlePrint}
          >
            Print Receipt
          </Button>
          <Button
            type="primary"
            icon={<ArrowRight size={16} />}
            size="large"
            block
            onClick={onNewTransaction}
          >
            New Transaction
          </Button>
        </div>
      </Card>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .receipt-card,
          .receipt-card * {
            visibility: visible;
          }
          .receipt-card {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
