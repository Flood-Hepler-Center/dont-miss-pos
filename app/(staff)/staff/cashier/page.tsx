'use client';

import { useState } from 'react';
import { TableSelector } from '@/components/cashier/TableSelector';
import { BillReview } from '@/components/cashier/BillReview';
import { PaymentMethodSelector } from '@/components/cashier/PaymentMethodSelector';
import { CashPayment } from '@/components/cashier/CashPayment';
import { PromptPayPayment } from '@/components/cashier/PromptPayPayment';
import { Receipt } from '@/components/cashier/Receipt';
import type { Table, Order, Payment } from '@/types';

type CashierStep = 'select' | 'review' | 'payment' | 'complete';
type PaymentMethod = 'CASH' | 'PROMPTPAY' | null;

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

export default function CashierPage() {
  const [step, setStep] = useState<CashierStep>('select');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [billCalculation, setBillCalculation] = useState<BillCalculation | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [paymentData, setPaymentData] = useState<Payment | null>(null);

  const handleTableSelect = (table: Table, tableOrders: Order[]) => {
    setSelectedTable(table);
    setOrders(tableOrders);
    setStep('review');
  };

  const handleBillReviewComplete = (calculation: BillCalculation) => {
    setBillCalculation(calculation);
    setStep('payment');
  };

  const handlePaymentMethodSelect = (method: PaymentMethod) => {
    setPaymentMethod(method);
  };

  const handlePaymentComplete = (payment: Payment) => {
    setPaymentData(payment);
    setStep('complete');
  };

  const handleNewTransaction = () => {
    setStep('select');
    setSelectedTable(null);
    setOrders([]);
    setBillCalculation(null);
    setPaymentMethod(null);
    setPaymentData(null);
  };

  const currentStepIndex = {
    select: 0,
    review: 1,
    payment: 2,
    complete: 3,
  }[step];

  return (
    <div className="min-h-screen bg-white font-mono p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center border-2 border-black p-4 mb-6">
          <div className="text-xl"></div>
          <h1 className="text-2xl font-bold my-2">CASHIER</h1>
          <p className="text-sm">Process Payments & Complete Transactions</p>
          <div className="text-xl"></div>
        </div>

        {/* Step Indicator */}
        <div className="border-2 border-black p-4 mb-6">
          <div className="flex justify-between items-center text-sm">
            <div className={`flex-1 text-center ${currentStepIndex >= 0 ? 'font-bold' : 'text-gray-400'}`}>
              <div className="mb-1">{currentStepIndex === 0 ? '→' : currentStepIndex > 0 ? '✓' : '○'}</div>
              <div>SELECT TABLE</div>
            </div>
            <div className="w-8 border-t-2 border-black" />
            <div className={`flex-1 text-center ${currentStepIndex >= 1 ? 'font-bold' : 'text-gray-400'}`}>
              <div className="mb-1">{currentStepIndex === 1 ? '→' : currentStepIndex > 1 ? '✓' : '○'}</div>
              <div>REVIEW BILL</div>
            </div>
            <div className="w-8 border-t-2 border-black" />
            <div className={`flex-1 text-center ${currentStepIndex >= 2 ? 'font-bold' : 'text-gray-400'}`}>
              <div className="mb-1">{currentStepIndex === 2 ? '→' : currentStepIndex > 2 ? '✓' : '○'}</div>
              <div>PAYMENT</div>
            </div>
            <div className="w-8 border-t-2 border-black" />
            <div className={`flex-1 text-center ${currentStepIndex >= 3 ? 'font-bold' : 'text-gray-400'}`}>
              <div className="mb-1">{currentStepIndex === 3 ? '→' : '○'}</div>
              <div>COMPLETE</div>
            </div>
          </div>
        </div>

        {/* Content */}
        {step === 'select' && (
          <TableSelector onTableSelect={handleTableSelect} />
        )}

        {step === 'review' && selectedTable && (
          <BillReview
            table={selectedTable}
            orders={orders}
            onComplete={handleBillReviewComplete}
            onBack={() => setStep('select')}
          />
        )}

        {step === 'payment' && billCalculation && selectedTable && (
          <div className="space-y-6">
            {!paymentMethod ? (
              <PaymentMethodSelector onSelect={handlePaymentMethodSelect} />
            ) : paymentMethod === 'CASH' ? (
              <CashPayment
                total={billCalculation.total}
                table={selectedTable}
                orders={orders}
                billCalculation={billCalculation}
                onComplete={handlePaymentComplete}
                onBack={() => setPaymentMethod(null)}
              />
            ) : (
              <PromptPayPayment
                total={billCalculation.total}
                table={selectedTable}
                orders={orders}
                billCalculation={billCalculation}
                onComplete={handlePaymentComplete}
                onBack={() => setPaymentMethod(null)}
              />
            )}
          </div>
        )}

        {step === 'complete' && paymentData && (
          <Receipt
            payment={paymentData}
            onNewTransaction={handleNewTransaction}
          />
        )}
      </div>
    </div>
  );
}
