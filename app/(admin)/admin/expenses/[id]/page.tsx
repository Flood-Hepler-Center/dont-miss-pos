'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  CheckCircle,
  Trash2,
  Bot,
  AlertCircle,
  Download,
  Edit2,
  ExternalLink,
  X,
  Save,
  Plus,
  Loader2,
  Search,
} from 'lucide-react';
import { expenseDocumentService, expenseLineService, expenseStatsService } from '@/lib/services/expense.service';
import { useExpenseSKUs } from '@/lib/hooks/useExpenses';
import type {
  ExpenseDocument,
  ExpenseLine,
  ExpenseMainCategory,
  ExpenseSubCategory,
  PurchaseUnit,
  BaseUnit,
  ExpenseSKU,
} from '@/types/expense';

// ─── SKU Combobox ─────────────────────────────────────────────────────────────

function SKUCombobox({ currentSkuId, currentLabel, skus, onSelect, onClearToNew }: {
  currentSkuId?: string;
  currentLabel: string;
  skus: ExpenseSKU[];
  onSelect: (sku: ExpenseSKU) => void;
  onClearToNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const displayValue = open ? search : (currentSkuId
    ? `${skus.find(s => s.id === currentSkuId)?.code ?? ''} ${currentLabel}`.trim()
    : currentLabel);

  const filtered = skus.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase()) ||
    (s.nameTh ?? '').includes(search)
  ).slice(0, 8);

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-1">
        <Search size={10} className="text-blue-400 flex-shrink-0" />
        <input
          value={displayValue}
          onFocus={() => { setSearch(''); setOpen(true); }}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search SKU..."
          className="w-full text-xs bg-transparent border-b border-blue-200 focus:border-blue-600 outline-none py-0.5 font-bold truncate"
        />
      </div>
      {open && (
        <div className="absolute top-full left-0 z-50 w-72 bg-white border border-gray-200 shadow-xl rounded max-h-48 overflow-y-auto">
          <div
            className="px-2 py-1.5 text-[10px] text-yellow-700 bg-yellow-50 cursor-pointer hover:bg-yellow-100 font-bold border-b border-yellow-200"
            onMouseDown={(e) => { e.preventDefault(); onClearToNew(); setOpen(false); setSearch(''); }}
          >
            ★ NEW SKU (will be created on save)
          </div>
          {filtered.map(sku => (
            <div
              key={sku.id}
              className="px-2 py-1.5 text-[10px] cursor-pointer hover:bg-blue-50 border-t border-gray-100 flex gap-2 items-center"
              onMouseDown={(e) => { e.preventDefault(); onSelect(sku); setOpen(false); setSearch(''); }}
            >
              <span className="font-mono text-gray-400 flex-shrink-0">{sku.code}</span>
              <span className="truncate font-bold flex-1">{sku.name}</span>
              <span className="flex-shrink-0 text-[9px] text-gray-400">{sku.purchaseUnit}/{sku.baseUnit}</span>
            </div>
          ))}
          {filtered.length === 0 && search && (
            <div className="px-2 py-2 text-[10px] text-gray-400 text-center">No SKUs match {"\""}{search}{"\""}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  capex: 'CAPEX',
  inventory: 'INVENTORY',
  operating: 'OPERATING',
  utility: 'UTILITY',
};

const SUB_CATEGORY_LABELS: Record<string, string> = {
  capex_equipment: 'Equipment',
  capex_decor: 'Decor',
  capex_furniture: 'Furniture',
  capex_technology: 'Technology',
  capex_vehicle: 'Vehicle',
  capex_renovation: 'Renovation',
  inventory_food: 'Food Ingredient',
  inventory_drinks: 'Drinks',
  inventory_packaging: 'Packaging',
  inventory_cleaning: 'Cleaning',
  inventory_consumable: 'Consumable',
  operating_staff: 'Staff Cost',
  operating_marketing: 'Marketing',
  operating_admin: 'Admin',
  utility_electric: 'Electricity',
  utility_water: 'Water',
  utility_gas: 'Gas',
  utility_internet: 'Internet',
  other: 'Other',
};

const ALL_SUB_CATEGORIES: ExpenseSubCategory[] = [
  'inventory_food', 'inventory_drinks', 'inventory_packaging', 'inventory_cleaning', 'inventory_consumable',
  'capex_equipment', 'capex_decor', 'capex_furniture', 'capex_technology', 'capex_vehicle', 'capex_renovation',
  'operating_staff', 'operating_marketing', 'operating_admin',
  'utility_electric', 'utility_water', 'utility_gas', 'utility_internet',
  'other',
];

const PURCHASE_UNITS: PurchaseUnit[] = ['kg', 'g', 'L', 'ml', 'pack', 'box', 'case', 'bottle', 'can', 'bag', 'unit', 'piece', 'roll', 'sheet', 'set'];
const BASE_UNITS: BaseUnit[] = ['g', 'ml', 'unit', 'piece', 'sheet', 'roll', 'cm', 'sqm'];

// ─── Editable line type ───────────────────────────────────────────────────────

type EditLine = ExpenseLine & { _isNew?: boolean; _deleted?: boolean };

function blankLine(documentId: string, vendorName: string, documentDate: Date): EditLine {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    documentId,
    skuName: '',
    rawDescription: '',
    mainCategory: 'inventory',
    subCategory: 'inventory_food',
    purchaseQty: 1,
    purchaseUnit: 'unit',
    baseQty: 1,
    baseUnit: 'unit',
    conversionFactor: 1,
    unitPrice: 0,
    subtotal: 0,
    discount: 0,
    finalAmount: 0,
    isAiExtracted: false,
    isNewSku: false,
    documentDate,
    vendorName,
    createdAt: new Date(),
    updatedAt: new Date(),
    _isNew: true,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { params: { id: string } };

export default function ExpenseDetailPage({ params }: Props) {
  const router = useRouter();
  const { skus } = useExpenseSKUs();
  const [document, setDocument] = useState<ExpenseDocument | null>(null);
  const [lines, setLines] = useState<ExpenseLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  // ─── Edit mode state ───────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editDoc, setEditDoc] = useState<Partial<ExpenseDocument>>({});
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const originalLinesRef = useRef<ExpenseLine[]>([]);

  // ─── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [docData, docLines] = await Promise.all([
        expenseDocumentService.getById(params.id),
        expenseLineService.getByDocumentId(params.id),
      ]);
      setDocument(docData);
      setLines(docLines);
      setLoading(false);
    }
    load();
  }, [params.id]);

  // ─── Enter / exit edit mode ─────────────────────────────────────────────────

  const startEdit = useCallback(() => {
    if (!document) return;
    setEditDoc({
      vendorName: document.vendorName,
      place: document.place ?? '',
      receiptNumber: document.receiptNumber ?? '',
      documentDate: document.documentDate,
      subtotal: document.subtotal,
      taxAmount: document.taxAmount,
      serviceCharge: document.serviceCharge,
      total: document.total,
      notes: document.notes ?? '',
    });
    setEditLines(lines.map((l) => ({ ...l })));
    originalLinesRef.current = lines;
    setIsEditing(true);
  }, [document, lines]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditDoc({});
    setEditLines([]);
  }, []);

  // ─── Line helpers ───────────────────────────────────────────────────────────

  const updateLine = useCallback((idx: number, patch: Partial<EditLine>) => {
    setEditLines((prev) => {
      const next = [...prev];
      const updated = { ...next[idx], ...patch };
      // Auto-recalculate finalAmount when price / qty / discount change
      if ('purchaseQty' in patch || 'unitPrice' in patch || 'discount' in patch) {
        const subtotal = updated.purchaseQty * updated.unitPrice;
        updated.subtotal = subtotal;
        updated.finalAmount = subtotal - (updated.discount ?? 0);
      }
      next[idx] = updated;
      return next;
    });
  }, []);

  const addLine = useCallback(() => {
    if (!document) return;
    setEditLines((prev) => [...prev, blankLine(params.id, document.vendorName, document.documentDate)]);
  }, [document, params.id]);

  const removeLine = useCallback((idx: number) => {
    setEditLines((prev) => prev.map((l, i) => i === idx ? { ...l, _deleted: true } : l));
  }, []);

  // ─── Computed totals ────────────────────────────────────────────────────────

  const visibleLines = editLines.filter((l) => !l._deleted);
  const computedSubtotal = visibleLines.reduce((s, l) => s + l.finalAmount, 0);
  const computedTotal = computedSubtotal + (editDoc.taxAmount ?? 0) + (editDoc.serviceCharge ?? 0);

  // ─── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!document) return;
    setSaving(true);
    try {
      // Update document
      await expenseDocumentService.update(params.id, {
        vendorName: editDoc.vendorName ?? document.vendorName,
        place: editDoc.place ?? document.place,
        receiptNumber: (editDoc.receiptNumber as string) || undefined,
        documentDate: editDoc.documentDate instanceof Date ? editDoc.documentDate : document.documentDate,
        taxAmount: editDoc.taxAmount ?? document.taxAmount,
        serviceCharge: editDoc.serviceCharge ?? document.serviceCharge,
        subtotal: computedSubtotal,
        total: computedTotal,
        notes: (editDoc.notes as string) || undefined,
        // If was confirmed, revert to draft so costs can be re-applied
        status: document.status === 'confirmed' ? 'draft' : document.status,
      });

      // Process line changes
      const originalIds = new Set(originalLinesRef.current.map((l) => l.id));

      for (const line of editLines) {
        if (line._deleted) {
          // Only delete lines that existed before (not new+deleted)
          if (originalIds.has(line.id)) {
            await expenseLineService.delete(line.id);
          }
        } else if (line._isNew) {
          await expenseLineService.create({
            documentId: params.id,
            skuId: line.skuId,
            skuCode: line.skuCode,
            skuName: line.skuName,
            rawDescription: line.rawDescription ?? line.skuName,
            mainCategory: line.mainCategory,
            subCategory: line.subCategory,
            purchaseQty: line.purchaseQty,
            purchaseUnit: line.purchaseUnit,
            baseQty: line.baseQty,
            baseUnit: line.baseUnit,
            conversionFactor: line.conversionFactor,
            unitPrice: line.unitPrice,
            subtotal: line.subtotal,
            discount: line.discount,
            finalAmount: line.finalAmount,
            isAiExtracted: false,
            isNewSku: false,
            documentDate: document.documentDate,
            vendorName: editDoc.vendorName ?? document.vendorName,
            place: editDoc.place ?? document.place,
          });
        } else {
          await expenseLineService.update(line.id, {
            skuId: line.skuId,
            skuCode: line.skuCode,
            skuName: line.skuName,
            mainCategory: line.mainCategory,
            subCategory: line.subCategory,
            purchaseQty: line.purchaseQty,
            purchaseUnit: line.purchaseUnit,
            baseQty: line.baseQty,
            baseUnit: line.baseUnit,
            conversionFactor: line.conversionFactor,
            unitPrice: line.unitPrice,
            subtotal: line.subtotal,
            discount: line.discount,
            finalAmount: line.finalAmount,
            isNewSku: line.isNewSku,
            documentDate: editDoc.documentDate instanceof Date ? editDoc.documentDate : document.documentDate,
            vendorName: editDoc.vendorName ?? document.vendorName,
            place: editDoc.place ?? document.place,
          });
        }
      }

      // Reload fresh data
      const [freshDoc, freshLines] = await Promise.all([
        expenseDocumentService.getById(params.id),
        expenseLineService.getByDocumentId(params.id),
      ]);
      setDocument(freshDoc);
      setLines(freshLines);
      setIsEditing(false);
      setEditDoc({});
      setEditLines([]);
    } finally {
      setSaving(false);
    }
  }, [document, params.id, editDoc, editLines, computedSubtotal, computedTotal]);

  // ─── Confirm ────────────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!document) return;
    setConfirming(true);
    try {
      await expenseStatsService.updateSKUCostAfterConfirm(lines);
      await expenseDocumentService.confirm(params.id, 'admin');
      setDocument((d) => d ? { ...d, status: 'confirmed' } : d);
    } finally {
      setConfirming(false);
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!document) return;
    if (!confirm(`Delete this expense from ${document.vendorName}? This will reverse all SKU cost calculations.`)) return;
    if (document.status === 'confirmed') {
      await expenseStatsService.reverseSKUCostAfterCancel(lines);
    }
    await expenseDocumentService.delete(params.id);
    router.push('/admin/expenses');
  };

  // ─── Export ─────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!document) return;
    const res = await fetch('/api/expenses/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: document.documentDate.toISOString(),
        endDate: document.documentDate.toISOString(),
        documentId: params.id,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `expense_${params.id}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-white font-mono flex items-center justify-center">
      <p className="text-xs text-gray-400 animate-pulse">LOADING...</p>
    </div>
  );

  if (!document) return (
    <div className="min-h-screen bg-white font-mono flex items-center justify-center">
      <div className="text-center">
        <p className="text-sm font-bold text-gray-500">EXPENSE NOT FOUND</p>
        <button onClick={() => router.push('/admin/expenses')} className="mt-4 text-xs underline">
          ← Back to expenses
        </button>
      </div>
    </div>
  );

  const isConfirmed = document.status === 'confirmed';
  const hasImage = !!document.receiptImageUrl;
  const displayLines = isEditing ? editLines.filter((l) => !l._deleted) : lines;

  // Derived value for date input
  const dateValue = isEditing
    ? (editDoc.documentDate instanceof Date
      ? editDoc.documentDate.toISOString().slice(0, 10)
      : '')
    : format(document.documentDate, 'yyyy-MM-dd');

  return (
    <div className="min-h-screen bg-white font-mono">
      {/* ── Header ── */}
      <div className={`border-b-2 p-4 transition-colors ${isEditing ? 'border-blue-500 bg-blue-50' : 'border-black'}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={isEditing ? cancelEdit : () => router.push('/admin/expenses')} className="p-1.5 hover:bg-gray-100 rounded">
              {isEditing ? <X size={16} /> : <ArrowLeft size={16} />}
            </button>
            <div>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">EDITING</span>
                  <input
                    value={editDoc.vendorName ?? ''}
                    onChange={(e) => setEditDoc((d) => ({ ...d, vendorName: e.target.value }))}
                    className="text-lg font-bold bg-white border-b-2 border-blue-400 focus:border-blue-600 outline-none px-1"
                    placeholder="Vendor name"
                  />
                </div>
              ) : (
                <h1 className="text-lg font-bold">{document.vendorName}</h1>
              )}
              <p className="text-[10px] text-gray-500">
                {format(document.documentDate, 'dd MMM yyyy')} ·{' '}
                {document.receiptNumber ? `#${document.receiptNumber} · ` : ''}
                {document.source.replace('_', ' ').toUpperCase()}
                {document.isAiExtracted && (
                  <span className="ml-2 text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">
                    <Bot size={8} className="inline mr-0.5" />AI EXTRACTED
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {saving ? 'SAVING...' : 'SAVE CHANGES'}
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-1 px-3 py-2 border-2 border-gray-300 text-xs font-bold hover:bg-gray-50"
                >
                  <X size={12} /> CANCEL
                </button>
              </>
            ) : (
              <>
                {!isConfirmed && (
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="flex items-center gap-1 px-4 py-2 bg-black text-white text-xs font-bold hover:bg-gray-800 disabled:bg-gray-400"
                  >
                    <CheckCircle size={12} />
                    {confirming ? 'CONFIRMING...' : 'CONFIRM'}
                  </button>
                )}
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1 px-3 py-2 border-2 border-black text-xs font-bold hover:bg-gray-50"
                >
                  <Download size={12} /> EXPORT
                </button>
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1 px-3 py-2 border-2 border-blue-500 text-blue-600 text-xs font-bold hover:bg-blue-50"
                >
                  <Edit2 size={12} /> EDIT
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1 px-3 py-2 border-2 border-red-300 text-red-500 text-xs font-bold hover:border-red-500 hover:bg-red-50"
                >
                  <Trash2 size={12} /> DELETE
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* ── Left: Meta ── */}
        <div className="lg:w-72 border-r-2 border-black p-6">
          {/* Status */}
          <div className={`p-3 mb-4 border-2 ${isConfirmed ? 'border-green-400 bg-green-50' : document.status === 'ai_review' ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300 bg-gray-50'}`}>
            <div className="flex items-center gap-2">
              {isConfirmed
                ? <CheckCircle size={14} className="text-green-600" />
                : document.status === 'ai_review'
                  ? <AlertCircle size={14} className="text-yellow-600" />
                  : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-400" />
              }
              <span className={`text-xs font-bold ${isConfirmed ? 'text-green-700' : document.status === 'ai_review' ? 'text-yellow-700' : 'text-gray-600'}`}>
                {isEditing ? 'EDITING' : document.status.toUpperCase().replace('_', ' ')}
              </span>
            </div>
            {document.confirmedBy && (
              <p className="text-[10px] text-gray-400 mt-1">by {document.confirmedBy}</p>
            )}
          </div>

          {/* Review reasons */}
          {document.requiresReview && document.reviewReasons && (
            <div className="border-2 border-yellow-300 bg-yellow-50 p-3 mb-4">
              <p className="text-[10px] font-bold text-yellow-700 mb-1">REVIEW NOTES</p>
              {document.reviewReasons.map((r, i) => (
                <p key={i} className="text-[10px] text-yellow-600">• {r}</p>
              ))}
            </div>
          )}

          {/* Editable fields */}
          <div className="space-y-4">
            {/* Date */}
            <div>
              <div className="text-[10px] font-bold text-gray-400 mb-1">DATE</div>
              {isEditing ? (
                <input
                  type="date"
                  value={dateValue}
                  onChange={(e) => setEditDoc((d) => ({ ...d, documentDate: new Date(e.target.value) }))}
                  className="w-full text-xs font-bold border-b-2 border-blue-300 focus:border-blue-600 outline-none py-0.5 bg-transparent"
                />
              ) : (
                <div className="text-xs font-bold">{format(document.documentDate, 'dd/MM/yyyy')}</div>
              )}
            </div>

            {/* Vendor */}
            <div>
              <div className="text-[10px] font-bold text-gray-400 mb-1">VENDOR</div>
              {isEditing ? (
                <input
                  value={editDoc.vendorName ?? ''}
                  onChange={(e) => setEditDoc((d) => ({ ...d, vendorName: e.target.value }))}
                  className="w-full text-xs font-bold border-b-2 border-blue-300 focus:border-blue-600 outline-none py-0.5 bg-transparent"
                />
              ) : (
                <div className="text-xs font-bold">{document.vendorName}</div>
              )}
            </div>

            {/* Place */}
            <div>
              <div className="text-[10px] font-bold text-gray-400 mb-1">PLACE</div>
              {isEditing ? (
                <input
                  value={editDoc.place ?? ''}
                  onChange={(e) => setEditDoc((d) => ({ ...d, place: e.target.value }))}
                  className="w-full text-xs font-bold border-b-2 border-blue-300 focus:border-blue-600 outline-none py-0.5 bg-transparent"
                  placeholder="—"
                />
              ) : (
                <div className="text-xs font-bold">{document.place ?? '—'}</div>
              )}
            </div>

            {/* Receipt # */}
            <div>
              <div className="text-[10px] font-bold text-gray-400 mb-1">RECEIPT NO.</div>
              {isEditing ? (
                <input
                  value={editDoc.receiptNumber ?? ''}
                  onChange={(e) => setEditDoc((d) => ({ ...d, receiptNumber: e.target.value }))}
                  className="w-full text-xs font-bold border-b-2 border-blue-300 focus:border-blue-600 outline-none py-0.5 bg-transparent"
                  placeholder="—"
                />
              ) : (
                <div className="text-xs font-bold">{document.receiptNumber ?? '—'}</div>
              )}
            </div>

            {/* Source & currency - read-only always */}
            <div>
              <div className="text-[10px] font-bold text-gray-400">SOURCE</div>
              <div className="text-xs font-bold">{document.source.replace('_', ' ')}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-400">CURRENCY</div>
              <div className="text-xs font-bold">{document.currency}</div>
            </div>

            {/* Notes */}
            {isEditing && (
              <div>
                <div className="text-[10px] font-bold text-gray-400 mb-1">NOTES</div>
                <textarea
                  value={editDoc.notes ?? ''}
                  onChange={(e) => setEditDoc((d) => ({ ...d, notes: e.target.value }))}
                  rows={2}
                  className="w-full text-xs border border-blue-300 focus:border-blue-600 outline-none p-1.5 bg-white resize-none"
                  placeholder="Optional notes..."
                />
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="border-t-2 border-black mt-4 pt-4 space-y-2">
            {/* Tax */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">Tax</span>
              {isEditing ? (
                <input
                  type="number"
                  value={editDoc.taxAmount ?? 0}
                  onChange={(e) => setEditDoc((d) => ({ ...d, taxAmount: parseFloat(e.target.value) || 0 }))}
                  className="w-24 text-right border-b border-blue-300 focus:border-blue-600 outline-none bg-transparent text-xs"
                />
              ) : (
                <span>฿{document.taxAmount?.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
              )}
            </div>
            {/* Service charge */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">Service Charge</span>
              {isEditing ? (
                <input
                  type="number"
                  value={editDoc.serviceCharge ?? 0}
                  onChange={(e) => setEditDoc((d) => ({ ...d, serviceCharge: parseFloat(e.target.value) || 0 }))}
                  className="w-24 text-right border-b border-blue-300 focus:border-blue-600 outline-none bg-transparent text-xs"
                />
              ) : (
                <span>฿{document.serviceCharge?.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
              )}
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-black pt-2 mt-2">
              <span>TOTAL</span>
              <span>฿{(isEditing ? computedTotal : document.total)?.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Receipt Image */}
          {hasImage && (
            <div className="mt-4">
              <div className="text-[10px] font-bold text-gray-400 mb-2">RECEIPT IMAGE</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={document.receiptImageUrl}
                alt="Receipt"
                className="w-full border-2 border-black object-contain max-h-48 cursor-pointer"
                onClick={() => window.open(document.receiptImageUrl, '_blank')}
              />
              <a
                href={document.receiptImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] mt-1 text-gray-400 hover:text-black"
              >
                <ExternalLink size={10} /> View full image
              </a>
            </div>
          )}
        </div>

        {/* ── Right: Line Items ── */}
        <div className="flex-1 p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold">{displayLines.length} LINE ITEM{displayLines.length !== 1 ? 'S' : ''}</p>
            <div className="flex items-center gap-3">
              {document.overallConfidence && (
                <span className="text-[10px] text-gray-400">
                  AI confidence: {Math.round(document.overallConfidence * 100)}%
                </span>
              )}
              {isEditing && (
                <button
                  onClick={addLine}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                >
                  <Plus size={12} /> ADD LINE
                </button>
              )}
            </div>
          </div>

          <div className="border-2 border-black overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-black text-white">
                  <th className="text-left px-3 py-2.5 font-bold">ITEM</th>
                  <th className="text-left px-3 py-2.5 font-bold">SKU</th>
                  <th className="text-left px-3 py-2.5 font-bold">CATEGORY</th>
                  <th className="text-right px-3 py-2.5 font-bold">BUY QTY</th>
                  <th className="text-left px-3 py-2.5 font-bold">UNIT</th>
                  <th className="text-right px-3 py-2.5 font-bold">BASE QTY</th>
                  <th className="text-left px-3 py-2.5 font-bold">BASE</th>
                  <th className="text-right px-3 py-2.5 font-bold">PRICE</th>
                  <th className="text-right px-3 py-2.5 font-bold">DISC</th>
                  <th className="text-right px-3 py-2.5 font-bold">TOTAL</th>
                  {isEditing && <th className="px-2 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {(isEditing ? editLines : lines).map((line, i) => {
                  if (isEditing && (line as EditLine)._deleted) return null;
                  const editLn = line as EditLine;
                  const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                  const rowBgEdit = 'bg-blue-50/30';

                  if (!isEditing) {
                    return (
                      <tr key={line.id} className={`border-t border-gray-200 ${rowBg}`}>
                        <td className="px-3 py-2.5">
                          <div className="font-bold">{line.skuName}</div>
                          {line.rawDescription && line.rawDescription !== line.skuName && (
                            <div className="text-[10px] text-gray-400 truncate max-w-40">{line.rawDescription}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {line.skuCode ? (
                            <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded font-mono">{line.skuCode}</span>
                          ) : (
                            <span className="text-[10px] text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-[10px]">{CATEGORY_LABELS[line.mainCategory] ?? line.mainCategory}</div>
                          <div className="text-[10px] text-gray-400">{SUB_CATEGORY_LABELS[line.subCategory] ?? line.subCategory}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">{line.purchaseQty?.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-gray-500">{line.purchaseUnit}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{line.baseQty?.toLocaleString('th-TH', { maximumFractionDigits: 3 })}</td>
                        <td className="px-3 py-2.5 text-gray-500">{line.baseUnit}</td>
                        <td className="px-3 py-2.5 text-right font-mono">฿{line.unitPrice?.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-red-500">{line.discount > 0 ? `-฿${line.discount.toFixed(2)}` : '—'}</td>
                        <td className="px-3 py-2.5 text-right font-bold font-mono">฿{line.finalAmount?.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  }

                  // EDIT MODE ROW
                  return (
                    <tr key={editLn.id} className={`border-t border-blue-100 ${rowBgEdit}`}>
                      {/* SKU selector */}
                      <td className="px-2 py-1.5">
                        <SKUCombobox
                          currentSkuId={editLn.skuId}
                          currentLabel={editLn.skuName}
                          skus={skus}
                          onSelect={(sku) => {
                            updateLine(i, {
                              skuId: sku.id,
                              skuCode: sku.code,
                              skuName: sku.name,
                              purchaseUnit: sku.purchaseUnit,
                              baseUnit: sku.baseUnit,
                              conversionFactor: sku.conversionFactor,
                              isNewSku: false,
                            });
                          }}
                          onClearToNew={() => updateLine(i, { skuId: undefined, skuCode: undefined, isNewSku: true })}
                        />
                      </td>
                      {/* SKU code */}
                      <td className="px-2 py-1.5">
                        <input
                          value={editLn.skuCode ?? ''}
                          onChange={(e) => updateLine(i, { skuCode: e.target.value || undefined })}
                          className="w-20 text-[10px] font-mono border-b border-blue-200 focus:border-blue-500 outline-none bg-transparent py-0.5"
                          placeholder="—"
                        />
                      </td>
                      {/* Category */}
                      <td className="px-2 py-1.5">
                        <select
                          value={editLn.subCategory}
                          onChange={(e) => {
                            const sub = e.target.value as ExpenseSubCategory;
                            const main = sub.split('_')[0] as ExpenseMainCategory;
                            updateLine(i, { subCategory: sub, mainCategory: main });
                          }}
                          className="text-[10px] border border-blue-200 focus:border-blue-500 outline-none bg-white py-0.5 max-w-32"
                        >
                          {ALL_SUB_CATEGORIES.map((sc) => (
                            <option key={sc} value={sc}>{SUB_CATEGORY_LABELS[sc]}</option>
                          ))}
                        </select>
                      </td>
                      {/* Purchase qty */}
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={editLn.purchaseQty}
                          onChange={(e) => updateLine(i, { purchaseQty: parseFloat(e.target.value) || 0 })}
                          className="w-16 text-right text-xs border-b border-blue-200 focus:border-blue-500 outline-none bg-transparent py-0.5"
                        />
                      </td>
                      {/* Purchase unit */}
                      <td className="px-2 py-1.5">
                        <select
                          value={editLn.purchaseUnit}
                          onChange={(e) => updateLine(i, { purchaseUnit: e.target.value as PurchaseUnit })}
                          className="text-[10px] border border-blue-200 focus:border-blue-500 outline-none bg-white py-0.5"
                        >
                          {PURCHASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      {/* Base qty */}
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={editLn.baseQty}
                          onChange={(e) => updateLine(i, { baseQty: parseFloat(e.target.value) || 0 })}
                          className="w-16 text-right text-xs border-b border-blue-200 focus:border-blue-500 outline-none bg-transparent py-0.5"
                        />
                      </td>
                      {/* Base unit */}
                      <td className="px-2 py-1.5">
                        <select
                          value={editLn.baseUnit}
                          onChange={(e) => updateLine(i, { baseUnit: e.target.value as BaseUnit })}
                          className="text-[10px] border border-blue-200 focus:border-blue-500 outline-none bg-white py-0.5"
                        >
                          {BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      {/* Unit price */}
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={editLn.unitPrice}
                          onChange={(e) => updateLine(i, { unitPrice: parseFloat(e.target.value) || 0 })}
                          className="w-20 text-right text-xs border-b border-blue-200 focus:border-blue-500 outline-none bg-transparent py-0.5"
                        />
                      </td>
                      {/* Discount */}
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={editLn.discount}
                          onChange={(e) => updateLine(i, { discount: parseFloat(e.target.value) || 0 })}
                          className="w-16 text-right text-xs border-b border-blue-200 focus:border-blue-500 outline-none bg-transparent py-0.5"
                        />
                      </td>
                      {/* Final amount (computed) */}
                      <td className="px-2 py-1.5 text-right font-bold text-xs font-mono text-blue-700">
                        ฿{editLn.finalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </td>
                      {/* Delete row */}
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => removeLine(i)}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black bg-gray-50">
                  <td colSpan={isEditing ? 9 : 9} className="px-3 py-2 text-right text-xs font-bold">TOTAL</td>
                  <td className="px-3 py-2 text-right font-bold font-mono">
                    ฿{(isEditing ? computedTotal : document.total).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  {isEditing && <td />}
                </tr>
              </tfoot>
            </table>
          </div>

          {isEditing && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'SAVING...' : 'SAVE ALL CHANGES'}
              </button>
              <button
                onClick={cancelEdit}
                className="px-6 py-3 border-2 border-gray-300 text-xs font-bold hover:border-black"
              >
                CANCEL
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
