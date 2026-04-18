'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Order } from '@/types';
import { NoTableBadge } from '@/components/orders/NoTableBadge';

interface NoTableOrderSelectorProps {
  onOrderSelect: (orders: Order[]) => void;
}

export function NoTableOrderSelector({ onOrderSelect }: NoTableOrderSelectorProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', 'in', ['PLACED', 'PREPARING', 'READY', 'SERVED'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as Order))
        .filter((order) => {
          if (order.isDeleted) return false;
          if (order.orderType === 'TAKE_AWAY') {
            return true;
          }
          return !order.tableId;
        });
      setOrders(ordersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleOrderClick = (order: Order) => {
    onOrderSelect([order]);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8 font-mono">
        <div className="border-2 border-black p-4">
          <p className="text-xs">LOADING...</p>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-300 p-6 text-center font-mono">
        <p className="text-xs text-gray-500">NO ORDERS WITHOUT TABLE</p>
      </div>
    );
  }

  return (
    <div className="font-mono">
      <div className="border-2 border-amber-400 bg-amber-50 p-3 mb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-amber-800">
            ⚠️ NO-TABLE + TAKE-AWAY ORDERS ({orders.length})
          </p>
          <NoTableBadge tableId={null} />
        </div>
      </div>
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {orders.map((order) => (
          <button
            key={order.id}
            onClick={() => handleOrderClick(order)}
            className="w-full border-2 border-black p-3 hover:bg-gray-100 text-left transition-colors"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-bold">
                  ORDER #{order.orderNumber || order.id.slice(-6).toUpperCase()}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {order.items.length} items • ฿{order.total?.toFixed(2)} •{' '}
                  {order.orderType === 'TAKE_AWAY'
                    ? `TAKE-AWAY (${order.customerName || 'WALK-IN'})`
                    : 'DINE-IN / NO TABLE'}
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Status: {order.status}
                </p>
              </div>
              <NoTableBadge tableId={order.tableId} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
