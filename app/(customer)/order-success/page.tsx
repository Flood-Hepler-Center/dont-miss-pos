'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { orderService } from '@/lib/services/order.service';
import { OrderTracking } from '@/components/customer/OrderTracking';
import type { Order, OrderItem } from '@/types';

function OrderSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [order, setOrder] = useState<Order | null>(null);
  const [showTracking, setShowTracking] = useState(false);

  useEffect(() => {
    if (orderId) {
      orderService.getById(orderId).then(setOrder);
    }
  }, [orderId]);

  if (!orderId || !order) {
    return (
      <div className="min-h-screen bg-white font-sour-gummy flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-xl mb-4">══════</div>
          <p className="text-sm">LOADING ORDER DETAILS...</p>
          <div className="text-xl mt-4">══════</div>
        </div>
      </div>
    );
  }

  if (showTracking) {
    return <OrderTracking orderId={orderId} />;
  }

  return (
    <div className="min-h-screen bg-white font-sour-gummy flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full border-2 border-black p-6">
        {/* Receipt Header */}
        <div className="text-center mb-6">
          <div className="text-xl">════════</div>
          <h1 className="text-2xl font-bold my-4">DON&apos;T MISS THIS SATURDAY</h1>
          <div className="text-xl">════════</div>
        </div>

        {/* Success Message */}
        <div className="text-center mb-6 py-4 border-y-2 border-black">
          <div className="text-4xl mb-2">✓</div>
          <h2 className="text-lg font-bold mb-1">ORDER RECEIVED</h2>
          <p className="text-xs text-gray-600">Your order has been sent to the kitchen</p>
        </div>

        {/* Order Details */}
        <div className="space-y-3 mb-6">
          <div className="flex justify-between text-sm">
            <span>ORDER #:</span>
            <span className="font-bold">{order.orderNumber || order.id.slice(-6).toUpperCase()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>TABLE #:</span>
            <span className="font-bold">{order.tableId}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>STATUS:</span>
            <span className="font-bold">{order.status}</span>
          </div>
        </div>

        {/* Items */}
        <div className="border-t-2 border-black pt-4 mb-4">
          <p className="text-xs font-bold mb-3">ORDER ITEMS:</p>
          <div className="space-y-2">
            {order.items.map((item: OrderItem, idx: number) => (
              <div key={idx} className="flex justify-between text-sm">
                <span>
                  {item.quantity}× {item.name.toUpperCase()}
                </span>
                <span>฿{item.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="border-t-2 border-dashed border-black pt-4 mb-6">
          <div className="flex justify-between text-lg font-bold">
            <span>TOTAL:</span>
            <span>฿{order.total.toFixed(2)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-600 mb-6">
          <p>Thank you for your order!</p>
          <p>We&apos;ll notify you when it&apos;s ready</p>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={() => setShowTracking(true)}
            className="w-full bg-black text-white px-6 py-3 border-2 border-black font-bold text-sm hover:bg-gray-800 transition-colors"
          >
            [TRACK ORDER]
          </button>
          <button
            onClick={() => router.push(`/menu/${order.tableId}`)}
            className="w-full bg-white text-black px-6 py-3 border-2 border-black font-bold text-sm hover:bg-gray-100 transition-colors"
          >
            [ORDER MORE]
          </button>
        </div>

        {/* Receipt Footer */}
        <div className="text-center mt-6">
          <div className="text-xl">════════</div>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white font-sour-gummy flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl mb-4">══</div>
          <p className="text-sm">LOADING...</p>
          <div className="text-xl mt-4">══</div>
        </div>
      </div>
    }>
      <OrderSuccessContent />
    </Suspense>
  );
}
