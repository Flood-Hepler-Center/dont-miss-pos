'use client';

import { useState, useEffect } from 'react';
import { message } from 'antd';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { orderService } from '@/lib/services/order.service';
import type { OrderItem, MenuItem, MenuCategory, SelectedModifier } from '@/types';
import { X } from 'lucide-react';
import { ItemModifierModal } from '@/components/shared/ItemModifierModal';

export default function CreateOrderPage() {
  const router = useRouter();
  const [tableId, setTableId] = useState<string>('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [fetchingMenu, setFetchingMenu] = useState(true);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);

  useEffect(() => {
    fetchMenuData();
  }, []);

  const fetchMenuData = async () => {
    try {
      setFetchingMenu(true);
      
      const categoriesQuery = query(
        collection(db, 'menuCategories'),
        where('isActive', '==', true)
      );
      const categoriesSnap = await getDocs(categoriesQuery);
      const categoriesData = categoriesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MenuCategory[];
      setCategories(categoriesData);

      const itemsQuery = query(
        collection(db, 'menuItems'),
        where('isAvailable', '==', true)
      );
      const itemsSnap = await getDocs(itemsQuery);
      const itemsData = itemsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MenuItem[];
      setMenuItems(itemsData);
    } catch (error) {
      console.error('Error fetching menu:', error);
      message.error('Failed to load menu items');
    } finally {
      setFetchingMenu(false);
    }
  };

  const addItemToOrder = (menuItem: MenuItem) => {
    // If item has modifiers, open modal
    if (menuItem.modifiers && menuItem.modifiers.length > 0) {
      setSelectedMenuItem(menuItem);
      return;
    }
    
    // Otherwise add directly (no modifiers)
    const existingIndex = items.findIndex(item => item.menuItemId === menuItem.id);
    
    if (existingIndex >= 0) {
      const newItems = [...items];
      newItems[existingIndex].quantity += 1;
      newItems[existingIndex].subtotal = newItems[existingIndex].price * newItems[existingIndex].quantity;
      setItems(newItems);
      message.success(`Increased ${menuItem.name} quantity`);
    } else {
      setItems([
        ...items,
        {
          menuItemId: menuItem.id,
          name: menuItem.name,
          quantity: 1,
          price: menuItem.price,
          subtotal: menuItem.price,
          modifiers: [],
        },
      ]);
      message.success(`Added ${menuItem.name}`);
    }
  };

  const handleModifierConfirm = (quantity: number, modifiers: SelectedModifier[]) => {
    if (!selectedMenuItem) return;
    
    // Calculate final price with modifiers
    let finalPrice = selectedMenuItem.price;
    for (const mod of modifiers) {
      if (mod.priceMode === 'absolute' && mod.absolutePrice) {
        finalPrice = mod.absolutePrice;
        break;
      } else {
        finalPrice += mod.priceAdjustment;
      }
    }
    
    setItems([
      ...items,
      {
        menuItemId: selectedMenuItem.id,
        name: selectedMenuItem.name,
        quantity,
        price: selectedMenuItem.price,
        subtotal: finalPrice * quantity,
        modifiers,
      },
    ]);
    
    message.success(`Added ${selectedMenuItem.name} with modifiers`);
    setSelectedMenuItem(null);
  };

  const removeItemFromOrder = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const updateQuantity = (index: number, newQty: number) => {
    if (newQty < 1) {
      removeItemFromOrder(index);
      return;
    }
    const newItems = [...items];
    newItems[index].quantity = newQty;
    newItems[index].subtotal = newItems[index].price * newQty;
    setItems(newItems);
  };

  const filteredMenuItems = menuItems.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchText.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSubmit = async () => {
    if (!tableId) {
      message.error('Please select a table');
      return;
    }

    if (items.length === 0) {
      message.error('Please add at least one item');
      return;
    }

    try {
      setLoading(true);
      await orderService.create({
        tableId,
        sessionId: `manual-${Date.now()}`,
        items,
        entryMethod: 'MANUAL',
        createdBy: 'current-staff',
      });

      message.success('Order created successfully');
      router.push('/staff/orders');
    } catch (error) {
      console.error('Error creating order:', error);
      message.error(error instanceof Error ? error.message : 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  return (
    <div className="min-h-screen bg-white font-mono p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center border-2 border-black p-4 mb-6">
          <div className="text-xl"></div>
          <h1 className="text-2xl font-bold my-2">CREATE NEW ORDER</h1>
          <p className="text-sm">Manual Order Entry</p>
          <div className="text-xl"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Menu Selection */}
          <div className="lg:col-span-2">
            <div className="border-2 border-black mb-4">
              <div className="border-b-2 border-black p-3 bg-white">
                <h2 className="text-center font-bold">[ SELECT ITEMS ]</h2>
              </div>

              {/* Table Selection */}
              <div className="p-4 border-b-2 border-black">
                <label className="block text-xs font-bold mb-2">TABLE NUMBER *</label>
                <select
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-black text-sm focus:outline-none"
                >
                  <option value="">SELECT TABLE</option>
                  {Array.from({ length: 20 }, (_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      TABLE {i + 1}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search & Filter */}
              <div className="p-4 border-b-2 border-black">
                <input
                  type="text"
                  placeholder="SEARCH ITEMS..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-black text-sm focus:outline-none mb-3"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1 border-2 border-black text-xs font-bold ${
                      selectedCategory === 'all' ? 'bg-black text-white' : 'bg-white'
                    }`}
                  >
                    [ALL]
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 py-1 border-2 border-black text-xs font-bold ${
                        selectedCategory === cat.id ? 'bg-black text-white' : 'bg-white'
                      }`}
                    >
                      [{cat.name.toUpperCase()}]
                    </button>
                  ))}
                </div>
              </div>

              {/* Menu Items Grid */}
              <div className="p-4 max-h-[500px] overflow-y-auto">
                {fetchingMenu ? (
                  <div className="text-center py-12">
                    <p className="text-sm">LOADING MENU...</p>
                  </div>
                ) : filteredMenuItems.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredMenuItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => addItemToOrder(item)}
                        className="border-2 border-black p-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <h3 className="text-sm font-bold mb-1">{item.name.toUpperCase()}</h3>
                        <p className="text-xs text-gray-600 mb-2">{item.description}</p>
                        <p className="text-sm font-bold">฿{item.price.toFixed(2)}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-black">
                    <p className="text-sm text-gray-600">NO ITEMS FOUND</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Current Order */}
          <div className="lg:col-span-1">
            <div className="border-2 border-black sticky top-4">
              <div className="border-b-2 border-black p-3 bg-white">
                <h2 className="text-center font-bold">[ CURRENT ORDER ]</h2>
                <p className="text-center text-xs">
                  {items.length} ITEM{items.length !== 1 ? 'S' : ''}
                </p>
              </div>

              <div className="divide-y-2 divide-black max-h-[400px] overflow-y-auto">
                {items.length > 0 ? (
                  items.map((item, index) => (
                    <div key={index} className="p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <h3 className="text-sm font-bold">{item.name.toUpperCase()}</h3>
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
                          onClick={() => removeItemFromOrder(index)}
                          className="p-1 hover:bg-gray-100"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(index, item.quantity - 1)}
                            className="w-6 h-6 border-2 border-black flex items-center justify-center hover:bg-gray-100"
                          >
                            -
                          </button>
                          <span className="font-bold w-6 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(index, item.quantity + 1)}
                            className="w-6 h-6 border-2 border-black flex items-center justify-center hover:bg-gray-100"
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
                  ))
                ) : (
                  <div className="p-12 text-center">
                    <p className="text-xs text-gray-600">NO ITEMS YET</p>
                    <p className="text-xs text-gray-600 mt-1">Click items to add</p>
                  </div>
                )}
              </div>

              {/* Total */}
              <div className="border-t-2 border-black p-4">
                <div className="flex justify-between text-lg font-bold mb-4">
                  <span>TOTAL:</span>
                  <span>฿{total.toFixed(2)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => router.push('/staff/orders')}
                    className="px-4 py-3 border-2 border-black bg-white font-bold text-sm hover:bg-gray-100"
                  >
                    [CANCEL]
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading || items.length === 0 || !tableId}
                    className="px-4 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    {loading ? '[CREATING...]' : '[CREATE]'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modifier Modal */}
      {selectedMenuItem && (
        <ItemModifierModal
          item={selectedMenuItem}
          onClose={() => setSelectedMenuItem(null)}
          onConfirm={handleModifierConfirm}
        />
      )}
    </div>
  );
}
