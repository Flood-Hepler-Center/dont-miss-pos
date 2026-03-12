'use client';

import { useCartStore } from '@/lib/stores/cartStore';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { orderService } from '@/lib/services/order.service';
import { X } from 'lucide-react';
import type { CreateOrderInput } from '@/types';

export default function CartPage() {
  const router = useRouter();
  const {
    items,
    tableId,
    sessionId,
    updateQuantity,
    removeItem,
    clearCart,
    getSubtotal,
    getTotal,
  } = useCartStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loading overlay component
  const LoadingOverlay = () => (
    <div className="fixed inset-0 bg-white/95 z-50 flex items-center justify-center font-sour-gummy">
      <div className="border-2 border-black p-12 bg-white">
        <div className="text-center">
          <div className="text-xl mb-3">═════</div>
          <p className="text-lg font-bold mb-1">SUBMITTING ORDER</p>
          <p className="text-xs">PLEASE WAIT...</p>
          <div className="text-xl mt-3">═════</div>
        </div>
      </div>
    </div>
  );

  const handleSubmitOrder = async () => {
    if (items.length === 0) {
      setError('Your cart is empty');
      return;
    }

    if (!tableId || !sessionId) {
      setError('Session expired. Please scan QR code again.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const orderInput: CreateOrderInput = {
        tableId,
        sessionId,
        items: items.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.subtotal,
          modifiers: item.modifiers,
        })),
        entryMethod: 'QR',
      };

      const orderId = await orderService.create(orderInput);
      clearCart();
      router.push(`/order-success?orderId=${orderId}`);
    } catch (err) {
      console.error('Error submitting order:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-white font-sour-gummy flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-xl mb-4"></div>
          <h1 className="text-2xl font-bold mb-2">CART IS EMPTY</h1>
          <div className="text-xl mb-6"></div>
          <p className="text-sm text-gray-600 mb-8">
            Add items from the menu to get started
          </p>
          <button
            onClick={() => router.back()}
            className="bg-black text-white px-8 py-3 border-2 border-black font-bold text-sm hover:bg-gray-800 transition-colors"
          >
            [BACK TO MENU]
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {isSubmitting && <LoadingOverlay />}
      <div className="min-h-screen bg-white pb-24 font-sour-gummy">
        <div className="max-w-2xl mx-auto">
          {/* Receipt Header */}
          <div className="sticky top-0 z-10 bg-white border-b-2 border-black px-4 py-4">
            <div className="text-center">
              <div className="text-sm">════════════</div>
              <h1 className="text-2xl font-bold my-2">DON&apos;T MISS THIS SATURDAY</h1>
              <p className="text-xs">ORDER REVIEW - TABLE #{tableId}</p>
              <div className="text-sm">════════════</div>
            </div>
          </div>

          {/* Items List */}
          <div className="px-4 py-6">
          <div className="border-2 border-black">
            {items.map((item) => (
              <div key={item.id} className="border-b-2 border-black pb-3 last:border-0 p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <p className="font-bold text-sm">{item.name}</p>
                    <p className="text-xs text-gray-600">฿{item.price.toFixed(2)} each</p>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <div className="mt-1 text-xs text-gray-600">
                        {item.modifiers.map((mod, idx) => (
                          <div key={idx}>
                            • {mod.optionName}
                            {mod.priceMode === 'absolute' && mod.absolutePrice ? 
                              ` (฿${mod.absolutePrice.toFixed(2)})` :
                              mod.priceAdjustment !== 0 ? ` (+฿${mod.priceAdjustment.toFixed(2)})` : ''
                            }
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1 hover:bg-gray-100 transition-colors"
                    aria-label="Remove item"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-7 h-7 flex items-center justify-center border-2 border-black bg-white hover:bg-gray-100 transition-colors"
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <span className="font-bold w-8 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-7 h-7 flex items-center justify-center border-2 border-black bg-white hover:bg-gray-100 transition-colors"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-600">฿{item.price.toFixed(2)} × {item.quantity}</p>
                    <p className="font-bold">฿{item.subtotal.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Receipt Totals */}
          <div className="mt-6 border-2 border-black p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>SUBTOTAL:</span>
                <span>฿{getSubtotal().toFixed(2)}</span>
              </div>
              <div className="border-t-2 border-dashed border-black my-2" />
              <div className="flex justify-between text-lg font-bold">
                <span>TOTAL:</span>
                <span>฿{getTotal().toFixed(2)}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-6 border-2 border-black bg-red-50 p-4">
              <p className="text-sm text-center font-bold text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Fixed Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-black p-4">
          <div className="max-w-2xl mx-auto grid grid-cols-2 gap-3">
            <button
              onClick={() => router.back()}
              className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100 transition-colors"
            >
              [BACK]
            </button>
            <button
              onClick={handleSubmitOrder}
              disabled={isSubmitting}
              className="px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '[PLACING ORDER...]' : '[CONFIRM ORDER]'}
            </button>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
