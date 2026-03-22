'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { reportsService } from '@/lib/services/reports.service';
import type { 
  EODReport, 
  SalesSummaryReport, 
  TopItemsReport, 
  CategoryPerformanceReport, 
  PaymentMethodsReport,
  DetailedOrderReport,
  ItemsSummaryDetailReport,
  ItemsDetailReport,
  PaymentDetailReport,
  UltimateReport,
  UltimatePaymentDetail,
  CategoryItemBreakdownReport
} from '@/lib/services/reports.service';
import { message } from 'antd';
import type { SelectedModifier } from '@/types';

interface UltimateReportRow {
  'Receipt #': string;
  'Date/Time': string;
  'Table': string;
  'Payment Status': string;
  'Payment Method': string;
  'Payment Subtotal'?: number; // Optional because a payment might not have all these details if it's just a summary row
  'Payment Discount'?: number;
  'Payment Tax'?: number;
  'Payment Total': number;
  'Order ID'?: string; // Optional because a payment might not have orders, or an order might not have items
  'Order Status'?: string;
  'Order Total'?: number;
  'Item Name'?: string; // Optional because an order might not have items
  'Quantity'?: number;
  'Price'?: number;
  'Item Subtotal'?: number;
  'Modifiers'?: string;
  [key: string]: string | number | undefined;
}

const REPORT_TYPES = [
  { value: 'ultimate', label: 'ULTIMATE FULL DETAIL (Revenue + Orders + Items)' },
  { value: 'eod', label: 'END OF DAY SUMMARY' },
  { value: 'sales', label: 'SALES BREAKDOWN' },
  { value: 'topitems', label: 'TOP SELLING ITEMS' },
  { value: 'category', label: 'CATEGORY PERFORMANCE' },
  { value: 'payment', label: 'PAYMENT METHODS' },
  { value: 'order_detail', label: 'DETAILED ORDER LIST' },
  { value: 'items_summary', label: 'ITEMS SUMMARY (Full)' },
  { value: 'items_detail', label: 'DETAILED ITEMS LOG' },
  { value: 'payment_detail', label: 'DETAILED PAYMENT LOG' },
  { value: 'category_breakdown', label: 'CATEGORY ITEM BREAKDOWN (Order vs Payment)' },
];

