"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/lib/stores/cartStore";
import { Notebook, ShoppingCart } from "lucide-react";
import Image from "next/image";
import type { MenuCategory, MenuItem, SelectedModifier } from "@/types";
import { ItemModifierModal } from "./ItemModifierModal";
import { CallStaffButton } from "./CallStaffButton";

interface MenuClientProps {
  tableId: string;
  categories: MenuCategory[];
  items: MenuItem[];
}

export function MenuClient({ tableId, categories, items }: MenuClientProps) {
  const router = useRouter();
  const { addItem, getItemCount, setTableId, setSessionId } = useCartStore();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [addedItemId, setAddedItemId] = useState<string | null>(null);
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);

  useEffect(() => {
    setTableId(tableId);

    const existingSessionId = localStorage.getItem("sessionId");
    if (!existingSessionId) {
      const newSessionId = crypto.randomUUID();
      localStorage.setItem("sessionId", newSessionId);
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

  const handleAddWithModifiers = (
    item: MenuItem,
    quantity: number,
    modifiers: SelectedModifier[],
  ) => {
    addItem(item, quantity, modifiers);
    setAddedItemId(item.id);
    setTimeout(() => setAddedItemId(null), 600);
  };

  // Sort categories by displayOrder
  const sortedCategories = [...categories].sort(
    (a, b) => (a.displayOrder || 999) - (b.displayOrder || 999)
  );

  const filteredItems =
    activeCategory === "all"
      ? [...items].sort((a, b) => {
          const catA = sortedCategories.find((c) => c.id === a.categoryId);
          const catB = sortedCategories.find((c) => c.id === b.categoryId);
          const catOrderA = catA?.displayOrder || 999;
          const catOrderB = catB?.displayOrder || 999;
          
          if (catOrderA !== catOrderB) return catOrderA - catOrderB;
          return (a.displayOrder || 999) - (b.displayOrder || 999);
        })
      : [...items]
          .filter((item) => item.categoryId === activeCategory)
          .sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999));

  const getIsAvailable = (item: MenuItem) => {
    if (!item.isAvailable) return false;
    if (item.hasStockTracking) {
      return item.stock !== undefined && item.stock > 0;
    }
    return true;
  };

  const cartCount = getItemCount();

  return (
    <div className="min-h-screen bg-white pb-24 font-sour-gummy">
      {/* Receipt Header */}
      <div className="sticky top-0 z-20 bg-white border-b-2 border-black px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-4">
            <div className="text-sm">════════════</div>
            <h1 className="text-2xl font-bold my-2">
              DON&apos;T MISS THIS SATURDAY
            </h1>
            <p className="text-xs">TABLE #{tableId}</p>
            <div className="text-sm">════════════</div>
          </div>

          {/* Category Filter */}
          <div className="mb-3">
            <p className="text-xs font-bold mb-2 text-center">
              CATEGORY:{" "}
              {activeCategory === "all"
                ? "ALL ITEMS"
                : categories
                  .find((c) => c.id === activeCategory)
                  ?.name.toUpperCase() || "ALL"}
            </p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide text-xs">
            <button
              onClick={() => setActiveCategory("all")}
              className={`flex-shrink-0 px-3 py-1 border-2 border-black transition-all ${activeCategory === "all"
                ? "bg-black text-white"
                : "bg-white text-black hover:bg-gray-100"
                }`}
            >
              [ALL ITEMS]
            </button>
            {sortedCategories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`flex-shrink-0 px-3 py-1 border-2 border-black transition-all ${activeCategory === category.id
                  ? "bg-black text-white"
                  : "bg-white text-black hover:bg-gray-100"
                  }`}
              >
                [{category.name.toUpperCase()}]
              </button>
            ))}
          </div>
        </div>

        {/* Cart Button */}
        <button
          onClick={() => router.push("/cart")}
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

        {/* Order History Button */}
        <button
          onClick={() => router.push("/order-history")}
          className="absolute top-4 left-4 p-2 border-2 border-black bg-white hover:bg-gray-100 transition-all"
          aria-label="Order History"
        >
          <span className="flex items-center gap-2 text-xs font-bold">
            <Notebook size={16} />
          </span>
        </button>
      </div>

      {/* Menu Items - With Images */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white border-2 border-black p-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Item Image */}
                {item.imageUrl && (
                  <div className="relative w-20 h-20 shrink-0 border-2 border-black">
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                      unoptimized
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="text-sm font-bold uppercase">{item.name}</h3>
                    {!getIsAvailable(item) && (
                      <span className="text-xs bg-black text-white px-2 py-0.5">
                        SOLD OUT
                      </span>
                    )}
                  </div>

                  {item.description && (
                    <p className="text-xs text-gray-600 mb-2 leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base">
                      ฿{item.price.toFixed(2)}
                    </span>

                    <button
                      onClick={() => handleAddToCart(item)}
                      disabled={!getIsAvailable(item)}
                      className={`px-4 py-2 text-xs font-bold border-2 border-black transition-all ${addedItemId === item.id
                        ? "bg-green-600 text-white border-green-600"
                        : getIsAvailable(item)
                          ? "bg-black text-white hover:bg-gray-800"
                          : "bg-gray-300 text-gray-500 border-gray-300 cursor-not-allowed"
                        }`}
                    >
                      {addedItemId === item.id ? "✓ ADDED" : "+ ADD"}
                    </button>
                  </div>
                </div>
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

      {/* Subtle Call Staff Actions - Bottom Left */}
      <div className="fixed bottom-6 left-4 z-30 flex flex-col gap-1.5">
        <CallStaffButton tableId={tableId} className="shadow-sm" />
        <CallStaffButton
          tableId={tableId}
          callType="PAYMENT"
          className="shadow-sm"
        />
      </div>

      {/* Floating Cart Button */}
      <div className="fixed bottom-6 right-6">
        {cartCount > 0 && (
          <button
            onClick={() => router.push("/cart")}
            className="bg-black text-white px-6 py-3 border-2 border-black shadow-lg hover:shadow-xl transition-all flex items-center gap-2 text-sm font-bold"
          >
            <ShoppingCart size={18} />
            VIEW CART ({cartCount})
          </button>
        )}
      </div>

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
