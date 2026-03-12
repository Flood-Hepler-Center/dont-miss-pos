'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { orderService } from '@/lib/services/order.service';
import type { Order, OrderItem } from '@/types';
import { format } from 'date-fns';

export default function KDSPage() {
  const [placedOrders, setPlacedOrders] = useState<Order[]>([]);
  const [preparingOrders, setPreparingOrders] = useState<Order[]>([]);
  const [readyOrders, setReadyOrders] = useState<Order[]>([]);

  useEffect(() => {
    const placedQuery = query(
      collection(db, 'orders'),
      where('status', '==', 'PLACED')
    );

    const unsubscribe = onSnapshot(
      placedQuery,
      (snapshot) => {
        const orders = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Order[];
        setPlacedOrders(orders);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const preparingQuery = query(
      collection(db, 'orders'),
      where('status', '==', 'PREPARING')
    );

    const unsubscribe = onSnapshot(
      preparingQuery,
      (snapshot) => {
        const orders = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Order[];
        setPreparingOrders(orders);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const readyQuery = query(
      collection(db, 'orders'),
      where('status', '==', 'READY')
    );

    const unsubscribe = onSnapshot(
      readyQuery,
      (snapshot) => {
        const orders = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Order[];
        setReadyOrders(orders);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleOrderClick = async (order: Order) => {
    try {
      if (order.status === 'PLACED') {
        await orderService.updateStatus(order.id, 'PREPARING');
      } else if (order.status === 'PREPARING') {
        await orderService.updateStatus(order.id, 'READY');
      } else if (order.status === 'READY') {
        await orderService.updateStatus(order.id, 'SERVED');
      }
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  const OrderCard = ({ order, onClick }: { order: Order; onClick: () => void }) => {
    const orderTime = order.createdAt instanceof Date
      ? order.createdAt
      : new Date((order.createdAt as Timestamp).seconds * 1000);

    const getCardStyle = () => {
      if (order.status === 'PLACED') {
        return 'border-4 border-red-600 bg-red-50';
      } else if (order.status === 'PREPARING') {
        return 'border-4 border-yellow-600 bg-yellow-50';
      } else if (order.status === 'READY') {
        return 'border-4 border-blue-600 bg-blue-50';
      }
      return 'border-4 border-black bg-white';
    };

    return (
      <button
        onClick={onClick}
        className={`w-full ${getCardStyle()} p-6 hover:opacity-90 active:opacity-75 transition-all text-left font-mono min-h-[200px]`}
      >
        {/* Header - Larger for iPad */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            {order.status === 'PLACED' && <span className="text-4xl">🔴</span>}
            {order.status === 'PREPARING' && <span className="text-4xl">🟡</span>}
            {order.status === 'READY' && <span className="text-4xl">🔵</span>}
            <div className="text-3xl font-bold">TABLE #{order.tableId}</div>
          </div>
          <div className="text-lg font-bold">{format(orderTime, 'HH:mm')}</div>
        </div>

        {/* Items - Larger text for easy reading */}
        <div className="space-y-2 mb-4">
          {order.items.map((item: OrderItem, idx: number) => (
            <div key={idx} className="text-lg border-b border-gray-300 pb-2 last:border-0">
              <div className="flex gap-3">
                <span className="font-bold text-xl">{item.quantity}×</span>
                <span className="flex-1 font-bold">{item.name.toUpperCase()}</span>
              </div>
              {item.modifiers && item.modifiers.length > 0 && (
                <div className="ml-8 text-base mt-1 border-l-4 border-black pl-2">
                  {item.modifiers.map((mod, modIdx: number) => (
                    <div key={modIdx} className="font-bold">→ {mod.optionName}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer - Clear action */}
        <div className="text-center text-base pt-3 mt-3">
          <div className="font-bold text-lg">
            {order.status === 'PLACED' && <span className="text-red-700">[ 🔴 TAP TO START COOKING ]</span>}
            {order.status === 'PREPARING' && <span className="text-yellow-700">[ 🟡 TAP WHEN READY ]</span>}
            {order.status === 'READY' && <span className="text-blue-700">[ 🔵 TAP TO COMPLETE ]</span>}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      {/* Header - Optimized for iPad */}
      <div className="max-w-[1800px] mx-auto mb-6">
        <div className="text-center border-4 border-black p-6 bg-white">
          <h1 className="text-4xl md:text-5xl font-bold mb-2">KITCHEN DISPLAY</h1>
          <p className="text-lg md:text-xl">LIVE ORDERS</p>
        </div>
      </div>

      {/* Responsive Grid: 1 col mobile, 2 col tablet, 3 col desktop */}
      <div className="max-w-[1800px] mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
        {/* NEW ORDERS */}
        <div>
          <div className="border-4 border-black bg-black text-white p-4 mb-4">
            <div className="text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-1">NEW ORDERS</h2>
              <p className="text-xl md:text-2xl font-bold">{placedOrders.length}</p>
            </div>
          </div>
          <div className="space-y-3">
            {placedOrders.map((order: Order) => (
              <OrderCard key={order.id} order={order} onClick={() => handleOrderClick(order)} />
            ))}
            {placedOrders.length === 0 && (
              <div className="border-4 border-dashed border-gray-400 p-12 text-center bg-gray-50">
                <p className="text-xl text-gray-600">NO NEW ORDERS</p>
              </div>
            )}
          </div>
        </div>

        {/* PREPARING */}
        <div>
          <div className="border-4 border-black bg-black text-white p-4 mb-4">
            <div className="text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-1">PREPARING</h2>
              <p className="text-xl md:text-2xl font-bold">{preparingOrders.length}</p>
            </div>
          </div>
          <div className="space-y-3">
            {preparingOrders.map((order: Order) => (
              <OrderCard key={order.id} order={order} onClick={() => handleOrderClick(order)} />
            ))}
            {preparingOrders.length === 0 && (
              <div className="border-4 border-dashed border-gray-400 p-12 text-center bg-gray-50">
                <p className="text-xl text-gray-600">NO ORDERS COOKING</p>
              </div>
            )}
          </div>
        </div>

        {/* READY */}
        <div>
          <div className="border-4 border-black bg-black text-white p-4 mb-4">
            <div className="text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-1">READY</h2>
              <p className="text-xl md:text-2xl font-bold">{readyOrders.length}</p>
            </div>
          </div>
          <div className="space-y-3 md:space-y-4">
            {readyOrders.map((order: Order) => (
              <OrderCard key={order.id} order={order} onClick={() => handleOrderClick(order)} />
            ))}
            {readyOrders.length === 0 && (
              <div className="border-4 border-dashed border-gray-400 p-12 text-center bg-gray-50">
                <p className="text-xl text-gray-600">NO ORDERS READY</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
