'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { menuService } from '@/lib/services/menu.service';
import type { MenuItem, MenuCategory } from '@/types';
import { ModifierManager } from '@/components/admin/ModifierManager';
import Image from 'next/image';

export default function MenuItemsPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
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
    imageUrl: '',
    modifiers: [],
  });
  const [imagePreview, setImagePreview] = useState<string>('');

  useEffect(() => {
    const q = query(collection(db, 'menuItems'), orderBy('name', 'asc'));
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
      setFilteredItems(itemsData.filter((i) => i.isActive));
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

  useEffect(() => {
    let filtered = items;

    if (categoryFilter) {
      filtered = filtered.filter((item) => item.categoryId === categoryFilter);
    }

    if (searchText) {
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    setFilteredItems(filtered);
  }, [categoryFilter, searchText, items]);

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      description: '',
      price: 0,
      costPrice: 0,
      categoryId: categories[0]?.id || '',
      isAvailable: true,
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
        await menuService.createItem(formData);
      }
      setModalVisible(false);
      setFormData({ name: '', description: '', price: 0, costPrice: 0, categoryId: '', isAvailable: true, imageUrl: '', modifiers: [] });
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
          <p className="text-xs md:text-sm">{filteredItems.length} Items</p>
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

        {/* Items Grid - Mobile Cards, Desktop Table */}
        <div className="hidden md:block border-2 border-black">
          <div className="border-b-2 border-black p-3 bg-white">
            <div className="grid grid-cols-7 gap-4 text-xs font-bold">
              <div>IMAGE</div>
              <div>NAME</div>
              <div>CATEGORY</div>
              <div>PRICE</div>
              <div>COST</div>
              <div>STATUS</div>
              <div>ACTIONS</div>
            </div>
          </div>
          <div className="divide-y-2 divide-black max-h-[600px] overflow-y-auto">
            {filteredItems.map((item) => {
              const cat = categories.find(c => c.id === item.categoryId);
              const margin = item.costPrice && item.price 
                ? ((item.price - item.costPrice) / item.price * 100).toFixed(1) 
                : null;
              return (
                <div key={item.id} className="p-3 hover:bg-gray-50">
                  <div className="grid grid-cols-7 gap-4 text-sm items-center">
                    <div>
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
                    <div className="font-bold">{item.name}</div>
                    <div className="text-xs">{cat?.name || '-'}</div>
                    <div className="font-bold">฿{item.price.toFixed(2)}</div>
                    <div className="text-xs">
                      {item.costPrice ? `฿${item.costPrice.toFixed(2)}` : '-'}
                      {margin && <div className="text-gray-600">{margin}%</div>}
                    </div>
                    <div>
                      <span className={`px-2 py-1 border-2 border-black text-xs ${item.isAvailable ? '' : 'bg-red-50'}`}>
                        {item.isAvailable ? 'AVAILABLE' : "86'D"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggle86(item.id, item.isAvailable)}
                        className="px-2 py-1 border border-black text-xs hover:bg-gray-100"
                      >
                        {item.isAvailable ? '[86]' : '[ON]'}
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
            {filteredItems.length === 0 && (
              <div className="p-12 text-center text-gray-600">
                <p className="text-sm">NO ITEMS FOUND</p>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {filteredItems.map((item) => {
            const cat = categories.find(c => c.id === item.categoryId);
            return (
              <div key={item.id} className="border-2 border-black p-4">
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
                    <p className="font-bold text-sm">{item.name}</p>
                    <p className="text-xs text-gray-600">{cat?.name}</p>
                    <p className="text-sm font-bold mt-1">฿{item.price.toFixed(2)}</p>
                  </div>
                  <span className={`px-2 py-1 border-2 border-black text-xs h-fit ${item.isAvailable ? '' : 'bg-red-50'}`}>
                    {item.isAvailable ? 'ON' : "86"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleToggle86(item.id, item.isAvailable)}
                    className="px-3 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100"
                  >
                    {item.isAvailable ? '[86]' : '[ON]'}
                  </button>
                  <button
                    onClick={() => handleEdit(item)}
                    className="px-3 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100"
                  >
                    [EDIT]
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(item.id)}
                    className="px-3 py-2 border-2 border-black text-xs font-bold hover:bg-red-50"
                  >
                    [DEL]
                  </button>
                </div>
              </div>
            );
          })}
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
                              if (file.size > 1024 * 1024) {
                                alert('Image must be less than 1MB');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                const base64 = reader.result as string;
                                setImagePreview(base64);
                                setFormData({ ...formData, imageUrl: base64 });
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="text-xs"
                        />
                        <p className="text-xs text-gray-600 mt-2">Max 1MB • JPG, PNG, GIF</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <ModifierManager
                  modifiers={formData.modifiers || []}
                  onChange={(modifiers) => setFormData({ ...formData, modifiers })}
                />

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.isAvailable}
                    onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                    className="w-4 h-4 border-2 border-black"
                  />
                  <label className="text-xs font-bold">AVAILABLE</label>
                </div>
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
