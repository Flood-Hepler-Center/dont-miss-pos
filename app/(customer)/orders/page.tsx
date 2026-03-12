'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useCartStore } from '@/lib/stores/cartStore';
import type { Order } from '@/types';

export default function CustomerOrdersPage() {
  const router = useRouter();
  const { tableId } = useCartStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tableId) {
      // If no table ID, redirect to menu
      router.push('/menu');
      return;
    }

    // Query all orders for this table that haven't been completed (paid)
    const ordersQuery = query(
      collection(db, 'orders'),
      where('tableId', '==', tableId),
      where('status', 'in', ['PLACED', 'PREPARING', 'READY', 'SERVED']),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      
      setOrders(fetchedOrders);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tableId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white font-mono flex items-center justify-center p-6">
        <div className="border-2 border-black p-8">
          <div className="text-center">
            <div className="text-sm mb-2">═</div>
            <p className="text-sm font-bold">LOADING ORDERS...</p>
            <div className="text-sm mt-2">═</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-mono p-4 pb-24">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6">
          <div className="text-center">
            <div className="text-sm"></div>
            <h1 className="text-xl font-bold my-2">YOUR ORDERS</h1>
            <p className="text-xs">TABLE {tableId}</p>
            <div className="text-sm"></div>
          </div>
        </div>

        {/* Orders List */}
        {orders.length === 0 ? (
          <div className="border-2 border-black p-12">
            <div className="text-center">
              <p className="text-sm mb-4">NO ACTIVE ORDERS</p>
              <p className="text-xs text-gray-600 mb-6">
                Orders will appear here once placed
              </p>
              <button
                onClick={() => router.push(`/menu/${tableId}`)}
                className="px-6 py-3 border-2 border-black bg-black text-white hover:bg-gray-800 font-bold text-sm"
              >
                [ORDER NOW]
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="border-2 border-black">
                {/* Order Header */}
                <div className="border-b-2 border-black p-3 bg-gray-50">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold">ORDER #{order.id.slice(-8).toUpperCase()}</p>
                      <p className="text-xs text-gray-600">
                        {order.createdAt && typeof (order.createdAt as unknown as Timestamp).toMillis === 'function' 
                          ? new Date((order.createdAt as unknown as Timestamp).toMillis()).toLocaleTimeString()
                          : new Date(order.createdAt as unknown as Date).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className={`px-3 py-1 border-2 border-black text-xs font-bold ${
                      order.status === 'READY' ? 'bg-black text-white' : 'bg-white'
                    }`}>
                      {order.status}
                    </div>
                  </div>
                </div>

                {/* Order Items */}
                <div className="divide-y-2 divide-black">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="p-3">
                      <div className="flex justify-between text-sm">
                        <span>{item.quantity}x {item.name}</span>
                        <span className="font-bold">฿{item.subtotal.toFixed(2)}</span>
                      </div>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="text-xs text-gray-600 mt-1">
                          {item.modifiers.map(m => m.optionName).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Order Total */}
                <div className="border-t-2 border-black p-3 bg-gray-50">
                  <div className="flex justify-between font-bold">
                    <span className="text-sm">TOTAL</span>
                    <span className="text-sm">฿{order.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Track Button */}
                <div className="border-t-2 border-black p-3">
                  <button
                    onClick={() => router.push(`/order-success?orderId=${order.id}`)}
                    className="w-full px-4 py-2 border-2 border-black bg-white hover:bg-gray-100 font-bold text-sm"
                  >
                    [TRACK ORDER]
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-black p-4">
          <div className="max-w-2xl mx-auto grid grid-cols-2 gap-3">
            <button
              onClick={() => router.push(`/menu/${tableId}`)}
              className="px-6 py-3 border-2 border-black bg-white hover:bg-gray-100 font-bold text-sm"
            >
              [BACK TO MENU]
            </button>
            <button
              onClick={() => router.push('/cart')}
              className="px-6 py-3 border-2 border-black bg-black text-white hover:bg-gray-800 font-bold text-sm"
            >
              [VIEW CART]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
