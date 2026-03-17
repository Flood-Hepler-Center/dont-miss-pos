'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { orderService } from '@/lib/services/order.service';
import type { Table, Order } from '@/types';
import { X } from 'lucide-react';

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tableOrders, setTableOrders] = useState<Order[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'tables'), orderBy('tableId', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tablesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Table[];
      setTables(tablesData);
    });

    return () => unsubscribe();
  }, []);

  const handleTableClick = async (table: Table) => {
    setSelectedTable(table);
    if (table.activeOrders && table.activeOrders.length > 0) {
      const orders = await Promise.all(
        table.activeOrders.map((orderId) => orderService.getById(orderId))
      );
      setTableOrders(orders.filter((order): order is Order => order !== null));
    } else {
      setTableOrders([]);
    }
  };

  return (
    <div className="min-h-screen bg-white font-mono p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center border-2 border-black p-4 mb-6">
          <div className="text-xl">═══════════</div>
          <h1 className="text-2xl font-bold my-2">TABLE MANAGEMENT</h1>
          <p className="text-sm">Monitor Status & Active Orders</p>
          <div className="text-xl">═══════════</div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs mb-6 justify-center border-2 border-black p-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-white border-2 border-black" />
            <span>VACANT</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-200 border-2 border-black" />
            <span>OCCUPIED</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 border-2 border-black" />
            <span>INACTIVE</span>
          </div>
        </div>

        {/* Tables Grid */}
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-10 gap-3 mb-6">
          {tables.map((table) => {
            const isInactive = table.isActive === false;
            return (
              <button
                key={table.id}
                onClick={() => handleTableClick(table)}
                className={`aspect-square border-2 border-black p-2 hover:bg-gray-50 transition-colors ${
                  isInactive ? 'bg-red-100 opacity-60' : 
                  table.status === 'OCCUPIED' ? 'bg-gray-200' : 'bg-white'
                }`}
              >
                <div className="flex flex-col items-center justify-center h-full">
                  <p className="text-2xl font-bold">{table.tableNumber}</p>
                  <p className="text-xs mt-1">
                    {table.status === 'OCCUPIED' ? 
                      `${table.activeOrders?.length || 0} ORD` : 
                      'EMPTY'
                    }
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Table Details Modal */}
        {selectedTable && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black max-w-2xl w-full max-h-[80vh] overflow-y-auto font-mono">
              {/* Modal Header */}
              <div className="border-b-2 border-black p-4 sticky top-0 bg-white">
                <div className="flex justify-between items-center">
                  <div className="text-center flex-1">
                    <div className="text-sm">═══════</div>
                    <h2 className="text-xl font-bold my-1">TABLE #{selectedTable.tableNumber}</h2>
                    <p className="text-xs">STATUS: {selectedTable.status}</p>
                    <div className="text-sm">═══════</div>
                  </div>
                  <button
                    onClick={() => setSelectedTable(null)}
                    className="p-2 hover:bg-gray-100 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-4">
                {tableOrders.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-bold mb-3 text-center border-b-2 border-black pb-2">
                      [ ACTIVE ORDERS: {tableOrders.length} ]
                    </h3>
                    <div className="space-y-3">
                      {tableOrders.map((order) => (
                        <div key={order.id} className="border-2 border-black p-3">
                          <div className="flex justify-between items-center mb-2 text-sm">
                            <span className="font-bold">ORDER #{order.orderNumber || order.id.slice(-6).toUpperCase()}</span>
                            <span className="px-2 py-1 border-2 border-black text-xs">
                              {order.status}
                            </span>
                          </div>
                          <div className="text-xs space-y-1">
                            <div className="flex justify-between">
                              <span>ITEMS:</span>
                              <span>{order.items?.length || 0}</span>
                            </div>
                            <div className="flex justify-between border-t-2 border-dashed border-black pt-1">
                              <span className="font-bold">TOTAL:</span>
                              <span className="font-bold">฿{order.total?.toFixed(2) || '0.00'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-black">
                    <p className="text-sm text-gray-600">NO ACTIVE ORDERS</p>
                  </div>
                )}

                {/* Close Button */}
                <button
                  onClick={() => setSelectedTable(null)}
                  className="w-full mt-4 px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 transition-colors"
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
