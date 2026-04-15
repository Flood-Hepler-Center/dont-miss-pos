'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { Upload, Plus, Download, Search, Filter, RefreshCw, Eye, Trash2, CheckCircle, AlertCircle, Clock, Bot } from 'lucide-react';
import { useExpenseDocuments, useExpenseStats } from '@/lib/hooks/useExpenses';
import type { ExpenseFilter, ExpenseMainCategory, ExpenseDocumentStatus } from '@/types/expense';
import { ExportModal } from './_components/export-modal';

const CATEGORY_LABELS: Record<string, string> = {
  capex: 'CAPEX',
  inventory: 'INVENTORY',
  operating: 'OPERATING',
  utility: 'UTILITY',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'DRAFT', color: 'bg-gray-100 text-gray-600', icon: <Clock size={10} /> },
  confirmed: { label: 'CONFIRMED', color: 'bg-green-100 text-green-700', icon: <CheckCircle size={10} /> },
  ai_processing: { label: 'AI PROCESSING', color: 'bg-blue-100 text-blue-700', icon: <Bot size={10} className="animate-pulse" /> },
  ai_review: { label: 'NEEDS REVIEW', color: 'bg-yellow-100 text-yellow-700', icon: <AlertCircle size={10} /> },
  cancelled: { label: 'CANCELLED', color: 'bg-red-100 text-red-600', icon: <Trash2 size={10} /> },
};

const QUICK_RANGES = [
  { label: 'THIS MONTH', start: startOfMonth(new Date()), end: endOfMonth(new Date()) },
  { label: 'LAST MONTH', start: startOfMonth(subMonths(new Date(), 1)), end: endOfMonth(subMonths(new Date(), 1)) },
  { label: 'LAST 3M', start: startOfMonth(subMonths(new Date(), 2)), end: endOfMonth(new Date()) },
];

