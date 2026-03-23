'use client';

import { useEffect, useState } from 'react';
import { message } from 'antd';
import { useRouter } from 'next/navigation';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { orderService } from '@/lib/services/order.service';
import type { Order, OrderType } from '@/types';
import { OrderTypeBadge } from '@/components/orders/OrderTypeBadge';

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderType | 'all'>('all');
  const [tableStatusFilter, setTableStatusFilter] = useState<'all' | 'hasTable' | 'noTable'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = (snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      })) as Order[]).filter((o) => !o.isDeleted);
      setOrders(ordersData);
      setFilteredOrders(ordersData);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let filtered = orders;

    if (searchText) {
      filtered = filtered.filter(
        (order) =>
          (order.tableId?.toLowerCase().includes(searchText.toLowerCase()) || false) ||
          order.id.toLowerCase().includes(searchText.toLowerCase()) ||
          (order.customerName?.toLowerCase().includes(searchText.toLowerCase()) || false)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    if (orderTypeFilter !== 'all') {
      filtered = filtered.filter((order) => order.orderType === orderTypeFilter);
    }

    if (tableStatusFilter !== 'all') {
      filtered = filtered.filter((order) => {
        if (order.orderType === 'TAKE_AWAY') return true; // Always show take-away
        const hasTable = !!order.tableId;
        return tableStatusFilter === 'hasTable' ? hasTable : !hasTable;
      });
    }

    setFilteredOrders(filtered);
  }, [searchText, statusFilter, orderTypeFilter, tableStatusFilter, orders]);

  const handleVoidOrder = async (orderId: string) => {
    try {
      await orderService.updateStatus(orderId, 'CANCELLED');
      message.success('Order cancelled successfully');
      setModalVisible(false);
    } catch (error) {
      console.error('Error cancelling order:', error);
      message.error('Failed to cancel order');
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      await orderService.softDelete(orderId, 'staff');
      setModalVisible(false);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting order:', error);
      message.error('Failed to delete order');
    }
  };

  return (
    <div className="min-h-screen bg-white font-mono p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center border-2 border-black p-4 mb-6">
          <div className="text-xl">═══════════</div>
          <h1 className="text-2xl font-bold my-2">ORDERS MANAGEMENT</h1>
          <p className="text-sm">Track & Manage Customer Orders</p>
          <div className="text-xl">═══════════</div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <button
            onClick={() => router.push('/staff/orders/create')}
            className="px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 transition-colors"
          >
            [+ CREATE ORDER]
          </button>
          <input
            type="text"
            placeholder="SEARCH TABLE OR ORDER ID..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="flex-1 px-4 py-3 border-2 border-black text-sm focus:outline-none focus:ring-0"
          />
          <select
            value={orderTypeFilter}
            onChange={(e) => setOrderTypeFilter(e.target.value as OrderType | 'all')}
            className="px-4 py-3 border-2 border-black text-sm focus:outline-none focus:ring-0"
          >
            <option value="all">ALL TYPES</option>
            <option value="DINE_IN">DINE-IN</option>
            <option value="TAKE_AWAY">TAKE-AWAY</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-3 border-2 border-black text-sm focus:outline-none focus:ring-0"
          >
            <option value="all">ALL STATUS</option>
            <option value="PLACED">PLACED</option>
            <option value="PREPARING">PREPARING</option>
            <option value="READY">READY</option>
            <option value="SERVED">SERVED</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
          <select
            value={tableStatusFilter}
            onChange={(e) => setTableStatusFilter(e.target.value as 'all' | 'hasTable' | 'noTable')}
            className="px-4 py-3 border-2 border-black text-sm focus:outline-none focus:ring-0"
          >
            <option value="all">ALL TABLES</option>
            <option value="hasTable">HAS TABLE</option>
            <option value="noTable">NO TABLE ⚠️</option>
          </select>
        </div>

        {/* Orders List - Desktop Table */}
        <div className="hidden md:block border-2 border-black">
          <div className="border-b-2 border-black p-3 bg-white">
            <div className="grid grid-cols-7 gap-4 text-xs font-bold">
              <div>ORDER ID</div>
              <div>TYPE</div>
              <div>TABLE/CUSTOMER</div>
              <div>ITEMS</div>
              <div>TOTAL</div>
              <div>STATUS</div>
              <div>ACTION</div>
            </div>
          </div>

          <div className="divide-y-2 divide-black max-h-[600px] overflow-y-auto">
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order) => (
                <div key={order.id} className="p-3 hover:bg-gray-50">
                  <div className="grid grid-cols-7 gap-4 text-sm items-center">
                    <div className="font-bold">#{order.orderNumber || order.id.slice(-6).toUpperCase()}</div>
                    <div><OrderTypeBadge orderType={order.orderType || 'DINE_IN'} /></div>
                    <div>
                      {order.orderType === 'TAKE_AWAY'
                        ? (order.customerName || 'Unknown')
                        : order.tableId
                          ? `TABLE ${order.tableId}`
                          : <span className="text-amber-600 font-bold">⚠️ NO TABLE</span>
                      }
                    </div>
                    <div>{order.items?.length || 0}</div>
                    <div className="font-bold">฿{order.total?.toFixed(2) || '0.00'}</div>
                    <div>
                      <span className="px-2 py-1 border-2 border-black text-xs">
                        {order.status}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedOrder(order);
                          setModalVisible(true);
                        }}
                        className="px-2 py-1 border border-black text-xs hover:bg-gray-100"
                      >
                        [VIEW]
                      </button>
                      <button
                        onClick={() => router.push(`/staff/orders/${order.id}/edit`)}
                        className="px-2 py-1 border border-black text-xs hover:bg-gray-100"
                      >
                        [EDIT]
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(order.id)}
                        className="px-2 py-1 border border-black text-xs text-red-600 hover:bg-red-50"
                      >
                        [DEL]
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-gray-600">
                <p className="text-sm">NO ORDERS FOUND</p>
              </div>
            )}
          </div>
        </div>

        {/* Orders List - Mobile Cards */}
        <div className="md:hidden space-y-3">
          {filteredOrders.length > 0 ? (
            filteredOrders.map((order) => (
              <div key={order.id} className="border-2 border-black p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-sm font-bold">#{order.orderNumber || order.id.slice(-6).toUpperCase()}</p>
                    <p className="text-xs mt-1">
                      {order.orderType === 'TAKE_AWAY'
                        ? (order.customerName || 'Unknown')
                        : `TABLE ${order.tableId || '-'}`
                      }
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <OrderTypeBadge orderType={order.orderType || 'DINE_IN'} />
                    <span className="px-2 py-1 border-2 border-black text-xs font-bold">
                      {order.status}
                    </span>
                  </div>
                </div>

                <div className="border-t-2 border-dashed border-black pt-2 mb-3">
                  <div className="flex justify-between text-sm">
                    <span>{order.items?.length || 0} ITEMS</span>
                    <span className="font-bold">฿{order.total?.toFixed(2) || '0.00'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setSelectedOrder(order);
                      setModalVisible(true);
                    }}
                    className="px-4 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100"
                  >
                    [VIEW]
                  </button>
                  <button
                    onClick={() => router.push(`/staff/orders/${order.id}/edit`)}
                    className="px-4 py-2 border-2 border-black bg-black text-white text-xs font-bold hover:bg-gray-800"
                  >
                    [EDIT]
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(order.id)}
                    className="px-4 py-2 border-2 border-black text-xs font-bold text-red-600 hover:bg-red-50 flex items-center justify-center whitespace-nowrap"
                  >
                    [DEL]
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="border-2 border-dashed border-black p-12 text-center text-gray-600">
              <p className="text-sm">NO ORDERS FOUND</p>
            </div>
          )}
        </div>

        {/* Order Details Modal */}
        {selectedOrder && modalVisible && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black max-w-2xl w-full max-h-[80vh] overflow-y-auto font-mono">
              {/* Modal Header */}
              <div className="border-b-2 border-black p-4 bg-white sticky top-0">
                <div className="text-center">
                  <div className="text-sm">═══════</div>
                  <h2 className="text-xl font-bold my-1">ORDER #{selectedOrder.orderNumber || selectedOrder.id.slice(-6).toUpperCase()}</h2>
                  <div className="flex justify-center gap-2 mb-1">
                    <OrderTypeBadge orderType={selectedOrder.orderType || 'DINE_IN'} />
                    <span className="text-xs">•</span>
                    <span className="text-xs">{selectedOrder.status}</span>
                  </div>
                  <p className="text-xs">
                    {selectedOrder.orderType === 'TAKE_AWAY'
                      ? (selectedOrder.customerName || 'Unknown')
                      : `TABLE ${selectedOrder.tableId || '-'}`
                    }
                  </p>
                  <div className="text-sm">═══════</div>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-4">
                <div className="space-y-2">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="border-b border-gray-200 pb-2 last:border-0">
                      <div className="flex justify-between text-sm">
                        <div className="flex-1">
                          <div>
                            <span className="font-bold">{item.quantity}×</span> {item.name}
                          </div>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="ml-6 mt-1 text-xs text-gray-600">
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
                        <div className="text-right">
                          <div className="text-gray-600">฿{item.price.toFixed(2)} each</div>
                          <div className="font-bold">฿{item.subtotal.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex justify-between text-sm">
                    <span>ITEMS:</span>
                    <span>{selectedOrder.items?.length || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t-2 border-dashed border-black pt-2">
                    <span className="font-bold">TOTAL:</span>
                    <span className="font-bold">฿{selectedOrder.total?.toFixed(2) || '0.00'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button
                    onClick={() => router.push(`/staff/orders/${selectedOrder.id}/edit`)}
                    className="col-span-2 px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 transition-colors"
                  >
                    [EDIT ORDER]
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setModalVisible(false)}
                    className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100 transition-colors"
                  >
                    [CLOSE]
                  </button>
                  {selectedOrder.status !== 'CANCELLED' && (
                    <button
                      onClick={() => handleVoidOrder(selectedOrder.id)}
                      className="px-6 py-3 border-2 border-black bg-red-50 text-black font-bold text-sm hover:bg-red-100 transition-colors"
                    >
                      [VOID ORDER]
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black max-w-md w-full font-mono">
              <div className="border-b-2 border-black p-4">
                <h2 className="text-lg font-bold text-center text-red-600">[DELETE ORDER?]</h2>
              </div>
              <div className="p-4">
                <p className="text-sm text-center mb-6">Are you sure you want to delete this order? This action will mark it as deleted.</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
                  >
                    [NO, CANCEL]
                  </button>
                  <button
                    onClick={() => handleDeleteOrder(deleteConfirm)}
                    className="px-6 py-3 border-2 border-black bg-red-600 text-white font-bold text-sm hover:bg-red-700"
                  >
                    [YES, DELETE]
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
