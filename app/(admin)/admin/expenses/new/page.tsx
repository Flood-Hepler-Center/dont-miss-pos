'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { Select } from 'antd';
import { expenseDocumentService, expenseLineService, expenseStatsService } from '@/lib/services/expense.service';
import { useExpenseSKUs, useExpenseVendors } from '@/lib/hooks/useExpenses';
import type { ExpenseSubCategory, PurchaseUnit, BaseUnit, ExpenseSKU } from '@/types/expense';

const SUB_CATEGORIES: { value: ExpenseSubCategory; label: string; main: string }[] = [
  { value: 'capex_equipment', label: 'Equipment', main: 'CAPEX' },
  { value: 'capex_decor', label: 'Decor', main: 'CAPEX' },
  { value: 'capex_furniture', label: 'Furniture', main: 'CAPEX' },
  { value: 'capex_technology', label: 'Technology', main: 'CAPEX' },
  { value: 'capex_vehicle', label: 'Vehicle', main: 'CAPEX' },
  { value: 'capex_renovation', label: 'Renovation', main: 'CAPEX' },
  { value: 'inventory_food', label: 'Food Ingredient', main: 'INVENTORY' },
  { value: 'inventory_drinks', label: 'Drinks', main: 'INVENTORY' },
  { value: 'inventory_packaging', label: 'Packaging', main: 'INVENTORY' },
  { value: 'inventory_cleaning', label: 'Cleaning', main: 'INVENTORY' },
  { value: 'inventory_consumable', label: 'Consumable', main: 'INVENTORY' },
  { value: 'operating_staff', label: 'Staff Cost', main: 'OPERATING' },
  { value: 'operating_marketing', label: 'Marketing', main: 'OPERATING' },
  { value: 'operating_admin', label: 'Admin', main: 'OPERATING' },
  { value: 'utility_electric', label: 'Electricity', main: 'UTILITY' },
  { value: 'utility_water', label: 'Water', main: 'UTILITY' },
  { value: 'utility_gas', label: 'Gas', main: 'UTILITY' },
  { value: 'utility_internet', label: 'Internet', main: 'UTILITY' },
  { value: 'other', label: 'Other', main: 'OTHER' },
];

type LineFormItem = {
  skuId: string;
  skuCode: string;
  skuName: string;
  subCategory: ExpenseSubCategory;
  purchaseQty: number;
  purchaseUnit: PurchaseUnit;
  baseQty: number;
  baseUnit: BaseUnit;
  conversionFactor: number;
  lineTotal: number; // User enters this (total paid for the line)
  unitPrice: number; // Derived: lineTotal / purchaseQty
  subtotal: number;
  discount: number;
  finalAmount: number;
  notes: string;
};

const defaultLine = (): LineFormItem => ({
  skuId: '',
  skuCode: '',
  skuName: '',
  subCategory: 'inventory_food',
  purchaseQty: 1,
  purchaseUnit: 'unit',
  baseQty: 1,
  baseUnit: 'unit',
  conversionFactor: 1,
  lineTotal: 0, // Primary input
  unitPrice: 0, // Derived
  subtotal: 0,
  discount: 0,
  finalAmount: 0,
  notes: '',
});

function recalcLine(line: LineFormItem): LineFormItem {
  // Derive unitPrice from lineTotal (user enters total, not unit price)
  const unitPrice = line.purchaseQty > 0 ? line.lineTotal / line.purchaseQty : 0;
  const subtotal = line.lineTotal; // subtotal = total paid (before discount)
  const finalAmount = subtotal - line.discount;
  const baseQty = line.purchaseQty * line.conversionFactor;
  return { ...line, unitPrice, subtotal, finalAmount, baseQty };
}

function applySkuToLine(line: LineFormItem, sku: ExpenseSKU): LineFormItem {
  return recalcLine({
    ...line,
    skuId: sku.id,
    skuCode: sku.code,
    skuName: sku.name,
    subCategory: sku.subCategory,
    purchaseUnit: sku.purchaseUnit,
    baseUnit: sku.baseUnit,
    conversionFactor: sku.conversionFactor,
  });
}

