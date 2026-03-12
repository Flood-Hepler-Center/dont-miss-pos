'use client';

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, limit, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Order, Payment } from '@/types';

interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  activeTables: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    activeTables: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);

  useEffect(() => {
    // Simplified query - just get recent payments
    const paymentsQuery = query(
      collection(db, 'payments'),
      limit(50)
    );

    const unsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
      const payments = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Payment[];

      const totalRevenue = payments.reduce((sum, p) => sum + (p.total || 0), 0);
      const totalOrders = payments.length;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      setStats((prev) => ({
        ...prev,
        totalRevenue,
        totalOrders,
        avgOrderValue,
      }));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const tablesQuery = query(
      collection(db, 'tables'),
      where('status', 'in', ['OCCUPIED', 'READY_TO_PAY'])
    );

    const unsubscribe = onSnapshot(tablesQuery, (snapshot) => {
      setStats((prev) => ({
        ...prev,
        activeTables: snapshot.size,
      }));
    });

    return () => unsubscribe();
  }, []);


  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(),
        };
      }) as Order[];
      setRecentOrders(ordersData.slice(0, 5));
    });

    return () => unsubscribe();
  }, []);


  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
          <h1 className="text-xl md:text-2xl font-bold my-2">ADMIN DASHBOARD</h1>
          <p className="text-xs md:text-sm">Overview & Analytics</p>
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          {/* Total Revenue */}
          <div className="border-2 border-black p-4">
            <div className="text-center">
              <p className="text-xs mb-2">TOTAL REVENUE</p>
              <p className="text-2xl md:text-4xl font-bold">฿{stats.totalRevenue.toFixed(0)}</p>
              <p className="text-xs text-gray-600 mt-1">All payments</p>
            </div>
          </div>

          {/* Total Orders */}
          <div className="border-2 border-black p-4">
            <div className="text-center">
              <p className="text-xs mb-2">TOTAL ORDERS</p>
              <p className="text-2xl md:text-4xl font-bold">{stats.totalOrders}</p>
              <p className="text-xs text-gray-600 mt-1">Completed</p>
            </div>
          </div>

          {/* Avg Order Value */}
          <div className="border-2 border-black p-4">
            <div className="text-center">
              <p className="text-xs mb-2">AVG ORDER</p>
              <p className="text-2xl md:text-4xl font-bold">฿{stats.avgOrderValue.toFixed(0)}</p>
              <p className="text-xs text-gray-600 mt-1">Per transaction</p>
            </div>
          </div>

          {/* Active Tables */}
          <div className="border-2 border-black p-4">
            <div className="text-center">
              <p className="text-xs mb-2">ACTIVE TABLES</p>
              <p className="text-2xl md:text-4xl font-bold">{stats.activeTables}</p>
              <p className="text-xs text-gray-600 mt-1">/ 20 total</p>
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="border-2 border-black">
          <div className="border-b-2 border-black p-3 bg-white">
            <h2 className="text-center font-bold text-sm md:text-base">[ RECENT ORDERS ]</h2>
          </div>
          
          {/* Desktop Table */}
          <div className="hidden md:block">
            <div className="border-b-2 border-black p-3 bg-gray-50">
              <div className="grid grid-cols-5 gap-4 text-xs font-bold">
                <div>ORDER ID</div>
                <div>TABLE</div>
                <div>ITEMS</div>
                <div>TOTAL</div>
                <div>STATUS</div>
              </div>
            </div>
            <div className="divide-y-2 divide-black max-h-96 overflow-y-auto">
              {recentOrders.length > 0 ? (
                recentOrders.map((order) => (
                  <div key={order.id} className="p-3 hover:bg-gray-50">
                    <div className="grid grid-cols-5 gap-4 text-sm">
                      <div className="font-bold">#{order.id.slice(-6).toUpperCase()}</div>
                      <div>TABLE {order.tableId}</div>
                      <div>{order.items?.length || 0}</div>
                      <div className="font-bold">฿{order.total?.toFixed(2) || '0.00'}</div>
                      <div>
                        <span className="px-2 py-1 border-2 border-black text-xs">
                          {order.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-gray-600">
                  <p className="text-sm">NO RECENT ORDERS</p>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y-2 divide-black">
            {recentOrders.length > 0 ? (
              recentOrders.map((order) => (
                <div key={order.id} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs font-bold">#{order.id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs">TABLE {order.tableId}</p>
                    </div>
                    <span className="px-2 py-1 border border-black text-xs">
                      {order.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>{order.items?.length || 0} ITEMS</span>
                    <span className="font-bold">฿{order.total?.toFixed(2) || '0.00'}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-gray-600">
                <p className="text-sm">NO RECENT ORDERS</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
