'use client';

import { Utensils, Package } from 'lucide-react';
import type { OrderType } from '@/types';

interface OrderTypeSelectorProps {
  value: OrderType;
  onChange: (type: OrderType) => void;
}

export function OrderTypeSelector({ value, onChange }: OrderTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <button
        type="button"
        onClick={() => onChange('DINE_IN')}
        className={`p-4 border-2 font-bold flex items-center justify-center gap-2 transition-colors ${
          value === 'DINE_IN' 
            ? 'bg-black text-white border-black' 
            : 'border-gray-300 hover:border-black'
        }`}
      >
        <Utensils size={20} />
        DINE-IN
      </button>
      <button
        type="button"
        onClick={() => onChange('TAKE_AWAY')}
        className={`p-4 border-2 font-bold flex items-center justify-center gap-2 transition-colors ${
          value === 'TAKE_AWAY' 
            ? 'bg-blue-600 text-white border-blue-600' 
            : 'border-gray-300 hover:border-blue-600'
        }`}
      >
        <Package size={20} />
        TAKE-AWAY
      </button>
    </div>
  );
}
