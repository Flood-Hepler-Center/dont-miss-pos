'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { menuService } from '@/lib/services/menu.service';
import type { MenuItem, MenuCategory } from '@/types';
import { ModifierManager } from '@/components/admin/ModifierManager';
import Image from 'next/image';

export default function MenuItemsPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [reorderingCategoryId, setReorderingCategoryId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<MenuItem>>({
    name: '',
    description: '',
    price: 0,
    costPrice: 0,
    categoryId: '',
    isAvailable: true,
    hasStockTracking: false,
    stock: 0,
    imageUrl: '',
    modifiers: [],
  });
  const [imagePreview, setImagePreview] = useState<string>('');

  useEffect(() => {
    const q = query(collection(db, 'menuItems'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsData = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(),
        };
      }) as MenuItem[];
      setItems(itemsData.filter((i) => i.isActive));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'menuCategories'), orderBy('displayOrder', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cats = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(),
        };
      }) as MenuCategory[];
      setCategories(cats.filter((c) => c.isActive));
    });

    return () => unsubscribe();
  }, []);

  /**
   * Build the ordered view of items:
   * - First filter by search/category
   * - Then group by category (category displayOrder ascending)
   * - Within a category, items are sorted by item displayOrder
   */
  const { groups, flatCount } = useMemo(() => {
    const searchLower = searchText.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (categoryFilter && item.categoryId !== categoryFilter) return false;
      if (searchLower && !item.name.toLowerCase().includes(searchLower)) return false;
      return true;
    });

    // Ordered list of categories to render as groups
    const catOrder = [...categories].sort(
      (a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999)
    );

    const groupList: { category: MenuCategory | null; items: MenuItem[] }[] = [];
    catOrder.forEach((cat) => {
      const catItems = filtered
        .filter((i) => i.categoryId === cat.id)
        .sort((a, b) => {
          const diff = (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
          if (diff !== 0) return diff;
          return (a.name || '').localeCompare(b.name || '');
        });
      if (catItems.length > 0) groupList.push({ category: cat, items: catItems });
    });

    // Orphan items (no matching category)
    const knownCatIds = new Set(catOrder.map((c) => c.id));
    const orphans = filtered
      .filter((i) => !knownCatIds.has(i.categoryId))
      .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
    if (orphans.length > 0) groupList.push({ category: null, items: orphans });

    return { groups: groupList, flatCount: filtered.length };
  }, [items, categories, categoryFilter, searchText]);

  const searchActive = searchText.trim().length > 0;

  /**
   * Reorder an item within its category. Uses the full (unfiltered) sorted
   * list for that category so ordering is preserved across filters.
   */
  const handleMoveItem = async (item: MenuItem, direction: -1 | 1) => {
    if (searchActive || reorderingCategoryId) return;

    const sameCat = items
      .filter((i) => i.categoryId === item.categoryId)
      .sort((a, b) => {
        const diff = (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
        if (diff !== 0) return diff;
        return (a.name || '').localeCompare(b.name || '');
      });

    const index = sameCat.findIndex((i) => i.id === item.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sameCat.length) return;

    const next = [...sameCat];
    [next[index], next[target]] = [next[target], next[index]];

    // Optimistic update: patch displayOrder locally so UI updates before round-trip
    setItems((prev) => {
      const map = new Map(prev.map((i) => [i.id, i]));
      next.forEach((i, idx) => {
        const existing = map.get(i.id);
        if (existing) map.set(i.id, { ...existing, displayOrder: idx });
      });
      return Array.from(map.values());
    });

    setReorderingCategoryId(item.categoryId);
    try {
      await menuService.reorderItems(next.map((i) => i.id));
    } catch (error) {
      console.error('Failed to reorder items:', error);
      alert('Failed to reorder items');
    } finally {
      setReorderingCategoryId(null);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      description: '',
      price: 0,
      costPrice: 0,
      categoryId: categories[0]?.id || '',
      isAvailable: true,
      hasStockTracking: false,
      stock: 0,
      imageUrl: '',
      modifiers: [],
    });
    setImagePreview('');
    setModalVisible(true);
  };

  const handleEdit = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || '',
      price: item.price,
      costPrice: item.costPrice || 0,
      categoryId: item.categoryId,
      isAvailable: item.isAvailable,
      hasStockTracking: item.hasStockTracking || false,
      stock: item.stock || 0,
      imageUrl: item.imageUrl || '',
      modifiers: item.modifiers || [],
    });
    setImagePreview(item.imageUrl || '');
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await menuService.deleteItem(id);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete item:', error);
      alert('Failed to delete item');
    }
  };

  const handleToggle86 = async (id: string, isAvailable: boolean) => {
    try {
      await menuService.toggleAvailability(id, !isAvailable);
    } catch (error) {
      console.error('Failed to toggle item:', error);
      alert('Failed to toggle item');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim() || !formData.categoryId) return;

    setLoading(true);
    try {
      if (editingItem) {
        await menuService.updateItem(editingItem.id, formData);
      } else {
        // Auto-assign displayOrder = (max in same category) + 1 so new items land at the end
        const categoryItems = items.filter((i) => i.categoryId === formData.categoryId);
        const maxOrder = categoryItems.reduce(
          (max, i) => Math.max(max, i.displayOrder ?? -1),
          -1
        );
        await menuService.createItem({
          ...formData,
          displayOrder: maxOrder + 1,
        });
      }
      setModalVisible(false);
      setFormData({ name: '', description: '', price: 0, costPrice: 0, categoryId: '', isAvailable: true, hasStockTracking: false, stock: 0, imageUrl: '', modifiers: [] });
      setImagePreview('');
    } catch (error) {
      console.error('Failed to save item:', error);
      alert('Failed to save item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
          <h1 className="text-xl md:text-2xl font-bold my-2">MENU ITEMS</h1>
          <p className="text-xs md:text-sm">{flatCount} Items</p>
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">══</div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <button
            onClick={handleAdd}
            className="px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800"
          >
            [+ ADD ITEM]
          </button>
          <input
            type="text"
            placeholder="SEARCH ITEMS..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="px-4 py-3 border-2 border-black text-sm focus:outline-none"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-3 border-2 border-black text-sm focus:outline-none"
          >
            <option value="">ALL CATEGORIES</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Reorder hint when search is active */}
        {searchActive && (
          <div className="mb-4 border-2 border-dashed border-black p-3 text-center text-xs">
            REORDER BUTTONS ARE DISABLED WHILE SEARCHING. CLEAR SEARCH TO REORDER.
          </div>
        )}

        {/* Grouped Items (Desktop + Mobile) */}
        <div className="space-y-6">
          {groups.map(({ category, items: catItems }) => {
            const catLabel = category?.name || 'UNCATEGORIZED';
            const catId = category?.id || '__none__';
            return (
              <div key={catId} className="border-2 border-black">
                {/* Category Header */}
                <div className="border-b-2 border-black bg-black text-white p-3 text-center">
                  <div className="text-xs font-black tracking-widest uppercase">
                    {catLabel} <span className="opacity-60">({catItems.length})</span>
                  </div>
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block">
                  <div className="border-b-2 border-black p-3 bg-gray-50">
                    <div className="grid grid-cols-12 gap-3 text-xs font-bold">
                      <div className="col-span-1">#</div>
                      <div className="col-span-1">IMAGE</div>
                      <div className="col-span-3">NAME</div>
                      <div className="col-span-1">PRICE</div>
                      <div className="col-span-1">COST</div>
                      <div className="col-span-2">STATUS</div>
                      <div className="col-span-1">REORDER</div>
                      <div className="col-span-2">ACTIONS</div>
                    </div>
                  </div>
                  <div className="divide-y-2 divide-black">
                    {catItems.map((item, index) => {
                      const margin = item.costPrice && item.price
                        ? ((item.price - item.costPrice) / item.price * 100).toFixed(1)
                        : null;
                      const isReordering = reorderingCategoryId === item.categoryId;
                      const canMoveUp = !searchActive && !isReordering && index > 0;
                      const canMoveDown = !searchActive && !isReordering && index < catItems.length - 1;
                      return (
                        <div key={item.id} className="p-3 hover:bg-gray-50">
                          <div className="grid grid-cols-12 gap-3 text-sm items-center">
                            <div className="col-span-1 text-xs font-bold">#{index + 1}</div>
                            <div className="col-span-1">
                              {item.imageUrl ? (
                                <div className="relative w-12 h-12">
                                  <Image
                                    src={item.imageUrl}
                                    alt={item.name}
                                    fill
                                    className="object-cover border border-black"
                                    unoptimized
                                  />
                                </div>
                              ) : (
                                <div className="w-12 h-12 border-2 border-dashed border-black" />
                              )}
                            </div>
                            <div className="col-span-3 font-bold">{item.name}</div>
                            <div className="col-span-1 font-bold">฿{item.price.toFixed(2)}</div>
                            <div className="col-span-1 text-xs">
                              {item.costPrice ? `฿${item.costPrice.toFixed(2)}` : '-'}
                              {margin && <div className="text-gray-600">{margin}%</div>}
                            </div>
                            <div className="col-span-2">
                              <span className={`px-2 py-1 border-2 border-black text-xs ${item.isAvailable ? '' : 'bg-red-50'}`}>
                                {item.isAvailable ? 'AVAILABLE' : "86'D"}
                              </span>
                              {item.hasStockTracking && (
                                <div className="mt-1 text-xs font-bold text-gray-700">
                                  STOCK: {item.stock}
                                </div>
                              )}
                            </div>
                            <div className="col-span-1 flex gap-1">
                              <button
                                onClick={() => handleMoveItem(item, -1)}
                                disabled={!canMoveUp}
                                className="px-2 py-1 border border-black text-xs hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Move up"
                              >
                                [↑]
                              </button>
                              <button
                                onClick={() => handleMoveItem(item, 1)}
                                disabled={!canMoveDown}
                                className="px-2 py-1 border border-black text-xs hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Move down"
                              >
                                [↓]
                              </button>
                            </div>
                            <div className="col-span-2 flex gap-2">
                              <button
                                onClick={() => handleToggle86(item.id, item.isAvailable)}
                                className="px-2 py-1 border border-black text-xs hover:bg-gray-100"
                              >
                                {item.isAvailable ? '[OFF]' : '[ON]'}
                              </button>
                              <button
                                onClick={() => handleEdit(item)}
                                className="px-2 py-1 border border-black text-xs hover:bg-gray-100"
                              >
                                [EDIT]
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(item.id)}
                                className="px-2 py-1 border border-black text-xs hover:bg-red-50"
                              >
                                [DEL]
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y-2 divide-black">
                  {catItems.map((item, index) => {
                    const isReordering = reorderingCategoryId === item.categoryId;
                    const canMoveUp = !searchActive && !isReordering && index > 0;
                    const canMoveDown = !searchActive && !isReordering && index < catItems.length - 1;
                    return (
                      <div key={item.id} className="p-4">
                        <div className="flex gap-3 mb-3">
                          {item.imageUrl ? (
                            <div className="relative w-16 h-16 shrink-0">
                              <Image
                                src={item.imageUrl}
                                alt={item.name}
                                fill
                                className="object-cover border border-black"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <div className="w-16 h-16 border-2 border-dashed border-black" />
                          )}
                          <div className="flex-1">
                            <p className="font-bold text-sm">
                              #{index + 1} {item.name}
                            </p>
                            <p className="text-sm font-bold mt-1">฿{item.price.toFixed(2)}</p>
                          </div>
                          <div className="flex flex-col gap-1 items-end">
                            <span className={`px-2 py-1 border-2 border-black text-xs h-fit ${item.isAvailable ? '' : 'bg-red-50'}`}>
                              {item.isAvailable ? 'ON' : "86"}
                            </span>
                            {item.hasStockTracking && (
                              <span className="text-xs font-bold text-gray-700">
                                STOCK: {item.stock}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          <button
                            onClick={() => handleMoveItem(item, -1)}
                            disabled={!canMoveUp}
                            className="px-2 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => handleMoveItem(item, 1)}
                            disabled={!canMoveDown}
                            className="px-2 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => handleToggle86(item.id, item.isAvailable)}
                            className="px-2 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100"
                          >
                            {item.isAvailable ? 'OFF' : 'ON'}
                          </button>
                          <button
                            onClick={() => handleEdit(item)}
                            className="px-2 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100"
                          >
                            EDIT
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(item.id)}
                            className="px-2 py-2 border-2 border-black text-xs font-bold hover:bg-red-50"
                          >
                            DEL
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {groups.length === 0 && (
            <div className="border-2 border-dashed border-black p-12 text-center text-gray-600">
              <p className="text-sm">NO ITEMS FOUND</p>
            </div>
          )}
        </div>

        {/* Add/Edit Modal */}
        {modalVisible && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white border-2 border-black max-w-2xl w-full font-mono my-8">
              <div className="border-b-2 border-black p-4">
                <h2 className="text-lg font-bold text-center">
                  {editingItem ? '[EDIT ITEM]' : '[ADD ITEM]'}
                </h2>
              </div>
              <form onSubmit={handleSave} className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold mb-2">NAME *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-2">CATEGORY *</label>
                    <select
                      value={formData.categoryId}
                      onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                      required
                    >
                      <option value="">SELECT CATEGORY</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-2">DESCRIPTION</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold mb-2">PRICE (฿) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-2">COST (฿)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.costPrice}
                      onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-2">IMAGE</label>
                  <div className="border-2 border-black p-3">
                    {imagePreview ? (
                      <div className="space-y-2">
                        <div className="relative w-full h-32">
                          <Image
                            src={imagePreview}
                            alt="Preview"
                            fill
                            className="object-cover border border-black"
                            unoptimized
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setImagePreview('');
                            setFormData({ ...formData, imageUrl: '' });
                          }}
                          className="text-xs underline hover:no-underline"
                        >
                          [REMOVE IMAGE]
                        </button>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 10 * 1024 * 1024) {
                                alert('Image must be less than 10MB');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = (e) => {
                                const img = document.createElement('img');
                                img.onload = () => {
                                  const canvas = document.createElement('canvas');
                                  let width = img.width;
                                  let height = img.height;
                                  
                                  const MAX_SIZE = 800; // Resize to max 800px
                                  if (width > height) {
                                    if (width > MAX_SIZE) {
                                      height *= MAX_SIZE / width;
                                      width = MAX_SIZE;
                                    }
                                  } else {
                                    if (height > MAX_SIZE) {
                                      width *= MAX_SIZE / height;
                                      height = MAX_SIZE;
                                    }
                                  }
                                  
                                  canvas.width = width;
                                  canvas.height = height;
                                  const ctx = canvas.getContext('2d');
                                  ctx?.drawImage(img, 0, 0, width, height);
                                  
                                  // Compress to WebP at 0.8 quality
                                  const base64 = canvas.toDataURL('image/webp', 0.8);
                                  setImagePreview(base64);
                                  setFormData({ ...formData, imageUrl: base64 });
                                };
                                img.src = e.target?.result as string;
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="text-xs"
                        />
                        <p className="text-xs text-gray-600 mt-2">Max 10MB • JPG, PNG, GIF</p>
                      </div>
                    )}
                  </div>
                </div>

                <ModifierManager
                  modifiers={formData.modifiers || []}
                  onChange={(modifiers) => setFormData({ ...formData, modifiers })}
                />

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.isAvailable}
                      onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                      className="w-4 h-4 border-2 border-black"
                    />
                    <label className="text-xs font-bold">AVAILABLE</label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.hasStockTracking}
                      onChange={(e) => setFormData({ ...formData, hasStockTracking: e.target.checked })}
                      className="w-4 h-4 border-2 border-black"
                    />
                    <label className="text-xs font-bold">TRACK STOCK</label>
                  </div>
                </div>

                {formData.hasStockTracking && (
                  <div>
                    <label className="block text-xs font-bold mb-2">CURRENT STOCK</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.stock || 0}
                      onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                      required
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 pt-4 border-t-2 border-black">
                  <button
                    type="button"
                    onClick={() => setModalVisible(false)}
                    className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
                  >
                    [CANCEL]
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    {loading ? '[SAVING...]' : editingItem ? '[UPDATE]' : '[CREATE]'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black max-w-md w-full font-mono">
              <div className="border-b-2 border-black p-4">
                <h2 className="text-lg font-bold text-center">[DELETE ITEM?]</h2>
              </div>
              <div className="p-4">
                <p className="text-sm text-center mb-6">This will hide the item from the menu.</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
                  >
                    [NO]
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirm)}
                    className="px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800"
                  >
                    [YES]
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
