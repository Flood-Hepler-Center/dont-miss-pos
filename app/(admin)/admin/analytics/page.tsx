'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { menuService } from '@/lib/services/menu.service';
import type { Order, MenuItem } from '@/types';
import {
  format, startOfDay, endOfDay, subDays,
  startOfWeek, startOfMonth,
} from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

// ─── Local Payment type (extends Firestore data) ──────────────────────────────
interface PaymentDoc {
  id: string;
  orderIds: string[];
  total: number;
  subtotal: number;
  tax: number;
  discountAmount: number;
  discountType?: string;
  discountPercent?: number;
  discountReason?: string;
  paymentMethod: string;
  status: string;
  customerSegment?: string;
  isSplit: boolean;
  splitDetails?: unknown[];
  processedBy?: string;
  amountReceived?: number;
  change?: number;
  processedAt: Date;
  createdAt: Date;
}

// ─── Timestamp → Date normaliser ──────────────────────────────────────────────
const toDate = (val: unknown): Date => {
  if (val instanceof Date) return val;
  if (val && typeof val === 'object') {
    if ('toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function')
      return (val as { toDate: () => Date }).toDate();
    if ('seconds' in val)
      return new Date((val as { seconds: number }).seconds * 1000);
  }
  return new Date(0);
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const rupiah = (n: number) => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
const pct = (n: number, d: number) => d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SEGMENT_LABEL: Record<string, string> = {
  NEW: '🆕 New', REGULAR: '🔄 Regular', FRIEND: '👥 Friend',
  BUSINESS: '💼 Business', EVENT: '🎊 Event', VIP: '⭐ VIP', UNTAGGED: '— Untagged',
};

// ─── Receipt-style components ─────────────────────────────────────────────────
function Divider({ ch = '─' }: { ch?: string }) {
  return <div className="text-gray-400 text-xs overflow-hidden whitespace-nowrap my-2">{ch.repeat(80)}</div>;
}
function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <div className="text-xs text-gray-500 overflow-hidden whitespace-nowrap">{'═'.repeat(80)}</div>
      <div className="flex items-baseline gap-3 mt-1">
        <h2 className="text-base font-bold uppercase">{title}</h2>
        {sub && <span className="text-xs text-gray-500">{sub}</span>}
      </div>
    </div>
  );
}
function KPI({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: string }) {
  const up = delta?.startsWith('+');
  return (
    <div className="border-2 border-black p-3">
      <p className="text-xs mb-1 text-gray-600">{label}</p>
      <p className="text-2xl font-bold leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      {delta && (
        <p className={`text-xs font-bold mt-0.5 ${up ? 'text-green-700' : 'text-red-700'}`}>{delta} vs prev</p>
      )}
    </div>
  );
}
function Bar2({ pct: p, max = 100 }: { pct: number; max?: number }) {
  const w = Math.min(100, (p / Math.max(max, 1)) * 100);
  return (
    <div className="h-1.5 bg-gray-200 border border-gray-300 mt-1">
      <div className="h-full bg-black" style={{ width: `${w}%` }} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<PaymentDoc[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [dateRange, setDateRange] = useState('today');
  const [loading, setLoading] = useState(true);
  const [menuTab, setMenuTab] = useState<'revenue' | 'quantity'>('revenue');

  useEffect(() => {
    const uO = onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
      (snap) => setOrders(snap.docs.map(d => {
        const x = d.data();
        return {
          id: d.id, ...x,
          createdAt: toDate(x.createdAt),
          updatedAt: toDate(x.updatedAt),
          placedAt: x.placedAt ? toDate(x.placedAt) : undefined,
          preparingAt: x.preparingAt ? toDate(x.preparingAt) : undefined,
          readyAt: x.readyAt ? toDate(x.readyAt) : undefined,
          servedAt: x.servedAt ? toDate(x.servedAt) : undefined,
          completedAt: x.completedAt ? toDate(x.completedAt) : undefined,
        } as Order;
      }))
    );
    const uP = onSnapshot(
      query(collection(db, 'payments'), orderBy('createdAt', 'desc')),
      (snap) => {
        setPayments(snap.docs.map(d => {
          const x = d.data();
          return {
            id: d.id,
            orderIds: x.orderIds || [],
            total: x.total || 0, subtotal: x.subtotal || 0,
            tax: x.tax || 0, discountAmount: x.discountAmount || 0,
            discountType: x.discountType, discountPercent: x.discountPercent,
            discountReason: x.discountReason,
            paymentMethod: x.paymentMethod || 'UNKNOWN',
            status: x.status,
            customerSegment: x.customerSegment,
            isSplit: x.isSplit || false,
            splitDetails: x.splitDetails,
            processedBy: x.processedBy,
            amountReceived: x.amountReceived,
            change: x.change,
            processedAt: toDate(x.processedAt || x.createdAt),
            createdAt: toDate(x.createdAt),
          } as PaymentDoc;
        }));
        setLoading(false);
      }
    );
    return () => { uO(); uP(); };
  }, []);

  useEffect(() => { menuService.getActiveItems().then(setMenuItems); }, []);
  const menuItemMap = useMemo(() => {
    return menuItems.reduce<Record<string, MenuItem>>((acc, m) => { acc[m.id] = m; return acc; }, {});
  }, [menuItems]);

  // ── Date range ──────────────────────────────────────────────────────────────
  const { startDate, prevStart, prevEnd } = useMemo(() => {
    const now = new Date();
    const map: Record<string, Date> = {
      today: startOfDay(now), '7days': subDays(now, 7), '30days': subDays(now, 30),
      week: startOfWeek(now), month: startOfMonth(now), all: new Date(0),
    };
    const s = map[dateRange] ?? new Date(0);
    const span = now.getTime() - s.getTime();
    return { startDate: s, prevStart: new Date(s.getTime() - span), prevEnd: s };
  }, [dateRange]);

  // ── Filtered ────────────────────────────────────────────────────────────────
  const filteredOrders   = useMemo(() => orders.filter(o => toDate(o.createdAt) >= startDate), [orders, startDate]);
  const filteredPayments = useMemo(() => payments.filter(p => p.createdAt >= startDate), [payments, startDate]);
  const prevPayments     = useMemo(() => payments.filter(p => p.createdAt >= prevStart && p.createdAt < prevEnd), [payments, prevStart, prevEnd]);

  const validPayments    = useMemo(() => filteredPayments.filter(p => p.status === 'COMPLETED'), [filteredPayments]);
  const prevValidPay     = useMemo(() => prevPayments.filter(p => p.status === 'COMPLETED'), [prevPayments]);

  const validOrderIds    = useMemo(() => new Set(validPayments.flatMap(p => p.orderIds)), [validPayments]);
  const completedOrders  = useMemo(() => filteredOrders.filter(o => validOrderIds.has(o.id)), [filteredOrders, validOrderIds]);
  const cancelledOrders  = useMemo(() => filteredOrders.filter(o => o.status === 'CANCELLED'), [filteredOrders]);

  // ── Financial KPIs ──────────────────────────────────────────────────────────
  const totalRevenue  = useMemo(() => validPayments.reduce((s, p) => s + p.total, 0), [validPayments]);
  const prevRevenue   = useMemo(() => prevValidPay.reduce((s, p) => s + p.total, 0), [prevValidPay]);
  const totalDiscount = useMemo(() => validPayments.reduce((s, p) => s + p.discountAmount, 0), [validPayments]);
  const totalTax      = useMemo(() => validPayments.reduce((s, p) => s + p.tax, 0), [validPayments]);
  const totalOrders   = completedOrders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalItemsSold = useMemo(() => completedOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0), [completedOrders]);
  const basketSize    = totalOrders > 0 ? totalItemsSold / totalOrders : 0;
  const prevTotalOrders = useMemo(() => { const pids = new Set(prevValidPay.flatMap(p => p.orderIds)); return orders.filter(o => o.createdAt >= prevStart && o.createdAt < prevEnd && pids.has(o.id)).length; }, [prevValidPay, orders, prevStart, prevEnd]);
  const prevAvg       = prevTotalOrders > 0 ? prevRevenue / prevTotalOrders : 0;
  const delta = (c: number, p: number) => p === 0 ? undefined : `${c >= p ? '+' : ''}${(((c - p) / p) * 100).toFixed(1)}%`;

  // ── Kitchen Performance (Ticket Time) ──────────────────────────────────────
  const ticketTimes = useMemo(() => {
    return completedOrders
      .map(o => {
        const placed = toDate(o.placedAt || o.createdAt);
        const ready  = o.readyAt ? toDate(o.readyAt) : o.servedAt ? toDate(o.servedAt) : null;
        if (!ready || ready.getTime() <= placed.getTime()) return null;
        return { mins: (ready.getTime() - placed.getTime()) / 60000, hour: placed.getHours() };
      })
      .filter((x): x is { mins: number; hour: number } => x !== null);
  }, [completedOrders]);

  const avgTicketTime    = ticketTimes.length > 0 ? ticketTimes.reduce((s, t) => s + t.mins, 0) / ticketTimes.length : 0;
  const sortedTimes      = [...ticketTimes].sort((a, b) => a.mins - b.mins);
  const medianTicket     = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length / 2)].mins : 0;
  const p95Ticket        = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.95)].mins : 0;
  const onTimeCount      = ticketTimes.filter(t => t.mins <= 10).length;
  const onTimeRate       = ticketTimes.length > 0 ? (onTimeCount / ticketTimes.length) * 100 : 0;

  const ticketByHour = useMemo(() => Array.from({ length: 24 }, (_, h) => {
    const hTimes = ticketTimes.filter(t => t.hour === h);
    return { hour: `${h}h`, avg: hTimes.length > 0 ? hTimes.reduce((s, t) => s + t.mins, 0) / hTimes.length : 0, count: hTimes.length };
  }).filter(h => h.count > 0), [ticketTimes]);

  // ── Revenue by Hour ─────────────────────────────────────────────────────────
  const revenueByHour = useMemo(() => Array.from({ length: 24 }, (_, h) => {
    const hp = validPayments.filter(p => p.processedAt.getHours() === h);
    const count = hp.length;
    const rev = hp.reduce((s, p) => s + p.total, 0);
    return { hour: `${h}h`, revenue: rev, orders: count };
  }).filter(h => h.revenue > 0), [validPayments]);

  const peakHour = revenueByHour.reduce((best, h) => h.revenue > best.revenue ? h : best, { hour: '—', revenue: 0, orders: 0 });

  // ── Revenue by Day of Week ──────────────────────────────────────────────────
  const revenueByDOW = useMemo(() => DOW.map((day, i) => {
    const dp = validPayments.filter(p => p.processedAt.getDay() === i);
    return { day, revenue: dp.reduce((s, p) => s + p.total, 0), orders: dp.length };
  }), [validPayments]);

  const bestDOW = revenueByDOW.reduce((b, d) => d.revenue > b.revenue ? d : b, { day: '—', revenue: 0, orders: 0 });

  // ── Revenue trend ────────────────────────────────────────────────────────────
  const dayCount = dateRange === '30days' ? 30 : 7;
  const revenueTrend = useMemo(() => Array.from({ length: dayCount }, (_, i) => {
    const date = subDays(new Date(), dayCount - 1 - i);
    const ds = startOfDay(date), de = endOfDay(date);
    const dp = validPayments.filter(p => p.processedAt >= ds && p.processedAt <= de);
    return { date: format(date, dayCount > 7 ? 'MM/dd' : 'EEE'), revenue: dp.reduce((s, p) => s + p.total, 0), orders: dp.length };
  }), [validPayments, dayCount]);

  // ── Menu Engineering Matrix (Kasavana & Smith, 1982) + Op. Efficiency ───────
  const menuStats = useMemo(() => {
    const acc: Record<string, { name: string; qty: number; revenue: number; unitRev: number; prepTime: number }> = {};
    completedOrders.forEach(o => o.items.forEach(item => {
      if (item.isVoided) return;
      const mi = menuItemMap[item.menuItemId];
      if (!acc[item.name]) {
        acc[item.name] = { 
          name: item.name, qty: 0, revenue: 0, unitRev: item.price, 
          prepTime: mi?.targetPrepMinutes || 10 
        };
      }
      acc[item.name].qty      += item.quantity;
      acc[item.name].revenue  += item.price * item.quantity;
    }));
    return Object.values(acc).map(m => ({ ...m, unitRev: m.qty > 0 ? m.revenue / m.qty : 0 }));
  }, [completedOrders, menuItemMap]);

  const avgQty      = menuStats.length > 0 ? menuStats.reduce((s, m) => s + m.qty, 0) / menuStats.length : 0;
  const avgUnitRev  = menuStats.length > 0 ? menuStats.reduce((s, m) => s + m.unitRev, 0) / menuStats.length : 0;
  const avgPrepTime = menuStats.length > 0 ? menuStats.reduce((s, m) => s + m.prepTime, 0) / menuStats.length : 0;

  // Kasavana Smith
  const starItems   = menuStats.filter(m => m.qty >= avgQty && m.unitRev >= avgUnitRev).sort((a, b) => b.revenue - a.revenue);
  const puzzleItems = menuStats.filter(m => m.qty < avgQty  && m.unitRev >= avgUnitRev).sort((a, b) => b.unitRev - a.unitRev);
  const ploughItems = menuStats.filter(m => m.qty >= avgQty && m.unitRev < avgUnitRev).sort((a, b) => b.qty - a.qty);
  const dogItems    = menuStats.filter(m => m.qty < avgQty  && m.unitRev < avgUnitRev).sort((a, b) => b.qty - a.qty);

  // Operational Matrix
  const opFastMovers  = menuStats.filter(m => m.qty >= avgQty && m.prepTime <= avgPrepTime).sort((a, b) => b.qty - a.qty);
  const opBottlenecks = menuStats.filter(m => m.qty >= avgQty && m.prepTime > avgPrepTime).sort((a, b) => b.qty - a.qty);
  const opFillers     = menuStats.filter(m => m.qty < avgQty  && m.prepTime <= avgPrepTime).sort((a, b) => b.qty - a.qty);
  const opTimeDrains  = menuStats.filter(m => m.qty < avgQty  && m.prepTime > avgPrepTime).sort((a, b) => b.qty - a.qty);

  const topByRevenue  = [...menuStats].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const topByQuantity = [...menuStats].sort((a, b) => b.qty - a.qty).slice(0, 10);
  const topItems      = menuTab === 'revenue' ? topByRevenue : topByQuantity;
  const maxTopVal     = menuTab === 'revenue' ? (topItems[0]?.revenue || 1) : (topItems[0]?.qty || 1);

  // ── Category Intelligence ────────────────────────────────────────────────────
  const categoryStats = useMemo(() => {
    const acc: Record<string, { category: string; count: number; revenue: number }> = {};
    completedOrders.forEach(o => o.items.forEach(item => {
      const mi = menuItemMap[item.menuItemId];
      const cat = mi?.categoryName || 'Uncategorised';
      if (!acc[cat]) acc[cat] = { category: cat, count: 0, revenue: 0 };
      acc[cat].count += item.quantity;
      acc[cat].revenue += item.price * item.quantity;
    }));
    return Object.values(acc).sort((a, b) => b.revenue - a.revenue);
  }, [completedOrders, menuItemMap]);

  // ── Modifier Analytics ───────────────────────────────────────────────────────
  const modifierStats = useMemo(() => {
    const acc: Record<string, { name: string; count: number; revenue: number }> = {};
    completedOrders.forEach(o => o.items.forEach(item => {
      (item.modifiers || []).forEach(mod => {
        const key = mod.optionName;
        if (!acc[key]) acc[key] = { name: key, count: 0, revenue: 0 };
        acc[key].count++;
        acc[key].revenue += mod.priceAdjustment * item.quantity;
      });
    }));
    return Object.values(acc).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [completedOrders]);

  const modifierAttachRate = useMemo(() => {
    const withMods = completedOrders.filter(o => o.items.some(i => i.modifiers && i.modifiers.length > 0)).length;
    return totalOrders > 0 ? (withMods / totalOrders) * 100 : 0;
  }, [completedOrders, totalOrders]);

  // ── Order Intelligence ───────────────────────────────────────────────────────
  const qrOrders     = completedOrders.filter(o => o.entryMethod === 'QR');
  const manualOrders = completedOrders.filter(o => o.entryMethod === 'MANUAL');
  const qrAvgItems   = qrOrders.length > 0 ? qrOrders.reduce((s, o) => s + o.items.length, 0) / qrOrders.length : 0;
  const manAvgItems  = manualOrders.length > 0 ? manualOrders.reduce((s, o) => s + o.items.length, 0) / manualOrders.length : 0;
  const withSpecials = completedOrders.filter(o => o.specialInstructions && o.specialInstructions.trim().length > 0).length;
  const splitPayments = validPayments.filter(p => p.isSplit);
  const dineIn    = completedOrders.filter(o => o.orderType !== 'TAKE_AWAY');
  const takeAway  = completedOrders.filter(o => o.orderType === 'TAKE_AWAY');

  // ── Table Performance ─────────────────────────────────────────────────────
  const tableStats = useMemo(() => {
    const acc: Record<string, { tableId: string; revenue: number; orders: number }> = {};
    completedOrders.filter(o => o.tableId).forEach(o => {
      const t = o.tableId!;
      if (!acc[t]) acc[t] = { tableId: t, revenue: 0, orders: 0 };
      acc[t].revenue += o.total || 0;
      acc[t].orders++;
    });
    return Object.values(acc).sort((a, b) => b.revenue - a.revenue).slice(0, 12);
  }, [completedOrders]);

  // ── Cashier Performance ────────────────────────────────────────────────────
  const cashierStats = useMemo(() => {
    const acc: Record<string, { name: string; revenue: number; count: number; discountGiven: number }> = {};
    validPayments.forEach(p => {
      const name = p.processedBy || 'Unknown';
      if (!acc[name]) acc[name] = { name, revenue: 0, count: 0, discountGiven: 0 };
      acc[name].revenue      += p.total;
      acc[name].count++;
      acc[name].discountGiven += p.discountAmount;
    });
    return Object.values(acc).sort((a, b) => b.revenue - a.revenue);
  }, [validPayments]);

  // ── Discount Intelligence ─────────────────────────────────────────────────
  const discountsByReason = useMemo(() => {
    const acc: Record<string, { reason: string; count: number; total: number }> = {};
    validPayments.filter(p => p.discountAmount > 0).forEach(p => {
      const r = p.discountReason || 'No reason given';
      if (!acc[r]) acc[r] = { reason: r, count: 0, total: 0 };
      acc[r].count++;
      acc[r].total += p.discountAmount;
    });
    return Object.values(acc).sort((a, b) => b.total - a.total);
  }, [validPayments]);

  // ── Customer Segments & RFM Matrix ───────────────────────────────────────
  const segStatsRaw = useMemo(() => {
    const acc: Record<string, { label: string; count: number; revenue: number }> = {};
    validPayments.forEach(p => {
      const seg = p.customerSegment || 'UNTAGGED';
      if (!acc[seg]) acc[seg] = { label: SEGMENT_LABEL[seg] || seg, count: 0, revenue: 0 };
      acc[seg].count++;
      acc[seg].revenue += p.total;
    });
    return Object.values(acc);
  }, [validPayments]);

  const segStats = useMemo(() => 
    [...segStatsRaw].sort((a, b) => b.count - a.count), 
  [segStatsRaw]);

  const segStatsMatrix = useMemo(() => 
    segStatsRaw.map(s => ({ ...s, aov: s.count > 0 ? s.revenue / s.count : 0 })).sort((a, b) => b.count - a.count), 
  [segStatsRaw]);

  const avgSegVisits = segStatsMatrix.length > 0 ? segStatsMatrix.reduce((s, x) => s + x.count, 0) / segStatsMatrix.length : 0;
  const avgSegAov    = segStatsMatrix.length > 0 ? segStatsMatrix.reduce((s, x) => s + x.aov, 0) / segStatsMatrix.length : 0;

  const segChampions = segStatsMatrix.filter(s => s.count >= avgSegVisits && s.aov >= avgSegAov).sort((a, b) => b.revenue - a.revenue);
  const segLoyalists = segStatsMatrix.filter(s => s.count >= avgSegVisits && s.aov < avgSegAov).sort((a, b) => b.count - a.count);
  const segSplurgers = segStatsMatrix.filter(s => s.count < avgSegVisits  && s.aov >= avgSegAov).sort((a, b) => b.aov - a.aov);
  const segPassersby = segStatsMatrix.filter(s => s.count < avgSegVisits  && s.aov < avgSegAov).sort((a, b) => b.count - a.count);


  const tooltipStyle = { border: '2px solid black', background: '#fff', fontFamily: 'monospace', fontSize: '12px' };

  if (loading) return (
    <div className="min-h-screen bg-white font-mono flex items-center justify-center">
      <p className="text-sm">Loading analytics data...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        {/* ══ MASTHEAD ════════════════════════════════════════════════════ */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-xs hidden md:block">{'═'.repeat(72)}</div>
          <div className="text-xs md:hidden">{'═'.repeat(36)}</div>
          <h1 className="text-xl md:text-2xl font-bold my-2 tracking-widest">ORDER ANALYTICS</h1>
          <p className="text-xs tracking-wider text-gray-600">BUSINESS INTELLIGENCE &amp; PERFORMANCE METRICS</p>
          <p className="text-xs text-gray-400 mt-1">{format(new Date(), 'EEEE, dd MMMM yyyy · HH:mm')}</p>
          <div className="text-xs hidden md:block">{'═'.repeat(72)}</div>
          <div className="text-xs md:hidden">{'═'.repeat(36)}</div>
        </div>

        {/* ══ TIME PERIOD ══════════════════════════════════════════════════ */}
        <div className="flex items-center gap-3 mb-6">
          <label className="text-xs font-bold">PERIOD:</label>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="border-2 border-black px-3 py-1.5 text-sm font-mono focus:outline-none"
          >
            <option value="today">TODAY</option>
            <option value="7days">LAST 7 DAYS</option>
            <option value="30days">LAST 30 DAYS</option>
            <option value="week">THIS WEEK</option>
            <option value="month">THIS MONTH</option>
            <option value="all">ALL TIME</option>
          </select>
          <span className="text-xs text-gray-500">{filteredOrders.length} orders in scope</span>
        </div>

        {/* ══ §1 FINANCIAL SUMMARY ══════════════════════════════════════════ */}
        <SectionHeader title="§1  FINANCIAL SUMMARY" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <KPI label="TOTAL REVENUE"    value={rupiah(totalRevenue)}    delta={delta(totalRevenue, prevRevenue)} />
          <KPI label="TRANSACTIONS"     value={String(validPayments.length)} sub={`${totalOrders} orders`}   delta={delta(totalOrders, prevTotalOrders)} />
          <KPI label="AVG CHECK (AOV)"  value={rupiah(avgOrderValue)}   delta={delta(avgOrderValue, prevAvg)} />
          <KPI label="BASKET SIZE"      value={`${basketSize.toFixed(1)}`}  sub="items / order" />
          <KPI label="TOTAL DISCOUNT"   value={rupiah(totalDiscount)}   sub={pct(totalDiscount, totalRevenue + totalDiscount) + ' rate'} />
          <KPI label="TAX COLLECTED"    value={rupiah(totalTax)}        sub="VAT / service" />
        </div>

        {/* ══ §2 KITCHEN PERFORMANCE ════════════════════════════════════════ */}
        <SectionHeader title="§2  KITCHEN PERFORMANCE" sub="ticket time = order placed → ready" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KPI label="AVG TICKET TIME" value={`${avgTicketTime.toFixed(1)} min`} sub={ticketTimes.length > 0 ? `${ticketTimes.length} tickets measured` : 'no data'} />
          <KPI label="MEDIAN TICKET"   value={`${medianTicket.toFixed(1)} min`}  />
          <KPI label="P95 TICKET"      value={`${p95Ticket.toFixed(1)} min`}     sub="95th percentile (worst normal)" />
          <KPI label="ON-TIME RATE"    value={`${onTimeRate.toFixed(0)}%`}       sub="completed ≤10 min" />
        </div>
        {ticketByHour.length > 0 && (
          <div className="border-2 border-black p-4 mb-8">
            <p className="text-xs font-bold mb-3">AVG TICKET TIME BY HOUR</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={ticketByHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hour" stroke="#000" style={{ fontSize: '10px' }} />
                <YAxis stroke="#000" style={{ fontSize: '10px' }} label={{ value: 'min', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => typeof v === 'number' ? `${v.toFixed(1)} min` : ''} />
                <Bar dataKey="avg" name="Avg Time (min)" fill="#000">
                  {ticketByHour.map((h, i) => <Cell key={i} fill={h.avg > 10 ? '#dc2626' : h.avg > 7 ? '#d97706' : '#000'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-500 mt-1">Red = {'>'} 10 min (overdue)  ·  Amber = {'>'} 7 min  ·  Black = on-time</p>
          </div>
        )}

        {/* ══ §3 REVENUE INTELLIGENCE ══════════════════════════════════════ */}
        <SectionHeader title="§3  REVENUE INTELLIGENCE" sub={`peak hour: ${peakHour.hour}  ·  best day: ${bestDOW.day}`} />
        <div className="border-2 border-black p-4 mb-4">
          <p className="text-xs font-bold mb-2">REVENUE TREND · {rupiah(totalRevenue)} total</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#000" style={{ fontSize: '11px' }} />
              <YAxis stroke="#000" style={{ fontSize: '10px' }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => typeof v === 'number' ? rupiah(v) : ''} />
              <Line type="monotone" dataKey="revenue" stroke="#000" strokeWidth={2.5} dot={false} name="Revenue" />
              <Line type="monotone" dataKey="orders"  stroke="#9CA3AF" strokeWidth={1.5} dot={false} name="Orders" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="border-2 border-black p-4">
            <p className="text-xs font-bold mb-2">HOURLY REVENUE · peak at {peakHour.hour}</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueByHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hour" stroke="#000" style={{ fontSize: '10px' }} />
                <YAxis stroke="#000" style={{ fontSize: '10px' }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => typeof v === 'number' ? rupiah(v) : ''} />
                <Bar dataKey="revenue" name="Revenue" fill="#000">
                  {revenueByHour.map((h, i) => <Cell key={i} fill={h.hour === peakHour.hour ? '#000' : '#6B7280'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="border-2 border-black p-4">
            <p className="text-xs font-bold mb-2">REVENUE BY DAY OF WEEK · best: {bestDOW.day}</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueByDOW}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" stroke="#000" style={{ fontSize: '11px' }} />
                <YAxis stroke="#000" style={{ fontSize: '10px' }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => typeof v === 'number' ? rupiah(v) : ''} />
                <Bar dataKey="revenue" name="Revenue" fill="#000">
                  {revenueByDOW.map((d, i) => <Cell key={i} fill={d.day === bestDOW.day ? '#000' : '#9CA3AF'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ══ §4 MENU ENGINEERING MATRIX ═══════════════════════════════════ */}
        <SectionHeader title="§4  MENU ENGINEERING MATRIX" sub="Kasavana & Smith (1982) — Finance: Volume vs Profitability (AOV)" />
        <div className="grid grid-cols-2 gap-px border-2 border-black mb-4 bg-black">
          {/* STARS */}
          <div className="bg-white p-3">
            <p className="text-xs font-bold mb-2">⭐ STARS  <span className="font-normal text-gray-500">high qty · high price → PROMOTE</span></p>
            {starItems.length === 0 ? <p className="text-xs text-gray-400">None</p> : starItems.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="truncate max-w-[65%]">{m.name}</span>
                <span className="font-bold">{rupiah(m.revenue)}</span>
              </div>
            ))}
          </div>
          {/* PUZZLES */}
          <div className="bg-white p-3">
            <p className="text-xs font-bold mb-2">❓ PUZZLES  <span className="font-normal text-gray-500">low qty · high price → REPOSITION</span></p>
            {puzzleItems.length === 0 ? <p className="text-xs text-gray-400">None</p> : puzzleItems.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="truncate max-w-[65%]">{m.name}</span>
                <span className="font-bold">{rupiah(m.revenue)}</span>
              </div>
            ))}
          </div>
          {/* PLOUGH HORSES */}
          <div className="bg-white p-3">
            <p className="text-xs font-bold mb-2">🐴 PLOUGH HORSES  <span className="font-normal text-gray-500">high qty · low price → MAINTAIN</span></p>
            {ploughItems.length === 0 ? <p className="text-xs text-gray-400">None</p> : ploughItems.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="truncate max-w-[65%]">{m.name}</span>
                <span className="text-gray-600">{m.qty}× sold</span>
              </div>
            ))}
          </div>
          {/* DOGS */}
          <div className="bg-white p-3">
            <p className="text-xs font-bold mb-2">🐕 DOGS  <span className="font-normal text-gray-500">low qty · low price → REVIEW</span></p>
            {dogItems.length === 0 ? <p className="text-xs text-gray-400">None</p> : dogItems.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="truncate max-w-[65%] text-gray-500">{m.name}</span>
                <span className="text-gray-400">{m.qty}×</span>
              </div>
            ))}
          </div>
        </div>

        {/* ══ §4.1 OPERATIONAL EFFICIENCY MATRIX ═════════════════════════════ */}
        <SectionHeader title="§4.1  OPERATIONAL EFFICIENCY MATRIX" sub="Operations: Volume vs Preparation Target Speed" />
        <div className="grid grid-cols-2 gap-px border-2 border-black mb-8 bg-black">
          {/* FAST MOVERS */}
          <div className="bg-white p-3 hover:bg-green-50 text-green-900">
            <p className="text-xs font-bold mb-2">🚀 FAST MOVERS  <span className="font-normal text-gray-500">high vol · fast prep → MAXIMISE</span></p>
            {opFastMovers.length === 0 ? <p className="text-xs text-gray-400">None</p> : opFastMovers.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="truncate max-w-[65%] font-bold">{m.name}</span>
                <span className="text-black">{m.qty}× · {m.prepTime}m</span>
              </div>
            ))}
          </div>
          {/* BOTTLENECKS */}
          <div className="bg-white p-3 hover:bg-red-50 text-red-900">
            <p className="text-xs font-bold mb-2">🐌 BOTTLENECKS  <span className="font-normal text-gray-500">high vol · slow prep → OPTIMISE/BATCH</span></p>
            {opBottlenecks.length === 0 ? <p className="text-xs text-gray-400">None</p> : opBottlenecks.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="truncate max-w-[65%] font-bold">{m.name}</span>
                <span className="text-black">{m.qty}× · {m.prepTime}m</span>
              </div>
            ))}
          </div>
          {/* QUICK FILLERS */}
          <div className="bg-white p-3 hover:bg-blue-50 text-blue-900">
            <p className="text-xs font-bold mb-2">🎯 QUICK FILLERS  <span className="font-normal text-gray-500">low vol · fast prep → GOOD UPSELLS</span></p>
            {opFillers.length === 0 ? <p className="text-xs text-gray-400">None</p> : opFillers.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="truncate max-w-[65%]">{m.name}</span>
                <span className="text-black">{m.qty}× · {m.prepTime}m</span>
              </div>
            ))}
          </div>
          {/* TIME DRAINS */}
          <div className="bg-white p-3">
            <p className="text-xs font-bold mb-2">🛑 TIME DRAINS  <span className="font-normal text-gray-500">low vol · slow prep → CONSIDER REMOVAL</span></p>
            {opTimeDrains.length === 0 ? <p className="text-xs text-gray-400">None</p> : opTimeDrains.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="truncate max-w-[65%] text-gray-600">{m.name}</span>
                <span className="text-gray-500">{m.qty}× · {m.prepTime}m</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Items Table */}
        <div className="border-2 border-black p-4 mb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold">TOP 10 ITEMS (ALL CATEGORIES)</p>
            <div className="flex gap-0">
              <button onClick={() => setMenuTab('revenue')}   className={`px-3 py-1 text-xs border-2 border-black ${menuTab === 'revenue' ? 'bg-black text-white' : 'bg-white'}`}>BY REVENUE</button>
              <button onClick={() => setMenuTab('quantity')}  className={`px-3 py-1 text-xs border-2 border-black -ml-0.5 ${menuTab === 'quantity' ? 'bg-black text-white' : 'bg-white'}`}>BY QTY</button>
            </div>
          </div>
          {topItems.length === 0
            ? <p className="text-xs text-gray-400 text-center py-4">No item data for this period</p>
            : topItems.map((m, i) => (
              <div key={i} className="py-1.5 border-b border-gray-200 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                  <span className="text-sm font-bold flex-1 truncate">{m.name}</span>
                  <span className="text-xs text-gray-500">{m.qty}×</span>
                  <span className="text-sm font-bold w-20 text-right">{rupiah(m.revenue)}</span>
                  <span className="text-xs text-gray-400 w-14 text-right">{pct(m.revenue, totalRevenue)}</span>
                </div>
                <div className="ml-6">
                  <Bar2 pct={menuTab === 'revenue' ? m.revenue : m.qty} max={maxTopVal} />
                </div>
              </div>
            ))}
          <Divider />
          <div className="flex justify-between text-xs font-bold mt-1">
            <span>TOP 10 TOTAL</span>
            <span>{rupiah(topItems.reduce((s, m) => s + m.revenue, 0))} · {pct(topItems.reduce((s, m) => s + m.revenue, 0), totalRevenue)} of revenue</span>
          </div>
        </div>

        {/* ══ §5 CATEGORY INTELLIGENCE ═════════════════════════════════════ */}
        {categoryStats.length > 0 && (
          <>
            <SectionHeader title="§5  CATEGORY PERFORMANCE" sub="revenue mapped to menu categories" />
            <div className="border-2 border-black p-4 mb-8">
              <div className="grid grid-cols-4 text-xs font-bold border-b-2 border-black pb-2 mb-2 bg-gray-50 pt-2 px-2 -mx-2">
                <span className="col-span-2">CATEGORY</span>
                <span className="text-right">ITEMS EXPECTED</span>
                <span className="text-right">REVENUE</span>
              </div>
              {categoryStats.map((c, i) => (
                <div key={i} className="py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 -mx-2 px-2">
                  <div className="grid grid-cols-4 text-xs">
                    <span className="col-span-2 font-bold truncate pr-2">{c.category}</span>
                    <span className="text-right text-gray-600">{c.count}</span>
                    <span className="text-right font-bold">{rupiah(c.revenue)}</span>
                  </div>
                  <div className="col-span-4 mt-1.5">
                    <Bar2 pct={c.revenue} max={categoryStats[0]?.revenue || 1} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══ §6 ORDER INTELLIGENCE ══════════════════════════════════════════ */}
        <SectionHeader title="§6  ORDER INTELLIGENCE" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KPI label="QR ORDERS"       value={String(qrOrders.length)}     sub={`Avg ${qrAvgItems.toFixed(1)} items/order`} />
          <KPI label="MANUAL ORDERS"   value={String(manualOrders.length)}  sub={`Avg ${manAvgItems.toFixed(1)} items/order`} />
          <KPI label="MODIFIER ATTACH" value={`${modifierAttachRate.toFixed(0)}%`} sub="orders with any modifier" />
          <KPI label="SPLIT BILLS"     value={String(splitPayments.length)} sub={pct(splitPayments.length, validPayments.length) + ' of txn'} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KPI label="DINE-IN"         value={String(dineIn.length)}        sub={rupiah(dineIn.reduce((s, o) => s + (o.total || 0), 0))} />
          <KPI label="TAKE-AWAY"       value={String(takeAway.length)}      sub={rupiah(takeAway.reduce((s, o) => s + (o.total || 0), 0))} />
          <KPI label="WITH SPECIALS"   value={String(withSpecials)}         sub={pct(withSpecials, totalOrders) + ' have instructions'} />
          <KPI label="CANCELLATIONS"   value={String(cancelledOrders.length)} sub={pct(cancelledOrders.length, filteredOrders.length) + ' rate'} />
        </div>
        {/* Modifier Leaderboard */}
        {modifierStats.length > 0 && (
          <div className="border-2 border-black p-4 mb-8">
            <p className="text-xs font-bold mb-3">TOP MODIFIERS / CUSTOMISATIONS</p>
            {modifierStats.map((m, i) => (
              <div key={i} className="py-1.5 border-b border-gray-100 last:border-0">
                <div className="flex justify-between text-xs">
                  <span className="font-bold">{m.name}</span>
                  <span>{m.count}× selected</span>
                </div>
                <Bar2 pct={m.count} max={modifierStats[0]?.count || 1} />
              </div>
            ))}
          </div>
        )}

        {/* ══ §7 TABLE PERFORMANCE ══════════════════════════════════════════ */}
        {tableStats.length > 0 && (
          <>
            <SectionHeader title="§7  TABLE PERFORMANCE" />
            <div className="border-2 border-black mb-8">
              <div className="border-b-2 border-black p-2 grid grid-cols-4 text-xs font-bold bg-gray-50">
                <span>TABLE</span><span className="text-right">ORDERS</span>
                <span className="text-right">REVENUE</span><span className="text-right">AOV / TABLE</span>
              </div>
              {tableStats.map((t, i) => (
                <div key={i} className="p-2 grid grid-cols-4 text-xs border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <span className="font-bold">TABLE {t.tableId}</span>
                  <span className="text-right">{t.orders}</span>
                  <span className="text-right font-bold">{rupiah(t.revenue)}</span>
                  <span className="text-right text-gray-600">{rupiah(t.revenue / t.orders)}</span>
                </div>
              ))}
              <div className="p-2 grid grid-cols-4 text-xs font-bold bg-gray-50 border-t-2 border-black">
                <span>TOTAL</span>
                <span className="text-right">{tableStats.reduce((s, t) => s + t.orders, 0)}</span>
                <span className="text-right">{rupiah(tableStats.reduce((s, t) => s + t.revenue, 0))}</span>
                <span className="text-right text-gray-500">—</span>
              </div>
            </div>
          </>
        )}

        {/* ══ §8 CASHIER PERFORMANCE ════════════════════════════════════════ */}
        {cashierStats.length > 0 && (
          <>
            <SectionHeader title="§8  CASHIER PERFORMANCE" />
            <div className="border-2 border-black mb-8">
              <div className="border-b-2 border-black p-2 grid grid-cols-4 text-xs font-bold bg-gray-50">
                <span>CASHIER</span><span className="text-right">TXN</span>
                <span className="text-right">REVENUE</span><span className="text-right">DISC GIVEN</span>
              </div>
              {cashierStats.map((c, i) => (
                <div key={i} className="p-2 grid grid-cols-4 text-xs border-b border-gray-100 last:border-0">
                  <span className="font-bold truncate">{c.name}</span>
                  <span className="text-right">{c.count}</span>
                  <span className="text-right font-bold">{rupiah(c.revenue)}</span>
                  <span className="text-right text-gray-600">{rupiah(c.discountGiven)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══ §9 DISCOUNT INTELLIGENCE ══════════════════════════════════════ */}
        <SectionHeader title="§9  DISCOUNT INTELLIGENCE" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KPI label="TOTAL DISCOUNTS"   value={rupiah(totalDiscount)} sub="revenue given away" />
          <KPI label="DISCOUNT RATE"     value={pct(totalDiscount, totalRevenue + totalDiscount)} sub="of gross sales" />
          <KPI label="TRANSACTIONS WITH DISC" value={String(validPayments.filter(p => p.discountAmount > 0).length)} sub={pct(validPayments.filter(p => p.discountAmount > 0).length, validPayments.length)} />
          <KPI label="AVG DISCOUNT/TXN"  value={totalDiscount > 0 ? rupiah(totalDiscount / validPayments.filter(p => p.discountAmount > 0).length) : '—'} />
        </div>
        {discountsByReason.length > 0 && (
          <div className="border-2 border-black p-4 mb-8">
            <p className="text-xs font-bold mb-3">DISCOUNT REASONS</p>
            {discountsByReason.map((d, i) => (
              <div key={i} className="py-1.5 border-b border-gray-100 last:border-0">
                <div className="flex justify-between text-xs">
                  <span className="font-bold">{d.reason}</span>
                  <span>{d.count}× · {rupiah(d.total)}</span>
                </div>
                <Bar2 pct={d.total} max={discountsByReason[0]?.total || 1} />
              </div>
            ))}
          </div>
        )}

        {/* ══ §10 CUSTOMER INTELLIGENCE ════════════════════════════════════ */}
        <SectionHeader title="§10  CUSTOMER INTELLIGENCE" sub="from cashier tagging" />
        {segStats.length > 0 && (
          <div className="border-2 border-black p-4 mb-8">
            <div className="grid grid-cols-5 text-xs font-bold border-b-2 border-black pb-2 mb-2 bg-gray-50 pt-2 px-2 -mx-2">
              <span className="col-span-2">SEGMENT</span><span className="text-right">VISITS</span>
              <span className="text-right">REVENUE</span><span className="text-right">AVG CHECK</span>
            </div>
            {segStats.map((s, i) => (
              <div key={i} className="py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 -mx-2 px-2">
                <div className="grid grid-cols-5 text-xs">
                  <span className="col-span-2 font-bold">{s.label}</span>
                  <span className="text-right">{s.count}</span>
                  <span className="text-right">{rupiah(s.revenue)}</span>
                  <span className="text-right text-gray-600">{s.count > 0 ? rupiah(s.revenue / s.count) : '—'}</span>
                </div>
                <div className="col-span-5 mt-1.5">
                  <Bar2 pct={s.count} max={segStats[0]?.count || 1} />
                </div>
              </div>
            ))}
            <Divider />
            <p className="text-xs text-gray-500">
              {validPayments.filter(p => p.customerSegment).length} of {validPayments.length} transactions tagged
              ({pct(validPayments.filter(p => p.customerSegment).length, validPayments.length)} coverage)
            </p>
          </div>
        )}

        {/* ══ §11 CUSTOMER VALUE MATRIX ════════════════════════════════════ */}
        <SectionHeader title="§11  CUSTOMER VALUE MATRIX" sub="CRM: Segment Visit Frequency vs Average Check (RFM model)" />
        <div className="grid grid-cols-2 gap-px border-2 border-black mb-8 bg-black">
          {/* CHAMPIONS */}
          <div className="bg-white p-3 hover:bg-indigo-50">
            <p className="text-xs font-bold mb-2">👑 CHAMPIONS  <span className="font-normal text-gray-500">high freq · high spend → REWARD</span></p>
            {segChampions.length === 0 ? <p className="text-xs text-gray-400">None</p> : segChampions.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="truncate max-w-[65%] font-bold">{m.label}</span>
                <span className="text-black">{m.count}x / {rupiah(m.aov)}</span>
              </div>
            ))}
          </div>
          {/* SPLURGERS */}
          <div className="bg-white p-3 hover:bg-purple-50">
            <p className="text-xs font-bold mb-2">💸 SPLURGERS  <span className="font-normal text-gray-500">low freq · high spend → INCENTIVISE RETURN</span></p>
            {segSplurgers.length === 0 ? <p className="text-xs text-gray-400">None</p> : segSplurgers.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="truncate max-w-[65%] font-bold">{m.label}</span>
                <span className="text-black">{m.count}x / {rupiah(m.aov)}</span>
              </div>
            ))}
          </div>
          {/* LOYALISTS */}
          <div className="bg-white p-3 hover:bg-teal-50">
            <p className="text-xs font-bold mb-2">🤝 LOYALISTS  <span className="font-normal text-gray-500">high freq · low spend → UPSELL</span></p>
            {segLoyalists.length === 0 ? <p className="text-xs text-gray-400">None</p> : segLoyalists.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="truncate max-w-[65%] font-bold">{m.label}</span>
                <span className="text-black">{m.count}x / {rupiah(m.aov)}</span>
              </div>
            ))}
          </div>
          {/* PASSERSBY */}
          <div className="bg-white p-3">
            <p className="text-xs font-bold mb-2">🚶 PASSERSBY  <span className="font-normal text-gray-500">low freq · low spend → LOW PRIORITY</span></p>
            {segPassersby.length === 0 ? <p className="text-xs text-gray-400">None</p> : segPassersby.slice(0, 5).map((m, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="truncate max-w-[65%] font-bold text-gray-500">{m.label}</span>
                <span className="text-gray-600">{m.count}x / {rupiah(m.aov)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ══ FOOTER ══════════════════════════════════════════════════════ */}
        <div className="text-center border-t-2 border-black pt-4 mb-12">
          <div className="text-xs text-gray-400 overflow-hidden whitespace-nowrap">{'─'.repeat(80)}</div>
          <p className="text-xs text-gray-500 mt-2">Generated {format(new Date(), "dd MMM yyyy 'at' HH:mm")} · Data from Firestore live snapshot</p>
          <p className="text-xs text-gray-400 text-center mx-auto max-w-2xl mt-1">Matrices Powered by POS Analytics Engine:<br />Finance (Kasavana-Smith 1982) · Operations (Prep/Volume Matrix) · CRM (RFM Strategy)</p>
        </div>

      </div>
    </div>
  );
}
