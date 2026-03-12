'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/lib/stores/cartStore';
import { ShoppingCart, Eye } from 'lucide-react';
import Image from 'next/image';
import type { MenuCategory, MenuItem } from '@/types';
import { ItemModifierModal } from './ItemModifierModal';

interface MenuClientProps {
  tableId: string;
  categories: MenuCategory[];
  items: MenuItem[];
}

export function MenuClient({ tableId, categories, items }: MenuClientProps) {
  const router = useRouter();
  const { addItem, getItemCount, setTableId, setSessionId } = useCartStore();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [addedItemId, setAddedItemId] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);

  useEffect(() => {
    setTableId(tableId);
    
    const existingSessionId = localStorage.getItem('sessionId');
    if (!existingSessionId) {
      const newSessionId = crypto.randomUUID();
      localStorage.setItem('sessionId', newSessionId);
      setSessionId(newSessionId);
    } else {
      setSessionId(existingSessionId);
    }
  }, [tableId, setTableId, setSessionId]);

  const handleAddToCart = (item: MenuItem) => {
    // Check if item has modifiers
    if (item.modifiers && item.modifiers.length > 0) {
      setModifierItem(item);
    } else {
      addItem(item, 1);
      setAddedItemId(item.id);
      setTimeout(() => setAddedItemId(null), 600);
    }
  };

  const handleAddWithModifiers = (item: MenuItem, quantity: number, modifiers: Array<{ groupId: string; optionId: string; optionName: string; priceAdjustment: number }>) => {
    addItem(item, quantity, modifiers);
    setAddedItemId(item.id);
    setTimeout(() => setAddedItemId(null), 600);
  };

  const filteredItems = activeCategory === 'all' 
    ? items 
    : items.filter((item) => item.categoryId === activeCategory);

  const cartCount = getItemCount();

  return (
    <div className="min-h-screen bg-white pb-24 font-mono">
      {/* Receipt Header */}
      <div className="sticky top-0 z-20 bg-white border-b-2 border-black px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-4">
            <div className="text-sm">════════════</div>
            <h1 className="text-2xl font-bold my-2">DON&apos;T MISS THIS SATURDAY</h1>
            <p className="text-xs">TABLE #{tableId}</p>
            <div className="text-sm">════════════</div>
          </div>

          {/* Category Filter */}
          <div className="mb-3">
            <p className="text-xs font-bold mb-2 text-center">
              CATEGORY: {activeCategory === 'all' ? 'ALL ITEMS' : categories.find(c => c.id === activeCategory)?.name.toUpperCase() || 'ALL'}
            </p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide text-xs">
            <button
              onClick={() => setActiveCategory('all')}
              className={`flex-shrink-0 px-3 py-1 border-2 border-black transition-all ${
                activeCategory === 'all'
                  ? 'bg-black text-white'
                  : 'bg-white text-black hover:bg-gray-100'
              }`}
            >
              [ALL ITEMS]
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`flex-shrink-0 px-3 py-1 border-2 border-black transition-all ${
                  activeCategory === category.id
                    ? 'bg-black text-white'
                    : 'bg-white text-black hover:bg-gray-100'
                }`}
              >
                [{category.name.toUpperCase()}]
              </button>
            ))}
          </div>
        </div>

        {/* Cart Button */}
        <button
          onClick={() => router.push('/cart')}
          className="absolute top-4 right-4 p-2 bg-black text-white border-2 border-black hover:bg-gray-800 transition-all"
          aria-label={`Cart with ${cartCount} items`}
        >
          <ShoppingCart size={20} />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-black text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Menu Items - Receipt Style */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="space-y-1">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white border-2 border-black p-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="text-sm font-bold uppercase">{item.name}</h3>
                    {!item.isAvailable && (
                      <span className="text-xs bg-black text-white px-2 py-0.5">SOLD OUT</span>
                    )}
                  </div>
                  
                  {item.description && (
                    <p className="text-xs text-gray-600 mb-2 leading-relaxed">
                      {item.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-bold text-base">฿{item.price.toFixed(2)}</span>
                    
                    {item.imageUrl && (
                      <button
                        onClick={() => setViewingImage(item.imageUrl!)}
                        className="text-gray-600 hover:text-black underline flex items-center gap-1"
                      >
                        <Eye size={12} />
                        <span>view photo</span>
                      </button>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleAddToCart(item)}
                  disabled={!item.isAvailable}
                  className={`flex-shrink-0 px-4 py-2 text-xs font-bold border-2 border-black transition-all ${
                    addedItemId === item.id
                      ? 'bg-green-600 text-white border-green-600'
                      : item.isAvailable
                      ? 'bg-black text-white hover:bg-gray-800'
                      : 'bg-gray-300 text-gray-500 border-gray-300 cursor-not-allowed'
                  }`}
                >
                  {addedItemId === item.id ? '✓ ADDED' : '+ ADD'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-12 border-2 border-black border-dashed">
            <p className="text-sm text-gray-600">NO ITEMS IN THIS CATEGORY</p>
          </div>
        )}
      </div>

      {/* Floating Cart Button */}
      {cartCount > 0 && (
        <button
          onClick={() => router.push('/cart')}
          className="fixed bottom-6 right-6 bg-black text-white px-6 py-3 border-2 border-black shadow-lg hover:shadow-xl transition-all flex items-center gap-2 text-sm font-bold"
        >
          <ShoppingCart size={18} />
          VIEW CART ({cartCount})
        </button>
      )}

      {/* Image Modal */}
      {viewingImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <div className="max-w-2xl w-full">
            <div className="relative w-full aspect-video bg-white">
              <Image
                src={viewingImage}
                alt="Menu item"
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 672px"
              />
            </div>
            <button
              className="mt-4 w-full bg-white text-black px-6 py-3 border-2 border-white font-bold text-sm hover:bg-gray-100"
              onClick={() => setViewingImage(null)}
            >
              [CLOSE]
            </button>
          </div>
        </div>
      )}

      {/* Modifier Selection Modal */}
      {modifierItem && (
        <ItemModifierModal
          item={modifierItem}
          onClose={() => setModifierItem(null)}
          onAddToCart={handleAddWithModifiers}
        />
      )}
    </div>
  );
}
