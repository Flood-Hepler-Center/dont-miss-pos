'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { orderService } from '@/lib/services/order.service';
import { tableService } from '@/lib/services/table.service';
import type { Table, Order } from '@/types';
import { X, ArrowRightLeft } from 'lucide-react';

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tableOrders, setTableOrders] = useState<Order[]>([]);
  const [isChangingTable, setIsChangingTable] = useState(false);
  const [targetTable, setTargetTable] = useState<Table | null>(null);
  const [loading, setLoading] = useState(false);
  const unsubscribeOrdersRef = useRef<(() => void) | null>(null);

  // Subscribe to all tables
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

  // Subscribe to active (unpaid) orders for the selected table in real-time
  const handleTableClick = (table: Table) => {
    setSelectedTable(table);

    // Unsubscribe from previous table's orders if any
    if (unsubscribeOrdersRef.current) {
      unsubscribeOrdersRef.current();
      unsubscribeOrdersRef.current = null;
    }

    if (table.status !== 'OCCUPIED') {
      setTableOrders([]);
      return;
    }

    // subscribeToTableOrders already filters to non-completed statuses:
    // ['PLACED', 'PREPARING', 'READY', 'SERVED']
    const unsub = orderService.subscribeToTableOrders(table.id, (orders) => {
      setTableOrders(orders);
    });

    unsubscribeOrdersRef.current = unsub;
  };

  const handleCloseModal = () => {
    setSelectedTable(null);
    setTableOrders([]);
    setIsChangingTable(false);
    setTargetTable(null);
    if (unsubscribeOrdersRef.current) {
      unsubscribeOrdersRef.current();
      unsubscribeOrdersRef.current = null;
    }
  };

  const handleChangeTable = async () => {
    if (!selectedTable || !targetTable) return;
    
    setLoading(true);
    try {
      await tableService.moveTable(selectedTable.id, targetTable.id);
      handleCloseModal();
    } catch (error) {
      console.error('Failed to move table:', error);
      alert('Failed to move table');
    } finally {
      setLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeOrdersRef.current) {
        unsubscribeOrdersRef.current();
      }
    };
  }, []);

  // Compute per-order totals (only non-voided, non-comped items)
  const getOrderTotal = (order: Order) =>
    (order.items || [])
      .filter((i) => !i.isVoided && !i.isComped)
      .reduce((sum, i) => sum + (i.subtotal || 0), 0);

  const grandTotal = tableOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);

  return (
    <div className="min-h-screen bg-white font-mono p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center border-2 border-black p-4 mb-6">
          <div className="text-xl">═══════════</div>
          <h1 className="text-2xl font-bold my-2">TABLE MANAGEMENT</h1>
          <p className="text-sm">Monitor Status &amp; Active Orders</p>
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
            <div className="bg-white border-2 border-black max-w-2xl w-full max-h-[85vh] overflow-y-auto font-mono">
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
                    onClick={handleCloseModal}
                    className="p-2 hover:bg-gray-100 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-4">
                {isChangingTable ? (
                  <div className="space-y-6">
                    <h3 className="text-sm font-bold text-center border-b-2 border-black pb-2">
                      [ SELECT NEW TABLE ]
                    </h3>
                    
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                      {tables
                        .filter(t => t.id !== selectedTable.id && t.isActive)
                        .map((table) => (
                          <button
                            key={table.id}
                            onClick={() => setTargetTable(table)}
                            className={`aspect-square border-2 border-black p-2 transition-all ${
                              targetTable?.id === table.id 
                                ? 'bg-black text-white scale-105 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)]' 
                                : table.status === 'OCCUPIED'
                                  ? 'bg-gray-100 border-dashed opacity-60'
                                  : 'bg-white hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex flex-col items-center justify-center h-full">
                              <p className="text-xl font-bold">{table.tableNumber}</p>
                              <p className="text-[10px]">
                                {table.status === 'OCCUPIED' ? 'OCCUPIED' : 'VACANT'}
                              </p>
                            </div>
                          </button>
                        ))}
                    </div>

                    {targetTable && (
                      <div className="border-2 border-black p-4 bg-gray-50 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-center gap-4 text-center">
                          <div>
                            <p className="text-xs text-gray-500">CURRENT</p>
                            <p className="text-xl font-bold">TABLE {selectedTable.tableNumber}</p>
                          </div>
                          <ArrowRightLeft className="text-gray-400" />
                          <div>
                            <p className="text-xs text-gray-500">NEW</p>
                            <p className="text-xl font-bold">TABLE {targetTable.tableNumber}</p>
                          </div>
                        </div>
                        
                        <div className="mt-6 grid grid-cols-2 gap-3">
                          <button
                            onClick={() => { setIsChangingTable(false); setTargetTable(null); }}
                            className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100 transition-colors"
                          >
                            [CANCEL]
                          </button>
                          <button
                            onClick={handleChangeTable}
                            disabled={loading}
                            className="px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
                          >
                            {loading ? '[MOVING...]' : '[CONFIRM MOVE]'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : tableOrders.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-bold mb-3 text-center border-b-2 border-black pb-2">
                      [ UNPAID ORDERS: {tableOrders.length} ]
                    </h3>
                    <div className="space-y-4">
                      {tableOrders.map((order) => {
                        const orderTotal = getOrderTotal(order);
                        return (
                          <div key={order.id} className="border-2 border-black">
                            {/* Order Header */}
                            <div className="border-b-2 border-black p-3 flex justify-between items-center bg-gray-50">
                              <span className="font-bold text-sm">
                                ORDER #{order.orderNumber || order.id.slice(-6).toUpperCase()}
                              </span>
                              <span className="px-2 py-1 border-2 border-black text-xs font-bold">
                                {order.status}
                              </span>
                            </div>

                            {/* Order Items */}
                            <div className="p-3 space-y-2">
                              {(order.items || []).map((item, itemIdx) => (
                                <div
                                  key={itemIdx}
                                  className={`text-sm ${item.isVoided ? 'opacity-40' : ''}`}
                                >
                                  <div className="flex justify-between">
                                    <div className="flex-1 pr-2">
                                      <span className={item.isVoided ? 'line-through' : ''}>
                                        {item.quantity}× {item.name}
                                      </span>
                                      {item.isVoided && (
                                        <span className="ml-2 text-xs text-red-600">[VOIDED]</span>
                                      )}
                                      {item.isComped && (
                                        <span className="ml-2 text-xs text-green-700">[COMP]</span>
                                      )}
                                      {item.modifiers && item.modifiers.length > 0 && (
                                        <div className="text-xs text-gray-500 ml-4 mt-0.5">
                                          {item.modifiers.map((mod, mIdx) => (
                                            <span key={mIdx} className="block">+ {mod.optionName}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <span className={`whitespace-nowrap ${item.isVoided ? 'line-through' : 'font-bold'}`}>
                                      {item.isComped ? '฿0.00' : `฿${(item.subtotal || 0).toFixed(2)}`}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Order Total */}
                            <div className="border-t-2 border-dashed border-black px-3 py-2 flex justify-between text-sm font-bold">
                              <span>ORDER TOTAL:</span>
                              <span>฿{orderTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Grand Total */}
                    <div className="mt-4 border-2 border-black p-3 flex justify-between text-lg font-bold">
                      <span>GRAND TOTAL:</span>
                      <span>฿{grandTotal.toFixed(2)}</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-6 grid grid-cols-1 gap-3">
                      <button
                        onClick={() => setIsChangingTable(true)}
                        className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100 transition-colors"
                      >
                        <ArrowRightLeft size={16} />
                        [CHANGE TABLE]
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-black">
                    <p className="text-sm text-gray-600">
                      {selectedTable.status === 'OCCUPIED'
                        ? 'LOADING ORDERS...'
                        : 'NO ACTIVE ORDERS'}
                    </p>
                    {selectedTable.status === 'OCCUPIED' && (
                      <p className="text-xs text-gray-400 mt-2">All orders may have been paid</p>
                    )}
                  </div>
                )}

                {/* Close Button */}
                <button
                  onClick={handleCloseModal}
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