export default function ExpensesPage() {
  const router = useRouter();

  const [dateRange, setDateRange] = useState({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) });
  const [categoryFilter, setCategoryFilter] = useState<ExpenseMainCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<ExpenseDocumentStatus | ''>('');
  const [searchText, setSearchText] = useState('');

  const filter: ExpenseFilter = useMemo(() => ({
    startDate: dateRange.start,
    endDate: dateRange.end,
    mainCategory: categoryFilter || undefined,
    status: statusFilter || undefined,
    searchText: searchText || undefined,
  }), [dateRange, categoryFilter, statusFilter, searchText]);

  const { documents, loading, confirmDocument, deleteDocument } = useExpenseDocuments(filter);
  const statsFilter = useMemo(() => ({ startDate: dateRange.start, endDate: dateRange.end }), [dateRange.start, dateRange.end]);
  const { stats } = useExpenseStats(statsFilter);

  // Exclude cancelled documents from standard display lists
  const displayDocs = useMemo(() => documents.filter((d) => d.status !== 'cancelled'), [documents]);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const executeExport = useCallback(async (exportFilter: {
    startDate: string;
    endDate: string;
    mainCategory?: string;
    status?: string;
  }) => {
    const res = await fetch('/api/expenses/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exportFilter),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense_report_${format(new Date(exportFilter.startDate), 'yyyyMMdd')}_${format(new Date(exportFilter.endDate), 'yyyyMMdd')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const totalConfirmed = displayDocs.filter((d) => d.status === 'confirmed').reduce((s, d) => s + d.total, 0);
  const totalDraft = displayDocs.filter((d) => d.status === 'draft').length;
  const totalAIReview = displayDocs.filter((d) => d.status === 'ai_review').length;

  return (
    <div className="min-h-screen bg-white font-mono">
      {/* Header */}
      <div className="border-b-2 border-black p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">EXPENSE MANAGEMENT</h1>
            <p className="text-xs text-gray-500 mt-1">CAPEX · INVENTORY · OPERATING · UTILITY</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push('/admin/expenses/upload')}
              className="flex items-center gap-2 px-4 py-2 bg-black text-white text-xs font-bold hover:bg-gray-800 transition-colors"
            >
              <Bot size={14} /> AI UPLOAD
            </button>
            <button
              onClick={() => router.push('/admin/expenses/new')}
              className="flex items-center gap-2 px-4 py-2 border-2 border-black text-xs font-bold hover:bg-gray-50 transition-colors"
            >
              <Plus size={14} /> MANUAL ENTRY
            </button>
            <button
              onClick={() => router.push('/admin/expenses/skus')}
              className="flex items-center gap-2 px-4 py-2 border-2 border-black text-xs font-bold hover:bg-gray-50 transition-colors"
            >
              <Filter size={14} /> SKU CATALOG
            </button>
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 border-2 border-black text-xs font-bold hover:bg-gray-50 transition-colors"
            >
              <Download size={14} /> EXPORT EXCEL
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 border-b-2 border-black">
        <div className="p-4 border-r-2 border-black">
          <div className="text-[10px] text-gray-500 font-bold">TOTAL CONFIRMED</div>
          <div className="text-xl font-bold mt-1">฿{totalConfirmed.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
          <div className="text-[10px] text-gray-400">{displayDocs.filter((d) => d.status === 'confirmed').length} docs</div>
        </div>
        <div className="p-4 border-r-2 border-black">
          <div className="text-[10px] text-gray-500 font-bold">CAPEX</div>
          <div className="text-xl font-bold mt-1">฿{(stats?.capexTotal ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 0 })}</div>
          <div className="text-[10px] text-gray-400">Equipment, Decor etc.</div>
        </div>
        <div className="p-4 border-r-2 border-black">
          <div className="text-[10px] text-gray-500 font-bold">INVENTORY</div>
          <div className="text-xl font-bold mt-1">฿{(stats?.inventoryTotal ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 0 })}</div>
          <div className="text-[10px] text-gray-400">Food, Drinks etc.</div>
        </div>
        <div className="p-4 border-r-2 border-black">
          <div className="text-[10px] text-gray-500 font-bold">PENDING REVIEW</div>
          <div className="text-xl font-bold mt-1 text-yellow-600">{totalAIReview}</div>
          <div className="text-[10px] text-gray-400">AI needs review</div>
        </div>
        <div className="p-4">
          <div className="text-[10px] text-gray-500 font-bold">DRAFTS</div>
          <div className="text-xl font-bold mt-1 text-gray-500">{totalDraft}</div>
          <div className="text-[10px] text-gray-400">Unconfirmed</div>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b-2 border-black p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Quick ranges */}
          <div className="flex gap-1">
            {QUICK_RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setDateRange({ start: r.start, end: r.end })}
                className={`px-3 py-1 text-[10px] font-bold border-2 border-black transition-colors ${
                  dateRange.start.getTime() === r.start.getTime() ? 'bg-black text-white' : 'hover:bg-gray-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={format(dateRange.start, 'yyyy-MM-dd')}
              onChange={(e) => setDateRange((p) => ({ ...p, start: new Date(e.target.value) }))}
              className="border-2 border-black px-2 py-1 text-xs font-mono"
            />
            <span className="text-xs font-bold">→</span>
            <input
              type="date"
              value={format(dateRange.end, 'yyyy-MM-dd')}
              onChange={(e) => setDateRange((p) => ({ ...p, end: new Date(e.target.value) }))}
              className="border-2 border-black px-2 py-1 text-xs font-mono"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ExpenseMainCategory | '')}
            className="border-2 border-black px-2 py-1 text-xs font-bold font-mono"
          >
            <option value="">ALL CATEGORIES</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ExpenseDocumentStatus | '')}
            className="border-2 border-black px-2 py-1 text-xs font-bold font-mono"
          >
            <option value="">ALL STATUS</option>
            <option value="draft">DRAFT</option>
            <option value="confirmed">CONFIRMED</option>
            <option value="ai_review">NEEDS REVIEW</option>
          </select>

          <div className="relative flex-1 min-w-40">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Search vendor, receipt..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full border-2 border-black pl-6 pr-2 py-1 text-xs font-mono"
            />
          </div>

          {loading && <RefreshCw size={14} className="animate-spin text-gray-400" />}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {displayDocs.length === 0 && !loading ? (
          <div className="p-16 text-center">
            <Upload size={32} className="mx-auto mb-4 text-gray-300" />
            <p className="text-sm font-bold text-gray-400">NO EXPENSE RECORDS FOUND</p>
            <p className="text-xs text-gray-300 mt-1">Upload a receipt or add manually</p>
            <div className="flex gap-2 justify-center mt-4">
              <button
                onClick={() => router.push('/admin/expenses/upload')}
                className="px-4 py-2 bg-black text-white text-xs font-bold"
              >
                AI UPLOAD
              </button>
              <button
                onClick={() => router.push('/admin/expenses/new')}
                className="px-4 py-2 border-2 border-black text-xs font-bold"
              >
                MANUAL ENTRY
              </button>
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-black bg-gray-50">
                <th className="text-left px-4 py-3 font-bold border-r border-gray-200">DATE</th>
                <th className="text-left px-4 py-3 font-bold border-r border-gray-200">VENDOR / PLACE</th>
                <th className="text-left px-4 py-3 font-bold border-r border-gray-200">SOURCE</th>
                <th className="text-left px-4 py-3 font-bold border-r border-gray-200">STATUS</th>
                <th className="text-right px-4 py-3 font-bold border-r border-gray-200">SUBTOTAL</th>
                <th className="text-right px-4 py-3 font-bold border-r border-gray-200">TOTAL (฿)</th>
                <th className="text-center px-4 py-3 font-bold">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayDocs.map((doc, i) => {
                const statusCfg = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.draft;
                return (
                  <tr key={doc.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-3 border-r border-gray-100">
                      <div className="font-bold">{format(doc.documentDate, 'dd/MM/yyyy')}</div>
                      {doc.receiptNumber && <div className="text-gray-400 text-[10px]">#{doc.receiptNumber}</div>}
                    </td>
                    <td className="px-4 py-3 border-r border-gray-100">
                      <div className="font-bold truncate max-w-40">{doc.vendorName}</div>
                      {doc.place && <div className="text-gray-400 text-[10px] truncate max-w-40">{doc.place}</div>}
                    </td>
                    <td className="px-4 py-3 border-r border-gray-100">
                      <span className="uppercase text-[10px] font-bold text-gray-500">{doc.source.replace('_', ' ')}</span>
                      {doc.isAiExtracted && (
                        <span className="ml-1 text-[9px] bg-blue-100 text-blue-600 px-1 rounded font-bold">AI</span>
                      )}
                    </td>
                    <td className="px-4 py-3 border-r border-gray-100">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded ${statusCfg.color}`}>
                        {statusCfg.icon} {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-r border-gray-100 text-right font-mono">
                      {doc.subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 border-r border-gray-100 text-right font-bold font-mono">
                      ฿{doc.total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => router.push(`/admin/expenses/${doc.id}`)}
                          className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                          title="View"
                        >
                          <Eye size={12} />
                        </button>
                        {doc.status === 'draft' || doc.status === 'ai_review' ? (
                          <button
                            onClick={() => confirmDocument(doc.id)}
                            className="p-1.5 hover:bg-green-50 text-green-600 rounded transition-colors"
                            title="Confirm"
                          >
                            <CheckCircle size={12} />
                          </button>
                        ) : null}
                        {doc.status !== 'confirmed' && (
                          <button
                            onClick={() => {
                              if (confirm(`Delete expense from ${doc.vendorName}?`)) {
                                deleteDocument(doc.id);
                              }
                            }}
                            className="p-1.5 hover:bg-red-50 text-red-500 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="border-t-2 border-black p-4 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {displayDocs.length} DOCUMENT{displayDocs.length !== 1 ? 'S' : ''} · {format(dateRange.start, 'dd MMM')} – {format(dateRange.end, 'dd MMM yyyy')}
        </span>
        <button
          onClick={() => setIsExportModalOpen(true)}
          className="flex items-center gap-1 text-xs font-bold underline hover:no-underline"
        >
          <Download size={12} /> EXPORT FOR CFO
        </button>
      </div>

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        defaultStartDate={dateRange.start}
        defaultEndDate={dateRange.end}
        onExport={executeExport}
      />
    </div>
  );
}
