'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';

export default function ReportsPage() {
  const [reportType, setReportType] = useState('eod');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportData, setReportData] = useState<Record<string, unknown> | null>(null);

  const handleGenerateReport = () => {
    const mockData = {
      totalRevenue: 45280.5,
      totalOrders: 127,
      avgOrderValue: 356.54,
      totalDiscounts: 1250.0,
      netRevenue: 44030.5,
      cashPayments: 25000.0,
      promptpayPayments: 20280.5,
    };
    setReportData(mockData);
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
              className="w-full px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800"
            >
              [GENERATE REPORT]
            </button>
          </div>
        </div>

        {/* Report Results */}
        {reportData && (
          <div className="border-2 border-black">
            <div className="border-b-2 border-black p-3 bg-white">
              <h2 className="text-sm font-bold">[REPORT RESULTS]</h2>
            </div>

            {/* Stats Grid */}
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="border-2 border-black p-3 text-center">
                  <p className="text-xs mb-1">TOTAL REVENUE</p>
                  <p className="text-xl md:text-2xl font-bold">฿{(reportData.totalRevenue as number).toFixed(2)}</p>
                </div>
                <div className="border-2 border-black p-3 text-center">
                  <p className="text-xs mb-1">TOTAL ORDERS</p>
                  <p className="text-xl md:text-2xl font-bold">{reportData.totalOrders as number}</p>
                </div>
                <div className="border-2 border-black p-3 text-center">
                  <p className="text-xs mb-1">AVG ORDER</p>
                  <p className="text-xl md:text-2xl font-bold">฿{(reportData.avgOrderValue as number).toFixed(2)}</p>
                </div>
                <div className="border-2 border-black p-3 text-center">
                  <p className="text-xs mb-1">NET REVENUE</p>
                  <p className="text-xl md:text-2xl font-bold">฿{(reportData.netRevenue as number).toFixed(2)}</p>
                </div>
              </div>

              {/* Details */}
              <div className="border-2 border-black p-4 mb-6">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between pb-2 border-b border-black">
                    <span className="font-bold">TOTAL DISCOUNTS:</span>
                    <span className="text-red-600 font-bold">-฿{(reportData.totalDiscounts as number).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-black">
                    <span className="font-bold">CASH PAYMENTS:</span>
                    <span>฿{(reportData.cashPayments as number).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold">PROMPTPAY:</span>
                    <span>฿{(reportData.promptpayPayments as number).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Export Buttons */}
              <div className="grid grid-cols-2 gap-3">
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
