'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { orderService } from '@/lib/services/order.service';
import type { Table, Order } from '@/types';

interface TableSelectorProps {
  onTableSelect: (table: Table, orders: Order[]) => void;
}

export function TableSelector({ onTableSelect }: TableSelectorProps) {
  const [tables, setTables] = useState<Table[]>([]);
  const [tableOrders, setTableOrders] = useState<Map<string, Order[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tablesQuery = query(
      collection(db, 'tables'),
      where('status', 'in', ['OCCUPIED', 'READY_TO_PAY'])
    );

    const unsubscribeTables = onSnapshot(tablesQuery, (snapshot) => {
      const tablesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Table[];
      setTables(tablesData);
      setLoading(false);
    });

    return () => {
      unsubscribeTables();
    };
  }, []);

  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    tables.forEach((table) => {
      const unsubscribe = orderService.subscribeToTableOrders(table.id, (orders) => {
        setTableOrders((prev) => {
          const next = new Map(prev);
          if (orders.length > 0) {
            next.set(table.id, orders);
          } else {
            next.delete(table.id);
          }
          return next;
        });
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [tables]);

  const handleTableClick = (table: Table) => {
    const orders = tableOrders.get(table.id) || [];
    if (orders.length === 0) {
      return;
    }
    onTableSelect(table, orders);
  };

  const activeTables = tables.filter((table) => (tableOrders.get(table.id) || []).length > 0);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 font-mono">
        <div className="border-2 border-black p-6">
          <p className="text-sm">LOADING TABLES...</p>
        </div>
      </div>
    );
  }

  if (activeTables.length === 0) {
    return (
      <div className="border-2 border-black p-12 text-center font-mono">
        <p className="text-sm">NO TABLES WITH ORDERS</p>
      </div>
    );
  }

  return (
    <div className="font-mono">
      <div className="border-2 border-black p-3 mb-4">
        <p className="text-xs text-center font-bold">[ SELECT TABLE TO PROCESS PAYMENT ]</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {activeTables.map((table) => {
          const orders = tableOrders.get(table.id) || [];
          const orderCount = orders.length;
          
          return (
            <button
              key={table.id}
              onClick={() => handleTableClick(table)}
              className="border-2 border-black p-4 hover:bg-gray-100 cursor-pointer transition-colors text-center"
            >
              <h3 className="text-xl font-bold mb-2">
                TABLE {table.tableNumber}
              </h3>
              <div className="text-xs text-gray-600">
                {orderCount} ORDER{orderCount !== 1 ? 'S' : ''}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
