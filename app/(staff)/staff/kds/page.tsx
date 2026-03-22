'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

type StatusDef = {
  colBorder: string;
  hdrBg: string;
  hdrText: string;
  label: string;
  emptyMsg: string;
};

// ─── Color Design Decision ──────────────────────────────────────────────────
// Industry-standard KDS uses the "traffic light" principle exclusively — 3 colors.
// RED #EF4444 → NEW / URGENT | AMBER #F59E0B → COOKING | GREEN #22C55E → READY
// DARK #1C1C1C → all surfaces | #121212 → page background

const STATUS = {
  placed: {
    colBorder: 'border-l-red-500',
    hdrBg:     'bg-red-600',
    hdrText:   'text-white',
    label:     '🔴  NEW ORDERS',
    emptyMsg:  'NO NEW ORDERS',
  },
  preparing: {
    colBorder: 'border-l-amber-400',
    hdrBg:     'bg-amber-600',
    hdrText:   'text-white',
    label:     '🟡  COOKING',
    emptyMsg:  'NOTHING COOKING',
  },
  ready: {
    colBorder: 'border-l-green-500',
    hdrBg:     'bg-green-600',
    hdrText:   'text-white',
    label:     '🟢  READY',
    emptyMsg:  'NOTHING READY',
  },
} as const;

// Per-item status config
const ITEM_STATUS_CONFIG = {
  PLACED: {
    badge:     'bg-red-600 text-white',
    btnBg:     'bg-red-600 hover:bg-red-500 text-white',
    btnLabel:  '▶ START',
    nextStatus: 'PREPARING' as const,
  },
  PREPARING: {
    badge:     'bg-amber-500 text-white',
    btnBg:     'bg-amber-500 hover:bg-amber-400 text-white',
    btnLabel:  '✓ DONE',
    nextStatus: 'READY' as const,
  },
  READY: {
    badge:     'bg-green-600 text-white',
    btnBg:     'bg-green-600 hover:bg-green-500 text-white',
    btnLabel:  '🔔 SERVE',
    nextStatus: 'SERVED' as const,
  },
  SERVED: {
    badge:     'bg-neutral-600 text-neutral-300',
    btnBg:     'bg-neutral-700 text-neutral-400 cursor-not-allowed',
    btnLabel:  '✅ SERVED',
    nextStatus: null,
  },
} as const;

// ─── Live Clock ──────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-3xl font-black text-white">{format(time, 'HH:mm:ss')}</span>;
}

// ─── Elapsed Timer ───────────────────────────────────────────────────────────
function ElapsedTimer({ since }: { since: Date }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const calc = () => Math.floor((Date.now() - since.getTime()) / 1000);
    setElapsed(calc());
    const id = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(id);
  }, [since]);

  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  const label = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

  if (min >= 10)
    return <span className="px-3 py-1 rounded-lg text-base font-black text-white bg-red-600 animate-pulse">⏱ {label}</span>;
  if (min >= 5)
    return <span className="px-3 py-1 rounded-lg text-base font-black text-black bg-amber-400">⏱ {label}</span>;
  return <span className="px-3 py-1 rounded-lg text-base font-black text-black bg-green-400">⏱ {label}</span>;
}

