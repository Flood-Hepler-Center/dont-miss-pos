import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { X, Loader2, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { expenseLineService } from '@/lib/services/expense.service';
import type { ExpenseSKU, ExpenseLine, ExpenseDocument } from '@/types/expense';

type Props = {
  sku: ExpenseSKU;
  onClose: () => void;
};

type HistoryItem = ExpenseLine & { document?: ExpenseDocument };

export function SKUHistoryModal({ sku, onClose }: Props) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    expenseLineService.getHistoryBySku(sku.id)
      .then(data => {
        if (mounted) {
          setHistory(data);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Failed to fetch SKU history', err);
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [sku.id]);

  const confirmedLines = history.filter(l => l.document?.status === 'confirmed');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 font-mono">
      <div className="bg-white border-2 border-black w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b-2 border-black bg-gray-50 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold">TRANSACTION HISTORY</h2>
            <p className="text-[10px] text-gray-500">[{sku.code}] {sku.name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Stats Header */}
        <div className="flex bg-white border-b-2 border-black flex-shrink-0">
          <div className="flex-1 p-4 border-r-2 border-black">
            <div className="text-[10px] text-gray-500 font-bold">MASTER BASE UNIT</div>
            <div className="text-lg font-mono font-bold mt-1 text-blue-600">{sku.baseUnit}</div>
          </div>
          <div className="flex-1 p-4 border-r-2 border-black">
            <div className="text-[10px] text-gray-500 font-bold">TOTAL PURCHASED (CONFIRMED)</div>
            <div className="text-lg font-mono font-bold mt-1">
              {sku.totalPurchasedQty.toLocaleString('th-TH', { maximumFractionDigits: 2 })} <span className="text-[10px] text-gray-400">{sku.baseUnit}</span>
            </div>
          </div>
          <div className="flex-1 p-4">
            <div className="text-[10px] text-gray-500 font-bold">AVERAGE UNIT COST</div>
            <div className="text-lg font-mono font-bold mt-1">
              ฿{sku.averageUnitCost.toLocaleString('th-TH', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
            </div>
          </div>
        </div>

        {/* Math explanation */}
        <div className="bg-blue-50 border-b border-blue-200 p-3 flex gap-2 flex-shrink-0 items-start">
          <AlertCircle size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-blue-800 leading-tight">
            Only <strong>CONFIRMED</strong> transactions are compiled into the master totals. Draft or Cancelled transactions are displayed here for reference (faded) but are excluded from the calculated metrics. Cost averages are strictly computed using the Base Qty.
          </p>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto bg-gray-50 relative">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Loader2 size={24} className="animate-spin text-gray-300" />
              <p className="text-xs text-gray-400 font-bold mt-2">Loading historical records...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-xs text-gray-400 font-bold">NO TRANSACTIONS FOUND</p>
            </div>
          ) : (
            <table className="w-full text-[10px] text-left">
              <thead className="sticky top-0 bg-gray-100 border-b-2 border-black shadow-sm">
                <tr>
                  <th className="px-3 py-2 border-r border-gray-200">DATE & RECEIPT</th>
                  <th className="px-3 py-2 border-r border-gray-200">VENDOR</th>
                  <th className="px-3 py-2 border-r border-gray-200">STATUS</th>
                  <th className="px-3 py-2 border-r border-gray-200">PURCHASE QTY/UNIT</th>
                  <th className="px-3 py-2 border-r border-gray-200">BASE QTY</th>
                  <th className="px-3 py-2 border-r border-gray-200 text-right">TOTAL COST (฿)</th>
                  <th className="px-3 py-2 border-r border-gray-200 text-right text-blue-800">EFFECTIVE RATE (฿)</th>
                </tr>
              </thead>
              <tbody>
                {history.map((line) => {
                  const doc = line.document;
                  const isConfirmed = doc?.status === 'confirmed';
                  const isCancelled = doc?.status === 'cancelled';
                  
                  const rowClass = isCancelled 
                    ? 'bg-red-50 text-gray-400 line-through' 
                    : !isConfirmed 
                      ? 'bg-white text-gray-500 opacity-60' 
                      : 'bg-white text-black hover:bg-yellow-50';

                  const effectiveRate = line.baseQty > 0 ? (line.finalAmount / line.baseQty) : 0;

                  return (
                    <tr key={line.id} className={`border-b border-gray-100 transition-colors ${rowClass}`}>
                      <td className="px-3 py-2 border-r border-gray-100">
                        <div className="font-bold">{format(line.documentDate, 'dd/MM/yyyy')}</div>
                        {doc?.receiptNumber && <div className="text-[9px] text-gray-400">#{doc.receiptNumber}</div>}
                      </td>
                      <td className="px-3 py-2 border-r border-gray-100 truncate max-w-32" title={line.vendorName}>
                        {line.vendorName}
                      </td>
                      <td className="px-3 py-2 border-r border-gray-100">
                        {isConfirmed ? (
                          <span className="flex items-center gap-1 text-green-600 font-bold"><CheckCircle size={10} /> CONFIRMED</span>
                        ) : isCancelled ? (
                          <span className="flex items-center gap-1 text-red-500 font-bold"><X size={10} /> CANCELLED</span>
                        ) : (
                          <span className="flex items-center gap-1 text-yellow-600 font-bold"><Clock size={10} /> DRAFT / PENDING</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-r border-gray-100 font-mono">
                        {line.purchaseQty.toLocaleString('th-TH')} <span className="text-gray-400 text-[9px]">{line.purchaseUnit}</span>
                        {line.conversionFactor !== 1 && <span className="ml-1 text-[8px] text-gray-400">(&times;{line.conversionFactor})</span>}
                      </td>
                      <td className="px-3 py-2 border-r border-gray-100 font-mono font-bold">
                        {line.baseQty.toLocaleString('th-TH')} <span className="text-gray-400 text-[9px]">{line.baseUnit}</span>
                      </td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono font-bold">
                        {line.finalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 border-r border-gray-100 text-right font-mono font-bold text-blue-700">
                        {effectiveRate.toLocaleString('th-TH', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {confirmedLines.length > 0 && (
                <tfoot className="bg-gray-100 border-t-2 border-black sticky bottom-0">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right font-bold text-[10px]">TOTALS (CONFIRMED ONLY)</td>
                    <td className="px-3 py-2 border-r border-gray-200 font-mono font-bold">
                      {confirmedLines.reduce((s, l) => s + l.baseQty, 0).toLocaleString('th-TH')}
                    </td>
                    <td className="px-3 py-2 border-r border-gray-200 text-right font-mono font-bold">
                      {confirmedLines.reduce((s, l) => s + l.finalAmount, 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        <div className="border-t-2 border-black p-4 bg-white flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-black text-white text-xs font-bold hover:bg-gray-800 transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
