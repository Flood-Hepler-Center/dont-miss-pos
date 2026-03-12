'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Order } from '@/types';

export default function StaffDashboardPage() {
  const [stats, setStats] = useState({
    activeOrders: 0,
    occupiedTables: 0,
    todayRevenue: 0,
    avgPrepTime: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);

  useEffect(() => {
    const ordersQuery = query(
      collection(db, 'orders'),
      where('status', 'in', ['PLACED', 'PREPARING', 'READY'])
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const orders = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Order[];

      setStats((prev) => ({
        ...prev,
        activeOrders: orders.length,
      }));

      setRecentOrders(orders.slice(0, 10));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const tablesQuery = query(
      collection(db, 'tables'),
      where('status', '==', 'OCCUPIED')
    );

    const unsubscribe = onSnapshot(tablesQuery, (snapshot) => {
      setStats((prev) => ({
        ...prev,
        occupiedTables: snapshot.size,
      }));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Real-time listener for today's revenue from payments
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const paymentsQuery = query(collection(db, 'payments'));

    const unsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
      let revenue = 0;
      snapshot.docs.forEach((doc) => {
        const payment = doc.data();
        const createdAt = payment.createdAt?.toMillis?.() || 0;
        if (createdAt >= todayTimestamp) {
          revenue += payment.total || 0;
        }
      });

      setStats((prev) => ({
        ...prev,
        todayRevenue: revenue,
      }));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Calculate average prep time from completed orders today
    const ordersQuery = query(
      collection(db, 'orders'),
      where('status', 'in', ['READY', 'SERVED', 'COMPLETED'])
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = today.getTime();

      let totalPrepTime = 0;
      let count = 0;

      snapshot.docs.forEach((doc) => {
        const order = doc.data();
        const createdAt = order.createdAt?.toMillis?.() || 0;
        const readyAt = order.readyAt?.toMillis?.() || order.updatedAt?.toMillis?.() || 0;
        
        if (createdAt >= todayTimestamp && readyAt > createdAt) {
          const prepTimeMinutes = Math.round((readyAt - createdAt) / 60000);
          totalPrepTime += prepTimeMinutes;
          count++;
        }
      });

      const avgPrepTime = count > 0 ? Math.round(totalPrepTime / count) : 0;

      setStats((prev) => ({
        ...prev,
        avgPrepTime,
      }));
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-white font-mono p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center border-2 border-black p-4 mb-6">
          <div className="text-xl">═══════════</div>
          <h1 className="text-2xl font-bold my-2">STAFF DASHBOARD</h1>
          <p className="text-sm">Live Operations Monitor</p>
          <div className="text-xl">═══════════</div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Active Orders */}
          <div className="border-2 border-black p-4">
            <div className="text-center">
              <p className="text-xs mb-2">ACTIVE ORDERS</p>
              <p className="text-4xl font-bold">{stats.activeOrders}</p>
            </div>
          </div>

          {/* Occupied Tables */}
          <div className="border-2 border-black p-4">
            <div className="text-center">
              <p className="text-xs mb-2">OCCUPIED TABLES</p>
              <p className="text-4xl font-bold">{stats.occupiedTables}</p>
              <p className="text-xs text-gray-600">/ 20</p>
            </div>
          </div>

          {/* Today's Revenue */}
          <div className="border-2 border-black p-4">
            <div className="text-center">
              <p className="text-xs mb-2">TODAY'S REVENUE</p>
              <p className="text-4xl font-bold">฿{stats.todayRevenue.toFixed(0)}</p>
            </div>
          </div>

          {/* Avg Prep Time */}
          <div className="border-2 border-black p-4">
            <div className="text-center">
              <p className="text-xs mb-2">AVG PREP TIME</p>
              <p className="text-4xl font-bold">{stats.avgPrepTime}</p>
              <p className="text-xs text-gray-600">MINUTES</p>
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="border-2 border-black">
          <div className="border-b-2 border-black p-3 bg-white">
            <h2 className="text-center font-bold">[ RECENT ORDERS ]</h2>
          </div>
          
          <div className="divide-y-2 divide-black">
            {recentOrders.length > 0 ? (
              recentOrders.map((order) => (
                <div key={order.id} className="p-4">
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex gap-4">
                      <span className="font-bold">TABLE #{order.tableId}</span>
                      <span>{order.items?.length || 0} ITEMS</span>
                    </div>
                    <div className="flex gap-4 items-center">
                      <span className="font-bold">฿{order.total?.toFixed(2) || '0.00'}</span>
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
      </div>
    </div>
  );
}