// ─── Priority Bar ────────────────────────────────────────────────────────────
function PriorityBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.round(score * 20));
  const bar = pct >= 70 ? 'bg-red-500' : pct >= 40 ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div className="mt-2 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KDSPage() {
  const [placedOrders, setPlacedOrders]       = useState<Order[]>([]);
  const [preparingOrders, setPreparingOrders] = useState<Order[]>([]);
  const [readyOrders, setReadyOrders]         = useState<Order[]>([]);
  const [menuItems, setMenuItems]             = useState<MenuItem[]>([]);
  const [loadingItems, setLoadingItems]       = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', '==', 'PLACED'));
    return onSnapshot(q, (s) => setPlacedOrders((s.docs.map((d) => ({ id: d.id, ...d.data() })) as Order[]).filter((o) => !o.isDeleted)));
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', '==', 'PREPARING'));
    return onSnapshot(q, (s) => setPreparingOrders((s.docs.map((d) => ({ id: d.id, ...d.data() })) as Order[]).filter((o) => !o.isDeleted)));
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', '==', 'READY'));
    return onSnapshot(q, (s) => setReadyOrders((s.docs.map((d) => ({ id: d.id, ...d.data() })) as Order[]).filter((o) => !o.isDeleted)));
  }, []);

  useEffect(() => { menuService.getActiveItems().then(setMenuItems); }, []);

  const menuItemMap = useMemo(
    () => menuItems.reduce<Record<string, MenuItem>>((acc, m) => { acc[m.id] = m; return acc; }, {}),
    [menuItems],
  );

  const getOrderDate = (date: unknown): Date => {
    if (date instanceof Date) return date;
    if (typeof date === 'object' && date !== null && 'seconds' in date &&
        typeof (date as Timestamp).seconds === 'number')
      return new Date((date as Timestamp).seconds * 1000);
    return new Date();
  };

  const getStation = useCallback((item: OrderItem): string => {
    const mi = menuItemMap[item.menuItemId];
    if (mi?.prepStation) return mi.prepStation.replace('_', ' ');
    const n = item.name.toLowerCase();
    if (n.includes('coffee') || n.includes('tea') || n.includes('latte') || n.includes('juice')) return 'DRINK';
    if (n.includes('cake') || n.includes('dessert') || n.includes('ice cream')) return 'DESSERT';
    if (n.includes('salad') || n.includes('cold') || n.includes('sushi')) return 'COLD KITCHEN';
    return 'HOT KITCHEN';
  }, [menuItemMap]);

  const getModifierSignature = useCallback((item: OrderItem): string => {
    if (!item.modifiers || item.modifiers.length === 0) return 'STANDARD';
    return item.modifiers.map((m) => `${m.modifierGroupName}:${m.optionName}`).sort().join(' | ');
  }, []);

  const smartBatches = useMemo(() => {
    const active = [...placedOrders, ...preparingOrders];
    const grouped = new Map<string, SmartBatch>();
    active.forEach((order) => {
      const orderDate = getOrderDate(order.createdAt);
      const oldestMinutes = Math.max(0, Math.floor((Date.now() - orderDate.getTime()) / 60000));
      const tableLabel = order.orderType === 'TAKE_AWAY'
        ? `TA:${order.customerName || 'Walk-in'}`
        : `T${order.tableId || '?'}`;
      order.items.forEach((item) => {
        if (item.isVoided) return;
        const sig = getModifierSignature(item);
        const key = `${item.menuItemId}__${sig}`;
        const mi = menuItemMap[item.menuItemId];
        const targetPrepMinutes = mi?.targetPrepMinutes || DEFAULT_TARGET_PREP_MINUTES;
        const station = getStation(item);
        const priorityScore = Number(
          ((oldestMinutes / Math.max(1, targetPrepMinutes)) * Math.max(1, item.quantity / 2) * (mi?.cookPriority || 1)).toFixed(2)
        );
        const ex = grouped.get(key);
        if (ex) {
          ex.quantity += item.quantity;
          ex.orderCount++;
          ex.oldestMinutes = Math.max(ex.oldestMinutes, oldestMinutes);
          ex.priorityScore = Number(Math.max(ex.priorityScore, priorityScore).toFixed(2));
          ex.orderIds = Array.from(new Set([...ex.orderIds, order.id]));
          ex.tableLabels = Array.from(new Set([...ex.tableLabels, tableLabel]));
          return;
        }
        grouped.set(key, { key, menuItemId: item.menuItemId, itemName: item.name, quantity: item.quantity, orderCount: 1, tableLabels: [tableLabel], orderIds: [order.id], oldestMinutes, station, targetPrepMinutes, priorityScore, modifierSignature: sig });
      });
    });
    return Array.from(grouped.values()).sort((a, b) => b.priorityScore - a.priorityScore);
  }, [placedOrders, preparingOrders, menuItemMap, getStation, getModifierSignature]);

  // ─── Per-item status handler ─────────────────────────────────────────────
  const handleItemClick = useCallback(async (
    orderId: string,
    itemIndex: number,
    currentItemStatus: 'PLACED' | 'PREPARING' | 'READY' | 'SERVED'
  ) => {
    const cfg = ITEM_STATUS_CONFIG[currentItemStatus];
    if (!cfg.nextStatus) return; // already SERVED
    const loadKey = `${orderId}-${itemIndex}`;
    setLoadingItems((prev) => new Set(prev).add(loadKey));
    try {
      await orderService.updateItemStatus(orderId, itemIndex, cfg.nextStatus);
    } catch (err) { console.error(err); }
    finally {
      setLoadingItems((prev) => { const s = new Set(prev); s.delete(loadKey); return s; });
    }
  }, []);

  // ─── Order Card — per-item rows ──────────────────────────────────────────
  const OrderCard = ({ order, st }: { order: Order; st: StatusDef }) => {
    const orderTime = getOrderDate(order.createdAt);
    const isTakeAway = order.orderType === 'TAKE_AWAY';
    const headerText = isTakeAway
      ? (order.customerName?.toUpperCase() || 'TAKE-AWAY')
      : order.tableId ? `TABLE #${order.tableId}` : 'NO TABLE';

    const activeItems = order.items.filter((i) => !i.isVoided);

    return (
      <div className={`w-full bg-neutral-800 border-l-8 ${st.colBorder} rounded-2xl overflow-hidden shadow-md`}>
        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-4 pb-2 gap-3">
          <div>
            <div className="text-3xl font-black text-white leading-none">{headerText}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <OrderTypeBadge orderType={order.orderType || 'DINE_IN'} />
              <span className="text-neutral-400 text-sm">{format(orderTime, 'HH:mm')}</span>
            </div>
          </div>
          <ElapsedTimer since={orderTime} />
        </div>

        {/* Divider */}
        <div className="mx-4 border-t border-neutral-700" />

        {/* Items — each with its own status control */}
        <div className="px-4 py-3 space-y-3">
          {activeItems.map((item: OrderItem, idx: number) => {
            // Find original index in full items array for service call
            const originalIdx = order.items.indexOf(item);
            const effectiveStatus = (item.itemStatus ?? 'PLACED') as 'PLACED' | 'PREPARING' | 'READY' | 'SERVED';
            const cfg = ITEM_STATUS_CONFIG[effectiveStatus];
            const loadKey = `${order.id}-${originalIdx}`;
            const isLoading = loadingItems.has(loadKey);

            return (
              <div key={idx} className="bg-neutral-900 rounded-xl p-3">
                {/* Item name & quantity */}
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-4xl font-black text-white leading-none w-12 text-right shrink-0">
                    {item.quantity}
                  </span>
                  <span className="text-lg font-bold text-white leading-tight flex-1">
                    {item.name.toUpperCase()}
                  </span>
                  {/* Item status badge */}
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
                    {effectiveStatus}
                  </span>
                </div>

                {/* Modifiers */}
                {item.modifiers && item.modifiers.length > 0 && (
                  <div className="ml-14 mb-2 space-y-0.5">
                    {item.modifiers.map((mod, mi: number) => (
                      <div key={mi} className="text-sm font-semibold text-neutral-400">
                        ▸ {mod.optionName}
                      </div>
                    ))}
                  </div>
                )}

                {/* Advance button */}
                <button
                  onClick={() => handleItemClick(order.id, originalIdx, effectiveStatus)}
                  disabled={effectiveStatus === 'SERVED' || isLoading}
                  className={`w-full mt-1 py-2 rounded-lg text-sm font-black transition-colors ${
                    effectiveStatus === 'SERVED'
                      ? 'bg-neutral-700 text-neutral-500 cursor-default'
                      : `${cfg.btnBg} active:scale-[0.97]`
                  }`}
                >
                  {isLoading ? '...' : cfg.btnLabel}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Column ──────────────────────────────────────────────────────────────────
  const Column = ({ st, orders }: { st: StatusDef; orders: Order[] }) => (
    <div className="flex flex-col gap-3">
      <div className={`${st.hdrBg} rounded-2xl px-5 py-3 flex items-center justify-between`}>
        <h2 className="text-2xl font-black text-white">{st.label}</h2>
        <span className="text-5xl font-black text-white/80">{orders.length}</span>
      </div>
      {orders.length === 0 ? (
        <div className="border-2 border-dashed border-neutral-700 rounded-2xl p-10 text-center">
          <p className="text-lg font-bold text-neutral-500">{st.emptyMsg}</p>
        </div>
      ) : (
        orders.map((order) => <OrderCard key={order.id} order={order} st={st} />)
      )}
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Nunito: rounded humanist sans-serif — top recommended for kitchen display legibility */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        * { font-family: 'Nunito', 'Helvetica Neue', Arial, sans-serif; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #121212; }
        ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
      `}</style>

      <div className="min-h-screen p-3 md:p-4" style={{ background: '#121212' }}>

        {/* ── Status Bar ─────────────────────────────────────────────────── */}
        <div className="bg-neutral-800 rounded-2xl px-5 py-3 mb-4 flex items-center justify-between border border-neutral-700 shadow-xl">
          <div>
            <h1 className="text-3xl font-black text-white">🍳 Kitchen Display</h1>
            <div className="flex gap-5 mt-1">
              <span className="text-red-400 font-bold text-lg">🔴 {placedOrders.length} NEW</span>
              <span className="text-amber-400 font-bold text-lg">🟡 {preparingOrders.length} COOKING</span>
              <span className="text-green-400 font-bold text-lg">🟢 {readyOrders.length} READY</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <LiveClock />
            <span className="text-xs text-neutral-500 font-semibold">TAP EACH ITEM TO ADVANCE STATUS</span>
          </div>
        </div>

        {/* ── Smart Prep Batches ────────────────────────────────────────── */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-2xl p-3 mb-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xl font-black text-white">⚡ Smart Prep Batches</h2>
            <span className="text-sm text-neutral-400">Same item grouped for faster cooking</span>
          </div>

          {smartBatches.length === 0 ? (
            <div className="border-2 border-dashed border-neutral-700 rounded-xl p-5 text-center">
              <p className="text-lg font-bold text-neutral-500">NO ACTIVE BATCHES</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {smartBatches.map((batch) => (
                <div key={batch.key} className="bg-neutral-900 border border-neutral-700 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-base font-bold text-white leading-tight">
                      {batch.itemName.toUpperCase()}
                    </p>
                    <span className="text-3xl font-black text-white leading-none">{batch.quantity}×</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-neutral-700 text-neutral-200 uppercase">
                      {batch.station}
                    </span>
                    <span className="text-xs text-neutral-400">{batch.orderCount} order{batch.orderCount > 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-xs text-neutral-400 truncate">{batch.tableLabels.join(' · ')}</p>
                  {batch.modifierSignature !== 'STANDARD' && (
                    <p className="text-xs text-neutral-400 italic mt-0.5 truncate">{batch.modifierSignature}</p>
                  )}
                  <PriorityBar score={batch.priorityScore} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Three Columns ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Column st={STATUS.placed}    orders={placedOrders} />
          <Column st={STATUS.preparing} orders={preparingOrders} />
          <Column st={STATUS.ready}     orders={readyOrders} />
        </div>
      </div>
    </>
  );
}
