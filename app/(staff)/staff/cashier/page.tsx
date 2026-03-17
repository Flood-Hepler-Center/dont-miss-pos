'use client';

import { useState, useEffect } from 'react';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { TableSelector } from '@/components/cashier/TableSelector';
import { NoTableOrderSelector } from '@/components/cashier/NoTableOrderSelector';
import { BillReview } from '@/components/cashier/BillReview';
import { PaymentMethodSelector } from '@/components/cashier/PaymentMethodSelector';
import { CashPayment } from '@/components/cashier/CashPayment';
import { PromptPayPayment } from '@/components/cashier/PromptPayPayment';
import { Receipt } from '@/components/cashier/Receipt';
import { orderService } from '@/lib/services/order.service';
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

  const handleNoTableOrdersSelect = (selectedOrders: Order[]) => {
    setSelectedTable(null); // No table selected
    setOrders(selectedOrders);
    setStep('review');
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

  // Real-time sync: refresh table/orders when changes occur from other pages
  useEffect(() => {
    if (!selectedTable) return;

    const unsubscribeTable = onSnapshot(
      doc(db, 'tables', selectedTable.id),
      (docSnap) => {
        if (docSnap.exists()) {
          const updatedTable = { id: docSnap.id, ...docSnap.data() } as Table;
          setSelectedTable(updatedTable);
        }
      },
      (error) => {
        console.error('Error syncing table:', error);
      }
    );

    const unsubscribeOrders = orderService.subscribeToTableOrders(
      selectedTable.id,
      (updatedOrders) => {
        setOrders(updatedOrders);
      }
    );

    return () => {
      unsubscribeTable();
      unsubscribeOrders();
    };
  }, [selectedTable?.id]);

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
          <div className="space-y-6">
            <TableSelector onTableSelect={handleTableSelect} />
            <div className="border-t-2 border-gray-300 my-6" />
            <NoTableOrderSelector onOrderSelect={handleNoTableOrdersSelect} />
          </div>
        )}

        {step === 'review' && (
          <BillReview
            table={selectedTable}
            orders={orders}
            onComplete={handleBillReviewComplete}
            onBack={() => setStep('select')}
          />
        )}

        {step === 'payment' && billCalculation && (
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
          <div className="space-y-6 pb-12">
            <Receipt payment={paymentData} orders={orders} />
            <div className="flex justify-center mt-6">
              <button 
                onClick={handleNewTransaction}
                className="bg-black text-white px-8 py-4 font-bold border-2 border-black hover:bg-gray-800 hover:text-white transition-all shadow-md"
              >
                START NEW TRANSACTION
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
