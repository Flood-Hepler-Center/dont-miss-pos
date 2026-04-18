import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { X, Download, FileSpreadsheet, AlertCircle, Loader2, Search, CheckSquare, Square, MousePointerClick, ListFilter } from 'lucide-react';
import type { ExpenseMainCategory, ExpenseDocumentStatus } from '@/types/expense';
import { useExpenseDocuments } from '@/lib/hooks/useExpenses';

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
    documentIds?: string[];
  }) => Promise<void>;
};

export function ExportModal({ isOpen, onClose, defaultStartDate, defaultEndDate, onExport }: Props) {
  const [startDate, setStartDate] = useState<Date>(defaultStartDate);
  const [endDate, setEndDate] = useState<Date>(defaultEndDate);
  const [category, setCategory] = useState<ExpenseMainCategory | ''>('');
  const [status, setStatus] = useState<ExpenseDocumentStatus | ''>('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<'filter' | 'manual'>('filter');
  
  // Manual selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchInSelection, setSearchInSelection] = useState('');

  // Fetch documents for manual selection based on current range/category
  const { documents, loading: loadingDocs } = useExpenseDocuments(
    exportMode === 'manual' ? {
      startDate,
      endDate,
      mainCategory: category || undefined,
      status: status || undefined,
    } : undefined
  );

  const filteredDocs = useMemo(() => {
    if (!documents) return [];
    let docs = documents.filter(d => d.status !== 'cancelled');
    if (searchInSelection) {
      const s = searchInSelection.toLowerCase();
      docs = docs.filter(d => 
        d.vendorName.toLowerCase().includes(s) || 
        d.receiptNumber?.toLowerCase().includes(s) ||
        d.place?.toLowerCase().includes(s)
      );
    }
    return docs;
  }, [documents, searchInSelection]);

  const totalSelectedAmount = useMemo(() => {
    if (exportMode === 'filter') return 0;
    return filteredDocs
      .filter(d => selectedIds.has(d.id))
      .reduce((sum, d) => sum + d.total, 0);
  }, [exportMode, filteredDocs, selectedIds]);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        mainCategory: category || undefined,
        status: status || undefined,
        documentIds: exportMode === 'manual' ? Array.from(selectedIds) : undefined,
      });
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDocs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocs.map(d => d.id)));
    }
  };

  const toggleDoc = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 font-mono">
      <div className="bg-white border-2 border-black w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b-2 border-black bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-green-600" />
            <h2 className="text-sm font-bold uppercase tracking-tighter">Export Expense Data</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 transition-colors border border-transparent hover:border-black">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <p className="text-[10px] text-gray-500 font-bold leading-tight">
            GENERATE CFO-READY EXCEL REPORT WITH SUMMARY TABLES, DETAILED LINE ITEMS, CAPEX REGISTER, AND INVENTORY ANALYSIS.
          </p>

          {/* Export Mode Toggle */}
          <div className="flex border-2 border-black">
            <button
              onClick={() => setExportMode('filter')}
              className={`flex-1 py-2 text-[10px] font-bold transition-colors flex items-center justify-center gap-2 ${
                exportMode === 'filter' ? 'bg-black text-white' : 'hover:bg-gray-50'
              }`}
            >
              <ListFilter size={14} /> EXPORT BY FILTER
            </button>
            <button
              onClick={() => setExportMode('manual')}
              className={`flex-1 py-2 text-[10px] font-bold transition-colors flex items-center justify-center gap-2 ${
                exportMode === 'manual' ? 'bg-black text-white' : 'hover:bg-gray-50 border-l-2 border-black'
              }`}
            >
              <MousePointerClick size={14} /> MANUAL SELECTION
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              {/* Date Range Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400">DATE RANGE</label>
                <div className="flex flex-wrap gap-1">
                  {QUICK_RANGES.map((r) => (
                    <button
                      key={r.label}
                      onClick={() => { setStartDate(r.start); setEndDate(r.end); }}
                      className={`px-2 py-1 text-[9px] font-bold border-2 border-black transition-colors ${
                        startDate.getTime() === r.start.getTime() && endDate.getTime() === r.end.getTime()
                          ? 'bg-black text-white'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-center mt-2">
                  <input
                    type="date"
                    value={format(startDate, 'yyyy-MM-dd')}
                    onChange={(e) => setStartDate(new Date(e.target.value))}
                    className="border-2 border-black px-2 py-1.5 text-xs font-mono focus:bg-yellow-50 outline-none w-full"
                  />
                  <span className="text-[10px] font-bold text-gray-400">TO</span>
                  <input
                    type="date"
                    value={format(endDate, 'yyyy-MM-dd')}
                    onChange={(e) => setEndDate(new Date(e.target.value))}
                    className="border-2 border-black px-2 py-1.5 text-xs font-mono focus:bg-yellow-50 outline-none w-full"
                  />
                </div>
              </div>

              {/* Additional Filters */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400">FILTERS</label>
                <div className="space-y-2">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseMainCategory | '')}
                    className="w-full border-2 border-black px-2 py-1.5 text-xs font-bold font-mono focus:bg-yellow-50 outline-none"
                  >
                    <option value="">ALL CATEGORIES</option>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ExpenseDocumentStatus | '')}
                    className="w-full border-2 border-black px-2 py-1.5 text-xs font-bold font-mono focus:bg-yellow-50 outline-none"
                  >
                    <option value="">ALL EXCEPT CANCELLED</option>
                    <option value="confirmed">CONFIRMED ONLY</option>
                    <option value="draft">DRAFT ONLY</option>
                    <option value="ai_review">NEEDS REVIEW</option>
                  </select>
                </div>
              </div>

              <div className="border-2 border-green-200 bg-green-50 p-3 flex gap-3 items-start">
                <AlertCircle size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-[9px] text-green-800 leading-tight font-bold uppercase">
                  Cancelled records are automatically excluded. Formatted for CFO review.
                </p>
              </div>
            </div>

            {/* Manual Selection List */}
            <div className={`space-y-3 transition-opacity ${exportMode === 'manual' ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Select Expenses ({selectedIds.size})</label>
                <button 
                  onClick={toggleSelectAll}
                  className="text-[9px] font-bold underline hover:no-underline"
                >
                  {selectedIds.size === filteredDocs.length ? 'DESELECT ALL' : 'SELECT ALL'}
                </button>
              </div>
              
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  placeholder="SEARCH IN RESULTS..."
                  value={searchInSelection}
                  onChange={(e) => setSearchInSelection(e.target.value)}
                  className="w-full border-2 border-black pl-7 pr-2 py-1.5 text-[10px] font-bold font-mono focus:bg-blue-50 outline-none"
                />
              </div>

              <div className="border-2 border-black h-[220px] overflow-y-auto bg-gray-50">
                {loadingDocs ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={20} className="animate-spin text-gray-400" />
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-[10px] font-bold text-gray-400">
                    NO EXPENSES FOUND
                  </div>
                ) : (
                  <div className="divide-y-2 divide-gray-100">
                    {filteredDocs.map((doc) => (
                      <div 
                        key={doc.id}
                        onClick={() => toggleDoc(doc.id)}
                        className={`p-2 flex items-center gap-3 cursor-pointer hover:bg-white transition-colors ${
                          selectedIds.has(doc.id) ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="flex-shrink-0 text-black">
                          {selectedIds.has(doc.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between items-start gap-1">
                            <span className="text-[10px] font-bold truncate leading-none uppercase">{doc.vendorName}</span>
                            <span className="text-[9px] font-mono font-bold whitespace-nowrap">฿{doc.total.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center mt-0.5">
                            <span className="text-[8px] text-gray-400 font-bold font-mono">{format(doc.documentDate, 'dd/MM/yy')}</span>
                            {doc.receiptNumber && (
                              <span className="text-[8px] text-gray-300 font-mono truncate ml-2">#{doc.receiptNumber}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {exportMode === 'manual' && selectedIds.size > 0 && (
                <div className="p-2 bg-black text-white flex justify-between items-center text-[9px] font-bold">
                  <span>TOTAL SELECTED:</span>
                  <span>฿{totalSelectedAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t-2 border-black bg-gray-50 flex items-center justify-between flex-shrink-0">
          <div className="text-[10px] font-bold text-gray-500">
            {exportMode === 'filter' 
              ? 'EXPORTING ALL DATA WITHIN FILTERS' 
              : `EXPORTING ${selectedIds.size} SELECTED DOCUMENTS`
            }
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border-2 border-black text-[10px] font-bold text-black hover:bg-gray-200 transition-colors uppercase"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting || (exportMode === 'manual' && selectedIds.size === 0)}
              className="px-6 py-2 bg-black text-white border-2 border-black text-[10px] font-bold flex items-center gap-2 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-200 transition-colors uppercase"
            >
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {isExporting ? 'Generating...' : 'Download Excel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

