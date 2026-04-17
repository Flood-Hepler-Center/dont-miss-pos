"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/lib/stores/cartStore";
import { Notebook, ShoppingCart } from "lucide-react";
import Image from "next/image";
import type { MenuCategory, MenuItem, SelectedModifier } from "@/types";
import { ItemModifierModal } from "./ItemModifierModal";
import { CallStaffButton } from "./CallStaffButton";
import { SplashScreen } from "./SplashScreen";

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
  const [actionModalOpen, setActionModalOpen] = useState(false);

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
    (a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999)
  );

  const filteredItems =
    activeCategory === "all"
      ? [...items].sort((a, b) => {
        const catA = sortedCategories.find((c) => c.id === a.categoryId);
        const catB = sortedCategories.find((c) => c.id === b.categoryId);
        const catOrderA = catA?.displayOrder ?? 999;
        const catOrderB = catB?.displayOrder ?? 999;

        if (catOrderA !== catOrderB) return catOrderA - catOrderB;
        return (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
      })
      : [...items]
        .filter((item) => item.categoryId === activeCategory)
        .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));

  // Build grouped structure for "All Items" view (category → items[])
  const groupedItems = useMemo(() => {
    if (activeCategory !== "all") return null;
    const groups: { category: (typeof sortedCategories)[0]; items: typeof filteredItems }[] = [];
    sortedCategories.forEach((cat) => {
      const catItems = filteredItems.filter((i) => i.categoryId === cat.id);
      if (catItems.length > 0) groups.push({ category: cat, items: catItems });
    });
    // Items with no matching category fall into an "Other" group
    const assignedIds = new Set(groups.flatMap((g) => g.items.map((i) => i.id)));
    const uncategorised = filteredItems.filter((i) => !assignedIds.has(i.id));
    if (uncategorised.length > 0)
      groups.push({ category: { id: '__other__', name: 'Other', displayOrder: 999, isActive: true, createdAt: new Date(), updatedAt: new Date() }, items: uncategorised });
    return groups;
  }, [activeCategory, filteredItems, sortedCategories]);

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
      <SplashScreen />

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
      </div>

      {/* Menu Items */}
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* ── All-Items view: grouped with category headers ─────────── */}
        {groupedItems ? (
          <div className="space-y-6">
            {groupedItems.map(({ category, items: catItems }: { category: typeof sortedCategories[0]; items: typeof filteredItems }) => (
              <div key={category.id}>
                {/* Receipt-aesthetic category title */}
                <div className="mb-3">
                  <div className="text-xs text-center text-gray-400 tracking-widest mb-1">
                    ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                  </div>
                  <div className="border-2 border-black bg-black text-white text-center py-2 px-4">
                    <span className="text-xs font-black tracking-[0.25em] uppercase">
                      {category.emoji ? `${category.emoji}  ` : ''}{category.name.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-center text-gray-400 tracking-widest mt-1">
                    ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                  </div>
                </div>

                {/* Items in this category */}
                <div className="space-y-3">
                  {catItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white border-2 border-black p-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {item.imageUrl && (
                          <div className="relative w-20 h-20 shrink-0 border-2 border-black">
                            <Image src={item.imageUrl} alt={item.name} fill className="object-cover" sizes="80px" unoptimized />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 mb-1">
                            <h3 className="text-sm font-bold uppercase">{item.name}</h3>
                            {!getIsAvailable(item) && (
                              <span className="text-xs bg-black text-white px-2 py-0.5">SOLD OUT</span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs text-gray-600 mb-2 leading-relaxed line-clamp-2">{item.description}</p>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-base">฿{item.price.toFixed(2)}</span>
                            <button
                              onClick={() => handleAddToCart(item)}
                              disabled={!getIsAvailable(item)}
                              className={`px-4 py-2 text-xs font-bold border-2 border-black transition-all ${
                                addedItemId === item.id
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
              </div>
            ))}

            {groupedItems.length === 0 && (
              <div className="text-center py-12 border-2 border-black border-dashed">
                <p className="text-sm text-gray-600">NO ITEMS AVAILABLE</p>
              </div>
            )}
          </div>
        ) : (
          /* ── Single-category view: flat list ─────────────────────── */
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="bg-white border-2 border-black p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {item.imageUrl && (
                    <div className="relative w-20 h-20 shrink-0 border-2 border-black">
                      <Image src={item.imageUrl} alt={item.name} fill className="object-cover" sizes="80px" unoptimized />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <h3 className="text-sm font-bold uppercase">{item.name}</h3>
                      {!getIsAvailable(item) && (
                        <span className="text-xs bg-black text-white px-2 py-0.5">SOLD OUT</span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-gray-600 mb-2 leading-relaxed line-clamp-2">{item.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-base">฿{item.price.toFixed(2)}</span>
                      <button
                        onClick={() => handleAddToCart(item)}
                        disabled={!getIsAvailable(item)}
                        className={`px-4 py-2 text-xs font-bold border-2 border-black transition-all ${
                          addedItemId === item.id
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

            {filteredItems.length === 0 && (
              <div className="text-center py-12 border-2 border-black border-dashed">
                <p className="text-sm text-gray-600">NO ITEMS IN THIS CATEGORY</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Navigation (Left) */}
      <div className="fixed bottom-6 left-4 sm:left-6 z-40">
        <button
          onClick={() => setActionModalOpen(true)}
          className="bg-white text-black px-4 sm:px-5 py-3 border-2 border-black transition-transform flex items-center gap-2 text-xs sm:text-sm font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]"
        >
          <div className="flex flex-col gap-1 w-4 justify-center">
            <div className="w-full h-[2px] bg-black"></div>
            <div className="w-full h-[2px] bg-black"></div>
            <div className="w-full h-[2px] bg-black"></div>
          </div>
        </button>
      </div>

      {/* Floating Cart Button (Right) */}
      {cartCount > 0 && (
        <div className="fixed bottom-6 right-4 sm:right-6 z-40">
          <button
            onClick={() => router.push("/cart")}
            className="bg-black text-white px-5 sm:px-6 py-3 sm:py-4 border-2 border-black transition-transform flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-bold shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[6px] active:translate-y-[6px]"
          >
            <ShoppingCart size={18} />
            VIEW CART ({cartCount})
          </button>
        </div>
      )}

      {/* Action Modal Overlay */}
      {actionModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white border-4 border-black w-full max-w-sm font-sour-gummy p-6 relative shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => setActionModalOpen(false)}
              className="absolute top-2 right-4 text-3xl hover:text-gray-600 transition-colors"
            >
              ×
            </button>

            <div className="text-center mb-6 border-b-4 border-black pb-4 mt-2">
              <h2 className="text-xl font-bold uppercase tracking-widest">
                STORE ACTION
              </h2>
            </div>

            <div className="space-y-4">
              <button
                onClick={() => { setActionModalOpen(false); router.push("/order-history"); }}
                className="w-full bg-black text-white border-2 border-black p-4 text-center font-bold flex justify-center items-center gap-3 hover:bg-gray-800 transition-colors uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] active:shadow-none active:translate-x-1 active:translate-y-1"
              >
                <Notebook size={20} />
                ORDER HISTORY
              </button>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <CallStaffButton
                  tableId={tableId}
                  className="!w-full !p-4 !h-auto !border-2 !border-black !bg-white !text-black hover:!bg-gray-100 !rounded-none !shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] active:!shadow-none active:translate-x-1 active:translate-y-1 uppercase tracking-widest flex-col gap-2"
                />
                <CallStaffButton
                  tableId={tableId}
                  callType="PAYMENT"
                  className="!w-full !p-4 !h-auto !border-2 !border-black !bg-white !text-black hover:!bg-gray-100 !rounded-none !shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] active:!shadow-none active:translate-x-1 active:translate-y-1 uppercase tracking-widest flex-col gap-2"
                />
              </div>
            </div>
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