export default function ReportsPage() {
  const [reportType, setReportType] = useState('ultimate');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportData, setReportData] = useState<
    | EODReport 
    | SalesSummaryReport 
    | TopItemsReport 
    | CategoryPerformanceReport 
    | PaymentMethodsReport 
    | DetailedOrderReport
    | ItemsSummaryDetailReport
    | ItemsDetailReport
    | PaymentDetailReport
    | UltimateReport
    | CategoryItemBreakdownReport
    | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<{ id: string, name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  useEffect(() => {
    import('@/lib/services/menu.service').then(({ menuService }) => {
      menuService.getCategories().then(setCategories);
    });
  }, []);

  const handleGenerateReport = async () => {
    if (reportType === 'eod' && !startDate) {
      message.error('Please select a date for EOD report');
      return;
    }
    
    if (reportType !== 'eod' && (!startDate || !endDate)) {
      message.error('Please select start and end dates');
      return;
    }

    setLoading(true);
    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = endDate ? new Date(endDate) : new Date(startDate);
      end.setHours(23, 59, 59, 999);

      let data;
      switch (reportType) {
        case 'eod':
          data = await reportsService.generateEODReport(start);
          break;
        case 'sales':
          data = await reportsService.generateSalesSummaryReport(start, end);
          break;
        case 'topitems':
          data = await reportsService.generateTopItemsReport(start, end, 10);
          break;
        case 'category':
          data = await reportsService.generateCategoryPerformanceReport(start, end);
          break;
        case 'payment':
          data = await reportsService.generatePaymentMethodsReport(start, end);
          break;
        case 'order_detail':
          data = await reportsService.generateDetailedOrderReport(start, end);
          break;
        case 'items_summary':
          data = await reportsService.generateItemsSummaryReport(start, end);
          break;
        case 'items_detail':
          data = await reportsService.generateItemsDetailReport(start, end);
          break;
        case 'payment_detail':
          data = await reportsService.generatePaymentDetailReport(start, end);
          break;
        case 'ultimate':
          data = await reportsService.generateUltimateReport(start, end);
          break;
        case 'category_breakdown':
          data = await reportsService.generateCategoryItemBreakdownReport(start, end, selectedCategory);
          break;
        default:
          throw new Error('Invalid report type');
      }
      
      setReportData(data);
      message.success('Report generated successfully');
    } catch (error) {
      console.error('Error generating report:', error);
      message.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };


  const exportToCSV = () => {
    if (!reportData) return;

    let csv = '';
    
    // Existing summary reports
    if ('totalRevenue' in reportData && !('orders' in reportData)) {
      csv = [
        Object.keys(reportData).join(','),
        Object.values(reportData).map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(','),
      ].join('\n');
    } 
    // Hierarchical Ultimate Report needs specialized flattening
    if (reportType === 'ultimate' && reportData && 'payments' in reportData) {
      const rows: UltimateReportRow[] = [];
      const data = reportData as UltimateReport;

      data.payments.forEach((pay: UltimatePaymentDetail) => {
        pay.orders.forEach(order => {
          order.items?.forEach(item => {
            rows.push({
              'Receipt #': pay.receiptNumber,
              'Date/Time': pay.processedAt,
              'Table': pay.tableId,
              'Payment Status': pay.status,
              'Payment Method': pay.paymentMethod,
              'Payment Subtotal': pay.subtotal,
              'Payment Discount': pay.discountAmount,
              'Payment Tax': pay.tax,
              'Payment Total': pay.total,
              'Order ID': order.id,
              'Order Status': order.status,
              'Order Total': order.total,
              'Item Name': item.name,
              'Quantity': item.quantity,
              'Price': item.price,
              'Item Subtotal': item.subtotal,
              'Modifiers': item.modifiers?.map((m: SelectedModifier) => `${m.modifierGroupName}: ${m.optionName}`).join('; ') || '',
            });
          });
          // If order has no items (shouldn't happen but for safety)
          if (!order.items || order.items.length === 0) {
            rows.push({
              'Receipt #': pay.receiptNumber,
              'Date/Time': pay.processedAt,
              'Table': pay.tableId,
              'Payment Status': pay.status,
              'Payment Method': pay.paymentMethod,
              'Payment Total': pay.total,
              'Order ID': order.id,
              'Order Status': order.status,
              'Order Total': order.total,
            });
          }
        });
        // If payment has no orders (auditing)
        if (!pay.orders || pay.orders.length === 0) {
          rows.push({
            'Receipt #': pay.receiptNumber,
            'Date/Time': pay.processedAt,
            'Table': pay.tableId,
            'Payment Status': pay.status,
            'Payment Method': pay.paymentMethod,
            'Payment Total': pay.total,
          });
        }
      });

      if (rows.length > 0) {
        const headers = Object.keys(rows[0]);
        const csvContent = [
          headers.join(','),
          ...rows.map(row => headers.map(header => `"${(row[header] ?? '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ultimate_report_${format(new Date(), 'yyyyMMdd')}.csv`;
        a.click();
        return;
      }
    }

    if (reportType === 'category_breakdown' && reportData && 'groups' in reportData) {
      const data = reportData as CategoryItemBreakdownReport;
      const csvRows: Record<string, string | number>[] = [];
      data.groups.forEach(group => {
        group.items.forEach(item => {
          csvRows.push({
            'Category': group.categoryName,
            'Item Name': item.itemName,
            'Ordered Qty': item.orderedQty,
            'Ordered Gross (THB)': item.orderedGross.toFixed(2),
            'Paid Qty': item.paidQty,
            'Paid Gross (THB)': item.paidGross.toFixed(2),
            'Variance (THB)': (item.orderedGross - item.paidGross).toFixed(2),
          });
        });
      });
      if (csvRows.length > 0) {
        const headers = Object.keys(csvRows[0]);
        const csvContent = [
          headers.join(','),
          ...csvRows.map(row => headers.map(header => `"${(row[header] ?? '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `category_breakdown_${format(new Date(), 'yyyyMMdd')}.csv`;
        a.click();
        return;
      }
    }

    // New detailed reports or reports with lists
    let items: Record<string, unknown>[] = [];
    if (reportData && !('totalRevenue' in reportData)) {
      if ('orders' in reportData) items = reportData.orders as unknown as Record<string, unknown>[];
      else if ('items' in reportData) items = reportData.items as unknown as Record<string, unknown>[];
      else if ('categories' in reportData) items = reportData.categories as unknown as Record<string, unknown>[];
      else if ('payments' in reportData) items = reportData.payments as unknown as Record<string, unknown>[];
      
      if (items.length > 0) {
        const headers = Object.keys(items[0]);
        const rows = items.map(item => 
          headers.map(header => {
            const val = item[header];
            if (typeof val === 'string' && val.includes(',')) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          }).join(',')
        );
        csv = [headers.join(','), ...rows].join('\n');
      }
    }

    if (!csv) {
      message.warning('No data to export or report format not supported for direct CSV');
      return;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-report-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
  };

  const renderReportContent = () => {
    if (!reportData) return null;

    if (reportType === 'ultimate' && 'payments' in reportData) {
      const data = reportData as UltimateReport;
      return (
        <div className="border-2 border-black p-4 bg-gray-50">
          <h3 className="font-bold text-sm mb-1 uppercase">Ultimate Full Detail Report</h3>
          <p className="text-[10px] text-gray-500 mb-4 italic">Hierarchical view: Payments → Orders → Items</p>
          
          <div className="space-y-6">
            {data.payments.slice(0, 5).map((pay) => (
              <div key={pay.id} className="border-l-4 border-black pl-4 py-2 bg-white shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="bg-black text-white px-2 py-0.5 text-[10px] font-bold mr-2">RECEIPT {pay.receiptNumber}</span>
                    <span className="text-xs font-bold">Table {pay.tableId}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold">฿{pay.total.toFixed(2)}</p>
                    <p className="text-[9px] text-gray-500">{pay.paymentMethod} • {format(new Date(pay.processedAt), 'HH:mm')}</p>
                  </div>
                </div>
                
                <div className="ml-2 space-y-3">
                  {pay.orders.map(order => (
                    <div key={order.id} className="border-t border-dashed border-gray-300 pt-2">
                      <p className="text-[9px] font-bold text-gray-600 mb-1">ORDER ID: {order.orderNumber || order.id.slice(-6).toUpperCase()} ({order.status})</p>
                      <ul className="text-[10px] space-y-1">
                        {order.items?.map((item, i) => (
                          <li key={i} className="flex justify-between">
                            <span>{item.quantity}x {item.name}</span>
                            <span className="text-gray-600">฿{item.subtotal.toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {data.payments.length > 5 && (
            <div className="mt-6 p-3 bg-white border border-black text-center">
              <p className="text-xs font-bold italic">... and {data.payments.length - 5} more transactions ready for export.</p>
              <p className="text-[9px] text-gray-500">The CSV will contain detailed item-level breakdowns for all orders.</p>
            </div>
          )}
        </div>
      );
    }

    if (reportType === 'eod' && 'totalRevenue' in reportData) {
      const data = reportData as EODReport;
      return (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="border-2 border-black p-3 text-center">
              <p className="text-xs mb-1">TOTAL REVENUE</p>
              <p className="text-xl md:text-2xl font-bold">฿{data.totalRevenue.toFixed(2)}</p>
            </div>
            <div className="border-2 border-black p-3 text-center">
              <p className="text-xs mb-1">TOTAL ORDERS</p>
              <p className="text-xl md:text-2xl font-bold">{data.totalOrders}</p>
            </div>
            <div className="border-2 border-black p-3 text-center">
              <p className="text-xs mb-1">AVG ORDER</p>
              <p className="text-xl md:text-2xl font-bold">฿{data.avgOrderValue.toFixed(2)}</p>
            </div>
            <div className="border-2 border-black p-3 text-center">
              <p className="text-xs mb-1">NET REVENUE</p>
              <p className="text-xl md:text-2xl font-bold">฿{data.netRevenue.toFixed(2)}</p>
            </div>
          </div>
          <div className="border-2 border-black p-4">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between pb-2 border-b border-black">
                <span className="font-bold">TOTAL DISCOUNTS:</span>
                <span className="text-red-600 font-bold">-฿{data.totalDiscounts.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-black">
                <span className="font-bold">CASH:</span>
                <span>฿{data.cashPayments.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-black">
                <span className="font-bold">PROMPTPAY:</span>
                <span>฿{data.promptpayPayments.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">CARD:</span>
                <span>฿{data.cardPayments.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </>
      );
    }

    if (reportType === 'sales' && 'dailyBreakdown' in reportData) {
      const data = reportData as SalesSummaryReport;
      return (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="border-2 border-black p-3 text-center">
              <p className="text-xs mb-1">TOTAL REVENUE</p>
              <p className="text-xl font-bold">฿{data.totalRevenue.toFixed(2)}</p>
            </div>
            <div className="border-2 border-black p-3 text-center">
              <p className="text-xs mb-1">TOTAL ORDERS</p>
              <p className="text-xl font-bold">{data.totalOrders}</p>
            </div>
            <div className="border-2 border-black p-3 text-center">
              <p className="text-xs mb-1">COMPLETED</p>
              <p className="text-xl font-bold text-green-600">{data.completedOrders}</p>
            </div>
            <div className="border-2 border-black p-3 text-center">
              <p className="text-xs mb-1">CANCELLED</p>
              <p className="text-xl font-bold text-red-600">{data.cancelledOrders}</p>
            </div>
          </div>
          <div className="border-2 border-black p-4">
            <h3 className="font-bold text-sm mb-3">DAILY BREAKDOWN</h3>
            <div className="space-y-2">
              {data.dailyBreakdown.map((day) => (
                <div key={day.date} className="flex justify-between text-sm pb-2 border-b border-gray-300">
                  <span>{format(new Date(day.date), 'MMM dd, yyyy')}</span>
                  <div className="text-right">
                    <span className="font-bold">฿{day.revenue.toFixed(2)}</span>
                    <span className="text-gray-600 ml-2">({day.orders} orders)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      );
    }

    if (reportType === 'topitems' && 'items' in reportData) {
      const data = reportData as TopItemsReport;
      return (
        <div className="border-2 border-black p-4">
          <h3 className="font-bold text-sm mb-3">TOP SELLING ITEMS</h3>
          <div className="space-y-2">
            {data.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center pb-2 border-b border-gray-300">
                <div>
                  <span className="font-bold text-sm">#{idx + 1} {item.name}</span>
                  <span className="text-xs text-gray-600 ml-2">({item.quantity} sold)</span>
                </div>
                <span className="font-bold">฿{item.revenue.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (reportType === 'category' && 'categories' in reportData) {
      const data = reportData as CategoryPerformanceReport;
      return (
        <div className="border-2 border-black p-4">
          <h3 className="font-bold text-sm mb-3">CATEGORY PERFORMANCE</h3>
          <div className="space-y-2">
            {data.categories.map((cat, idx) => (
              <div key={idx} className="border-2 border-black p-3">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold">{cat.category}</span>
                  <span className="font-bold">฿{cat.revenue.toFixed(2)}</span>
                </div>
                <div className="text-xs text-gray-600">
                  <span>{cat.itemsSold} items sold</span>
                  <span className="ml-3">Avg: ฿{cat.avgPrice.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (reportType === 'payment' && 'cash' in reportData) {
      const data = reportData as PaymentMethodsReport;
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">CASH</p>
            <p className="text-2xl font-bold">฿{data.cash.total.toFixed(2)}</p>
            <p className="text-xs text-gray-600 mt-1">{data.cash.count} transactions</p>
          </div>
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">PROMPTPAY</p>
            <p className="text-2xl font-bold">฿{data.promptpay.total.toFixed(2)}</p>
            <p className="text-xs text-gray-600 mt-1">{data.promptpay.count} transactions</p>
          </div>
          <div className="border-2 border-black p-4 text-center">
            <p className="text-xs mb-2">CARD</p>
            <p className="text-2xl font-bold">฿{data.card.total.toFixed(2)}</p>
            <p className="text-xs text-gray-600 mt-1">{data.card.count} transactions</p>
          </div>
        </div>
      );
    }

    if (reportType === 'order_detail' && 'orders' in reportData) {
      const data = reportData as DetailedOrderReport;
      return (
        <div className="border-2 border-black p-4">
          <h3 className="font-bold text-sm mb-3">DETAILED ORDER REPORT ({data.orders.length} orders)</h3>
          <p className="text-xs text-gray-600 mb-3 italic">Use CSV export for full details including item lists.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b-2 border-black">
                    <th className="pb-2">TIME</th>
                    <th className="pb-2">TABLE</th>
                    <th className="pb-2">STATUS</th>
                    <th className="pb-2 text-right">SUBTOTAL</th>
                    <th className="pb-2 text-right">DISC</th>
                    <th className="pb-2 text-right">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.slice(0, 10).map((order) => (
                    <tr key={order.id} className="border-b border-gray-300">
                      <td className="py-2">{format(new Date(order.createdAt), 'HH:mm')}</td>
                      <td className="py-2">{order.tableId}</td>
                      <td className="py-2 text-[10px]">{order.status}</td>
                      <td className="py-2 text-right">฿{order.subtotal.toFixed(2)}</td>
                      <td className="py-2 text-right text-red-600">-฿{order.discount.toFixed(2)}</td>
                      <td className="py-2 text-right font-bold">฿{order.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            {data.orders.length > 10 && (
              <p className="text-[10px] text-center mt-3 bg-gray-100 p-1">... and {data.orders.length - 10} more. Export CSV for full list.</p>
            )}
          </div>
        </div>
      );
    }

    if (reportType === 'items_summary' && 'items' in reportData) {
      const data = reportData as ItemsSummaryDetailReport;
      return (
        <div className="border-2 border-black p-4">
          <h3 className="font-bold text-sm mb-3">ITEMS SUMMARY DETAIL ({data.items.length} items)</h3>
          <div className="space-y-2">
            {data.items.slice(0, 10).map((item, idx) => (
              <div key={idx} className="flex justify-between items-center pb-2 border-b border-gray-300">
                <div>
                  <span className="font-bold text-sm">{item.name}</span>
                  <span className="text-[10px] bg-black text-white px-1 ml-2">{item.category}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold">฿{item.revenue.toFixed(2)}</span>
                  <p className="text-[10px] text-gray-500">{item.quantity} units sold</p>
                </div>
              </div>
            ))}
            {data.items.length > 10 && (
              <p className="text-xs text-center text-gray-500 pt-2 italic">Export CSV to see all {data.items.length} items</p>
            )}
          </div>
        </div>
      );
    }

    if (reportType === 'items_detail' && 'items' in reportData) {
      const data = reportData as ItemsDetailReport;
      return (
        <div className="border-2 border-black p-4">
          <h3 className="font-bold text-sm mb-3">ITEMS DETAIL LOG ({data.items.length} records)</h3>
          <p className="text-xs text-gray-600 mb-3 italic">Export CSV for full detail including modifiers and order IDs.</p>
          <div className="space-y-1">
            {data.items.slice(0, 15).map((item, idx) => (
              <div key={idx} className="text-[11px] flex justify-between border-b border-gray-100 py-1">
                <span>{item.itemName} x{item.quantity} ({item.tableId})</span>
                <span className="font-mono">{format(new Date(item.createdAt), 'HH:mm')}</span>
              </div>
            ))}
            {data.items.length > 15 && (
              <p className="text-[10px] text-center text-gray-400 mt-2 italic">Showing first 15 of {data.items.length} records</p>
            )}
          </div>
        </div>
      );
    }

    if (reportType === 'payment_detail' && 'payments' in reportData) {
      const data = reportData as PaymentDetailReport;
      return (
        <div className="border-2 border-black p-4">
          <h3 className="font-bold text-sm mb-3">FULL PAYMENT DETAIL ({data.payments.length} receipts)</h3>
          <p className="text-xs text-gray-600 mb-3 italic">Finalized income data from the payments collection.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[10px]">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="pb-2">RECEIPT #</th>
                  <th className="pb-2">TABLE</th>
                  <th className="pb-2">METHOD</th>
                  <th className="pb-2 text-right">TOTAL</th>
                  <th className="pb-2">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.slice(0, 10).map((pay) => (
                  <tr key={pay.id} className="border-b border-gray-300">
                    <td className="py-2 font-bold">{pay.receiptNumber}</td>
                    <td className="py-2">{pay.tableId}</td>
                    <td className="py-2">{pay.paymentMethod}</td>
                    <td className="py-2 text-right font-bold">฿{pay.total.toFixed(2)}</td>
                    <td className="py-2">{pay.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.payments.length > 10 && (
              <p className="text-[10px] text-center mt-3 bg-gray-100 p-1">Showing 10 of {data.payments.length}. Export CSV for full financial log.</p>
            )}
          </div>
        </div>
      );
    }

    if (reportType === 'category_breakdown' && 'groups' in reportData) {
      const data = reportData as CategoryItemBreakdownReport;
      return (
        <div className="border-2 border-black p-4">
          <h3 className="font-bold text-sm mb-3 uppercase">CATEGORY ITEM BREAKDOWN (Order vs Payment)</h3>
          {data.groups.length === 0 && <p className="text-xs text-gray-500">No data found in this category.</p>}
          {data.groups.map(group => (
             <div key={group.categoryId} className="mb-6">
                <div className="bg-black text-white p-2 flex justify-between font-bold text-sm">
                   <span>{group.categoryName}</span>
                   <span>Ordered: ฿{group.totalOrderedGross.toFixed(2)} | Paid: ฿{group.totalPaidGross.toFixed(2)}</span>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-black mt-2">
                   <thead className="bg-gray-100 border-b border-black">
                      <tr>
                         <th className="p-2 border-r border-black">ITEM</th>
                         <th className="p-2 border-r border-black text-right w-16">ORD. QTY</th>
                         <th className="p-2 border-r border-black text-right w-24">ORD. GROSS</th>
                         <th className="p-2 border-r border-black text-right text-green-700 w-16">PAID QTY</th>
                         <th className="p-2 text-right text-green-700 w-24">PAID GROSS</th>
                      </tr>
                   </thead>
                   <tbody>
                      {group.items.sort((a,b) => b.orderedGross - a.orderedGross).map(item => (
                         <tr key={item.menuItemId} className="border-b border-gray-300">
                            <td className="p-1 border-r border-black">{item.itemName}</td>
                            <td className="p-1 border-r border-black text-right">{item.orderedQty}</td>
                            <td className="p-1 border-r border-black text-right font-bold">฿{item.orderedGross.toFixed(2)}</td>
                            <td className="p-1 border-r border-black text-right text-green-700">{item.paidQty}</td>
                            <td className="p-1 text-right font-bold text-green-700">฿{item.paidGross.toFixed(2)}</td>
                         </tr>
                      ))}
                   </tbody>
                </table>
                </div>
             </div>
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
          <h1 className="text-xl md:text-2xl font-bold my-2">REPORTS & ANALYTICS</h1>
          <p className="text-xs md:text-sm">Generate Business Insights</p>
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
        </div>

        {/* Report Generator */}
        <div className="border-2 border-black mb-6">
          <div className="border-b-2 border-black p-3 bg-white">
            <h2 className="text-sm font-bold">[REPORT GENERATOR]</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold mb-2">START DATE</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-2">END DATE</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold mb-2">REPORT TYPE</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                >
                  {REPORT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              {reportType === 'category_breakdown' && (
                <div>
                  <label className="block text-xs font-bold mb-2 text-indigo-700">POPUP STORE CATEGORY FILTER</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-indigo-700 text-sm focus:outline-none"
                  >
                    <option value="ALL">★ ALL CATEGORIES ★</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              onClick={handleGenerateReport}
              disabled={loading}
              className="w-full px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '[GENERATING...]' : '[GENERATE REPORT]'}
            </button>
          </div>
        </div>

        {/* Report Results */}
        {reportData && (
          <div className="border-2 border-black">
            <div className="border-b-2 border-black p-3 bg-white">
              <h2 className="text-sm font-bold">[REPORT RESULTS]</h2>
            </div>

            <div className="p-4">
              {renderReportContent()}
              
              {/* Export Buttons */}
              <div className="mt-6">
                <button
                  onClick={exportToCSV}
                  className="w-full px-6 py-4 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100 flex items-center justify-center gap-2"
                >
                  <span className="text-lg">📄</span> [DOWNLOAD FULL CSV REPORT]
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
