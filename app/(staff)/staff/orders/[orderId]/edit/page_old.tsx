'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { menuService } from '@/lib/services/menu.service';
import type { Order, MenuItem, OrderItem, SelectedModifier } from '@/types';
import { X, Plus, Edit2 } from 'lucide-react';

interface EditOrderPageProps {
  params: { orderId: string };
}

export default function EditOrderPage({ params }: EditOrderPageProps) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedItems, setEditedItems] = useState<OrderItem[]>([]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingModifiers, setEditingModifiers] = useState<SelectedModifier[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const orderDoc = await getDoc(doc(db, 'orders', params.orderId));
        if (orderDoc.exists()) {
          const orderData = { id: orderDoc.id, ...orderDoc.data() } as Order;
          setOrder(orderData);
          setEditedItems([...orderData.items]);
        }
        
        const items = await menuService.getActiveItems();
        setMenuItems(items);
      } catch (error) {
        console.error('Error fetching order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params.orderId]);

  const handleUpdateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    
    const updated = [...editedItems];
    updated[index].quantity = newQuantity;
    // Recalculate subtotal with modifiers
    const basePrice = updated[index].price;
    const modifierPrice = (updated[index].modifiers || []).reduce((sum, mod) => {
      if (mod.priceMode === 'absolute' && mod.absolutePrice) {
        return mod.absolutePrice;
      }
      return sum + mod.priceAdjustment;
    }, 0);
    const finalPrice = modifierPrice > 0 ? modifierPrice : basePrice + modifierPrice;
    updated[index].subtotal = finalPrice * newQuantity;
    setEditedItems(updated);
  };

  const handleEditModifiers = (index: number) => {
    setEditingItemIndex(index);
    setEditingModifiers([...(editedItems[index].modifiers || [])]);
  };

  const handleSaveModifiers = () => {
    if (editingItemIndex === null) return;
    
    const updated = [...editedItems];
    updated[editingItemIndex].modifiers = editingModifiers;
    
    // Recalculate subtotal with new modifiers
    const basePrice = updated[editingItemIndex].price;
    let finalPrice = basePrice;
    
    for (const mod of editingModifiers) {
      if (mod.priceMode === 'absolute' && mod.absolutePrice) {
        finalPrice = mod.absolutePrice;
        break;
      } else {
        finalPrice += mod.priceAdjustment;
      }
    }
    
    updated[editingItemIndex].subtotal = finalPrice * updated[editingItemIndex].quantity;
    setEditedItems(updated);
    setEditingItemIndex(null);
    setEditingModifiers([]);
  };

  const handleRemoveModifier = (modIndex: number) => {
    setEditingModifiers(editingModifiers.filter((_, i) => i !== modIndex));
  };

  const handleRemoveItem = (index: number) => {
    const updated = editedItems.filter((_, i) => i !== index);
    setEditedItems(updated);
  };

  const handleAddItem = (menuItem: MenuItem) => {
    const newItem: OrderItem = {
      menuItemId: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity: 1,
      subtotal: menuItem.price,
      modifiers: [],
    };
    
    setEditedItems([...editedItems, newItem]);
    setShowAddMenu(false);
    setSearchTerm('');
  };

  const handleSave = async () => {
    if (!order) return;
    
    setSaving(true);
    try {
      const newSubtotal = editedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const newTotal = newSubtotal; // Adjust if tax/discounts apply
      
      await updateDoc(doc(db, 'orders', params.orderId), {
        items: editedItems,
        subtotal: newSubtotal,
        total: newTotal,
        updatedAt: serverTimestamp(),
      });
      
      router.push('/staff/orders');
    } catch (error) {
      console.error('Error updating order:', error);
      alert('Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 font-mono">
        <div className="border-2 border-black p-8">
          <div className="text-sm mb-2">═</div>
          <p className="text-sm font-bold">LOADING ORDER...</p>
          <div className="text-sm mt-2">═</div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 font-mono text-center">
        <p className="text-sm">ORDER NOT FOUND</p>
      </div>
    );
  }

  const filteredMenuItems = menuItems.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-white font-mono p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm"></div>
          <h1 className="text-xl font-bold my-1">EDIT ORDER</h1>
          <div className="text-sm"></div>
          <div className="mt-3 text-xs">
            <div>ORDER #{order.id.slice(-8).toUpperCase()}</div>
            <div>TABLE {order.tableId}</div>
            <div>STATUS: {order.status}</div>
          </div>
        </div>

        {/* Order Items */}
        <div className="border-2 border-black mb-6">
          <div className="border-b-2 border-black p-3 bg-gray-50">
            <h2 className="text-center font-bold text-sm">[ ORDER ITEMS ]</h2>
          </div>
          
          <div className="divide-y-2 divide-black">
            {editedItems.length === 0 ? (
              <div className="p-12 text-center text-gray-600">
                <p className="text-sm">NO ITEMS</p>
              </div>
            ) : (
              editedItems.map((item, index) => (
                <div key={index} className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-bold">{item.name.toUpperCase()}</p>
                      <p className="text-xs text-gray-600">฿{item.price.toFixed(2)} each</p>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="mt-1 text-xs text-gray-600">
                          {item.modifiers.map((mod, modIdx) => (
                            <div key={modIdx}>
                              → {mod.optionName}
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
                      onClick={() => handleEditModifiers(index)}
                      className="p-2 border-2 border-black hover:bg-gray-100"
                      title="Edit modifiers"
                    >
                      <Edit2 size={16} />
                    </button>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateQuantity(index, item.quantity - 1)}
                        className="w-8 h-8 border-2 border-black hover:bg-gray-100 font-bold"
                      >
                        -
                      </button>
                      <span className="w-12 text-center font-bold">{item.quantity}</span>
                      <button
                        onClick={() => handleUpdateQuantity(index, item.quantity + 1)}
                        className="w-8 h-8 border-2 border-black hover:bg-gray-100 font-bold"
                      >
                        +
                      </button>
                    </div>
                    
                    <div className="w-24 text-right font-bold text-sm">
                      ฿{item.subtotal.toFixed(2)}
                    </div>
                    
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="p-2 border-2 border-black hover:bg-red-50"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          
          {/* Add Item Button */}
          <div className="border-t-2 border-black p-3">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-full px-4 py-2 border-2 border-black bg-white hover:bg-gray-100 font-bold text-sm flex items-center justify-center gap-2"
            >
              <Plus size={16} /> [ADD ITEM]
            </button>
          </div>
        </div>

        {/* Add Menu Item Modal */}
        {showAddMenu && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="border-2 border-black bg-white max-w-2xl w-full max-h-[80vh] flex flex-col">
              <div className="border-b-2 border-black p-3">
                <h2 className="text-lg font-bold text-center">[ ADD MENU ITEM ]</h2>
              </div>
              
              <div className="p-3 border-b-2 border-black">
                <input
                  type="text"
                  placeholder="SEARCH MENU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-black focus:outline-none"
                />
              </div>
              
              <div className="flex-1 overflow-y-auto divide-y-2 divide-black">
                {filteredMenuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleAddItem(item)}
                    className="w-full p-3 hover:bg-gray-100 text-left"
                  >
                    <div className="flex justify-between">
                      <span className="font-bold text-sm">{item.name.toUpperCase()}</span>
                      <span className="font-bold text-sm">฿{item.price.toFixed(2)}</span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-gray-600 mt-1">{item.description}</p>
                    )}
                  </button>
                ))}
              </div>
              
              <div className="border-t-2 border-black p-3">
                <button
                  onClick={() => setShowAddMenu(false)}
                  className="w-full px-4 py-2 border-2 border-black hover:bg-gray-100 font-bold text-sm"
                >
                  [CLOSE]
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => router.back()}
            disabled={saving}
            className="px-6 py-3 border-2 border-black bg-white hover:bg-gray-100 font-bold text-sm disabled:opacity-50"
          >
            [CANCEL]
          </button>
          <button
            onClick={handleSave}
            disabled={saving || editedItems.length === 0}
            className="px-6 py-3 border-2 border-black bg-black text-white hover:bg-gray-800 font-bold text-sm disabled:opacity-50"
          >
            {saving ? '[SAVING...]' : '[SAVE CHANGES]'}
          </button>
        </div>
      </div>
    </div>
  );
}
