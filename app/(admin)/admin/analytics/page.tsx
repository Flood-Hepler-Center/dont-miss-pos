'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Order } from '@/types';
import { format, startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from 'date-fns';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Payment {
  id: string;
  orderIds: string[];
  total: number;
  subtotal: number;
  tax: number;
  discountAmount: number;
  paymentMethod: string;
  status: string;
  processedAt: Date;
  createdAt: Date;
}

export default function AnalyticsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [dateRange, setDateRange] = useState('today');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sync fetch for both
    const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const paymentsQuery = query(collection(db, 'payments'), orderBy('createdAt', 'desc'));

    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const ordersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Order[];
      setOrders(ordersData);
    });

    const unsubscribePayments = onSnapshot(paymentsQuery, (snapshot) => {
      const paymentsData = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          orderIds: data.orderIds || [],
          total: data.total || 0,
          subtotal: data.subtotal || 0,
          tax: data.tax || 0,
          discountAmount: data.discountAmount || 0,
          paymentMethod: data.paymentMethod || 'UNKNOWN',
          status: data.status,
          processedAt: data.processedAt?.toDate?.() || data.createdAt?.toDate?.() || new Date(),
          createdAt: data.createdAt?.toDate?.() || new Date(),
        };
      }) as Payment[];
      setPayments(paymentsData);
      setLoading(false);
    });

    return () => {
      unsubscribeOrders();
      unsubscribePayments();
    };
  }, []);

  const getFilteredOrders = () => {
    const now = new Date();
    let startDate: Date;

    switch (dateRange) {
      case 'today':
        startDate = startOfDay(now);
        break;
      case 'week':
        startDate = startOfWeek(now);
        break;
      case 'month':
        startDate = startOfMonth(now);
        break;
      case '7days':
        startDate = subDays(now, 7);
        break;
      case '30days':
        startDate = subDays(now, 30);
        break;
      default:
        return orders;
    }

    return orders.filter((order) => order.createdAt >= startDate);
  };

  const getFilteredPayments = () => {
    const now = new Date();
    let startDate: Date;

    switch (dateRange) {
      case 'today': startDate = startOfDay(now); break;
      case 'week': startDate = startOfWeek(now); break;
      case 'month': startDate = startOfMonth(now); break;
      case '7days': startDate = subDays(now, 7); break;
      case '30days': startDate = subDays(now, 30); break;
      default: return payments;
    }

    return payments.filter((pay) => pay.createdAt >= startDate);
  };

  const filteredOrders = getFilteredOrders();
  const filteredPayments = getFilteredPayments();
  
  // Financial Metrics (Payments)
  const validPayments = filteredPayments.filter(p => p.status === 'COMPLETED');

  // Operational Metrics (Orders)
  // Compute valid orders mapped directly from successfully processed payments
  const validOrderIds = new Set(validPayments.flatMap(p => p.orderIds || []));
  const completedOrders = filteredOrders.filter((o) => validOrderIds.has(o.id));
  
  const totalOrders = completedOrders.length;
  const totalItemsSold = completedOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

  const totalRevenue = validPayments.reduce((sum, p) => sum + p.total, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Revenue by Hour (from Payments)
  const revenueByHour = Array.from({ length: 24 }, (_, i) => {
    const hourPayments = validPayments.filter((p) => p.processedAt.getHours() === i);
    return {
      hour: `${i}:00`,
      revenue: hourPayments.reduce((sum, p) => sum + p.total, 0),
      count: hourPayments.length,
    };
  }).filter((h) => h.revenue > 0 || h.count > 0);

  // Revenue by Day (from Payments)
  const revenueByDay = (() => {
    const days = dateRange === '30days' ? 30 : dateRange === '7days' ? 7 : 7;
    const data: { date: string; revenue: number; orders: number }[] = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      const dayPayments = validPayments.filter(
        (p) => p.processedAt >= dayStart && p.processedAt <= dayEnd
      );
      const dayOrders = completedOrders.filter(
        (o) => o.createdAt >= dayStart && o.createdAt <= dayEnd
      );
      data.push({
        date: format(date, 'MMM dd'),
        revenue: dayPayments.reduce((sum, p) => sum + p.total, 0),
        orders: dayOrders.length,
      });
    }
    return data;
  })();

  // Top Selling Items
  const itemStats = completedOrders.reduce((acc, order) => {
    order.items.forEach((item) => {
      if (!acc[item.name]) {
        acc[item.name] = { name: item.name, quantity: 0, revenue: 0 };
      }
      acc[item.name].quantity += item.quantity;
      acc[item.name].revenue += item.price * item.quantity;
    });
    return acc;
  }, {} as Record<string, { name: string; quantity: number; revenue: number }>);

  const topItems = Object.values(itemStats)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Payment Methods Distribution (from Payments)
  const paymentMethodStats = validPayments.reduce((acc, pay) => {
    const method = pay.paymentMethod || 'UNKNOWN';
    if (!acc[method]) {
      acc[method] = { name: method, value: 0, count: 0 };
    }
    acc[method].value += pay.total;
    acc[method].count += 1;
    return acc;
  }, {} as Record<string, { name: string; value: number; count: number }>);

  const paymentData = Object.values(paymentMethodStats);

  // Status Distribution
  const statusStats = filteredOrders.reduce((acc, order) => {
    if (!acc[order.status]) {
      acc[order.status] = 0;
    }
    acc[order.status] += 1;
    return acc;
  }, {} as Record<string, number>);

  const statusData = Object.entries(statusStats).map(([name, value]) => ({ name, value }));

  // Order Type Breakdown
  const dineInOrders = completedOrders.filter(o => o.orderType === 'DINE_IN' || !o.orderType);
  const takeAwayOrders = completedOrders.filter(o => o.orderType === 'TAKE_AWAY');
  const dineInRevenue = dineInOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const takeAwayRevenue = takeAwayOrders.reduce((sum, o) => sum + (o.total || 0), 0);

  const COLORS = ['#000000', '#4B5563', '#9CA3AF', '#D1D5DB', '#E5E7EB'];

  if (loading) {
    return (
      <div className="min-h-screen bg-white font-mono p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
          <h1 className="text-xl md:text-2xl font-bold my-2">ORDER ANALYTICS</h1>
          <p className="text-xs md:text-sm">Business Intelligence & Performance Metrics</p>
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
        </div>

        {/* Date Range Filter */}
        <div className="mb-6">
          <label className="block text-xs font-bold mb-2">TIME PERIOD</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="w-full md:w-64 px-3 py-2 border-2 border-black text-sm focus:outline-none"
          >
            <option value="today">TODAY</option>
            <option value="7days">LAST 7 DAYS</option>
            <option value="30days">LAST 30 DAYS</option>
            <option value="week">THIS WEEK</option>
            <option value="month">THIS MONTH</option>
            <option value="all">ALL TIME</option>
          </select>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">TOTAL REVENUE</p>
            <p className="text-2xl md:text-3xl font-bold">฿{totalRevenue.toFixed(0)}</p>
          </div>
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">ORDERS</p>
            <p className="text-2xl md:text-3xl font-bold">{totalOrders}</p>
          </div>
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">AVG ORDER</p>
            <p className="text-2xl md:text-3xl font-bold">฿{avgOrderValue.toFixed(0)}</p>
          </div>
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">TOTAL ITEMS SOLD</p>
            <p className="text-2xl md:text-3xl font-bold">
              {totalItemsSold}
            </p>
          </div>
        </div>

        {/* Order Type Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">DINE-IN ORDERS</p>
            <p className="text-2xl md:text-3xl font-bold">{dineInOrders.length}</p>
            <p className="text-xs text-gray-600 mt-1">฿{dineInRevenue.toFixed(0)}</p>
          </div>
          <div className="border-2 border-blue-600 bg-blue-50 p-4 text-center">
            <p className="text-xs mb-2 text-blue-800">TAKE-AWAY ORDERS</p>
            <p className="text-2xl md:text-3xl font-bold text-blue-800">{takeAwayOrders.length}</p>
            <p className="text-xs text-blue-600 mt-1">฿{takeAwayRevenue.toFixed(0)}</p>
          </div>
        </div>

        {/* Revenue by Day Chart */}
        <div className="border-2 border-black p-4 mb-6">
          <h2 className="text-sm font-bold mb-4 text-center">[REVENUE TREND]</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#000" />
              <XAxis dataKey="date" stroke="#000" style={{ fontSize: '12px' }} />
              <YAxis stroke="#000" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{ border: '2px solid black', fontFamily: 'monospace' }}
                formatter={(value) => typeof value === 'number' ? `฿${value.toFixed(2)}` : ''}
              />
              <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: '12px' }} />
              <Line type="monotone" dataKey="revenue" stroke="#000" strokeWidth={2} name="Revenue (฿)" />
              <Line type="monotone" dataKey="orders" stroke="#666" strokeWidth={2} name="Orders" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Two Column Layout for Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Revenue by Hour */}
          <div className="border-2 border-black p-4">
            <h2 className="text-sm font-bold mb-4 text-center">[HOURLY REVENUE]</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={revenueByHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="#000" />
                <XAxis dataKey="hour" stroke="#000" style={{ fontSize: '10px' }} />
                <YAxis stroke="#000" style={{ fontSize: '10px' }} />
                <Tooltip
                  contentStyle={{ border: '2px solid black', fontFamily: 'monospace' }}
                  formatter={(value) => typeof value === 'number' ? `฿${value.toFixed(0)}` : ''}
                />
                <Bar dataKey="revenue" fill="#000" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Status Distribution */}
          <div className="border-2 border-black p-4">
            <h2 className="text-sm font-bold mb-4 text-center">[ORDER STATUS]</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
                  outerRadius={80}
                  fill="#000"
                  dataKey="value"
                  style={{ fontFamily: 'monospace', fontSize: '10px' }}
                >
                  {statusData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="#000" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ border: '2px solid black', fontFamily: 'monospace' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods */}
        {paymentData.length > 0 && (
          <div className="border-2 border-black p-4 mb-6">
            <h2 className="text-sm font-bold mb-4 text-center">[PAYMENT METHODS]</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {paymentData.map((method, idx) => (
                <div key={idx} className="border border-black p-3 text-center">
                  <p className="text-xs mb-1">{method.name}</p>
                  <p className="text-xl font-bold">฿{method.value.toFixed(0)}</p>
                  <p className="text-xs text-gray-600">{method.count} orders</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Selling Items */}
        <div className="border-2 border-black p-4">
          <h2 className="text-sm font-bold mb-4 text-center">[TOP SELLING ITEMS]</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="text-left p-2 font-bold">#</th>
                  <th className="text-left p-2 font-bold">ITEM</th>
                  <th className="text-right p-2 font-bold">QTY SOLD</th>
                  <th className="text-right p-2 font-bold">REVENUE</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-black last:border-0">
                    <td className="p-2">{idx + 1}</td>
                    <td className="p-2 font-bold">{item.name}</td>
                    <td className="p-2 text-right">{item.quantity}</td>
                    <td className="p-2 text-right font-bold">฿{item.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
