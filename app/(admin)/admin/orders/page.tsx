'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Payment } from '@/types';
import { format } from 'date-fns';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  totalPrice: number;
}

interface Order {
  id: string;
  tableId: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  paymentMethod?: string;
  createdAt: Date;
  updatedAt: Date;
}

export default function OrdersManagementPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [dateFilter, setDateFilter] = useState('today');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const ordersData = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          tableId: data.tableId,
          items: data.items || [],
          subtotal: data.subtotal || 0,
          tax: data.tax || 0,
          total: data.total || 0,
          status: data.status,
          paymentMethod: data.paymentMethod,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(),
        };
      }) as Order[];
      setOrders(ordersData);
    });

    return () => unsubscribe();
  }, []);

  // Fetch payments for financial accuracy
  useEffect(() => {
    // Generate date range based on dateFilter
    const now = new Date();
    let startDate: Date;
    
    if (dateFilter === 'today') {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    } else if (dateFilter === 'week') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else if (dateFilter === 'month') {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      startDate = new Date(2024, 0, 1); // Default to a reasonable start date
    }

    const paymentsQuery = query(
      collection(db, 'payments'),
      where('createdAt', '>=', startDate),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
      const paymentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: (doc.data().createdAt as Timestamp)?.toDate() || new Date(),
      })) as Payment[];
      
      // Filter out VOIDED payments for revenue
      setPayments(paymentsData.filter(p => p.status !== 'VOIDED'));
    });

    return () => unsubscribe();
  }, [dateFilter]);

  useEffect(() => {
    let filtered = [...orders];

    // Date filter
    if (dateFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filtered = filtered.filter((order) => order.createdAt >= today);
    } else if (dateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filtered = filtered.filter((order) => order.createdAt >= weekAgo);
    } else if (dateFilter === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      filtered = filtered.filter((order) => order.createdAt >= monthAgo);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    setFilteredOrders(filtered);
  }, [orders, dateFilter, statusFilter]);

  // Calculate stats
  // Calculate stats from payments for accuracy
  const totalRevenue = payments.reduce((sum, p) => sum + p.total, 0);
  const totalOrders = filteredOrders.length;
  const avgOrderValue = payments.length > 0 ? totalRevenue / payments.length : 0;
  const completedOrders = filteredOrders.filter((o) => o.status === 'COMPLETED').length;

  const statusCounts = {
    PLACED: filteredOrders.filter((o) => o.status === 'PLACED').length,
    PREPARING: filteredOrders.filter((o) => o.status === 'PREPARING').length,
    READY: filteredOrders.filter((o) => o.status === 'READY').length,
    SERVED: filteredOrders.filter((o) => o.status === 'SERVED').length,
    COMPLETED: filteredOrders.filter((o) => o.status === 'COMPLETED').length,
  };

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <div>
            <label className="block text-xs font-bold mb-2">DATE RANGE</label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
            >
              <option value="today">TODAY</option>
              <option value="week">LAST 7 DAYS</option>
              <option value="month">LAST 30 DAYS</option>
              <option value="all">ALL TIME</option>
            </select>
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
        </div>

        {/* Orders List - Desktop */}
        <div className="hidden md:block border-2 border-black">
          <div className="border-b-2 border-black p-3 bg-white">
            <div className="grid grid-cols-7 gap-4 text-xs font-bold">
              <div>ORDER ID</div>
              <div>TABLE</div>
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
                  <div className="font-bold">#{order.id.slice(-6).toUpperCase()}</div>
                  <div>TABLE {order.tableId}</div>
                  <div className="text-xs">
                    {format(order.createdAt, 'dd MMM yyyy')}
                    <br />
                    {format(order.createdAt, 'HH:mm')}
                  </div>
                  <div>{order.items?.length || 0}</div>
                  <div className="font-bold">฿{order.total.toFixed(2)}</div>
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
                  <p className="text-sm font-bold">#{order.id.slice(-6).toUpperCase()}</p>
                  <p className="text-xs mt-1">TABLE {order.tableId}</p>
                  <p className="text-xs mt-1">{format(order.createdAt, 'dd MMM yyyy HH:mm')}</p>
                </div>
                <span className="px-2 py-1 border-2 border-black text-xs font-bold">{order.status}</span>
              </div>
              <div className="text-sm mb-3">
                <p className="font-bold">฿{order.total.toFixed(2)}</p>
                <p className="text-xs">{order.items?.length || 0} items</p>
              </div>
              <button
                onClick={() => {
                  setSelectedOrder(order);
                  setModalVisible(true);
                }}
                className="w-full px-4 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100"
              >
                [VIEW DETAILS]
              </button>
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
                    <p>#{selectedOrder.id.slice(-8).toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold mb-1">TABLE</p>
                    <p>TABLE {selectedOrder.tableId}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold mb-1">DATE/TIME</p>
                    <p>{format(selectedOrder.createdAt, 'dd MMM yyyy HH:mm')}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold mb-1">STATUS</p>
                    <span className="inline-block px-2 py-1 border-2 border-black text-xs">
                      {selectedOrder.status}
                    </span>
                  </div>
                </div>

                <div className="border-2 border-black p-3">
                  <p className="text-xs font-bold mb-2">[ITEMS]</p>
                  <div className="space-y-2">
                    {selectedOrder.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm pb-2 border-b border-black last:border-0 last:pb-0">
                        <div>
                          <p className="font-bold">{item.name}</p>
                          <p className="text-xs">Qty: {item.quantity} × ฿{item.price.toFixed(2)}</p>
                        </div>
                        <p className="font-bold">฿{item.totalPrice}</p>
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
      </div>
    </div>
  );
}
