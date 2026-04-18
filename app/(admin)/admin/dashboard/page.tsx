'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  onSnapshot,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Order, OrderItem, Payment, OrderStatus } from '@/types';
import { fetchCostMaps, getLineCost, type CostMaps } from '@/lib/utils/costCalculator';
import {
  getCurrentWeekend,
  getWeekendByOffset,
  getLastNWeekendsRange,
  listRecentWeekends,
  buildCustomRange,
  rangeIncludesToday,
  type DateRange,
} from '@/lib/utils/dateRanges';

// -------------- Helpers --------------

const formatTime = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

const toDate = (v: unknown): Date => {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') return new Date(v);
  return new Date();
};

const lineAmount = (item: OrderItem) => item.subtotal || item.price * item.quantity;

// -------------- Filter --------------

type FilterPreset =
  | 'current_weekend'
  | 'last_weekend'
  | 'last_4_weekends'
  | 'pick_weekend'
  | 'custom';

// -------------- Types --------------

type PaymentPivotRow = {
  key: string;
  tableId: string;
  paymentTime: string;
  sumAmount: number;
  sumDiscount: number;
  netAmount: number;
  sumCost: number;
  avgGP: number;
  paymentMethod: string;
};

type LiveOrderRow = {
  id: string;
  orderNumber: string;
  tableId: string;
  createdAt: Date;
  status: OrderStatus;
  itemCount: number;
  amount: number;
  cost: number;
  gpPercent: number;
};

// -------------- Main Component --------------

