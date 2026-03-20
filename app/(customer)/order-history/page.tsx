'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { orderService } from '@/lib/services/order.service';
import { useCartStore } from '@/lib/stores/cartStore';
import type { Order } from '@/types';
import { ChevronLeft, ShoppingBag, Clock } from 'lucide-react';

export default function OrderHistoryPage() {
  const router = useRouter();
  const { sessionId, tableId } = useCartStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get session ID from store or localStorage
    const currentSessionId = sessionId || localStorage.getItem('sessionId');
    
    if (!currentSessionId) {
      setLoading(false);
      return;
    }

    // Subscribe to real-time updates
    const unsubscribe = orderService.subscribeToIncompleteOrdersBySession(
      currentSessionId,
      (updatedOrders) => {
        // Filter by tableId if available (customer view should only see their table's orders)
        const currentTableId = tableId || localStorage.getItem('tableId');
        const filteredOrders = currentTableId 
          ? updatedOrders.filter(order => order.tableId === currentTableId)
          : updatedOrders;
        setOrders(filteredOrders);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [sessionId, tableId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PLACED':
        return 'bg-amber-100 border-amber-500 text-amber-800';
      case 'PREPARING':
        return 'bg-yellow-100 border-yellow-500 text-yellow-800';
      case 'READY':
        return 'bg-green-100 border-green-500 text-green-800';
      case 'SERVED':
        return 'bg-blue-100 border-blue-500 text-blue-800';
      default:
        return 'bg-gray-100 border-gray-500 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PLACED':
        return 'ORDER PLACED';
      case 'PREPARING':
        return 'PREPARING';
      case 'READY':
        return 'READY';
      case 'SERVED':
        return 'SERVED';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white font-sour-gummy flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl mb-4">════════</div>
          <p className="text-sm">LOADING ORDERS...</p>
          <div className="text-xl mt-4">════════</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sour-gummy">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b-2 border-black px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => router.back()}
              className="p-2 border-2 border-black hover:bg-gray-100"
            >
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-xl font-bold">ORDER HISTORY</h1>
          </div>
          <div className="text-center">
            <div className="text-sm">════════════</div>
            <p className="text-xs mt-2">ACTIVE ORDERS</p>
            <div className="text-sm mt-2">════════════</div>
          </div>
        </div>

        {/* Orders List */}
        <div className="px-4 py-6">
          {orders.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-black">
              <ShoppingBag size={48} className="mx-auto mb-4 text-gray-400" />
              <p className="text-sm text-gray-600 mb-2">NO ACTIVE ORDERS</p>
              <p className="text-xs text-gray-500">
                Your orders will appear here
              </p>
              <button
                onClick={() => router.push('/menu/1/1')}
                className="mt-4 px-6 py-2 bg-black text-white text-xs font-bold border-2 border-black"
              >
                [BACK TO MENU]
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="border-2 border-black p-4"
                >
                  {/* Order Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-xs text-gray-600">ORDER #</p>
                      <p className="font-bold">{order.orderNumber || order.id.slice(-6).toUpperCase()}</p>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-bold border-2 ${getStatusColor(order.status)}`}
                    >
                      {getStatusText(order.status)}
                    </span>
                  </div>

                  {/* Items Summary */}
                  <div className="space-y-2 mb-4">
                    {order.items.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span>
                          {item.quantity}× {item.name}
                        </span>
                        <span>฿{item.subtotal.toFixed(2)}</span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <p className="text-xs text-gray-500">
                        + {order.items.length - 3} more items
                      </p>
                    )}
                  </div>

                  {/* Total */}
                  <div className="border-t-2 border-black pt-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Clock size={14} />
                        <span>
                          {order.createdAt instanceof Date
                            ? order.createdAt.toLocaleTimeString()
                            : typeof order.createdAt === 'object' && order.createdAt && 'seconds' in order.createdAt
                            ? new Date((order.createdAt as { seconds: number }).seconds * 1000).toLocaleTimeString()
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-600">TOTAL</p>
                        <p className="text-lg font-bold">฿{order.total?.toFixed(2) || '0.00'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => router.push(`/order-success?orderId=${order.id}`)}
                      className="flex-1 px-4 py-2 border-2 border-black bg-black text-white text-xs font-bold hover:bg-gray-800"
                    >
                      [VIEW DETAILS]
                    </button>
                    {order.status !== 'SERVED' && (
                      <button
                        onClick={() => router.push(`/cart`)}
                        className="flex-1 px-4 py-2 border-2 border-black bg-white text-black text-xs font-bold hover:bg-gray-100"
                      >
                        [ADD MORE]
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom spacing */}
        <div className="h-8" />
      </div>
    </div>
  );
}
