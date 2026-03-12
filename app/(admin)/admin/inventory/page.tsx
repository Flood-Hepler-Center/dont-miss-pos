'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface InventoryItem {
  id: string;
  name: string;
  currentStock: number;
  initialStock: number;
  reorderPoint: number;
  unit: string;
  costPerUnit: number;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [crudModalVisible, setCrudModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ type: 'add', quantity: 0, reason: 'Purchase' });
  const [itemForm, setItemForm] = useState({
    name: '',
    initialStock: 0,
    unit: 'kg',
    reorderPoint: 0,
    costPerUnit: 0,
  });

  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const inventoryData = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          currentStock: data.currentStock,
          initialStock: data.initialStock,
          reorderPoint: data.reorderPoint,
          unit: data.unit,
          costPerUnit: data.costPerUnit,
        } as InventoryItem;
      });
      setItems(inventoryData);
    });

    return () => unsubscribe();
  }, []);

  const lowStockItems = items.filter((item) => item.currentStock <= item.reorderPoint);
  const criticalItems = items.filter((item) => item.currentStock === 0);
  const totalValue = items.reduce((sum, item) => sum + item.currentStock * item.costPerUnit, 0);

  const getStockPercentage = (current: number, initial: number) => {
    if (initial === 0) return 0;
    return Math.round((current / initial) * 100);
  };

  const handleAdd = () => {
    setEditingItem(null);
    setItemForm({ name: '', initialStock: 0, unit: 'kg', reorderPoint: 0, costPerUnit: 0 });
    setCrudModalVisible(true);
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      initialStock: item.initialStock,
      unit: item.unit,
      reorderPoint: item.reorderPoint,
      costPerUnit: item.costPerUnit,
    });
    setCrudModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'inventory', id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting inventory:', error);
      alert('Failed to delete item');
    }
  };

  const handleCrudSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingItem) {
        const itemRef = doc(db, 'inventory', editingItem.id);
        await updateDoc(itemRef, {
          ...itemForm,
          updatedAt: serverTimestamp(),
        });
      } else {
        const itemRef = doc(collection(db, 'inventory'));
        await setDoc(itemRef, {
          ...itemForm,
          currentStock: itemForm.initialStock || 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setCrudModalVisible(false);
      setItemForm({ name: '', initialStock: 0, unit: 'kg', reorderPoint: 0, costPerUnit: 0 });
    } catch (error) {
      console.error('Error saving inventory:', error);
      alert('Failed to save item');
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = (item: InventoryItem) => {
    setSelectedItem(item);
    setAdjustForm({ type: 'add', quantity: 0, reason: 'Purchase' });
    setAdjustModalVisible(true);
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    try {
      let newStock = selectedItem.currentStock;

      if (adjustForm.type === 'add') {
        newStock += adjustForm.quantity;
      } else if (adjustForm.type === 'deduct') {
        newStock -= adjustForm.quantity;
      } else if (adjustForm.type === 'set') {
        newStock = adjustForm.quantity;
      }

      const itemRef = doc(db, 'inventory', selectedItem.id);
      await updateDoc(itemRef, {
        currentStock: Math.max(0, newStock),
        lastAdjusted: serverTimestamp(),
      });

      setAdjustModalVisible(false);
    } catch (error) {
      console.error('Error adjusting stock:', error);
      alert('Failed to adjust stock');
    }
  };

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
          <h1 className="text-xl md:text-2xl font-bold my-2">INVENTORY MANAGEMENT</h1>
          <p className="text-xs md:text-sm">{items.length} Items Total</p>
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="border-2 border-black p-3 text-center">
            <p className="text-xs mb-1">LOW STOCK</p>
            <p className="text-2xl font-bold text-orange-600">{lowStockItems.length}</p>
          </div>
          <div className="border-2 border-black p-3 text-center">
            <p className="text-xs mb-1">OUT OF STOCK</p>
            <p className="text-2xl font-bold text-red-600">{criticalItems.length}</p>
          </div>
          <div className="border-2 border-black p-3 text-center">
            <p className="text-xs mb-1">TOTAL VALUE</p>
            <p className="text-lg md:text-2xl font-bold">฿{totalValue.toFixed(0)}</p>
          </div>
        </div>

        {/* Add Button */}
        <div className="mb-6">
          <button
            onClick={handleAdd}
            className="w-full md:w-auto px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800"
          >
            [+ ADD ITEM]
          </button>
        </div>

        {/* Inventory List */}
        <div className="border-2 border-black">
          {/* Desktop Table */}
          <div className="hidden md:block">
            <div className="border-b-2 border-black p-3 bg-white">
              <div className="grid grid-cols-7 gap-4 text-xs font-bold">
                <div>ITEM</div>
                <div>CURRENT</div>
                <div>STOCK %</div>
                <div>REORDER</div>
                <div>COST/UNIT</div>
                <div>VALUE</div>
                <div>ACTIONS</div>
              </div>
            </div>
            <div className="divide-y-2 divide-black">
              {items.map((item) => {
                const percentage = getStockPercentage(item.currentStock, item.initialStock);
                const isLow = item.currentStock <= item.reorderPoint;
                const isOut = item.currentStock === 0;
                return (
                  <div key={item.id} className="p-3 hover:bg-gray-50">
                    <div className="grid grid-cols-7 gap-4 text-sm items-center">
                      <div className="font-bold">{item.name}</div>
                      <div className={isOut ? 'text-red-600 font-bold' : isLow ? 'text-orange-600 font-bold' : ''}>
                        {item.currentStock} {item.unit}
                      </div>
                      <div>
                        <div className="w-full bg-gray-200 h-2 border border-black">
                          <div
                            className={`h-full ${percentage > 50 ? 'bg-green-500' : percentage > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs mt-1">{percentage}%</p>
                      </div>
                      <div>{item.reorderPoint} {item.unit}</div>
                      <div>฿{item.costPerUnit.toFixed(2)}</div>
                      <div>฿{(item.currentStock * item.costPerUnit).toFixed(2)}</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="px-2 py-1 border border-black text-xs hover:bg-gray-100"
                        >
                          [EDIT]
                        </button>
                        <button
                          onClick={() => handleAdjust(item)}
                          className="px-2 py-1 border border-black text-xs hover:bg-blue-50"
                        >
                          [ADJ]
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
              {items.length === 0 && (
                <div className="p-12 text-center text-gray-600">
                  <p className="text-sm">NO INVENTORY ITEMS</p>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y-2 divide-black">
            {items.map((item) => {
              const percentage = getStockPercentage(item.currentStock, item.initialStock);
              const isLow = item.currentStock <= item.reorderPoint;
              const isOut = item.currentStock === 0;
              return (
                <div key={item.id} className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-sm">{item.name}</p>
                      <p className={`text-xs ${isOut ? 'text-red-600 font-bold' : isLow ? 'text-orange-600 font-bold' : 'text-gray-600'}`}>
                        {item.currentStock} / {item.initialStock} {item.unit}
                      </p>
                    </div>
                    <span className={`px-2 py-1 border border-black text-xs ${isOut ? 'bg-red-50' : isLow ? 'bg-orange-50' : ''}`}>
                      {isOut ? 'OUT' : isLow ? 'LOW' : 'OK'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 border border-black mb-3">
                    <div
                      className={`h-full ${percentage > 50 ? 'bg-green-500' : percentage > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <div className="text-xs mb-3">
                    <p>REORDER: {item.reorderPoint} {item.unit}</p>
                    <p>COST: ฿{item.costPerUnit.toFixed(2)}/{item.unit}</p>
                    <p>VALUE: ฿{(item.currentStock * item.costPerUnit).toFixed(2)}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleEdit(item)}
                      className="px-3 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100"
                    >
                      [EDIT]
                    </button>
                    <button
                      onClick={() => handleAdjust(item)}
                      className="px-3 py-2 border-2 border-black text-xs font-bold hover:bg-blue-50"
                    >
                      [ADJUST]
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
            {items.length === 0 && (
              <div className="p-12 text-center text-gray-600">
                <p className="text-sm">NO INVENTORY ITEMS</p>
              </div>
            )}
          </div>
        </div>

        {/* Add/Edit Modal */}
        {crudModalVisible && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black max-w-lg w-full font-mono">
              <div className="border-b-2 border-black p-4">
                <h2 className="text-lg font-bold text-center">
                  {editingItem ? '[EDIT ITEM]' : '[ADD ITEM]'}
                </h2>
              </div>
              <form onSubmit={handleCrudSubmit} className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-2">ITEM NAME *</label>
                  <input
                    type="text"
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                    placeholder="e.g., Potato, Oil, Beef"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-2">INITIAL STOCK *</label>
                    <input
                      type="number"
                      value={itemForm.initialStock}
                      onChange={(e) => setItemForm({ ...itemForm, initialStock: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                      min={0}
                      step="0.01"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-2">UNIT *</label>
                    <input
                      type="text"
                      value={itemForm.unit}
                      onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                      placeholder="kg, L, pcs"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-2">REORDER POINT *</label>
                    <input
                      type="number"
                      value={itemForm.reorderPoint}
                      onChange={(e) => setItemForm({ ...itemForm, reorderPoint: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                      min={0}
                      step="0.01"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-2">COST/UNIT (฿) *</label>
                    <input
                      type="number"
                      value={itemForm.costPerUnit}
                      onChange={(e) => setItemForm({ ...itemForm, costPerUnit: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                      min={0}
                      step="0.01"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-4 border-t-2 border-black">
                  <button
                    type="button"
                    onClick={() => setCrudModalVisible(false)}
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

        {/* Adjust Stock Modal */}
        {adjustModalVisible && selectedItem && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black max-w-md w-full font-mono">
              <div className="border-b-2 border-black p-4">
                <h2 className="text-lg font-bold text-center">[ADJUST STOCK - {selectedItem.name}]</h2>
              </div>
              <form onSubmit={handleAdjustSubmit} className="p-4 space-y-4">
                <div className="border-2 border-black p-4 text-center">
                  <p className="text-xs mb-1">CURRENT STOCK</p>
                  <p className="text-2xl font-bold">{selectedItem.currentStock} {selectedItem.unit}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-2">ADJUSTMENT TYPE *</label>
                  <select
                    value={adjustForm.type}
                    onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                    required
                  >
                    <option value="add">ADD (+)</option>
                    <option value="deduct">DEDUCT (-)</option>
                    <option value="set">SET EXACT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-2">QUANTITY *</label>
                  <input
                    type="number"
                    value={adjustForm.quantity}
                    onChange={(e) => setAdjustForm({ ...adjustForm, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                    min={0}
                    step="0.01"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-2">REASON *</label>
                  <select
                    value={adjustForm.reason}
                    onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                    required
                  >
                    <option value="Purchase">PURCHASE</option>
                    <option value="Wastage">WASTAGE</option>
                    <option value="Correction">CORRECTION</option>
                    <option value="Transfer">TRANSFER</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-4 border-t-2 border-black">
                  <button
                    type="button"
                    onClick={() => setAdjustModalVisible(false)}
                    className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
                  >
                    [CANCEL]
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800"
                  >
                    [ADJUST]
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
                <p className="text-sm text-center mb-6">This will permanently delete this inventory item.</p>
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