export default function AdminDashboard() {
  // Filter state
  const [preset, setPreset] = useState<FilterPreset>('current_weekend');
  const [weekendOffset, setWeekendOffset] = useState(0); // for pick_weekend
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Resolve to a concrete range based on preset
  const dateRange: DateRange = useMemo(() => {
    switch (preset) {
      case 'current_weekend':
        return getCurrentWeekend();
      case 'last_weekend':
        return getWeekendByOffset(1);
      case 'last_4_weekends':
        return getLastNWeekendsRange(4);
      case 'pick_weekend':
        return getWeekendByOffset(weekendOffset);
      case 'custom': {
        const custom = buildCustomRange(customStart, customEnd);
        return custom ?? getCurrentWeekend();
      }
      default:
        return getCurrentWeekend();
    }
  }, [preset, weekendOffset, customStart, customEnd]);

  const isLiveRange = rangeIncludesToday(dateRange);
  const recentWeekends = useMemo(() => listRecentWeekends(12), []);

  const [payments, setPayments] = useState<(Payment & { id: string })[]>([]);
  const [orders, setOrders] = useState<(Order & { id: string })[]>([]);
  const [costMaps, setCostMaps] = useState<CostMaps | null>(null);
  const [costMapsLoading, setCostMapsLoading] = useState(true);
  const [activeTables, setActiveTables] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // 1. Initial fetch of cost maps
  useEffect(() => {
    let mounted = true;
    fetchCostMaps()
      .then((maps) => {
        if (mounted) {
          setCostMaps(maps);
          setCostMapsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load cost maps:', err);
        setCostMapsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Live listener: payments in selected range
  useEffect(() => {
    const q = query(
      collection(db, 'payments'),
      where('createdAt', '>=', Timestamp.fromDate(dateRange.start)),
      where('createdAt', '<=', Timestamp.fromDate(dateRange.end)),
    );

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs
        .map((d) => ({ ...(d.data() as Payment), id: d.id }))
        .filter((p) => !p.isDeleted && p.status !== 'VOIDED');
      setPayments(rows);
      setLastUpdated(new Date());
    });
    return () => unsub();
  }, [dateRange.start, dateRange.end]);

  // 3. Live listener: orders in selected range
  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('createdAt', '>=', Timestamp.fromDate(dateRange.start)),
      where('createdAt', '<=', Timestamp.fromDate(dateRange.end)),
    );

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs
        .map((d) => ({ ...(d.data() as Order), id: d.id }))
        .filter((o) => !o.isDeleted);
      setOrders(rows);
      setLastUpdated(new Date());
    });
    return () => unsub();
  }, [dateRange.start, dateRange.end]);

  // 4. Live tables count
  useEffect(() => {
    const q = query(
      collection(db, 'tables'),
      where('status', 'in', ['OCCUPIED', 'READY_TO_PAY']),
    );
    const unsub = onSnapshot(q, (snap) => setActiveTables(snap.size));
    return () => unsub();
  }, []);

  // ============= Derived: Payment Layer =============
  const paymentLayer = useMemo(() => {
    if (!costMaps) {
      return {
        totals: { gross: 0, discount: 0, net: 0, cost: 0, gp: 0, count: 0 },
        pivot: [] as PaymentPivotRow[],
      };
    }

    const ordersMap = new Map<string, Order & { id: string }>();
    orders.forEach((o) => ordersMap.set(o.id, o));

    const pivotMap = new Map<string, PaymentPivotRow>();
    let grossTotal = 0;
    let discountTotal = 0;
    let costTotal = 0;

    payments.forEach((pay) => {
      const processedAt = toDate(pay.processedAt || pay.createdAt);
      const time = formatTime(processedAt);
      const tableId = pay.tableId || 'N/A';
      const key = `${tableId}||${time}`;

      // Aggregate linked orders
      let paySum = 0;
      let payCost = 0;
      (pay.orderIds || []).forEach((oid) => {
        const order = ordersMap.get(oid);
        if (!order) return;
        order.items?.forEach((item) => {
          if (item.isVoided) return;
          paySum += lineAmount(item);
          payCost += getLineCost(item.menuItemId, item.quantity, item.modifiers, costMaps);
        });
      });

      const payDiscount = pay.discountAmount || 0;
      grossTotal += paySum;
      discountTotal += payDiscount;
      costTotal += payCost;

      let row = pivotMap.get(key);
      if (!row) {
        row = {
          key,
          tableId,
          paymentTime: time,
          sumAmount: 0,
          sumDiscount: 0,
          netAmount: 0,
          sumCost: 0,
          avgGP: 0,
          paymentMethod: pay.paymentMethod || 'N/A',
        };
        pivotMap.set(key, row);
      }
      row.sumAmount += paySum;
      row.sumDiscount += payDiscount;
      row.sumCost += payCost;
    });

    const pivot = Array.from(pivotMap.values()).map((r) => {
      const net = Math.max(0, r.sumAmount - r.sumDiscount);
      return {
        ...r,
        netAmount: net,
        avgGP: net > 0 ? ((net - r.sumCost) / net) * 100 : 0,
      };
    });
    pivot.sort((a, b) => {
      if (a.tableId !== b.tableId) return a.tableId.localeCompare(b.tableId);
      return a.paymentTime.localeCompare(b.paymentTime);
    });

    const netTotal = Math.max(0, grossTotal - discountTotal);
    const gpTotal = netTotal > 0 ? ((netTotal - costTotal) / netTotal) * 100 : 0;

    return {
      totals: {
        gross: grossTotal,
        discount: discountTotal,
        net: netTotal,
        cost: costTotal,
        gp: gpTotal,
        count: payments.length,
      },
      pivot,
    };
  }, [payments, orders, costMaps]);

  // ============= Derived: Order Layer (ESTIMATED: ALL ORDERS) =============
  const orderLayer = useMemo(() => {
    if (!costMaps) {
      return {
        totals: { 
          estimatedGross: 0, 
          estimatedDiscount: 0, 
          estimatedNet: 0, 
          estimatedCost: 0, 
          estimatedGP: 0, 
          openCount: 0 
        },
        statusBreakdown: {} as Record<OrderStatus, { count: number; amount: number }>,
        liveOrders: [] as LiveOrderRow[],
      };
    }

    // Build set of orderIds that are already settled via a non-voided payment
    const settledOrderIds = new Set<string>();
    payments.forEach((p) => (p.orderIds || []).forEach((id) => settledOrderIds.add(id)));

    const liveOrders: LiveOrderRow[] = [];
    const statusBreakdown: Record<string, { count: number; amount: number }> = {};
    let totalEstimatedRevenue = 0;
    let totalEstimatedCost = 0;
    let openOrdersCount = 0;

    orders.forEach((o) => {
      if (o.status === 'CANCELLED' || o.isVoided) return;

      const isSettled = settledOrderIds.has(o.id);
      if (!isSettled) {
        openOrdersCount += 1;
      }

      let amount = 0;
      let cost = 0;
      let itemCount = 0;
      o.items?.forEach((item) => {
        if (item.isVoided) return;
        amount += lineAmount(item);
        cost += getLineCost(item.menuItemId, item.quantity, item.modifiers, costMaps);
        itemCount += item.quantity;
      });

      totalEstimatedRevenue += amount;
      totalEstimatedCost += cost;

      const status = isSettled ? 'COMPLETED' : o.status;
      if (!statusBreakdown[status]) statusBreakdown[status] = { count: 0, amount: 0 };
      statusBreakdown[status].count += 1;
      statusBreakdown[status].amount += amount;

      liveOrders.push({
        id: o.id,
        orderNumber: o.orderNumber || o.id.slice(-6).toUpperCase(),
        tableId: o.tableId || 'N/A',
        createdAt: toDate(o.createdAt),
        status: status as OrderStatus,
        itemCount,
        amount,
        cost,
        gpPercent: amount > 0 ? ((amount - cost) / amount) * 100 : 0,
      });
    });

    liveOrders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const estimatedGP = totalEstimatedRevenue > 0 ? ((totalEstimatedRevenue - totalEstimatedCost) / totalEstimatedRevenue) * 100 : 0;

    return {
      totals: {
        estimatedGross: totalEstimatedRevenue,
        estimatedDiscount: 0, 
        estimatedNet: totalEstimatedRevenue,
        estimatedCost: totalEstimatedCost,
        estimatedGP,
        openCount: openOrdersCount,
      },
      statusBreakdown: statusBreakdown as Record<OrderStatus, { count: number; amount: number }>,
      liveOrders,
    };
  }, [orders, payments, costMaps]);

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold">ADMIN DASHBOARD</h1>
              <p className="text-[11px] md:text-xs text-gray-600">
                Overview & Analytics — Two-Layer View (Payment + Live Orders)
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 border-2 border-black text-[10px] font-bold ${
                  isLiveRange ? 'bg-black text-white' : 'bg-gray-200 text-black'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isLiveRange ? 'bg-green-400 animate-pulse' : 'bg-gray-500'
                  }`}
                />
                {isLiveRange ? `LIVE · updated ${formatTime(lastUpdated)}` : 'HISTORICAL'}
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="border-2 border-black p-4 mb-4">
          <div className="flex flex-col gap-3">
            {/* Preset chips */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-[10px] font-bold text-gray-600 mr-1">FILTER:</span>
              <PresetChip active={preset === 'current_weekend'} onClick={() => setPreset('current_weekend')}>
                ★ CURRENT WEEKEND
              </PresetChip>
              <PresetChip active={preset === 'last_weekend'} onClick={() => setPreset('last_weekend')}>
                LAST WEEKEND
              </PresetChip>
              <PresetChip active={preset === 'last_4_weekends'} onClick={() => setPreset('last_4_weekends')}>
                LAST 4 WEEKENDS
              </PresetChip>
              <PresetChip
                active={preset === 'pick_weekend'}
                onClick={() => {
                  setPreset('pick_weekend');
                  setWeekendOffset(0);
                }}
              >
                PICK A WEEKEND
              </PresetChip>
              <PresetChip active={preset === 'custom'} onClick={() => setPreset('custom')}>
                CUSTOM RANGE
              </PresetChip>
            </div>

            {/* Conditional controls */}
            {preset === 'pick_weekend' && (
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[10px] font-bold text-gray-600">WEEKEND:</label>
                <select
                  value={weekendOffset}
                  onChange={(e) => setWeekendOffset(parseInt(e.target.value, 10))}
                  className="px-3 py-1.5 border-2 border-black text-xs focus:outline-none bg-white"
                >
                  {recentWeekends.map((w, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '★ ' : ''}
                      {w.label.replace(/^(Current Weekend|Last Weekend|\d+ Weekends Ago) · /, '')}
                      {i === 0 ? ' (current)' : i === 1 ? ' (last)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {preset === 'custom' && (
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[10px] font-bold text-gray-600">FROM:</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-3 py-1.5 border-2 border-black text-xs focus:outline-none"
                />
                <label className="text-[10px] font-bold text-gray-600">TO:</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-3 py-1.5 border-2 border-black text-xs focus:outline-none"
                />
                {(!customStart || !customEnd) && (
                  <span className="text-[10px] text-orange-600 italic">
                    Pick both dates to apply — showing current weekend meanwhile
                  </span>
                )}
              </div>
            )}

            {/* Resolved range badge */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-300">
              <span className="text-[10px] text-gray-500">ACTIVE RANGE:</span>
              <span className="text-xs font-bold bg-black text-white px-2 py-0.5">
                {dateRange.label}
              </span>
            </div>
          </div>
        </div>

        {costMapsLoading && (
          <div className="border-2 border-black p-4 mb-6 bg-yellow-50 text-xs text-center">
            Loading cost maps (recipes + inventory)...
          </div>
        )}

        {/* ================= ORDER LAYER (ESTIMATED) ============= */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Layer 1 · ESTIMATED (Orders: Live + Settled)
            </h2>
            <span className="text-[10px] text-gray-500 italic">
              Full business volume estimate — including both paid and unpaid orders
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <StatCard label="EST. GROSS" value={`฿${orderLayer.totals.estimatedGross.toFixed(0)}`} />
            <StatCard label="EST. DISC." value="฿0" accent="orange" />
            <StatCard label="EST. NET" value={`฿${orderLayer.totals.estimatedNet.toFixed(0)}`} />
            <StatCard label="EST. COST" value={`฿${orderLayer.totals.estimatedCost.toFixed(0)}`} accent="red" />
            <StatCard label="EST. GP%" value={`${orderLayer.totals.estimatedGP.toFixed(1)}%`} accent="green" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div className="border border-black p-2 bg-blue-50 flex justify-between items-center px-4">
               <span className="text-[10px] font-bold text-gray-600">TOTAL VOLUME:</span>
               <span className="text-sm font-bold">{orders.length} ORDERS</span>
            </div>
            <div className="border border-black p-2 bg-blue-50 flex justify-between items-center px-4">
               <span className="text-[10px] font-bold text-gray-600">CURRENTLY OPEN:</span>
               <span className="text-sm font-bold text-red-600">{orderLayer.totals.openCount}</span>
            </div>
            <div className="border border-black p-2 bg-blue-50 flex justify-between items-center px-4">
               <span className="text-[10px] font-bold text-gray-600">ACTIVE TABLES:</span>
               <span className="text-sm font-bold">{activeTables}</span>
            </div>
          </div>

          {/* Status breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            {(['PLACED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'] as OrderStatus[]).map((s) => {
              const b = orderLayer.statusBreakdown[s] || { count: 0, amount: 0 };
              return (
                <div key={s} className="border border-black p-2 text-center bg-white">
                  <p className="text-[9px] text-gray-600">{s}</p>
                  <p className="text-lg font-bold">{b.count}</p>
                  <p className="text-[10px] text-gray-500">฿{b.amount.toFixed(0)}</p>
                </div>
              );
            })}
          </div>

          {/* Live orders table */}
          <div className="border-2 border-black">
            <div className="border-b-2 border-black p-3 bg-red-50 flex justify-between items-center">
              <div>
                <h3 className="text-xs font-bold uppercase">Orders Feed</h3>
                <p className="text-[10px] text-gray-600 italic">Sorted by most recent (Includes settled)</p>
              </div>
              <div className="flex gap-2">
                <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 font-bold">
                  {orderLayer.totals.openCount} OPEN
                </span>
                <span className="text-[10px] bg-gray-500 text-white px-2 py-0.5 font-bold">
                  {orders.length - orderLayer.totals.openCount} SETTLED
                </span>
              </div>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-gray-100 sticky top-0 border-b-2 border-black">
                  <tr>
                    <th className="p-2 border-r border-gray-300">ORDER</th>
                    <th className="p-2 border-r border-gray-300">TABLE</th>
                    <th className="p-2 border-r border-gray-300">TIME</th>
                    <th className="p-2 border-r border-gray-300">STATUS</th>
                    <th className="p-2 border-r border-gray-300 text-right">ITEMS</th>
                    <th className="p-2 border-r border-gray-300 text-right">AMOUNT</th>
                    <th className="p-2 border-r border-gray-300 text-right">COST</th>
                    <th className="p-2 text-right">GP%</th>
                  </tr>
                </thead>
                <tbody>
                  {orderLayer.liveOrders.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-gray-500 italic">
                        No open orders — kitchen is clear.
                      </td>
                    </tr>
                  )}
                  {orderLayer.liveOrders.map((o) => (
                    <tr key={o.id} className="border-b border-gray-200 hover:bg-red-50">
                      <td className="p-2 border-r border-gray-200 font-bold">#{o.orderNumber}</td>
                      <td className="p-2 border-r border-gray-200">{o.tableId}</td>
                      <td className="p-2 border-r border-gray-200">{formatTime(o.createdAt)}</td>
                      <td className="p-2 border-r border-gray-200">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="p-2 border-r border-gray-200 text-right">{o.itemCount}</td>
                      <td className="p-2 border-r border-gray-200 text-right font-bold">
                        ฿{o.amount.toFixed(2)}
                      </td>
                      <td className="p-2 border-r border-gray-200 text-right text-red-600">
                        ฿{o.cost.toFixed(2)}
                      </td>
                      <td
                        className={`p-2 text-right font-bold ${gpColor(o.gpPercent)}`}
                      >
                        {o.gpPercent.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ================= PAYMENT LAYER (REAL) ================= */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 bg-green-600 rounded-full" />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Layer 2 · REAL (Settled Payments)
            </h2>
            <span className="text-[10px] text-gray-500 italic">
              Confirmed revenue — actual money in the bank
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <StatCard label="REAL GROSS" value={`฿${paymentLayer.totals.gross.toFixed(0)}`} />
            <StatCard label="REAL DISCOUNT" value={`-฿${paymentLayer.totals.discount.toFixed(0)}`} accent="orange" />
            <StatCard label="REAL NET" value={`฿${paymentLayer.totals.net.toFixed(0)}`} />
            <StatCard label="REAL COST" value={`฿${paymentLayer.totals.cost.toFixed(0)}`} accent="red" />
            <StatCard label="REAL GP%" value={`${paymentLayer.totals.gp.toFixed(1)}%`} accent="green" />
          </div>

          <div className="border-2 border-black">
            <div className="border-b-2 border-black p-3 bg-green-50 flex justify-between items-center">
              <div>
                <h3 className="text-xs font-bold uppercase">Pivot by Table & Time Payment</h3>
                <p className="text-[10px] text-gray-600 italic">Same structure as the Summary Order by Day report</p>
              </div>
              <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 font-bold">
                {paymentLayer.totals.count} PAYMENTS · {paymentLayer.pivot.length} GROUPS
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-gray-100 border-b-2 border-black">
                  <tr>
                    <th className="p-2 border-r border-gray-300">TABLE</th>
                    <th className="p-2 border-r border-gray-300">TIME</th>
                    <th className="p-2 border-r border-gray-300">METHOD</th>
                    <th className="p-2 border-r border-gray-300 text-right">AMOUNT</th>
                    <th className="p-2 border-r border-gray-300 text-right">DISCOUNT</th>
                    <th className="p-2 border-r border-gray-300 text-right">NET</th>
                    <th className="p-2 border-r border-gray-300 text-right">COST</th>
                    <th className="p-2 text-right">GP%</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentLayer.pivot.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-gray-500 italic">
                        No settled payments yet for this day.
                      </td>
                    </tr>
                  )}
                  {paymentLayer.pivot.map((r) => (
                    <tr key={r.key} className="border-b border-gray-200 hover:bg-green-50">
                      <td className="p-2 border-r border-gray-200 font-bold">{r.tableId}</td>
                      <td className="p-2 border-r border-gray-200">{r.paymentTime}</td>
                      <td className="p-2 border-r border-gray-200 text-[10px]">{r.paymentMethod}</td>
                      <td className="p-2 border-r border-gray-200 text-right">
                        ฿{r.sumAmount.toFixed(2)}
                      </td>
                      <td className="p-2 border-r border-gray-200 text-right text-orange-600">
                        {r.sumDiscount > 0 ? `-฿${r.sumDiscount.toFixed(2)}` : '—'}
                      </td>
                      <td className="p-2 border-r border-gray-200 text-right font-bold">
                        ฿{r.netAmount.toFixed(2)}
                      </td>
                      <td className="p-2 border-r border-gray-200 text-right text-red-600">
                        ฿{r.sumCost.toFixed(2)}
                      </td>
                      <td className={`p-2 text-right font-bold ${gpColor(r.avgGP)}`}>
                        {r.avgGP.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  {paymentLayer.pivot.length > 0 && (
                    <tr className="bg-black text-white font-bold">
                      <td className="p-2 border-r border-gray-700" colSpan={3}>
                        GRAND TOTAL
                      </td>
                      <td className="p-2 border-r border-gray-700 text-right">
                        ฿{paymentLayer.totals.gross.toFixed(2)}
                      </td>
                      <td className="p-2 border-r border-gray-700 text-right text-orange-300">
                        {paymentLayer.totals.discount > 0 ? `-฿${paymentLayer.totals.discount.toFixed(2)}` : '—'}
                      </td>
                      <td className="p-2 border-r border-gray-700 text-right">
                        ฿{paymentLayer.totals.net.toFixed(2)}
                      </td>
                      <td className="p-2 border-r border-gray-700 text-right">
                        ฿{paymentLayer.totals.cost.toFixed(2)}
                      </td>
                      <td className="p-2 text-right">{paymentLayer.totals.gp.toFixed(1)}%</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// -------------- Small sub-components --------------

type StatCardProps = {
  label: string;
  value: string;
  accent?: 'red' | 'green' | 'orange';
};

function StatCard({ label, value, accent }: StatCardProps) {
  const accentClass =
    accent === 'red'
      ? 'text-red-600'
      : accent === 'green'
      ? 'text-green-700'
      : accent === 'orange'
      ? 'text-orange-600'
      : 'text-black';
  return (
    <div className="border-2 border-black p-3 text-center bg-white">
      <p className="text-[10px] mb-1 text-gray-600">{label}</p>
      <p className={`text-lg md:text-xl font-bold ${accentClass}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const colorMap: Record<OrderStatus, string> = {
    PLACED: 'bg-blue-100 text-blue-800 border-blue-400',
    PREPARING: 'bg-yellow-100 text-yellow-800 border-yellow-400',
    READY: 'bg-purple-100 text-purple-800 border-purple-400',
    SERVED: 'bg-green-100 text-green-800 border-green-400',
    COMPLETED: 'bg-gray-100 text-gray-800 border-gray-400',
    CANCELLED: 'bg-red-100 text-red-800 border-red-400',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 border text-[9px] font-bold ${colorMap[status]}`}>
      {status}
    </span>
  );
}

function gpColor(gp: number): string {
  if (gp >= 60) return 'text-green-700';
  if (gp >= 40) return 'text-yellow-700';
  return 'text-red-600';
}

type PresetChipProps = {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function PresetChip({ active, onClick, children }: PresetChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 border-2 text-[10px] font-bold transition-colors ${
        active
          ? 'border-black bg-black text-white'
          : 'border-black bg-white text-black hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}
