'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Order, OrderType } from '@/types';
import { format } from 'date-fns';
import { DatePicker } from 'antd';
import type { Dayjs } from 'dayjs';
import { OrderTypeBadge } from '@/components/orders/OrderTypeBadge';
import { orderService } from '@/lib/services/order.service';

export default function OrdersManagementPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [dateFilter, setDateFilter] = useState('satsun');
  const [customDateRange, setCustomDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderType | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editDate, setEditDate] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const ordersData = (snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Order[]).filter((o) => !o.isDeleted);
      setOrders(ordersData);
    });

    return () => unsubscribe();
  }, []);

  const handleDeleteOrder = async (orderId: string) => {
    try {
      await orderService.softDelete(orderId, 'admin');
      setModalVisible(false);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting order:', error);
      alert('Failed to delete order.');
    }
  };

  const handleUpdateDate = async () => {
    if (!selectedOrder || !editDate) return;
    setIsUpdating(true);
    try {
      const newDate = new Date(editDate);
      await orderService.updateDate(selectedOrder.id, newDate);
      
      // Update local state
      setSelectedOrder({
        ...selectedOrder,
        createdAt: newDate
      });
      setIsEditingDate(false);
    } catch (error) {
      console.error('Error updating date:', error);
      alert('Failed to update date.');
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    let filtered = [...orders];

    // Date filter
    if (dateFilter === 'satsun') {
      const now = new Date();
      const saturday = new Date(now);
      saturday.setDate(now.getDate() - ((now.getDay() + 1) % 7));
      saturday.setHours(0, 0, 0, 0);
      filtered = filtered.filter((order) => {
        const orderDate = order.createdAt instanceof Date 
          ? order.createdAt 
          : new Date((order.createdAt as { seconds: number }).seconds * 1000);
        return orderDate >= saturday;
      });
    } else if (dateFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filtered = filtered.filter((order) => {
        const orderDate = order.createdAt instanceof Date 
          ? order.createdAt 
          : new Date((order.createdAt as { seconds: number }).seconds * 1000);
        return orderDate >= today;
      });
    } else if (dateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filtered = filtered.filter((order) => {
        const orderDate = order.createdAt instanceof Date 
          ? order.createdAt 
          : new Date((order.createdAt as { seconds: number }).seconds * 1000);
        return orderDate >= weekAgo;
      });
    } else if (dateFilter === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      filtered = filtered.filter((order) => {
        const orderDate = order.createdAt instanceof Date 
          ? order.createdAt 
          : new Date((order.createdAt as { seconds: number }).seconds * 1000);
        return orderDate >= monthAgo;
      });
    } else if (dateFilter === 'custom') {
      if (customDateRange[0] && customDateRange[1]) {
        const start = customDateRange[0].startOf('day').toDate();
        const end = customDateRange[1].endOf('day').toDate();
        filtered = filtered.filter((order) => {
          const orderDate = order.createdAt instanceof Date 
            ? order.createdAt 
            : new Date((order.createdAt as { seconds: number }).seconds * 1000);
          return orderDate >= start && orderDate <= end;
        });
      }
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    // Order type filter
    if (orderTypeFilter !== 'all') {
      filtered = filtered.filter((order) => order.orderType === orderTypeFilter);
    }

    setFilteredOrders(filtered);
  }, [orders, dateFilter, statusFilter, orderTypeFilter, customDateRange]);

  // Calculate stats
  const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders = filteredOrders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const completedOrders = filteredOrders.filter((o) => o.status === 'COMPLETED').length;

  const statusCounts = {
    PLACED: filteredOrders.filter((o) => o.status === 'PLACED').length,
    PREPARING: filteredOrders.filter((o) => o.status === 'PREPARING').length,
    READY: filteredOrders.filter((o) => o.status === 'READY').length,
    SERVED: filteredOrders.filter((o) => o.status === 'SERVED').length,
    COMPLETED: filteredOrders.filter((o) => o.status === 'COMPLETED').length,
  };

  // Order type breakdown
  const dineInOrders = filteredOrders.filter(o => o.orderType === 'DINE_IN' || !o.orderType).length;
  const takeAwayOrders = filteredOrders.filter(o => o.orderType === 'TAKE_AWAY').length;

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
          <h1 className="text-xl md:text-2xl font-bold my-2">ORDER MANAGEMENT</h1>
          <p className="text-xs md:text-sm">Business Overview & Order Details</p>
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">TOTAL REVENUE</p>
            <p className="text-2xl md:text-3xl font-bold">฿{totalRevenue.toFixed(0)}</p>
          </div>
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">TOTAL ORDERS</p>
            <p className="text-2xl md:text-3xl font-bold">{totalOrders}</p>
          </div>
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">AVG ORDER</p>
            <p className="text-2xl md:text-3xl font-bold">฿{avgOrderValue.toFixed(0)}</p>
          </div>
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">COMPLETED</p>
            <p className="text-2xl md:text-3xl font-bold">{completedOrders}</p>
          </div>
        </div>

        {/* Order Type Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">DINE-IN ORDERS</p>
            <p className="text-2xl md:text-3xl font-bold">{dineInOrders}</p>
          </div>
          <div className="border-2 border-blue-600 bg-blue-50 p-4 text-center">
            <p className="text-xs mb-2 text-blue-800">TAKE-AWAY ORDERS</p>
            <p className="text-2xl md:text-3xl font-bold text-blue-800">{takeAwayOrders}</p>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="border-2 border-black mb-6">
          <div className="border-b-2 border-black p-3 bg-white">
            <h2 className="text-sm font-bold">[ORDER STATUS BREAKDOWN]</h2>
          </div>
          <div className="grid grid-cols-5 gap-3 p-4">
            <div className="text-center">
              <p className="text-xs mb-1">PLACED</p>
              <p className="text-xl font-bold">{statusCounts.PLACED}</p>
            </div>
            <div className="text-center">
              <p className="text-xs mb-1">PREPARING</p>
              <p className="text-xl font-bold">{statusCounts.PREPARING}</p>
            </div>
            <div className="text-center">
              <p className="text-xs mb-1">READY</p>
              <p className="text-xl font-bold">{statusCounts.READY}</p>
            </div>
            <div className="text-center">
              <p className="text-xs mb-1">SERVED</p>
              <p className="text-xl font-bold">{statusCounts.SERVED}</p>
            </div>
            <div className="text-center">
              <p className="text-xs mb-1">COMPLETED</p>
              <p className="text-xl font-bold">{statusCounts.COMPLETED}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div>
            <label className="block text-xs font-bold mb-2">DATE RANGE</label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none mb-2"
            >
              <option value="satsun">SAT+SUN</option>
              <option value="today">TODAY</option>
              <option value="week">LAST 7 DAYS</option>
              <option value="month">LAST 30 DAYS</option>
              <option value="custom">CUSTOM RANGE</option>
              <option value="all">ALL TIME</option>
            </select>
            {dateFilter === 'custom' && (
              <DatePicker.RangePicker 
                className="w-full border-2 border-black rounded-none shadow-none font-mono text-sm py-1.5"
                value={customDateRange}
                onChange={(dates) => setCustomDateRange(dates as [Dayjs | null, Dayjs | null] || [null, null])}
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-bold mb-2">STATUS</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
            >
              <option value="all">ALL STATUS</option>
              <option value="PLACED">PLACED</option>
              <option value="PREPARING">PREPARING</option>
              <option value="READY">READY</option>
              <option value="SERVED">SERVED</option>
              <option value="COMPLETED">COMPLETED</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold mb-2">ORDER TYPE</label>
            <select
              value={orderTypeFilter}
              onChange={(e) => setOrderTypeFilter(e.target.value as OrderType | 'all')}
              className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
            >
              <option value="all">ALL TYPES</option>
              <option value="DINE_IN">DINE-IN</option>
              <option value="TAKE_AWAY">TAKE-AWAY</option>
            </select>
          </div>
        </div>

        {/* Orders List - Desktop */}
        <div className="hidden md:block border-2 border-black">
          <div className="border-b-2 border-black p-3 bg-white">
            <div className="grid grid-cols-7 gap-4 text-xs font-bold">
              <div>ORDER ID</div>
              <div>TYPE</div>
              <div>DATE/TIME</div>
              <div>ITEMS</div>
              <div>TOTAL</div>
              <div>STATUS</div>
              <div className="text-center">ACTIONS</div>
            </div>
          </div>
          <div className="divide-y-2 divide-black max-h-[600px] overflow-y-auto">
            {filteredOrders.map((order) => (
              <div key={order.id} className="p-3 hover:bg-gray-50">
                <div className="grid grid-cols-7 gap-4 text-sm items-center">
                  <div className="font-bold">#{order.orderNumber || order.id.slice(-6).toUpperCase()}</div>
                  <div><OrderTypeBadge orderType={order.orderType || 'DINE_IN'} /></div>
                  <div className="text-xs">
                    {format(order.createdAt instanceof Date ? order.createdAt : new Date((order.createdAt as { seconds: number }).seconds * 1000), 'dd MMM yyyy')}
                    <br />
                    {format(order.createdAt instanceof Date ? order.createdAt : new Date((order.createdAt as { seconds: number }).seconds * 1000), 'HH:mm')}
                  </div>
                  <div>{order.items?.length || 0}</div>
                  <div className="font-bold">฿{(order.total || 0).toFixed(2)}</div>
                  <div>
                    <span className="px-2 py-1 border-2 border-black text-xs">{order.status}</span>
                  </div>
                  <div className="text-center">
                    <button
                      onClick={() => {
                        setSelectedOrder(order);
                        setModalVisible(true);
                      }}
                      className="px-3 py-1 border border-black text-xs hover:bg-gray-100"
                    >
                      [VIEW]
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(order.id)}
                      className="px-3 py-1 border border-black text-xs ml-2 text-red-600 hover:bg-red-50"
                    >
                      [DEL]
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Orders List - Mobile */}
        <div className="md:hidden space-y-3">
          {filteredOrders.map((order) => (
            <div key={order.id} className="border-2 border-black p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-sm font-bold">#{order.orderNumber || order.id.slice(-6).toUpperCase()}</p>
                  <div className="flex gap-2 mt-1">
                    <OrderTypeBadge orderType={order.orderType || 'DINE_IN'} />
                  </div>
                  <p className="text-xs mt-1">
                    {order.orderType === 'TAKE_AWAY' 
                      ? (order.customerName || 'Unknown')
                      : `TABLE ${order.tableId || '-'}`
                    }
                  </p>
                  <p className="text-xs mt-1">
                    {format(order.createdAt instanceof Date ? order.createdAt : new Date((order.createdAt as { seconds: number }).seconds * 1000), 'dd MMM yyyy HH:mm')}
                  </p>
                </div>
                <span className="px-2 py-1 border-2 border-black text-xs font-bold">{order.status}</span>
              </div>
              <div className="text-sm mb-3">
                <p className="font-bold">฿{(order.total || 0).toFixed(2)}</p>
                <p className="text-xs">{order.items?.length || 0} items</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedOrder(order);
                    setModalVisible(true);
                  }}
                  className="flex-1 px-4 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100"
                >
                  [VIEW DETAILS]
                </button>
                <button
                  onClick={() => setDeleteConfirm(order.id)}
                  className="px-4 py-2 border-2 border-black text-xs font-bold text-red-600 hover:bg-red-50"
                >
                  [DEL]
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredOrders.length === 0 && (
          <div className="border-2 border-black p-12 text-center">
            <p className="text-sm text-gray-600">NO ORDERS FOUND</p>
          </div>
        )}

        {/* Order Details Modal */}
        {modalVisible && selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white border-2 border-black max-w-2xl w-full font-mono my-8">
              <div className="border-b-2 border-black p-4">
                <h2 className="text-lg font-bold text-center">[ORDER DETAILS]</h2>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs font-bold mb-1">ORDER ID</p>
                    <p>#{selectedOrder.orderNumber || selectedOrder.id.slice(-8).toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold mb-1">TYPE</p>
                    <OrderTypeBadge orderType={selectedOrder.orderType || 'DINE_IN'} />
                  </div>
                  <div>
                    <p className="text-xs font-bold mb-1">
                      {selectedOrder.orderType === 'TAKE_AWAY' ? 'CUSTOMER' : 'TABLE'}
                    </p>
                    <p>
                      {selectedOrder.orderType === 'TAKE_AWAY' 
                        ? (selectedOrder.customerName || 'Unknown')
                        : `TABLE ${selectedOrder.tableId || '-'}`
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold mb-1">DATE/TIME</p>
                    {isEditingDate ? (
                      <div className="flex flex-col gap-2">
                        <input
                          type="datetime-local"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="border-2 border-black p-1 text-xs font-mono w-full"
                        />
                        <div className="flex gap-2">
                          <button 
                            onClick={handleUpdateDate}
                            disabled={isUpdating}
                            className="text-[10px] font-bold underline px-2 py-1 border border-black hover:bg-black hover:text-white"
                          >
                            {isUpdating ? 'SAVING...' : '[SAVE]'}
                          </button>
                          <button 
                            onClick={() => setIsEditingDate(false)}
                            className="text-[10px] font-bold underline px-2 py-1 border border-black hover:bg-gray-100"
                          >
                            [CANCEL]
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="group flex flex-col items-start gap-1">
                        <p>{format(selectedOrder.createdAt instanceof Date ? selectedOrder.createdAt : new Date((selectedOrder.createdAt as { seconds: number }).seconds * 1000), 'dd MMM yyyy HH:mm')}</p>
                        <button 
                          onClick={() => {
                            const date = selectedOrder.createdAt instanceof Date ? selectedOrder.createdAt : new Date((selectedOrder.createdAt as { seconds: number }).seconds * 1000);
                            setEditDate(format(date, "yyyy-MM-dd'T'HH:mm"));
                            setIsEditingDate(true);
                          }}
                          className="text-[10px] font-bold underline hover:text-blue-600 transition-colors"
                        >
                          [EDIT DATE/TIME]
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold mb-1">STATUS</p>
                    <span className="inline-block px-2 py-1 border-2 border-black text-xs">
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>

                {selectedOrder.orderType === 'TAKE_AWAY' && selectedOrder.customerPhone && (
                  <div className="text-sm border-2 border-blue-200 bg-blue-50 p-3">
                    <p className="text-xs font-bold mb-1 text-blue-800">CUSTOMER INFO</p>
                    <p className="text-blue-900">Phone: {selectedOrder.customerPhone}</p>
                    {selectedOrder.customerEmail && <p className="text-blue-900">Email: {selectedOrder.customerEmail}</p>}
                    {selectedOrder.pickupTime && (
                      <p className="text-blue-900">
                        Pickup: {format(
                          selectedOrder.pickupTime instanceof Date 
                            ? selectedOrder.pickupTime 
                            : new Date((selectedOrder.pickupTime as unknown as { seconds: number }).seconds * 1000), 
                          'dd MMM yyyy HH:mm'
                        )}
                      </p>
                    )}
                  </div>
                )}

                <div className="border-2 border-black p-3">
                  <p className="text-xs font-bold mb-2">[ITEMS]</p>
                  <div className="space-y-2">
                    {selectedOrder.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm pb-2 border-b border-black last:border-0 last:pb-0">
                        <div>
                          <p className="font-bold">{item.name}</p>
                          <p className="text-xs">Qty: {item.quantity} × ฿{item.price.toFixed(2)}</p>
                        </div>
                        <p className="font-bold">฿{item.subtotal.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-2 border-black p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>SUBTOTAL:</span>
                    <span>฿{selectedOrder.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>TAX (7%):</span>
                    <span>฿{selectedOrder.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base border-t-2 border-black pt-2">
                    <span>TOTAL:</span>
                    <span>฿{selectedOrder.total.toFixed(2)}</span>
                  </div>
                </div>

                {selectedOrder.paymentMethod && (
                  <div className="text-sm">
                    <p className="text-xs font-bold mb-1">PAYMENT METHOD</p>
                    <p>{selectedOrder.paymentMethod}</p>
                  </div>
                )}

                <button
                  onClick={() => setModalVisible(false)}
                  className="w-full px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800"
                >
                  [CLOSE]
                </button>
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
