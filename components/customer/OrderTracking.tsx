'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Order, OrderStatus, OrderItem, SelectedModifier } from '@/types';

interface OrderTrackingProps {
  orderId: string;
}

const statusConfig: Record<OrderStatus, {
  label: string;
  symbol: string;
  description: string;
}> = {
  PLACED: {
    label: 'ORDER PLACED',
    symbol: '[ ✓ ]',
    description: 'Order received by kitchen',
  },
  PREPARING: {
    label: 'PREPARING',
    symbol: '[ 👨‍🍳 ]',
    description: 'Your food is being prepared...',
  },
  READY: {
    label: 'READY',
    symbol: '[ 📦 ]',
    description: 'Order is ready for pickup!',
  },
  SERVED: {
    label: 'SERVED',
    symbol: '[ 🍽 ]',
    description: 'Enjoy your meal!',
  },
  COMPLETED: {
    label: 'COMPLETED',
    symbol: '[ ✓ ]',
    description: 'Order completed',
  },
  CANCELLED: {
    label: 'CANCELLED',
    symbol: '[ ✗ ]',
    description: 'Order cancelled',
  },
};

const statusOrder: OrderStatus[] = ['PLACED', 'PREPARING', 'READY', 'SERVED'];

export function OrderTracking({ orderId }: OrderTrackingProps) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orderRef = doc(db, 'orders', orderId);
    
    const unsubscribe = onSnapshot(orderRef, (doc) => {
      if (doc.exists()) {
        setOrder({
          id: doc.id,
          ...doc.data(),
        } as Order);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [orderId]);

  if (loading || !order) {
    return (
      <div className="min-h-screen bg-white font-sour-gummy flex items-center justify-center p-6">
        <div className="border-2 border-black p-8">
          <div className="text-center">
            <div className="text-sm mb-2">═</div>
            <p className="text-sm font-bold">LOADING ORDER...</p>
            <div className="text-sm mt-2">═</div>
          </div>
        </div>
      </div>
    );
  }

  const currentStatusIndex = statusOrder.indexOf(order.status);

  return (
    <div className="min-h-screen bg-white font-sour-gummy p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6">
          <div className="text-center">
            <div className="text-sm"></div>
            <h1 className="text-xl font-bold my-2">TRACK YOUR ORDER</h1>
            <div className="text-sm"></div>
          </div>
          <div className="mt-4 text-center text-xs">
            <div>ORDER #{order.orderNumber || order.id.slice(-6).toUpperCase()}</div>
            <div>TABLE {order.tableId}</div>
          </div>
        </div>

        {/* Status Timeline */}
        <div className="border-2 border-black mb-6">
          <div className="border-b-2 border-black p-3 bg-white">
            <h2 className="text-center font-bold text-sm">[ ORDER STATUS ]</h2>
          </div>
          
          <div className="p-4">
            {statusOrder.map((status, index) => {
              const config = statusConfig[status];
              const isCompleted = index <= currentStatusIndex;
              const isCurrent = index === currentStatusIndex;
              
              return (
                <div key={status} className="mb-4 last:mb-0">
                  <div className={`border-2 border-black p-3 ${
                    isCurrent ? 'bg-black text-white' : isCompleted ? 'bg-gray-100' : 'bg-white'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold">{config.symbol} {config.label}</span>
                      <span className="text-xs">
                        {isCompleted && !isCurrent && '[✓]'}
                        {isCurrent && '[CURRENT]'}
                        {!isCompleted && '[PENDING]'}
                      </span>
                    </div>
                    {isCurrent && (
                      <div className="text-xs mt-2 border-t-2 border-dashed pt-2 ${
                        isCurrent ? 'border-white' : 'border-black'
                      }">
                        {config.description}
                      </div>
                    )}
                  </div>
                  {index < statusOrder.length - 1 && (
                    <div className="flex justify-center">
                      <div className={`w-0.5 h-4 ${
                        isCompleted ? 'bg-black' : 'bg-gray-300'
                      }`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Order Items */}
        <div className="border-2 border-black">
          <div className="border-b-2 border-black p-3 bg-white">
            <h2 className="text-center font-bold text-sm">[ ORDER ITEMS ]</h2>
          </div>
          
          <div className="divide-y-2 divide-black">
            {order.items.map((item: OrderItem, idx: number) => (
              <div key={idx} className="p-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-sm font-bold">
                      {item.quantity}x {item.name.toUpperCase()}
                    </p>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <div className="text-xs mt-1 text-gray-600">
                        {item.modifiers.map((m: SelectedModifier) => m.optionName).join(', ')}
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-bold">
                    ฿{item.subtotal.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="border-t-2 border-dashed border-black p-4 bg-gray-50">
            <div className="flex justify-between text-lg font-bold">
              <span>TOTAL</span>
              <span>฿{order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6">
          <button
            onClick={() => router.push(`/menu/${order.tableId}`)}
            className="w-full bg-black text-white p-4 font-bold border-2 border-black hover:bg-gray-800 transition-all text-sm shadow-md flex items-center justify-center gap-2"
          >
            ^ ORDER MORE
          </button>
        </div>
      </div>
    </div>
  );
}
