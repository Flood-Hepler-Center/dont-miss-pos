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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'tables'),
      where('status', 'in', ['OCCUPIED', 'READY_TO_PAY'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tablesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Table[];
      setTables(tablesData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleTableClick = async (table: Table) => {
    if (!table.activeOrders || table.activeOrders.length === 0) {
      return;
    }

    const orders = await Promise.all(
      table.activeOrders.map((orderId) => orderService.getById(orderId))
    );
    const validOrders = orders.filter((order): order is Order => order !== null);
    onTableSelect(table, validOrders);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 font-mono">
        <div className="border-2 border-black p-6">
          <p className="text-sm">LOADING TABLES...</p>
        </div>
      </div>
    );
  }

  if (tables.length === 0) {
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
        {tables.map((table) => (
          <button
            key={table.id}
            onClick={() => handleTableClick(table)}
            className="border-2 border-black p-4 hover:bg-gray-100 cursor-pointer transition-colors text-center"
          >
            <h3 className="text-xl font-bold mb-2">
              TABLE {table.tableNumber}
            </h3>
            <div className="text-xs mb-2">
              {table.activeOrders?.length || 0} ORDER{(table.activeOrders?.length || 0) !== 1 ? 'S' : ''}
            </div>
            {table.totalAmount !== undefined && table.totalAmount > 0 && (
              <div className="text-sm font-bold border-t-2 border-dashed border-black pt-2 mt-2">
                ฿{table.totalAmount.toFixed(2)}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
