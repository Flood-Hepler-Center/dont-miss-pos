'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Search, Edit2, Trash2, Package, X, Save, RefreshCw, AlertCircle, History } from 'lucide-react';
import { useExpenseSKUs } from '@/lib/hooks/useExpenses';
import type { ExpenseSKU, ExpenseSubCategory, PurchaseUnit, BaseUnit, ExpenseMainCategory } from '@/types/expense';
import { SKUHistoryModal } from './_components/sku-history-modal';

const SUB_CATEGORIES: { value: ExpenseSubCategory; label: string; main: ExpenseMainCategory }[] = [
  { value: 'capex_equipment', label: 'Equipment', main: 'capex' },
  { value: 'capex_decor', label: 'Decor', main: 'capex' },
  { value: 'capex_furniture', label: 'Furniture', main: 'capex' },
  { value: 'capex_technology', label: 'Technology', main: 'capex' },
  { value: 'capex_vehicle', label: 'Vehicle', main: 'capex' },
  { value: 'capex_renovation', label: 'Renovation', main: 'capex' },
  { value: 'inventory_food', label: 'Food Ingredient', main: 'inventory' },
  { value: 'inventory_drinks', label: 'Drinks', main: 'inventory' },
  { value: 'inventory_packaging', label: 'Packaging', main: 'inventory' },
  { value: 'inventory_cleaning', label: 'Cleaning', main: 'inventory' },
  { value: 'inventory_consumable', label: 'Consumable', main: 'inventory' },
  { value: 'operating_staff', label: 'Staff Cost', main: 'operating' },
  { value: 'operating_marketing', label: 'Marketing', main: 'operating' },
  { value: 'operating_admin', label: 'Admin', main: 'operating' },
  { value: 'utility_electric', label: 'Electricity', main: 'utility' },
  { value: 'utility_water', label: 'Water', main: 'utility' },
  { value: 'utility_gas', label: 'Gas', main: 'utility' },
  { value: 'utility_internet', label: 'Internet', main: 'utility' },
  { value: 'other', label: 'Other', main: 'operating' },
];

const PURCHASE_UNITS: PurchaseUnit[] = ['kg', 'g', 'L', 'ml', 'pack', 'box', 'case', 'bottle', 'can', 'bag', 'unit', 'piece', 'roll', 'sheet', 'set'];
const BASE_UNITS: BaseUnit[] = ['g', 'ml', 'unit', 'piece', 'sheet', 'roll', 'cm', 'sqm'];

const CATEGORY_COLORS: Record<string, string> = {
  capex: 'bg-purple-100 text-purple-700',
  inventory: 'bg-green-100 text-green-700',
  operating: 'bg-blue-100 text-blue-700',
  utility: 'bg-orange-100 text-orange-700',
};

type SKUFormData = {
  name: string;
  nameTh: string;
  mainCategory: ExpenseMainCategory;
  subCategory: ExpenseSubCategory;
  baseUnit: BaseUnit;
  purchaseUnit: PurchaseUnit;
  purchaseSize: number;
  purchaseUnitLabel: string;
  conversionFactor: number;
  notes: string;
};

const defaultForm = (): SKUFormData => ({
  name: '',
  nameTh: '',
  mainCategory: 'inventory',
  subCategory: 'inventory_food',
  baseUnit: 'g',
  purchaseUnit: 'kg',
  purchaseSize: 0,
  purchaseUnitLabel: '',
  conversionFactor: 1000,
  notes: '',
});

