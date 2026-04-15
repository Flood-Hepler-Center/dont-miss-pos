import { useState } from 'react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { X, Download, FileSpreadsheet, AlertCircle, Loader2 } from 'lucide-react';
import type { ExpenseMainCategory, ExpenseDocumentStatus } from '@/types/expense';

const QUICK_RANGES = [
  { label: 'THIS MONTH', start: startOfMonth(new Date()), end: endOfMonth(new Date()) },
  { label: 'LAST MONTH', start: startOfMonth(subMonths(new Date(), 1)), end: endOfMonth(subMonths(new Date(), 1)) },
  { label: 'LAST 3M', start: startOfMonth(subMonths(new Date(), 2)), end: endOfMonth(new Date()) },
];

const CATEGORY_LABELS: Record<string, string> = {
  capex: 'CAPEX',
  inventory: 'INVENTORY',
  operating: 'OPERATING',
  utility: 'UTILITY',
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  defaultStartDate: Date;
  defaultEndDate: Date;
  onExport: (filter: {
    startDate: string;
    endDate: string;
    mainCategory?: ExpenseMainCategory;
    status?: ExpenseDocumentStatus;
  }) => Promise<void>;
};

export function ExportModal({ isOpen, onClose, defaultStartDate, defaultEndDate, onExport }: Props) {
  const [startDate, setStartDate] = useState<Date>(defaultStartDate);
  const [endDate, setEndDate] = useState<Date>(defaultEndDate);
  const [category, setCategory] = useState<ExpenseMainCategory | ''>('');
  const [status, setStatus] = useState<ExpenseDocumentStatus | ''>('');
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        mainCategory: category || undefined,
        status: status || undefined,
      });
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 font-mono">
      <div className="bg-white border-2 border-black w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b-2 border-black bg-gray-50">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-green-600" />
            <h2 className="text-sm font-bold">EXPORT TO EXCEL</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <p className="text-xs text-gray-500">
            Generate a comprehensive Excel report with summary tables, detailed line items, CAPEX register, and inventory analysis.
          </p>

          {/* Date Range Selection */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-500">DATE RANGE</label>
            <div className="flex gap-2">
              {QUICK_RANGES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => { setStartDate(r.start); setEndDate(r.end); }}
                  className={`px-3 py-1.5 text-[10px] font-bold border-2 border-black transition-colors ${
                    startDate.getTime() === r.start.getTime() && endDate.getTime() === r.end.getTime()
                      ? 'bg-black text-white'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3 items-center mt-2">
              <input
                type="date"
                value={format(startDate, 'yyyy-MM-dd')}
                onChange={(e) => setStartDate(new Date(e.target.value))}
                className="border-2 border-gray-300 px-3 py-2 text-xs font-mono focus:border-black outline-none flex-1"
              />
              <span className="text-xs font-bold text-gray-400">TO</span>
              <input
                type="date"
                value={format(endDate, 'yyyy-MM-dd')}
                onChange={(e) => setEndDate(new Date(e.target.value))}
                className="border-2 border-gray-300 px-3 py-2 text-xs font-mono focus:border-black outline-none flex-1"
              />
            </div>
          </div>

          {/* Additional Filters */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-500">FILTER BY</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseMainCategory | '')}
                  className="w-full border-2 border-gray-300 px-3 py-2 text-xs font-bold font-mono focus:border-black outline-none"
                >
                  <option value="">ALL CATEGORIES</option>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ExpenseDocumentStatus | '')}
                  className="w-full border-2 border-gray-300 px-3 py-2 text-xs font-bold font-mono focus:border-black outline-none"
                >
                  <option value="">ALL EXCEPT CANCELLED</option>
                  <option value="confirmed">CONFIRMED ONLY</option>
                  <option value="draft">DRAFT ONLY</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border border-green-200 bg-green-50 p-3 flex gap-3 items-start">
            <AlertCircle size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-green-800 leading-tight">
              <strong>Cancelled records are automatically excluded</strong> from all exports. The report is formatted directly for CFO review.
            </p>
          </div>
        </div>

        <div className="p-4 border-t-2 border-black bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border-2 border-gray-300 text-xs font-bold text-gray-600 hover:border-black transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-6 py-2 bg-black text-white text-xs font-bold flex items-center gap-2 hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {isExporting ? 'GENERATING...' : 'GENERATE EXCEL REPORT'}
          </button>
        </div>
      </div>
    </div>
  );
}
