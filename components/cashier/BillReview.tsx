'use client';

import { useState, useEffect } from 'react';
import { DiscountForm } from './DiscountForm';
import type { Table, Order } from '@/types';
import { ChevronDown, ChevronUp } from 'lucide-react';

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

interface BillReviewProps {
  table: Table;
  orders: Order[];
  onComplete: (calculation: BillCalculation) => void;
  onBack: () => void;
}

export function BillReview({ table, orders, onComplete, onBack }: BillReviewProps) {
  const [billCalculation, setBillCalculation] = useState<BillCalculation | null>(null);
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<string[]>(orders.map(o => o.id));

  const toggleOrder = (orderId: string) => {
    setExpandedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  useEffect(() => {
    calculateBill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const calculateBill = (discount?: { type: 'PERCENTAGE' | 'FIXED'; amount: number; reason: string }) => {
    const subtotal = orders
      .flatMap((o) => o.items || [])
      .filter((item) => !item.isVoided && !item.isComped)
      .reduce((sum, item) => sum + (item.subtotal || 0), 0);

    let discountAmount = 0;
    let discountType: 'PERCENTAGE' | 'FIXED' | undefined;
    let discountPercent: number | undefined;
    let discountReason: string | undefined;

    if (discount) {
      discountType = discount.type;
      discountReason = discount.reason;
      if (discount.type === 'PERCENTAGE') {
        discountPercent = discount.amount;
        discountAmount = subtotal * (discount.amount / 100);
      } else {
        discountAmount = discount.amount;
      }
    }

    const subtotalAfterDiscount = subtotal - discountAmount;
    const tax = 0;
    const total = subtotalAfterDiscount;

    const calculation: BillCalculation = {
      subtotal,
      discountAmount,
      subtotalAfterDiscount,
      tax,
      total,
    };

    // Only add optional fields if they exist
    if (discountType) calculation.discountType = discountType;
    if (discountPercent) calculation.discountPercent = discountPercent;
    if (discountReason) calculation.discountReason = discountReason;

    setBillCalculation(calculation);
  };

  const handleDiscountApply = (discount: { type: 'PERCENTAGE' | 'FIXED'; amount: number; reason: string }) => {
    calculateBill(discount);
    setShowDiscountForm(false);
  };

  const handleRemoveDiscount = () => {
    calculateBill();
    setShowDiscountForm(false);
  };

  const handleProceedToPayment = () => {
    if (billCalculation) {
      onComplete(billCalculation);
    }
  };

  if (!billCalculation) {
    return (
      <div className="border-2 border-black p-6 text-center font-mono">
        <p className="text-sm">CALCULATING BILL...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto font-mono">
      <button
        onClick={onBack}
        className="mb-4 px-4 py-2 border-2 border-black bg-white hover:bg-gray-100 text-sm font-bold"
      >
        [← BACK TO TABLES]
      </button>

      <div className="border-2 border-black mb-6">
        <div className="border-b-2 border-black p-4 text-center">
          <div className="text-sm">═══════</div>
          <h2 className="text-xl font-bold my-1">TABLE {table.tableNumber} BILL</h2>
          <div className="text-sm">═══════</div>
        </div>

        {/* Orders */}
        <div className="divide-y-2 divide-black">
          {orders.map((order) => (
            <div key={order.id}>
              <button
                onClick={() => toggleOrder(order.id)}
                className="w-full p-4 hover:bg-gray-50 flex justify-between items-center"
              >
                <span className="font-bold text-sm">
                  ORDER #{order.id.slice(-6).toUpperCase()}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs">{order.items?.length || 0} ITEMS</span>
                  {expandedOrders.includes(order.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>
              {expandedOrders.includes(order.id) && (
                <div className="p-4 bg-gray-50 space-y-2">
                  {order.items?.map((item, itemIdx) => (
                    <div
                      key={itemIdx}
                      className={`text-sm ${item.isVoided || item.isComped ? 'opacity-60' : ''}`}
                    >
                      <div className="flex justify-between">
                        <div className="flex-1">
                          <span className={item.isVoided ? 'line-through' : ''}>
                            {item.quantity}× {item.name}
                          </span>
                          {item.isVoided && <span className="ml-2 text-xs">[VOIDED]</span>}
                          {item.isComped && <span className="ml-2 text-xs">[COMP]</span>}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="ml-4 mt-1 text-xs text-gray-600">
                              {item.modifiers.map((mod, modIdx) => (
                                <div key={modIdx}>+ {mod.optionName}</div>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className={item.isVoided ? 'line-through' : ''}>
                          ฿{item.isComped ? '0.00' : item.subtotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bill Summary */}
        <div className="border-t-2 border-black p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>SUBTOTAL:</span>
            <span className="font-bold">฿{billCalculation.subtotal.toFixed(2)}</span>
          </div>

          {billCalculation.discountAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span>
                DISCOUNT ({billCalculation.discountType === 'PERCENTAGE' 
                  ? `${billCalculation.discountPercent}%` 
                  : 'FIXED'}):
              </span>
              <span className="font-bold">-฿{billCalculation.discountAmount.toFixed(2)}</span>
            </div>
          )}

          <div className="border-t-2 border-dashed border-black pt-2 flex justify-between text-lg">
            <span className="font-bold">TOTAL:</span>
            <span className="font-bold">฿{billCalculation.total.toFixed(2)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t-2 border-black p-4 space-y-3">
          {!showDiscountForm && billCalculation.discountAmount === 0 && (
            <button
              onClick={() => setShowDiscountForm(true)}
              className="w-full px-6 py-3 border-2 border-black bg-white hover:bg-gray-100 font-bold text-sm"
            >
              [APPLY DISCOUNT]
            </button>
          )}

          {!showDiscountForm && billCalculation.discountAmount > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowDiscountForm(true)}
                className="px-6 py-3 border-2 border-black bg-white hover:bg-gray-100 font-bold text-sm"
              >
                [CHANGE]
              </button>
              <button
                onClick={handleRemoveDiscount}
                className="px-6 py-3 border-2 border-black bg-white hover:bg-gray-100 font-bold text-sm"
              >
                [REMOVE]
              </button>
            </div>
          )}

          {showDiscountForm && (
            <DiscountForm
              subtotal={billCalculation.subtotal}
              onApply={handleDiscountApply}
              onCancel={() => setShowDiscountForm(false)}
            />
          )}

          <button
            onClick={handleProceedToPayment}
            className="w-full px-6 py-4 border-2 border-black bg-black text-white hover:bg-gray-800 font-bold text-sm"
          >
            [PROCEED TO PAYMENT]
          </button>
        </div>
      </div>
    </div>
  );
}
