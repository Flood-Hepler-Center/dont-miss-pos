'use client';

import { useState } from 'react';
import { message } from 'antd';

interface DiscountFormProps {
  subtotal: number;
  onApply: (discount: { type: 'PERCENTAGE' | 'FIXED'; amount: number; reason: string }) => void;
  onCancel: () => void;
}

export function DiscountForm({ subtotal, onApply, onCancel }: DiscountFormProps) {
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState<string>('');

  const reasonOptions = [
    { value: 'Promotion', label: 'Promotion' },
    { value: 'Manager discount', label: 'Manager discount' },
    { value: 'Loyalty program', label: 'Loyalty program' },
    { value: 'Service recovery', label: 'Service recovery' },
    { value: 'Other', label: 'Other' },
  ];

  const handleApply = () => {
    if (!amount || amount <= 0) {
      message.error('Please enter a valid discount amount');
      return;
    }

    if (!reason) {
      message.error('Please select a discount reason');
      return;
    }

    if (type === 'PERCENTAGE' && (amount < 0 || amount > 100)) {
      message.error('Percentage discount must be between 0% and 100%');
      return;
    }

    if (type === 'FIXED' && amount > subtotal) {
      message.error('Fixed discount cannot exceed bill amount');
      return;
    }

    onApply({ type, amount, reason });
  };

  const calculatedDiscount = type === 'PERCENTAGE' 
    ? subtotal * (amount / 100) 
    : amount;

  return (
    <div className="border-2 border-black p-4 bg-white font-mono">
      <h3 className="text-sm font-bold mb-4 text-center border-b-2 border-black pb-2">[ APPLY DISCOUNT ]</h3>

      <div className="space-y-4">
        {/* Discount Type */}
        <div>
          <label className="block text-xs font-bold mb-2">TYPE</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setType('PERCENTAGE')}
              className={`px-4 py-2 border-2 border-black text-xs font-bold ${
                type === 'PERCENTAGE' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              [PERCENTAGE %]
            </button>
            <button
              onClick={() => setType('FIXED')}
              className={`px-4 py-2 border-2 border-black text-xs font-bold ${
                type === 'FIXED' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              [FIXED ฿]
            </button>
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-bold mb-2">AMOUNT</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            min={0}
            max={type === 'PERCENTAGE' ? 100 : subtotal}
            className="w-full px-4 py-3 border-2 border-black text-center text-lg focus:outline-none"
            placeholder={type === 'PERCENTAGE' ? '0%' : '฿0'}
          />
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs font-bold mb-2">REASON</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-4 py-3 border-2 border-black text-sm focus:outline-none"
          >
            <option value="">SELECT REASON</option>
            {reasonOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label.toUpperCase()}</option>
            ))}
          </select>
        </div>

        {/* Preview */}
        {amount > 0 && (
          <div className="border-2 border-dashed border-black p-3">
            <div className="flex justify-between text-sm">
              <span>DISCOUNT AMOUNT:</span>
              <span className="font-bold">-฿{calculatedDiscount.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-3 border-2 border-black bg-white hover:bg-gray-100 font-bold text-xs"
          >
            [CANCEL]
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-3 border-2 border-black bg-black text-white hover:bg-gray-800 font-bold text-xs"
          >
            [APPLY]
          </button>
        </div>
      </div>
    </div>
  );
}
