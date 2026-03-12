'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { menuService } from '@/lib/services/menu.service';
import type { MenuCategory } from '@/types';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', displayOrder: 0 });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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

  const handleAdd = () => {
    setEditingCategory(null);
    setFormData({ name: '', description: '', displayOrder: categories.length });
    setModalVisible(true);
  };

  const handleEdit = (category: MenuCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      displayOrder: category.displayOrder,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await menuService.deleteCategory(id);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Failed to delete category');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    
    setLoading(true);
    try {
      if (editingCategory) {
        await menuService.updateCategory(editingCategory.id, formData);
      } else {
        await menuService.createCategory(formData);
      }
      setModalVisible(false);
      setFormData({ name: '', description: '', displayOrder: 0 });
    } catch (error) {
      console.error('Failed to save category:', error);
      alert('Failed to save category');
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
          <h1 className="text-xl md:text-2xl font-bold my-2">MENU CATEGORIES</h1>
          <p className="text-xs md:text-sm">{categories.length} Total Categories</p>
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
        </div>

        {/* Add Button */}
        <div className="mb-6">
          <button
            onClick={handleAdd}
            className="w-full md:w-auto px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800"
          >
            [+ ADD CATEGORY]
          </button>
        </div>

        {/* Categories List */}
        <div className="border-2 border-black">
          <div className="border-b-2 border-black p-3 bg-white hidden md:block">
            <div className="grid grid-cols-4 gap-4 text-xs font-bold">
              <div>NAME</div>
              <div>DESCRIPTION</div>
              <div>SORT ORDER</div>
              <div>ACTIONS</div>
            </div>
          </div>
          
          <div className="divide-y-2 divide-black">
            {categories.map((category) => (
              <div key={category.id} className="p-4">
                {/* Desktop */}
                <div className="hidden md:grid grid-cols-4 gap-4 text-sm items-center">
                  <div className="font-bold">{category.name}</div>
                  <div className="text-xs">{category.description || '-'}</div>
                  <div>{category.displayOrder}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(category)}
                      className="px-3 py-1 border border-black text-xs hover:bg-gray-100"
                    >
                      [EDIT]
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(category.id)}
                      className="px-3 py-1 border border-black text-xs hover:bg-red-50"
                    >
                      [DELETE]
                    </button>
                  </div>
                </div>
                
                {/* Mobile */}
                <div className="md:hidden">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-sm">{category.name}</p>
                      <p className="text-xs text-gray-600 mt-1">{category.description || '-'}</p>
                    </div>
                    <span className="text-xs border border-black px-2 py-1">#{category.displayOrder}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => handleEdit(category)}
                      className="px-3 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100"
                    >
                      [EDIT]
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(category.id)}
                      className="px-3 py-2 border-2 border-black text-xs font-bold hover:bg-red-50"
                    >
                      [DELETE]
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {categories.length === 0 && (
              <div className="p-12 text-center text-gray-600">
                <p className="text-sm">NO CATEGORIES</p>
              </div>
            )}
          </div>
        </div>

        {/* Add/Edit Modal */}
        {modalVisible && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black max-w-lg w-full font-mono">
              <div className="border-b-2 border-black p-4">
                <h2 className="text-lg font-bold text-center">
                  {editingCategory ? '[EDIT CATEGORY]' : '[ADD CATEGORY]'}
                </h2>
              </div>
              
              <form onSubmit={handleSubmit} className="p-4">
                <div className="mb-4">
                  <label className="block text-xs font-bold mb-2">NAME *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                    required
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-xs font-bold mb-2">DESCRIPTION</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                    rows={3}
                  />
                </div>
                
                <div className="mb-6">
                  <label className="block text-xs font-bold mb-2">DISPLAY ORDER</label>
                  <input
                    type="number"
                    value={formData.displayOrder}
                    onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
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
                    {loading ? '[SAVING...]' : editingCategory ? '[UPDATE]' : '[CREATE]'}
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
                <h2 className="text-lg font-bold text-center">[DELETE CATEGORY?]</h2>
              </div>
              <div className="p-4">
                <p className="text-sm text-center mb-6">
                  This will hide the category. Associated items won&apos;t be affected.
                </p>
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