export default function NewExpensePage() {
  const router = useRouter();
  const { skus } = useExpenseSKUs();
  const { vendors } = useExpenseVendors();

  const [vendorName, setVendorName] = useState('');
  const [place, setPlace] = useState('');
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [taxAmount, setTaxAmount] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineFormItem[]>([defaultLine()]);
  const [saving, setSaving] = useState(false);

  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const total = subtotal + taxAmount + serviceCharge;

  const addLine = useCallback(() => setLines((p) => [...p, defaultLine()]), []);
  const removeLine = useCallback((idx: number) => setLines((p) => p.filter((_, i) => i !== idx)), []);

  const updateLine = useCallback((idx: number, field: keyof LineFormItem, value: string | number) => {
    setLines((prev) => {
      const next = [...prev];
      const updated = { ...next[idx], [field]: value };
      next[idx] = recalcLine(updated);
      return next;
    });
  }, []);

  const selectSKU = useCallback((idx: number, skuId: string) => {
    const sku = skus.find((s) => s.id === skuId);
    if (!sku) return;
    setLines((prev) => {
      const next = [...prev];
      next[idx] = applySkuToLine(next[idx], sku);
      return next;
    });
  }, [skus]);

  const handleSave = useCallback(async (saveStatus: 'draft' | 'confirmed') => {
    if (!vendorName) { alert('Vendor name is required'); return; }
    if (lines.some((l) => !l.skuName)) { alert('All lines need an item name'); return; }

    setSaving(true);
    try {
      const documentId = await expenseDocumentService.create({
        documentDate: new Date(documentDate),
        vendorName,
        place: place || vendorName,
        source: 'manual',
        receiptNumber: receiptNumber || undefined,
        subtotal,
        taxAmount,
        serviceCharge,
        total,
        currency: 'THB',
        isAiExtracted: false,
        requiresReview: false,
      });

      const docDate = new Date(documentDate);
      await expenseLineService.bulkCreate(
        lines.map((l) => ({
          documentId,
          skuId: l.skuId || undefined,
          skuCode: l.skuCode || undefined,
          skuName: l.skuName,
          mainCategory: (l.subCategory.split('_')[0] ?? 'other') as 'capex' | 'inventory' | 'operating' | 'utility',
          subCategory: l.subCategory,
          purchaseQty: l.purchaseQty,
          purchaseUnit: l.purchaseUnit,
          baseQty: l.baseQty,
          baseUnit: l.baseUnit,
          conversionFactor: l.conversionFactor,
          unitPrice: l.unitPrice,
          subtotal: l.subtotal,
          discount: l.discount,
          finalAmount: l.finalAmount,
          isAiExtracted: false,
          isNewSku: !l.skuId,
          documentDate: docDate,
          vendorName,
          place: place || vendorName,
          notes: l.notes || undefined,
        }))
      );

      if (saveStatus === 'confirmed') {
        const savedLines = await expenseLineService.getByDocumentId(documentId);
        await expenseStatsService.updateSKUCostAfterConfirm(savedLines);
        await expenseDocumentService.confirm(documentId, 'admin');
      }

      router.push(`/admin/expenses/${documentId}`);
    } finally {
      setSaving(false);
    }
  }, [vendorName, place, documentDate, receiptNumber, taxAmount, serviceCharge, total, subtotal, lines, router]);

  return (
    <div className="min-h-screen bg-white font-mono">
      <div className="border-b-2 border-black p-4 flex items-center gap-4">
        <button onClick={() => router.push('/admin/expenses')} className="p-1.5 hover:bg-gray-100">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-lg font-bold">NEW EXPENSE ENTRY</h1>
          <p className="text-[10px] text-gray-500">Manual entry — CAPEX / Inventory / Operating / Utility</p>
        </div>
      </div>

      <div className="p-6">
        {/* Header Info */}
        <div className="border-2 border-black p-4 mb-6">
          <p className="text-[10px] font-bold text-gray-500 mb-3">EXPENSE HEADER</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 block mb-1">DATE *</label>
              <input
                type="date"
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
                className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 block mb-1">VENDOR / SUPPLIER *</label>
              <input
                list="vendor-list"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="e.g. Makro, Local market"
                className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
              />
              <datalist id="vendor-list">
                {vendors.map((v) => <option key={v.id} value={v.name} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 block mb-1">PLACE / BRANCH</label>
              <input
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="Branch or location"
                className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 block mb-1">RECEIPT NO.</label>
              <input
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                placeholder="Optional"
                className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 block mb-1">TAX (฿)</label>
              <input
                type="number"
                value={taxAmount}
                onChange={(e) => setTaxAmount(parseFloat(e.target.value) || 0)}
                className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 block mb-1">SERVICE CHARGE (฿)</label>
              <input
                type="number"
                value={serviceCharge}
                onChange={(e) => setServiceCharge(parseFloat(e.target.value) || 0)}
                className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-[10px] font-bold text-gray-500 block mb-1">NOTES</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border-2 border-black px-3 py-2 text-sm font-mono resize-none"
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="border-2 border-black mb-6">
          <div className="flex items-center justify-between p-3 border-b-2 border-black bg-gray-50">
            <p className="text-[10px] font-bold">LINE ITEMS ({lines.length})</p>
            <button
              onClick={addLine}
              className="flex items-center gap-1 px-3 py-1.5 bg-black text-white text-[10px] font-bold hover:bg-gray-800"
            >
              <Plus size={10} /> ADD LINE
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-3 py-2 font-bold min-w-48">SKU / ITEM</th>
                  <th className="text-left px-3 py-2 font-bold min-w-36">CATEGORY</th>
                  <th className="text-right px-3 py-2 font-bold min-w-20">BUY QTY</th>
                  <th className="text-left px-3 py-2 font-bold min-w-16">UNIT</th>
                  <th className="text-right px-3 py-2 font-bold min-w-24">CONV. FACTOR</th>
                  <th className="text-right px-3 py-2 font-bold min-w-20">BASE QTY</th>
                  <th className="text-left px-3 py-2 font-bold min-w-16">BASE</th>
                  <th className="text-right px-3 py-2 font-bold min-w-24">TOTAL (฿) *</th>
                  <th className="text-right px-3 py-2 font-bold min-w-20">DISC (฿)</th>
                  <th className="text-right px-3 py-2 font-bold min-w-20 text-gray-400">UNIT ฿</th>
                  <th className="text-right px-3 py-2 font-bold min-w-24">FINAL (฿)</th>
                  <th className="px-3 py-2 min-w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className={`border-t border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-3 py-2">
                      <Select
                        value={line.skuId || undefined}
                        onChange={(value) => selectSKU(idx, value)}
                        placeholder="Search SKU..."
                        showSearch
                        optionFilterProp="label"
                        className="w-full mb-1"
                        size="small"
                        style={{ width: '100%' }}
                        options={skus.map((s) => ({
                          value: s.id,
                          label: `[${s.code}] ${s.name}${s.purchaseUnitLabel ? ` (${s.purchaseUnitLabel})` : ''}`,
                        }))}
                      />
                      <input
                        value={line.skuName}
                        onChange={(e) => updateLine(idx, 'skuName', e.target.value)}
                        placeholder="Or enter custom item name"
                        className="w-full border border-gray-200 px-2 py-1 text-xs font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={line.subCategory}
                        onChange={(e) => updateLine(idx, 'subCategory', e.target.value)}
                        className="w-full border border-gray-200 px-2 py-1 text-xs font-mono"
                      >
                        {SUB_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.main}: {c.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={line.purchaseQty}
                        onChange={(e) => updateLine(idx, 'purchaseQty', parseFloat(e.target.value) || 0)}
                        className="w-full border-2 border-black px-2 py-1 text-xs font-mono text-right font-bold"
                      />
                      {line.conversionFactor > 1 && (
                        <div className="text-[9px] text-gray-400 mt-0.5">
                          = {line.baseQty.toLocaleString('th-TH', { maximumFractionDigits: 1 })} {line.baseUnit}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs">{line.purchaseUnit}</div>
                      {line.conversionFactor > 1 && (
                        <div className="text-[9px] text-gray-400">×{line.conversionFactor}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={line.conversionFactor}
                        onChange={(e) => updateLine(idx, 'conversionFactor', parseFloat(e.target.value) || 1)}
                        className="w-full border border-gray-200 px-2 py-1 text-xs font-mono text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-500 text-[10px]">
                      {line.baseQty.toLocaleString('th-TH', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs text-gray-600">{line.baseUnit}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={line.lineTotal}
                        onChange={(e) => updateLine(idx, 'lineTotal', parseFloat(e.target.value) || 0)}
                        className="w-full border-2 border-black px-2 py-1 text-xs font-mono text-right font-bold"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={line.discount}
                        onChange={(e) => updateLine(idx, 'discount', parseFloat(e.target.value) || 0)}
                        className="w-full border border-gray-200 px-2 py-1 text-xs font-mono text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-400 text-[10px]">
                      {line.unitPrice > 0 ? line.unitPrice.toLocaleString('th-TH', { maximumFractionDigits: 2 }) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold font-mono">
                      ฿{line.finalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2">
                      {lines.length > 1 && (
                        <button
                          onClick={() => removeLine(idx)}
                          className="p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black bg-gray-50">
                  <td colSpan={9} className="px-3 py-2 text-right text-xs font-bold">SUBTOTAL</td>
                  <td className="px-3 py-2 text-right font-bold font-mono">฿{subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                  <td />
                </tr>
                <tr className="bg-gray-50">
                  <td colSpan={9} className="px-3 py-1 text-right text-xs text-gray-500">TAX</td>
                  <td className="px-3 py-1 text-right font-mono text-gray-500">฿{taxAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                  <td />
                </tr>
                {serviceCharge > 0 && (
                  <tr className="bg-gray-50">
                    <td colSpan={9} className="px-3 py-1 text-right text-xs text-gray-500">SERVICE CHARGE</td>
                    <td className="px-3 py-1 text-right font-mono text-gray-500">฿{serviceCharge.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                    <td />
                  </tr>
                )}
                <tr className="border-t border-black bg-black text-white">
                  <td colSpan={9} className="px-3 py-2 text-right text-sm font-bold">GRAND TOTAL</td>
                  <td className="px-3 py-2 text-right font-bold font-mono text-sm">฿{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => router.push('/admin/expenses')}
            className="px-6 py-3 border-2 border-gray-300 text-xs font-bold hover:border-black text-gray-500"
          >
            CANCEL
          </button>
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="px-6 py-3 border-2 border-black text-xs font-bold hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : 'SAVE AS DRAFT'}
          </button>
          <button
            onClick={() => handleSave('confirmed')}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-black text-white text-xs font-bold hover:bg-gray-800 disabled:bg-gray-400"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            SAVE & CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
}
