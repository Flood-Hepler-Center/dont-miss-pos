'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { orderService } from '@/lib/services/order.service';
import { menuService } from '@/lib/services/menu.service';
import type { MenuItem, Order, OrderItem } from '@/types';
import { format } from 'date-fns';
import { OrderTypeBadge } from '@/components/orders/OrderTypeBadge';

type SmartBatch = {
  key: string;
  menuItemId: string;
  itemName: string;
  quantity: number;
  orderCount: number;
  tableLabels: string[];
  orderIds: string[];
  oldestMinutes: number;
  station: string;
  targetPrepMinutes: number;
  priorityScore: number;
  modifierSignature: string;
};

const DEFAULT_TARGET_PREP_MINUTES = 10;

export default function KDSPage() {
  const [placedOrders, setPlacedOrders] = useState<Order[]>([]);
  const [preparingOrders, setPreparingOrders] = useState<Order[]>([]);
  const [readyOrders, setReadyOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

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

  useEffect(() => {
    const fetchMenuItems = async () => {
      const items = await menuService.getActiveItems();
      setMenuItems(items);
    };

    fetchMenuItems();
  }, []);

  const menuItemMap = useMemo(() => {
    return menuItems.reduce<Record<string, MenuItem>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }, [menuItems]);

  const getOrderDate = (date: unknown): Date => {
    if (date instanceof Date) {
      return date;
    }
    if (
      typeof date === 'object' &&
      date !== null &&
      'seconds' in date &&
      typeof (date as Timestamp).seconds === 'number'
    ) {
      return new Date((date as Timestamp).seconds * 1000);
    }
    return new Date();
  };

  const getStation = (item: OrderItem): string => {
    const menuItem = menuItemMap[item.menuItemId];
    if (menuItem?.prepStation) {
      return menuItem.prepStation.replace('_', ' ');
    }

    const itemName = item.name.toLowerCase();
    if (itemName.includes('coffee') || itemName.includes('tea') || itemName.includes('latte')) {
      return 'DRINK';
    }
    if (itemName.includes('cake') || itemName.includes('dessert') || itemName.includes('ice cream')) {
      return 'DESSERT';
    }
    if (itemName.includes('salad') || itemName.includes('cold')) {
      return 'COLD KITCHEN';
    }
    return 'HOT KITCHEN';
  };

  const getModifierSignature = (item: OrderItem): string => {
    if (!item.modifiers || item.modifiers.length === 0) {
      return 'STANDARD';
    }
    return item.modifiers
      .map((mod) => `${mod.modifierGroupName}:${mod.optionName}`)
      .sort()
      .join(' | ');
  };

  const smartBatches = useMemo((): SmartBatch[] => {
    const activeCookingOrders = [...placedOrders, ...preparingOrders];
    const grouped = new Map<string, SmartBatch>();

    activeCookingOrders.forEach((order) => {
      const orderDate = getOrderDate(order.createdAt);
      const oldestMinutes = Math.max(0, Math.floor((Date.now() - orderDate.getTime()) / 60000));
      const tableLabel =
        order.orderType === 'TAKE_AWAY' ? `TAKE-AWAY:${order.customerName || 'WALK-IN'}` : `TABLE:${order.tableId || 'N/A'}`;

      order.items.forEach((item) => {
        const modifierSignature = getModifierSignature(item);
        const key = `${item.menuItemId}__${modifierSignature}`;
        const menuItem = menuItemMap[item.menuItemId];
        const targetPrepMinutes = menuItem?.targetPrepMinutes || DEFAULT_TARGET_PREP_MINUTES;
        const station = getStation(item);
        const cookPriority = menuItem?.cookPriority || 1;
        const urgencyFactor = oldestMinutes / Math.max(1, targetPrepMinutes);
        const quantityFactor = Math.max(1, item.quantity / 2);
        const priorityScore = Number((urgencyFactor * quantityFactor * cookPriority).toFixed(2));

        const existing = grouped.get(key);
        if (existing) {
          existing.quantity += item.quantity;
          existing.orderCount += 1;
          existing.oldestMinutes = Math.max(existing.oldestMinutes, oldestMinutes);
          existing.priorityScore = Number(
            Math.max(existing.priorityScore, priorityScore).toFixed(2)
          );
          existing.orderIds = Array.from(new Set([...existing.orderIds, order.id]));
          existing.tableLabels = Array.from(new Set([...existing.tableLabels, tableLabel]));
          return;
        }

        grouped.set(key, {
          key,
          menuItemId: item.menuItemId,
          itemName: item.name,
          quantity: item.quantity,
          orderCount: 1,
          tableLabels: [tableLabel],
          orderIds: [order.id],
          oldestMinutes,
          station,
          targetPrepMinutes,
          priorityScore,
          modifierSignature,
        });
      });
    });

    return Array.from(grouped.values()).sort((a, b) => b.priorityScore - a.priorityScore);
  }, [placedOrders, preparingOrders, menuItemMap]);

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
      const isTakeAway = order.orderType === 'TAKE_AWAY';

      if (order.status === 'PLACED') {
        return isTakeAway
          ? 'border-4 border-blue-600 bg-blue-100'
          : 'border-4 border-red-600 bg-red-50';
      } else if (order.status === 'PREPARING') {
        return isTakeAway
          ? 'border-4 border-blue-600 bg-blue-100'
          : 'border-4 border-yellow-600 bg-yellow-50';
      } else if (order.status === 'READY') {
        return isTakeAway
          ? 'border-4 border-green-600 bg-green-100'
          : 'border-4 border-blue-600 bg-blue-50';
      }
      return isTakeAway
        ? 'border-4 border-blue-600 bg-blue-50'
        : 'border-4 border-black bg-white';
    };

    const getHeaderText = () => {
      if (order.orderType === 'TAKE_AWAY') {
        return order.customerName?.toUpperCase() || 'TAKE-AWAY';
      }
      if (order.tableId) {
        return `TABLE #${order.tableId}`;
      }
      return 'NO TABLE';
    };

    const getActionText = () => {
      const isTakeAway = order.orderType === 'TAKE_AWAY';

      if (order.status === 'PLACED') {
        return <span className={isTakeAway ? 'text-blue-700' : 'text-red-700'}>
          [ {isTakeAway ? 'TAKE-AWAY' : 'NEW'} TAP TO START COOKING ]
        </span>;
      } else if (order.status === 'PREPARING') {
        return <span className={isTakeAway ? 'text-blue-700' : 'text-yellow-700'}>
          [ {isTakeAway ? 'TAKE-AWAY' : 'COOKING'} TAP WHEN READY ]
        </span>;
      } else {
        return <span className={isTakeAway ? 'text-green-700' : 'text-blue-700'}>
          [ {isTakeAway ? 'DONE' : 'READY'} TAP TO {isTakeAway ? 'COMPLETE' : 'SERVE'} ]
        </span>;
      }
    };

    return (
      <button
        onClick={onClick}
        className={`w-full ${getCardStyle()} p-6 hover:opacity-90 active:opacity-75 transition-all text-left font-mono min-h-[200px]`}
      >
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <OrderTypeBadge orderType={order.orderType || 'DINE_IN'} />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="text-3xl font-bold">{getHeaderText()}</div>
          </div>
          <div className="text-lg font-bold">{format(orderTime, 'HH:mm')}</div>
        </div>

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

        <div className="text-center text-base pt-3 mt-3">
          <div className="font-bold text-lg">
            {getActionText()}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      <div className="max-w-[1800px] mx-auto mb-6">
        <div className="border-4 border-black p-4 bg-gray-50">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-xl font-bold">SMART PREP BATCHES</h2>
            <p className="text-sm">Same menu across orders is grouped for faster parallel cooking</p>
          </div>
          {smartBatches.length === 0 ? (
            <div className="border-2 border-dashed border-gray-400 p-6 text-center text-sm">
              NO ACTIVE BATCHES
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {smartBatches.map((batch) => (
                <div key={batch.key} className="border-2 border-black bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold leading-tight">{batch.itemName.toUpperCase()}</p>
                      <p className="text-xs text-gray-600 mt-1">{batch.modifierSignature}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{batch.quantity}x</p>
                      <p className="text-xs">TOTAL QTY</p>
                    </div>
                  </div>
                  <p className="text-xs mt-3">
                    <span className="font-bold">ORDERS:</span> {batch.orderCount}
                  </p>
                  <p className="text-xs mt-1">
                    <span className="font-bold">TABLES/TAKE-AWAY:</span> {batch.tableLabels.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
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
