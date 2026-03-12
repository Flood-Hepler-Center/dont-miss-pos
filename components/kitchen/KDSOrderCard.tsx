'use client';

import { Card } from 'antd';
import { Clock } from 'lucide-react';
import type { Order } from '@/types';

interface KDSOrderCardProps {
  order: Order;
  onClick: () => void;
}

export function KDSOrderCard({ order, onClick }: KDSOrderCardProps) {
  const getTimeSinceOrder = () => {
    if (!order.createdAt) return 0;
    const orderTime = order.createdAt instanceof Date 
      ? order.createdAt 
      : new Date((order.createdAt as {seconds: number}).seconds * 1000);
    const now = new Date();
    return Math.floor((now.getTime() - orderTime.getTime()) / 60000);
  };

  const minutesSinceOrder = getTimeSinceOrder();
  const isUrgent = minutesSinceOrder > 15;
  const isCritical = minutesSinceOrder > 30;

  const urgencyColor = isCritical
    ? 'border-red-500 bg-red-50'
    : isUrgent
    ? 'border-orange-500 bg-orange-50'
    : 'border-gray-200 bg-white';

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-soft-md ${urgencyColor} border-2`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-3xl font-bold text-gray-900">
          Table {order.tableId}
        </h3>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Clock size={16} strokeWidth={2} />
          <span className={minutesSinceOrder > 15 ? 'font-bold text-orange-600' : ''}>
            {minutesSinceOrder}m
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {order.items?.map((item, idx) => (
          <div key={idx} className="flex justify-between items-start">
            <div className="flex-1">
              <span className="font-semibold text-gray-900">
                {item.quantity}x {item.name}
              </span>
              {item.modifiers && item.modifiers.length > 0 && (
                <div className="ml-4 mt-1">
                  {item.modifiers.map((mod, modIdx) => (
                    <span
                      key={modIdx}
                      className="inline-block px-2 py-1 mr-2 text-xs bg-yellow-100 text-yellow-800 rounded"
                    >
                      {mod.optionName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {order.specialInstructions && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-sm text-gray-600 italic">{order.specialInstructions}</p>
        </div>
      )}
    </Card>
  );
}
