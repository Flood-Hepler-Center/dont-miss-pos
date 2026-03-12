'use client';

import { Users } from 'lucide-react';
import type { Table } from '@/types';

interface TableCardProps {
  table: Table;
  onClick: () => void;
}

const statusConfig = {
  VACANT: {
    bg: 'bg-gray-100',
    border: 'border-gray-300',
    text: 'text-gray-600',
    label: 'Vacant',
  },
  OCCUPIED: {
    bg: 'bg-blue-50',
    border: 'border-blue-500',
    text: 'text-blue-600',
    label: 'Occupied',
  },
  WAITING: {
    bg: 'bg-orange-50',
    border: 'border-orange-500',
    text: 'text-orange-600',
    label: 'Waiting',
  },
  READY_TO_PAY: {
    bg: 'bg-green-50',
    border: 'border-green-500',
    text: 'text-green-600',
    label: 'Ready to Pay',
  },
};

export function TableCard({ table, onClick }: TableCardProps) {
  const config = statusConfig[table.status as keyof typeof statusConfig] || statusConfig.VACANT;

  return (
    <div
      onClick={onClick}
      className={`${config.bg} ${config.border} border-2 rounded-xl p-6 cursor-pointer transition-all hover:shadow-soft-md ${
        table.status !== 'VACANT' ? 'hover:scale-105' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-2xl font-bold text-gray-900">Table {table.tableNumber}</h3>
        <Users size={24} className={config.text} strokeWidth={2} />
      </div>

      <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text} border ${config.border}`}>
        {config.label}
      </div>

      {table.status !== 'VACANT' && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex justify-between items-center text-sm mb-2">
            <span className="text-gray-600">Active Orders:</span>
            <span className="font-semibold text-gray-900">{table.activeOrders?.length || 0}</span>
          </div>
        </div>
      )}
    </div>
  );
}