export default function SKUCatalogPage() {
  const router = useRouter();
  const { skus, loading, createSKU, updateSKU, deleteSKU } = useExpenseSKUs();
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseMainCategory | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [editingSKU, setEditingSKU] = useState<ExpenseSKU | null>(null);
  const [formData, setFormData] = useState<SKUFormData>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncResult, setSyncResult] = useState<{ fixedLinesCount: number; updatedSkusCount: number } | null>(null);
  const [historySku, setHistorySku] = useState<ExpenseSKU | null>(null);

  const filtered = skus.filter((s) => {
    const q = searchText.toLowerCase();
    const matchText = !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || (s.nameTh ?? '').toLowerCase().includes(q);
    const matchCat = !categoryFilter || s.mainCategory === categoryFilter;
    return matchText && matchCat;
  });

  const openCreate = useCallback(() => {
    setEditingSKU(null);
    setFormData(defaultForm());
    setShowForm(true);
  }, []);

  const openEdit = useCallback((sku: ExpenseSKU) => {
    setEditingSKU(sku);
    setFormData({
      name: sku.name,
      nameTh: sku.nameTh ?? '',
      mainCategory: sku.mainCategory,
      subCategory: sku.subCategory,
      baseUnit: sku.baseUnit,
      purchaseUnit: sku.purchaseUnit,
      purchaseSize: sku.purchaseSize ?? 0,
      purchaseUnitLabel: sku.purchaseUnitLabel ?? '',
      conversionFactor: sku.conversionFactor,
      notes: sku.notes ?? '',
    });
    setShowForm(true);
  }, []);

  const handleSubCategoryChange = useCallback((sub: ExpenseSubCategory) => {
    const mainCat = SUB_CATEGORIES.find((c) => c.value === sub)?.main ?? 'other';
    setFormData((p) => ({ ...p, subCategory: sub, mainCategory: mainCat as ExpenseMainCategory }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.name) { alert('Item name is required'); return; }
    setSaving(true);
    try {
      if (editingSKU) {
        await updateSKU(editingSKU.id, {
          name: formData.name,
          nameTh: formData.nameTh || undefined,
          mainCategory: formData.mainCategory,
          subCategory: formData.subCategory,
          baseUnit: formData.baseUnit,
          purchaseUnit: formData.purchaseUnit,
          purchaseSize: formData.purchaseSize || undefined,
          purchaseUnitLabel: formData.purchaseUnitLabel || undefined,
          conversionFactor: formData.conversionFactor,
          notes: formData.notes || undefined,
        });
      } else {
        await createSKU({
          name: formData.name,
          nameTh: formData.nameTh || undefined,
          mainCategory: formData.mainCategory,
          subCategory: formData.subCategory,
          baseUnit: formData.baseUnit,
          purchaseUnit: formData.purchaseUnit,
          purchaseSize: formData.purchaseSize || undefined,
          purchaseUnitLabel: formData.purchaseUnitLabel || undefined,
          conversionFactor: formData.conversionFactor,
          notes: formData.notes || undefined,
          isActive: true,
        });
      }
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }, [formData, editingSKU, createSKU, updateSKU]);

  const handleDelete = useCallback(async (sku: ExpenseSKU) => {
    if (!confirm(`Delete SKU [${sku.code}] ${sku.name}?`)) return;
    await deleteSKU(sku.id);
  }, [deleteSKU]);

  const handleGlobalSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/expenses/skus/sync', { method: 'POST' });
      if (!res.ok) throw new Error('Sync failed');
      const data = await res.json();
      setSyncResult(data);
    } catch (err) {
      alert('Error during global sync. Please try again.');
      setSyncModalOpen(false);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-white font-mono">
      <div className="border-b-2 border-black p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin/expenses')} className="p-1.5 hover:bg-gray-100">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Package size={18} /> SKU CATALOG
            </h1>
          <p className="text-[10px] text-gray-500">Master item list — same SKU across all expenses</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { setSyncResult(null); setSyncModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 border-2 border-black text-xs font-bold hover:bg-gray-50"
        >
          <RefreshCw size={14} /> RE-SYNC CALCULATIONS
        </button>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-black text-white text-xs font-bold hover:bg-gray-800"
        >
          <Plus size={14} /> NEW SKU
        </button>
      </div>
    </div>

      {/* Stats */}
      <div className="grid grid-cols-5 border-b-2 border-black">
        {[
          { label: 'ALL', value: skus.length, filter: '' },
          { label: 'CAPEX', value: skus.filter((s) => s.mainCategory === 'capex').length, filter: 'capex' },
          { label: 'INVENTORY', value: skus.filter((s) => s.mainCategory === 'inventory').length, filter: 'inventory' },
          { label: 'OPERATING', value: skus.filter((s) => s.mainCategory === 'operating').length, filter: 'operating' },
          { label: 'UTILITY', value: skus.filter((s) => s.mainCategory === 'utility').length, filter: 'utility' },
        ].map((item) => (
          <button
            key={item.filter}
            onClick={() => setCategoryFilter(item.filter as ExpenseMainCategory | '')}
            className={`p-4 text-left border-r border-gray-200 hover:bg-gray-50 transition-colors ${categoryFilter === item.filter ? 'bg-black text-white' : ''}`}
          >
            <div className={`text-[10px] font-bold ${categoryFilter === item.filter ? 'text-gray-300' : 'text-gray-500'}`}>{item.label}</div>
            <div className="text-xl font-bold mt-1">{item.value}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-4 border-b-2 border-black">
        <div className="relative max-w-sm">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="Search by name or SKU code..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full border-2 border-black pl-8 pr-3 py-2 text-xs font-mono"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {filtered.length === 0 && !loading ? (
          <div className="p-16 text-center">
            <Package size={32} className="mx-auto mb-4 text-gray-200" />
            <p className="text-sm font-bold text-gray-400">NO SKUs FOUND</p>
            <button onClick={openCreate} className="mt-4 px-4 py-2 bg-black text-white text-xs font-bold">
              CREATE FIRST SKU
            </button>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-black bg-gray-50">
                <th className="text-left px-4 py-3 font-bold border-r border-gray-200">CODE</th>
                <th className="text-left px-4 py-3 font-bold border-r border-gray-200">ITEM NAME</th>
                <th className="text-left px-4 py-3 font-bold border-r border-gray-200">CATEGORY</th>
                <th className="text-left px-4 py-3 font-bold border-r border-gray-200">PURCHASE UNIT</th>
                <th className="text-right px-4 py-3 font-bold border-r border-gray-200">CONV. FACTOR</th>
                <th className="text-left px-4 py-3 font-bold border-r border-gray-200">BASE UNIT</th>
                <th className="text-right px-4 py-3 font-bold border-r border-gray-200">AVG COST/BASE</th>
                <th className="text-right px-4 py-3 font-bold border-r border-gray-200">TOTAL PURCHASED</th>
                <th className="text-center px-4 py-3 font-bold">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sku, i) => (
                <tr key={sku.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-3 border-r border-gray-100">
                    <span className="font-mono font-bold text-xs bg-gray-100 px-2 py-0.5 rounded">{sku.code}</span>
                  </td>
                  <td className="px-4 py-3 border-r border-gray-100">
                    <div className="font-bold">{sku.name}</div>
                    {sku.nameTh && <div className="text-[10px] text-gray-400">{sku.nameTh}</div>}
                    {sku.notes && <div className="text-[10px] text-gray-300 truncate max-w-48">{sku.notes}</div>}
                  </td>
                  <td className="px-4 py-3 border-r border-gray-100">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${CATEGORY_COLORS[sku.mainCategory] ?? 'bg-gray-100 text-gray-600'}`}>
                      {sku.mainCategory.toUpperCase()}
                    </span>
                    <div className="text-[10px] text-gray-400 mt-1">{sku.subCategory.replace('_', ' ')}</div>
                  </td>
                  <td className="px-4 py-3 border-r border-gray-100">
                    <div className="font-mono">{sku.purchaseUnitLabel || sku.purchaseUnit}</div>
                    {sku.purchaseUnitLabel && <div className="text-[10px] text-gray-400">{sku.purchaseUnit}</div>}
                  </td>
                  <td className="px-4 py-3 border-r border-gray-100 text-right font-mono">×{sku.conversionFactor.toLocaleString()}</td>
                  <td className="px-4 py-3 border-r border-gray-100 font-mono text-gray-600">{sku.baseUnit}</td>
                  <td className="px-4 py-3 border-r border-gray-100 text-right font-mono">
                    {sku.averageUnitCost > 0
                      ? `฿${sku.averageUnitCost.toLocaleString('th-TH', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 border-r border-gray-100 text-right font-mono">
                    {sku.totalPurchasedQty > 0
                      ? `${sku.totalPurchasedQty.toLocaleString('th-TH', { maximumFractionDigits: 2 })} ${sku.baseUnit}`
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setHistorySku(sku)} className="p-1.5 hover:bg-gray-100 rounded text-blue-600" title="View Transaction History">
                        <History size={12} />
                      </button>
                      <button onClick={() => openEdit(sku)} className="p-1.5 hover:bg-gray-100 rounded" title="Edit Master SKU">
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => handleDelete(sku)} className="p-1.5 hover:bg-red-50 text-red-500 rounded" title="Delete SKU">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* SKU Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="border-b-2 border-black p-4 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-sm font-bold">{editingSKU ? 'EDIT SKU' : 'NEW SKU'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {editingSKU && (
                <div className="bg-gray-50 border border-gray-200 px-3 py-2">
                  <span className="text-[10px] text-gray-400">SKU CODE: </span>
                  <span className="text-sm font-bold font-mono">{editingSKU.code}</span>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">ITEM NAME (ENGLISH) *</label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Sugar"
                  className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">ITEM NAME (THAI)</label>
                <input
                  value={formData.nameTh}
                  onChange={(e) => setFormData((p) => ({ ...p, nameTh: e.target.value }))}
                  placeholder="e.g. น้ำตาล"
                  className="w-full border-2 border-black px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">SUB-CATEGORY *</label>
                <select
                  value={formData.subCategory}
                  onChange={(e) => handleSubCategoryChange(e.target.value as ExpenseSubCategory)}
                  className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
                >
                  {SUB_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.main.toUpperCase()}: {c.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">PURCHASE UNIT *</label>
                  <select
                    value={formData.purchaseUnit}
                    onChange={(e) => setFormData((p) => ({ ...p, purchaseUnit: e.target.value as PurchaseUnit }))}
                    className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
                  >
                    {PURCHASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">BASE UNIT *</label>
                  <select
                    value={formData.baseUnit}
                    onChange={(e) => setFormData((p) => ({ ...p, baseUnit: e.target.value as BaseUnit }))}
                    className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
                  >
                    {BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">
                    PURCHASE SIZE
                    <span className="ml-1 text-gray-400 font-normal">(e.g., 5 for 5kg)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={formData.purchaseSize}
                    onChange={(e) => setFormData((p) => ({ ...p, purchaseSize: parseFloat(e.target.value) || 0 }))}
                    className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-1">
                    UNIT LABEL
                    <span className="ml-1 text-gray-400 font-normal">(display)</span>
                  </label>
                  <input
                    value={formData.purchaseUnitLabel}
                    onChange={(e) => setFormData((p) => ({ ...p, purchaseUnitLabel: e.target.value }))}
                    className="w-full border-2 border-black px-3 py-2 text-sm"
                    placeholder="e.g., 5kg bottle"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">
                  CONVERSION FACTOR *
                  <span className="ml-2 text-gray-400 font-normal">
                    (1 {formData.purchaseUnit} = ? {formData.baseUnit})
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={formData.conversionFactor}
                  onChange={(e) => setFormData((p) => ({ ...p, conversionFactor: parseFloat(e.target.value) || 1 }))}
                  className="w-full border-2 border-black px-3 py-2 text-sm font-mono"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  e.g. Buy 1 kg → base unit g → factor = 1000 | Buy 1 L → base unit ml → factor = 1000
                </p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 block mb-1">NOTES</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full border-2 border-black px-3 py-2 text-sm font-mono resize-none"
                />
              </div>
            </div>

            <div className="border-t-2 border-black p-4 flex gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 border-2 border-gray-300 text-xs font-bold text-gray-500 hover:border-black">
                CANCEL
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-black text-white text-xs font-bold hover:bg-gray-800 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                <Save size={12} /> {saving ? 'SAVING...' : editingSKU ? 'UPDATE SKU' : 'CREATE SKU'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Modal */}
      {syncModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black w-full max-w-md shadow-2xl">
            <div className="border-b-2 border-black p-4 flex items-center justify-between">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <RefreshCw size={16} className={isSyncing ? "animate-spin text-blue-600" : ""} /> 
                {syncResult ? "SYNC COMPLETE" : "GLOBAL SKU RE-SYNC"}
              </h2>
              {(!isSyncing) && (
                <button onClick={() => setSyncModalOpen(false)} className="p-1 hover:bg-gray-100">
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="p-6 space-y-4">
              {!syncResult ? (
                <>
                  <p className="text-xs">
                    This powerful background tool ensures 100% data continuity by cross-checking all historical entries.
                  </p>
                  <ul className="text-[10px] space-y-2 text-gray-600 list-disc pl-4 font-mono">
                    <li>Scans every confirmed expense document on record.</li>
                    <li>Checks every individual expense line unit definition.</li>
                    <li><strong className="text-black">If an historical line has a mismatched Unit or Factor, it modifies that specific line silently to match the master SKU's current settings.</strong></li>
                    <li>Recalculates the "TOTAL PURCHASED" and "AVG COST/BASE" entirely from scratch for every unit.</li>
                  </ul>
                  
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 flex gap-2">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-yellow-600" />
                    <span className="text-[10px] leading-tight font-bold">
                      Warning: If you recently altered a master SKU unit (e.g. from Bottle to Litre), this WILL update your historical lines and totals logic to enforce Litres globally.
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center py-4 space-y-4">
                  <p className="text-sm font-bold text-green-600">Calculations successfully resynchronized.</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 border border-gray-200 p-3 rounded">
                      <div className="font-bold text-xl">{syncResult.updatedSkusCount}</div>
                      <div className="text-[10px] text-gray-500">SKUs Recalculated</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 p-3 rounded">
                      <div className="font-bold text-xl">{syncResult.fixedLinesCount}</div>
                      <div className="text-[10px] text-gray-500">Mismatched Lines Fixed</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t-2 border-black p-4 bg-gray-50">
              {syncResult ? (
                <button
                  onClick={() => setSyncModalOpen(false)}
                  className="w-full py-2 bg-black text-white text-xs font-bold"
                >
                  CLOSE & RELOAD
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setSyncModalOpen(false)}
                    disabled={isSyncing}
                    className="flex-1 py-2 border-2 border-gray-300 text-xs font-bold text-gray-600 hover:border-black disabled:opacity-50"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleGlobalSync}
                    disabled={isSyncing}
                    className="flex-1 py-2 bg-black text-white text-xs font-bold hover:bg-gray-800 disabled:opacity-50"
                  >
                    {isSyncing ? "SYNCING..." : "PROCEED"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historySku && (
        <SKUHistoryModal
          sku={historySku}
          onClose={() => setHistorySku(null)}
        />
      )}
    </div>
  );
}
