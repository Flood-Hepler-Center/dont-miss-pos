'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import { reportsService } from '@/lib/services/reports.service';
import type { 
  EODReport, 
  SalesSummaryReport, 
  TopItemsReport, 
  CategoryPerformanceReport, 
  PaymentMethodsReport 
} from '@/lib/services/reports.service';
import { message } from 'antd';

export default function ReportsPage() {
  const [reportType, setReportType] = useState('eod');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportData, setReportData] = useState<EODReport | SalesSummaryReport | TopItemsReport | CategoryPerformanceReport | PaymentMethodsReport | null>(null);
  const [loading, setLoading] = useState(false);

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
      let data;
      const start = new Date(startDate);
      const end = endDate ? new Date(endDate) : new Date(startDate);
      end.setHours(23, 59, 59, 999);

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

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('End of Day Report', 20, 20);
    doc.setFontSize(12);
    doc.text(`Date: ${format(new Date(), 'dd MMM yyyy')}`, 20, 30);

    if (reportData) {
      let y = 50;
      Object.entries(reportData).forEach(([key, value]) => {
        doc.text(`${key}: ${value}`, 20, y);
        y += 10;
      });
    }

    doc.save(`report-${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const exportToCSV = () => {
    if (!reportData) return;

    const csv = [
      Object.keys(reportData).join(','),
      Object.values(reportData).join(','),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
  };

  const renderReportContent = () => {
    if (!reportData) return null;

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

            <div>
              <label className="block text-xs font-bold mb-2">REPORT TYPE</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
              >
                <option value="eod">END OF DAY</option>
                <option value="sales">SALES SUMMARY</option>
                <option value="topitems">TOP SELLING ITEMS</option>
                <option value="category">CATEGORY PERFORMANCE</option>
                <option value="payment">PAYMENT METHODS</option>
              </select>
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
              <div className="grid grid-cols-2 gap-3 mt-6">
                <button
                  onClick={exportToPDF}
                  className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
                >
                  [EXPORT PDF]
                </button>
                <button
                  onClick={exportToCSV}
                  className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
                >
                  [EXPORT CSV]
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
