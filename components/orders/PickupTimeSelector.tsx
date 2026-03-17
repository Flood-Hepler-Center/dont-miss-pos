'use client';

import { Clock } from 'lucide-react';

interface PickupTimeSelectorProps {
  value?: Date;
  onChange: (time: Date | undefined) => void;
}

export function PickupTimeSelector({ value, onChange }: PickupTimeSelectorProps) {
  const formatForInput = (date: Date) => {
    return date.toISOString().slice(0, 16);
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold uppercase">
        Pickup Time (Optional)
      </label>
      <div className="relative">
        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="datetime-local"
          value={value ? formatForInput(value) : ''}
          onChange={(e) => {
            const date = e.target.value ? new Date(e.target.value) : undefined;
            onChange(date);
          }}
          min={formatForInput(new Date())}
          className="w-full pl-10 pr-4 py-3 border-2 border-black text-sm"
        />
      </div>
      <p className="text-gray-500 text-xs">
        If not set, order will be prepared ASAP
      </p>
    </div>
  );
}
