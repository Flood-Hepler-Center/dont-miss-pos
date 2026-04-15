/* eslint-disable no-console */
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Eye,
  Bot,
  ImageIcon,
  Loader2,
  Zap,
  ShieldCheck,
  ScanText,
  Tags,
  ClipboardList,
  Trash2,
  Plus,
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useExpenseAI } from '@/lib/hooks/useExpenseAI';
import { useExpenseSKUs } from '@/lib/hooks/useExpenses';
import { expenseDocumentService, expenseLineService, expenseStatsService, expenseSKUService } from '@/lib/services/expense.service';
import type {
  AIPipelineStep,
  AIPipelineStepResult,
  AIFinalLine,
  AIExpenseFinalizerResult,
  ExpenseSubCategory,
  PurchaseUnit,
  BaseUnit,
  ExpenseSKU,
} from '@/types/expense';

// ─── Step metadata ──────────────────────────────────────────────────────────

const STEP_META: Record<AIPipelineStep, { label: string; desc: string; icon: React.ReactNode }> = {
  bill_validator: { label: 'Bill Validator', desc: 'Checking if this is a valid bill or receipt', icon: <ShieldCheck size={14} /> },
  quality_assessor: { label: 'Quality Check', desc: 'Assessing image quality for OCR readiness', icon: <Eye size={14} /> },
  ocr_extractor: { label: 'OCR Extractor', desc: 'Reading and structuring all receipt text', icon: <ScanText size={14} /> },
  sku_matcher: { label: 'SKU Matcher', desc: 'Matching items to your product catalog', icon: <Tags size={14} /> },
  expense_finalizer: { label: 'Expense Builder', desc: 'Building the final structured expense record', icon: <ClipboardList size={14} /> },
};

const STEP_ORDER: AIPipelineStep[] = ['bill_validator', 'quality_assessor', 'ocr_extractor', 'sku_matcher', 'expense_finalizer'];

// ─── StepIndicator ──────────────────────────────────────────────────────────

function StepIndicator({ step, result }: { step: AIPipelineStep; result?: AIPipelineStepResult }) {
  const meta = STEP_META[step];
  const status = result?.status ?? 'pending';
  const bgColor = status === 'done' ? 'bg-green-50 border-green-200' : status === 'running' ? 'bg-blue-50 border-blue-300 animate-pulse' : status === 'failed' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200';
  const iconColor = status === 'done' ? 'text-green-600' : status === 'running' ? 'text-blue-600' : status === 'failed' ? 'text-red-600' : 'text-gray-300';

  return (
    <div className={`flex items-start gap-2 p-2.5 border rounded-lg transition-all ${bgColor}`}>
      <div className={`flex-shrink-0 mt-0.5 ${iconColor}`}>
        {status === 'running' ? <Loader2 size={14} className="animate-spin" /> : status === 'done' ? <CheckCircle size={14} className="text-green-600" /> : status === 'failed' ? <XCircle size={14} className="text-red-600" /> : meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={`text-[11px] font-bold truncate ${status === 'pending' ? 'text-gray-400' : 'text-gray-800'}`}>{meta.label}</span>
          {result?.durationMs && <span className="text-[10px] text-gray-400 flex-shrink-0">{result.durationMs}ms</span>}
        </div>
        <p className={`text-[10px] mt-0.5 ${status === 'pending' ? 'text-gray-300' : 'text-gray-500'}`}>
          {status === 'running' ? meta.desc : status === 'done' && result?.result ? renderStepSummary(step, result.result) : status === 'failed' ? (result?.error ?? 'Failed') : meta.desc}
        </p>
        {result?.outputTokens && <span className="text-[10px] text-gray-300">{result.inputTokens}→{result.outputTokens} tokens</span>}
      </div>
    </div>
  );
}

function renderStepSummary(step: AIPipelineStep, result: unknown): string {
  try {
    const r = result as Record<string, unknown>;
    if (step === 'bill_validator') return `✓ ${String(r.document_type).toUpperCase()} (${Math.round(Number(r.confidence) * 100)}%) — ${String(r.visible_merchant ?? 'Unknown')}`;
    if (step === 'quality_assessor') return `✓ Quality: ${String(r.overall_quality).toUpperCase()} — OCR ${Math.round(Number(r.ocr_confidence) * 100)}%`;
    if (step === 'ocr_extractor') { const items = (r.line_items as unknown[]) ?? []; return `✓ ${items.length} items — ${String((r.vendor as Record<string, unknown>)?.name ?? 'unknown')} — ฿${Number(r.total).toLocaleString()}`; }
    if (step === 'sku_matcher') { const m = (r.matches as unknown[]) ?? []; const n = (r.matches as Array<Record<string, unknown>>).filter(x => x.is_new_sku).length; return `✓ ${m.length} matched — ${n} new SKU${n !== 1 ? 's' : ''}`; }
    if (step === 'expense_finalizer') { const l = (r.lines as unknown[]) ?? []; return `✓ ${l.length} lines — ฿${Number(r.total).toLocaleString()} — ${Math.round(Number(r.confidence_score) * 100)}%`; }
  } catch { /* */ }
  return 'Completed';
}

// ─── SKU Combobox ───────────────────────────────────────────────────────────

function SKUCombobox({ currentSkuId, currentLabel, skus, onSelect, onClearToNew }: {
  currentSkuId: string | null;
  currentLabel: string;
  skus: ExpenseSKU[];
  onSelect: (sku: ExpenseSKU) => void;
  onClearToNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayValue = open ? search : (currentSkuId ? `${skus.find(s => s.id === currentSkuId)?.code ?? ''} ${currentLabel}`.trim() : currentLabel);

  const filtered = skus.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase()) ||
    (s.nameTh ?? '').includes(search)
  ).slice(0, 8);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        value={displayValue}
        onFocus={() => { setSearch(''); setOpen(true); }}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search SKU..."
        className="w-full min-w-32 text-[11px] bg-transparent border-b border-blue-200 focus:border-blue-600 outline-none py-0.5 font-bold truncate"
      />
      {open && (
        <div className="absolute top-full left-0 z-50 w-72 bg-white border border-gray-200 shadow-xl rounded max-h-48 overflow-y-auto">
          <div
            className="px-2 py-1.5 text-[10px] text-yellow-700 bg-yellow-50 cursor-pointer hover:bg-yellow-100 font-bold border-b border-yellow-200 flex items-center gap-1"
            onMouseDown={(e) => { e.preventDefault(); onClearToNew(); setOpen(false); setSearch(''); }}
          >
            <span className="text-yellow-500">★</span> NEW SKU (create on save)
          </div>
          {filtered.map(sku => (
            <div
              key={sku.id}
              className="px-2 py-1.5 text-[10px] cursor-pointer hover:bg-blue-50 border-t border-gray-100 flex gap-2 items-center"
              onMouseDown={(e) => { e.preventDefault(); onSelect(sku); setOpen(false); setSearch(''); }}
            >
              <span className="font-mono text-gray-400 flex-shrink-0">{sku.code}</span>
              <span className="truncate font-bold">{sku.name}</span>
              <span className="ml-auto flex-shrink-0 text-[9px] text-gray-400">{sku.purchaseUnit}/{sku.baseUnit}</span>
            </div>
          ))}
          {filtered.length === 0 && search && (
            <div className="px-2 py-2 text-[10px] text-gray-400 text-center">No SKUs match &quot;{search}&quot;</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

type EditableLine = AIFinalLine & { _dirty?: boolean; _deleted?: boolean };

const ALL_SUB_CATEGORIES: string[][] = [
  ['inventory_food', 'Food Ingredient'], ['inventory_drinks', 'Drinks'], ['inventory_packaging', 'Packaging'],
  ['inventory_cleaning', 'Cleaning'], ['inventory_consumable', 'Consumable'],
  ['capex_equipment', 'Equipment'], ['capex_decor', 'Decor'], ['capex_furniture', 'Furniture'],
  ['capex_technology', 'Technology'], ['capex_vehicle', 'Vehicle'], ['capex_renovation', 'Renovation'],
  ['operating_staff', 'Staff Cost'], ['operating_marketing', 'Marketing'], ['operating_admin', 'Admin'],
  ['utility_electric', 'Electricity'], ['utility_water', 'Water'], ['utility_gas', 'Gas'],
  ['utility_internet', 'Internet'], ['other', 'Other'],
];
const PURCHASE_UNITS = ['kg', 'g', 'L', 'ml', 'pack', 'box', 'case', 'bottle', 'can', 'bag', 'unit', 'piece', 'roll', 'sheet', 'set'];
const BASE_UNITS = ['g', 'ml', 'unit', 'piece', 'sheet', 'roll', 'cm', 'sqm'];

// Multi-file mode: each file owns its own job
type MultiFileJob = {
  id: string;
  file: File;
  previewUrl: string;
  // parallel pipeline tracking
  jobId?: string;
  imageUrl?: string;
  imagePath?: string;
  overallStatus?: string;
  pipelineSteps?: AIPipelineStepResult[];
  status: 'pending' | 'uploading' | 'processing' | 'ready' | 'confirmed' | 'error';
  finalResult?: AIExpenseFinalizerResult;
  editableLines: EditableLine[];
  savedId?: string;
  errorMessage?: string;
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ExpenseUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Single-file mode uses the hook
  const { job, uploadState, error, finalResult, startPipeline, reset, progressPercent } = useExpenseAI();
  const { skus } = useExpenseSKUs();

  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editableLines, setEditableLines] = useState<EditableLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Session-level new-SKU dedup: Map<normKey, Promise<skuId>>
  // Promise-based so parallel confirms don't create the same SKU twice
  const newSkuSessionCache = useRef<Map<string, Promise<string>>>(new Map());

  // Manual edit mode
  const [manualEditMode, setManualEditMode] = useState(false);
  const [manualVendor, setManualVendor] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualReceiptNo, setManualReceiptNo] = useState('');
  const [manualTax, setManualTax] = useState(0);
  const [manualServiceCharge, setManualServiceCharge] = useState(0);

  // Multi-file state
  const [multiFiles, setMultiFiles] = useState<MultiFileJob[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(-1);
  const [isMultiMode, setIsMultiMode] = useState(false);

  // Firestore unsub refs for parallel multi-file subscriptions
  const multiSubsRef = useRef<Map<string, () => void>>(new Map());
  const multiProcessingRef = useRef<Map<string, Set<string>>>(new Map());

  // ─── Single-file handler ───────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setEditableLines([]);
    setSavedId(null);
    setManualEditMode(false);
    try { await startPipeline(file); } catch { /* handled by hook */ }
  }, [startPipeline]);

  // ─── Parallel multi-file: fire ALL pipelines simultaneously ───────────

  const startAllPipelines = useCallback(async (jobs: MultiFileJob[]) => {
    // Mark all as uploading immediately
    setMultiFiles(jobs.map(j => ({ ...j, status: 'uploading' })));

    // Fire all API calls in parallel — no await between them
    const results = await Promise.allSettled(
      jobs.map(async (job) => {
        const formData = new FormData();
        formData.append('file', job.file);
        const res = await fetch('/api/expenses/ai/upload', { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json() as { error: string };
          throw new Error(err.error ?? 'Upload failed');
        }
        const { jobId, imageUrl } = await res.json() as { jobId: string; imageUrl: string };
        return { localId: job.id, jobId, imageUrl };
      })
    );

    // Store jobIds in multiFiles state
    setMultiFiles(prev => prev.map(f => {
      const found = results.find(r =>
        r.status === 'fulfilled' && r.value.localId === f.id
      );
      if (found && found.status === 'fulfilled') {
        return { ...f, jobId: found.value.jobId, imageUrl: found.value.imageUrl, status: 'processing' };
      }
      const failed = results.find(r =>
        r.status === 'rejected'
      );
      if (failed) return { ...f, status: 'error', errorMessage: 'Upload failed' };
      return f;
    }));
  }, []);

  // ─── Subscribe to all active job IDs in multi-mode ────────────────────

  useEffect(() => {
    if (!isMultiMode) return;

    // Subscribe to any jobId that doesn't have a sub yet
    for (const mf of multiFiles) {
      if (!mf.jobId) continue;
      if (multiSubsRef.current.has(mf.jobId)) continue;

      const currentJobId = mf.jobId;
      const localId = mf.id;
      
      const unsub = onSnapshot(doc(db, 'expense_ai_jobs', currentJobId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as {
          overallStatus: string;
          finalResult?: AIExpenseFinalizerResult;
          steps?: AIPipelineStepResult[];
          errorMessage?: string;
        };

        // --- PARALLEL NUDGE LOGIC ---
        if (data.overallStatus === 'running' || data.overallStatus === 'pending') {
          const pendingSteps = data.steps?.filter(s => s.status === 'pending') || [];
          
          for (const nextS of pendingSteps) {
            // Steps 1, 2, 3 are independent
            const isIndependent = nextS.stepNumber <= 3;
            
            // Steps 4, 5 have prereqs
            const allPrereqsDone = data.steps?.filter(s => s.stepNumber < nextS.stepNumber).every(s => s.status === 'done');
            
            const isValidToStart = isIndependent || allPrereqsDone;

            // Get or create the set for this job
            if (!multiProcessingRef.current.has(currentJobId)) {
              multiProcessingRef.current.set(currentJobId, new Set());
            }
            const jobSet = multiProcessingRef.current.get(currentJobId)!;

            if (isValidToStart && !jobSet.has(nextS.step)) {
              jobSet.add(nextS.step);
              console.log(`🧠 [Multi] Nudging job ${currentJobId} step ${nextS.stepNumber}: ${nextS.step}`);
              
              fetch(`/api/expenses/ai/${currentJobId}/step`, { method: 'POST' })
                .then(res => { 
                  if (!res.ok) throw new Error(); 
                  console.log(`✅ [Multi] Step ${nextS.step} nudge successful for ${currentJobId}`);
                })
                .catch(() => { 
                  console.error(`❌ [Multi] Nudge failed for ${currentJobId} ${nextS.step}`);
                  jobSet.delete(nextS.step); 
                });
            }
          }
        } else if (data.overallStatus === 'completed' || data.overallStatus === 'needs_review' || data.overallStatus === 'failed') {
          multiProcessingRef.current.delete(currentJobId);
        }

        setMultiFiles(prev => prev.map(f => {
          if (f.id !== localId) return f;
          const newStatus =
            data.overallStatus === 'completed' || data.overallStatus === 'needs_review' ? 'ready' :
              data.overallStatus === 'failed' ? 'error' :
                'processing';
          return {
            ...f,
            overallStatus: data.overallStatus,
            pipelineSteps: data.steps ?? f.pipelineSteps,
            finalResult: data.finalResult ?? f.finalResult,
            status: f.status === 'confirmed' ? 'confirmed' : newStatus,
            errorMessage: data.errorMessage,
          };
        }));
      });

      multiSubsRef.current.set(mf.jobId, unsub);
    }

    return () => {
      // Cleanup on unmount or mode change
    };
  }, [isMultiMode, multiFiles]);

  // Unsub all when leaving multi mode
  useEffect(() => {
    if (!isMultiMode) {
      multiSubsRef.current.forEach(unsub => unsub());
      multiSubsRef.current.clear();
    }
  }, [isMultiMode]);

  // ─── File selection handlers ───────────────────────────────────────────

  const startMultiMode = useCallback((files: File[]) => {
    // Unsub existing
    multiSubsRef.current.forEach(unsub => unsub());
    multiSubsRef.current.clear();

    const jobs: MultiFileJob[] = files.slice(0, 10).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending' as const,
      editableLines: [],
    }));

    setMultiFiles(jobs);
    setIsMultiMode(true);
    setCurrentFileIndex(0);
    setPreviewUrl(jobs[0].previewUrl);
    setEditableLines([]);
    setSavedId(null);
    setManualEditMode(false);

    // Fire all pipelines in parallel
    startAllPipelines(jobs);
  }, [startAllPipelines]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    if (files.length === 1) {
      setIsMultiMode(false); setMultiFiles([]); setCurrentFileIndex(-1);
      handleFile(files[0]);
    } else {
      startMultiMode(files);
    }
  }, [handleFile, startMultiMode]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (files.length === 1) {
      setIsMultiMode(false); setMultiFiles([]); setCurrentFileIndex(-1);
      handleFile(files[0]);
    } else {
      startMultiMode(files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleFile, startMultiMode]);

  // ─── Line editing ──────────────────────────────────────────────────────

  const handleLineChange = useCallback((idx: number, field: keyof AIFinalLine, value: string | number | boolean) => {
    setEditableLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value, _dirty: true };
      return next;
    });
  }, []);

  const handleLineSkuSelect = useCallback((idx: number, sku: ExpenseSKU) => {
    setEditableLines(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        sku_id: sku.id,
        sku_code: sku.code,
        description: sku.name,
        purchase_unit: sku.purchaseUnit,
        base_unit: sku.baseUnit,
        is_new_sku: false,
        _dirty: true,
      };
      return next;
    });
  }, []);

  const handleLineClearSku = useCallback((idx: number) => {
    setEditableLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], sku_id: null, sku_code: null, is_new_sku: true, _dirty: true };
      return next;
    });
  }, []);

  // ─── Confirm & Save ────────────────────────────────────────────────────

  // In multi mode, get the active file's finalResult and job metadata
  const activeMultiFile = isMultiMode && currentFileIndex >= 0 ? multiFiles[currentFileIndex] : null;
  const activeFinalResult = activeMultiFile?.finalResult ?? finalResult;
  const activeJobId = activeMultiFile?.jobId ?? job?.id;
  const activeImageUrl = activeMultiFile?.imageUrl ?? job?.imageUrl;
  const activeImagePath = activeMultiFile?.imagePath ?? job?.imagePath;

  const normKey = (desc: string) => desc
    .replace(/\s*[×x]\s*\d+/gi, '').replace(/\s*\d+\s*[×x]/gi, '')
    .replace(/\s*\d+\s*(kg|g|L|ml|pack|box|bottle|can|bag|unit|piece|set|roll|sheet)s?\b/gi, '')
    .replace(/\s*\d+\s*$/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  const handleConfirmSave = useCallback(async () => {
    if (!activeFinalResult || editableLines.length === 0) return;
    setSaving(true);
    try {
      const documentDate = new Date(activeFinalResult.expense_date);

      // ── Deduplicate new SKUs (Promise-based to handle parallel race conditions) ──
      const skuIdMap: Record<number, string> = {};

      for (const line of editableLines.filter(l => !l._deleted)) {
        if (!line.is_new_sku || line.sku_id) continue;

        const key = normKey(line.description);

        // If a Promise is already in the cache (from a concurrent confirm), await it
        if (newSkuSessionCache.current.has(key)) {
          skuIdMap[line.line_item_index] = await newSkuSessionCache.current.get(key)!;
          continue;
        }

        // Create the promise and store IMMEDIATELY before awaiting (prevents race)
        const createPromise = expenseSKUService.create({
          name: line.description,
          mainCategory: (line.category?.split('_')[0] ?? 'inventory') as 'capex' | 'inventory' | 'operating' | 'utility',
          subCategory: (line.category ?? 'inventory_food') as ExpenseSubCategory,
          baseUnit: line.base_unit as BaseUnit,
          purchaseUnit: line.purchase_unit as PurchaseUnit,
          purchaseSize: line.purchase_size ?? undefined,
          purchaseUnitLabel: line.purchase_unit_label ?? undefined,
          conversionFactor: line.base_qty > 0 && line.purchase_qty > 0 ? line.base_qty / line.purchase_qty : 1,
          isActive: true,
        });
        newSkuSessionCache.current.set(key, createPromise);
        skuIdMap[line.line_item_index] = await createPromise;
      }

      const documentId = await expenseDocumentService.create({
        documentDate,
        vendorName: activeFinalResult.vendor_name,
        place: activeFinalResult.place ?? activeFinalResult.vendor_name,
        source: 'direct_upload',
        receiptNumber: activeFinalResult.receipt_number ?? undefined,
        subtotal: activeFinalResult.subtotal,
        taxAmount: activeFinalResult.tax,
        serviceCharge: activeFinalResult.service_charge,
        total: activeFinalResult.total,
        currency: 'THB',
        isAiExtracted: true,
        overallConfidence: activeFinalResult.confidence_score,
        requiresReview: activeFinalResult.requires_review,
        reviewReasons: activeFinalResult.review_reasons,
        aiJobId: activeJobId,
        receiptImageUrl: activeImageUrl,
        receiptImagePath: activeImagePath,
      });

      await expenseLineService.bulkCreate(
        editableLines.filter(l => !l._deleted).map((line) => {
          const newSkuId = skuIdMap[line.line_item_index];
          const matchedSKU = line.sku_id ? skus.find(s => s.id === line.sku_id) : undefined;
          return {
            documentId,
            skuId: newSkuId ?? line.sku_id ?? undefined,
            skuCode: line.sku_code ?? matchedSKU?.code ?? undefined,
            skuName: line.description,
            rawDescription: line.description,
            mainCategory: (line.category?.split('_')[0] ?? 'inventory') as 'capex' | 'inventory' | 'operating' | 'utility',
            subCategory: (line.category ?? 'inventory_food') as ExpenseSubCategory,
            purchaseQty: line.purchase_qty,
            purchaseUnit: line.purchase_unit as PurchaseUnit,
            baseQty: line.base_qty,
            baseUnit: line.base_unit as BaseUnit,
            conversionFactor: line.base_qty > 0 && line.purchase_qty > 0 ? line.base_qty / line.purchase_qty : 1,
            unitPrice: line.unit_price,
            subtotal: line.subtotal,
            discount: line.discount,
            finalAmount: line.final_amount,
            isAiExtracted: true,
            isNewSku: line.is_new_sku,
            documentDate,
            vendorName: activeFinalResult.vendor_name,
            place: activeFinalResult.place,
          };
        })
      );

      const allLines = await expenseLineService.getByDocumentId(documentId);
      await expenseStatsService.updateSKUCostAfterConfirm(allLines);
      await expenseDocumentService.confirm(documentId, 'admin');

      setSavedId(documentId);

      if (isMultiMode && currentFileIndex >= 0) {
        setMultiFiles(prev => prev.map((f, idx) =>
          idx === currentFileIndex ? { ...f, status: 'confirmed', savedId: documentId, editableLines } : f
        ));
      }
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFinalResult, editableLines, activeJobId, activeImageUrl, activeImagePath, skus, isMultiMode, currentFileIndex]);

  // ─── Sync editableLines when finalResult changes (single mode) ─────────

  useEffect(() => {
    if (!isMultiMode && editableLines.length === 0 && finalResult && finalResult.lines.length > 0) {
      setEditableLines(finalResult.lines.map(l => ({ ...l, _dirty: false })));
    }
  }, [finalResult, editableLines.length, isMultiMode]);

  const isReviewOrDone = uploadState === 'review' || uploadState === 'done';

  const linesData: EditableLine[] = (editableLines.length > 0
    ? editableLines
    : (activeFinalResult?.lines ?? []).map(l => ({ ...l, _dirty: false } as EditableLine))
  ).filter((l: EditableLine) => !l._deleted);

  // Active file's pipeline steps (for multi mode display)
  // const activeSteps = activeMultiFile?.pipelineSteps ?? job?.steps ?? [];

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white font-mono">
      {/* Header */}
      <div className="border-b-2 border-black p-4 flex items-center gap-4">
        <button onClick={() => router.push('/admin/expenses')} className="p-1.5 hover:bg-gray-100 rounded">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2"><Bot size={18} /> AI RECEIPT PROCESSOR</h1>
          <p className="text-[10px] text-gray-500">
            {isMultiMode ? `Batch mode — ${multiFiles.length} receipts processing in parallel` : 'Upload a receipt — 5-step AI pipeline auto-extracts all data'}
          </p>
        </div>
        {isMultiMode && multiFiles.length > 0 && (
          <div className="text-xs font-bold">
            {multiFiles.filter(f => f.status === 'confirmed').length} / {multiFiles.length} confirmed
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* ── Left ── */}
        <div className="lg:w-2/5 border-r-2 border-black p-6">

          {/* Multi-file queue */}
          {isMultiMode && multiFiles.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold">RECEIPTS ({multiFiles.length}/10) — ALL PROCESSING IN PARALLEL</span>
                <button
                  onClick={() => {
                    multiSubsRef.current.forEach(u => u()); multiSubsRef.current.clear();
                    setMultiFiles([]); setIsMultiMode(false); setCurrentFileIndex(-1);
                    reset(); setPreviewUrl(null); setEditableLines([]); setSavedId(null);
                  }}
                  className="text-[10px] text-red-600 hover:underline"
                >Clear All</button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {multiFiles.map((fileJob, idx) => (
                  <div
                    key={fileJob.id}
                    onClick={() => {
                      setCurrentFileIndex(idx);
                      setPreviewUrl(fileJob.previewUrl);
                      setEditableLines(
                        fileJob.editableLines.length > 0
                          ? fileJob.editableLines
                          : (fileJob.finalResult?.lines ?? []).map(l => ({ ...l, _dirty: false } as EditableLine))
                      );
                      setSavedId(fileJob.savedId ?? null);
                      setManualEditMode(false);
                    }}
                    className={`border-2 rounded p-2 cursor-pointer transition-all ${idx === currentFileIndex ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-12 border border-gray-200 rounded overflow-hidden flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fileJob.previewUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold truncate">{fileJob.file.name}</p>
                        <p className="text-[9px] text-gray-400">{(fileJob.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <div className="flex-shrink-0">
                        {fileJob.status === 'pending' && <span className="text-[9px] text-gray-400">Pending</span>}
                        {(fileJob.status === 'uploading' || fileJob.status === 'processing') && <Loader2 size={14} className="animate-spin text-blue-600" />}
                        {fileJob.status === 'ready' && <span className="text-[9px] text-orange-600 font-bold">Ready</span>}
                        {fileJob.status === 'confirmed' && <CheckCircle size={14} className="text-green-600" />}
                        {fileJob.status === 'error' && <XCircle size={14} className="text-red-600" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1 text-[10px] text-center">
                <div className="bg-gray-50 rounded p-1">
                  <div className="font-bold text-blue-600">{multiFiles.filter(f => f.status === 'uploading' || f.status === 'processing').length}</div>
                  <div className="text-gray-400">Processing</div>
                </div>
                <div className="bg-gray-50 rounded p-1">
                  <div className="font-bold text-orange-500">{multiFiles.filter(f => f.status === 'ready').length}</div>
                  <div className="text-gray-400">Ready</div>
                </div>
                <div className="bg-gray-50 rounded p-1">
                  <div className="font-bold text-green-600">{multiFiles.filter(f => f.status === 'confirmed').length}</div>
                  <div className="text-gray-400">Confirmed</div>
                </div>
              </div>

              {multiFiles.some(f => f.status === 'ready') && (
                <button
                  onClick={() => {
                    const idx = multiFiles.findIndex(f => f.status === 'ready');
                    if (idx >= 0) {
                      setCurrentFileIndex(idx);
                      setPreviewUrl(multiFiles[idx].previewUrl);
                      setEditableLines((multiFiles[idx].finalResult?.lines ?? []).map(l => ({ ...l, _dirty: false } as EditableLine)));
                      setSavedId(null);
                    }
                  }}
                  className="mt-3 w-full py-2 bg-orange-500 text-white text-xs font-bold hover:bg-orange-600"
                >
                  REVIEW NEXT READY ({multiFiles.filter(f => f.status === 'ready').length})
                </button>
              )}

              {multiFiles.length < 10 && (
                <button onClick={() => fileInputRef.current?.click()} className="mt-2 w-full py-2 border-2 border-black text-xs font-bold hover:bg-gray-50">
                  ADD MORE FILES ({10 - multiFiles.length} remaining)
                </button>
              )}
            </div>
          ) : !previewUrl ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all ${dragOver ? 'border-black bg-gray-50 scale-[1.01]' : 'border-gray-300 hover:border-gray-500 hover:bg-gray-50'}`}
            >
              <ImageIcon size={40} className="mx-auto mb-4 text-gray-300" />
              <p className="text-sm font-bold text-gray-600">DROP RECEIPT IMAGE(S) HERE</p>
              <p className="text-xs text-gray-400 mt-1">Click to browse · Select multiple for parallel batch</p>
              <p className="text-[10px] text-gray-300 mt-3">JPEG · PNG · WebP · HEIC · Max 10MB · Up to 10 files</p>
              <div className="mt-4 flex justify-center">
                <div className="px-4 py-2 bg-black text-white text-xs font-bold flex items-center gap-2">
                  <Upload size={12} /> UPLOAD RECEIPT
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="border-2 border-black rounded overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Receipt preview" className="w-full object-contain max-h-96" />
              </div>
              {(uploadState === 'idle' || uploadState === 'error') && (
                <button onClick={() => { reset(); setPreviewUrl(null); }} className="mt-3 w-full py-2 border-2 border-black text-xs font-bold hover:bg-gray-50">
                  UPLOAD DIFFERENT IMAGE
                </button>
              )}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic" multiple onChange={onFileChange} className="hidden" />

          {/* Tips */}
          <div className="mt-6 border-2 border-black p-4 bg-gray-50">
            <p className="text-[10px] font-bold text-gray-600 mb-2">TIPS FOR BEST RESULTS</p>
            <ul className="text-[10px] text-gray-500 space-y-1 list-none">
              <li>• Take photo in good lighting</li>
              <li>• Ensure all text is visible and not cut off</li>
              <li>• Avoid shadows over the receipt text</li>
              <li>• Include the total amount section</li>
            </ul>
          </div>
        </div>

        {/* ── Right: Pipeline + Results ── */}
        <div className="flex-1 p-6">
          {uploadState === 'idle' && !isMultiMode && (
            <div className="text-center py-16">
              <Zap size={32} className="mx-auto mb-4 text-gray-200" />
              <p className="text-sm font-bold text-gray-300">UPLOAD A RECEIPT TO START</p>
              <p className="text-xs text-gray-300 mt-1">5-step AI pipeline will auto-extract all data</p>
            </div>
          )}

          {/* Multi-mode: show selected file's pipeline + review */}
          {isMultiMode && currentFileIndex >= 0 && (() => {
            const cur = multiFiles[currentFileIndex];
          const curFinal = cur?.finalResult;
            const curLines = editableLines.length > 0 ? editableLines.filter(l => !l._deleted) : (curFinal?.lines ?? []).map(l => ({...l, _dirty: false } as EditableLine));
          const isProcessingCur = cur?.status === 'uploading' || cur?.status === 'processing';
          const isReadyCur = cur?.status === 'ready' || cur?.status === 'confirmed';

          return (
          <div>
            <p className="text-xs font-bold mb-3">{cur?.file.name} — <span className={`${cur?.status === 'confirmed' ? 'text-green-600' : cur?.status === 'ready' ? 'text-orange-500' : cur?.status === 'error' ? 'text-red-500' : 'text-blue-600'}`}>{cur?.status?.toUpperCase()}</span></p>

            {/* Pipeline steps */}
            <div className="space-y-1.5 mb-4">
              {STEP_ORDER.map(step => {
                const result = cur?.pipelineSteps?.find(s => s.step === step);
                return <StepIndicator key={step} step={step} result={result} />;
              })}
            </div>

            {cur?.status === 'error' && (
              <div className="border-2 border-red-500 bg-red-50 p-3 mb-4">
                <p className="text-xs font-bold text-red-700">PIPELINE FAILED</p>
                <p className="text-xs text-red-600 mt-1">{cur.errorMessage}</p>
              </div>
            )}

            {isProcessingCur && (
              <div className="text-center py-8 text-gray-400">
                <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                <p className="text-xs">Processing in parallel with other receipts...</p>
              </div>
            )}

            {isReadyCur && curFinal && curLines.length > 0 && !savedId && (
              <ReviewTable
                lines={curLines}
                finalResult={curFinal}
                skus={skus}
                saving={saving}
                manualEditMode={manualEditMode}
                manualVendor={manualVendor}
                manualDate={manualDate}
                manualReceiptNo={manualReceiptNo}
                manualTax={manualTax}
                manualServiceCharge={manualServiceCharge}
                setManualVendor={setManualVendor}
                setManualDate={setManualDate}
                setManualReceiptNo={setManualReceiptNo}
                setManualTax={setManualTax}
                setManualServiceCharge={setManualServiceCharge}
                setManualEditMode={setManualEditMode}
                setEditableLines={setEditableLines}
                editableLines={editableLines}
                handleLineChange={handleLineChange}
                handleLineSkuSelect={handleLineSkuSelect}
                handleLineClearSku={handleLineClearSku}
                handleConfirmSave={handleConfirmSave}
                onDiscard={() => {
                  setEditableLines([]); setSavedId(null); setManualEditMode(false);
                }}
              />
            )}

            {savedId && (
              <SavedSuccess savedId={savedId} onViewExpense={() => router.push(`/admin/expenses/${savedId}`)} onUploadAnother={() => { reset(); setPreviewUrl(null); setEditableLines([]); setSavedId(null); setManualEditMode(false); }} onAllExpenses={() => router.push('/admin/expenses')} />
            )}
          </div>
          );
          })()}

          {/* Single-file mode */}
          {!isMultiMode && (uploadState === 'uploading' || uploadState === 'processing' || isReviewOrDone || uploadState === 'error') && (
            <div>
              {/* Progress */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-gray-500">AI PIPELINE PROGRESS</span>
                  <span className="text-[10px] font-bold">{progressPercent}%</span>
                </div>
                <div className="h-2 bg-gray-100 border border-gray-200">
                  <div className={`h-full transition-all duration-500 ${uploadState === 'error' ? 'bg-red-500' : isReviewOrDone ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${progressPercent}%` }} />
                </div>
              </div>

              <div className="space-y-1.5 mb-6">
                {STEP_ORDER.map(step => {
                  const result = job?.steps.find(s => s.step === step);
                  return <StepIndicator key={step} step={step} result={result} />;
                })}
              </div>

              {uploadState === 'error' && (
                <div className="border-2 border-red-500 bg-red-50 p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2"><XCircle size={16} className="text-red-500" /><span className="text-xs font-bold text-red-700">PIPELINE FAILED</span></div>
                  <p className="text-xs text-red-600">{error}</p>
                  <button onClick={() => { reset(); setPreviewUrl(null); }} className="mt-3 px-3 py-1.5 bg-red-500 text-white text-xs font-bold hover:bg-red-600">TRY AGAIN</button>
                </div>
              )}

              {uploadState === 'review' && finalResult && (
                <div className="border-2 border-yellow-400 bg-yellow-50 p-3 mb-4">
                  <div className="flex items-center gap-2 mb-1"><AlertCircle size={14} className="text-yellow-600" /><span className="text-xs font-bold text-yellow-700">REVIEW REQUIRED</span></div>
                  <ul className="text-[11px] text-yellow-600 space-y-0.5 list-none">{finalResult.review_reasons.map((r, i) => <li key={i}>• {r}</li>)}</ul>
                </div>
              )}

              {isReviewOrDone && linesData.length > 0 && !savedId && (
                <ReviewTable
                  lines={linesData}
                  finalResult={activeFinalResult!}
                  skus={skus}
                  saving={saving}
                  manualEditMode={manualEditMode}
                  manualVendor={manualVendor}
                  manualDate={manualDate}
                  manualReceiptNo={manualReceiptNo}
                  manualTax={manualTax}
                  manualServiceCharge={manualServiceCharge}
                  setManualVendor={setManualVendor}
                  setManualDate={setManualDate}
                  setManualReceiptNo={setManualReceiptNo}
                  setManualTax={setManualTax}
                  setManualServiceCharge={setManualServiceCharge}
                  setManualEditMode={setManualEditMode}
                  setEditableLines={setEditableLines}
                  editableLines={editableLines}
                  handleLineChange={handleLineChange}
                  handleLineSkuSelect={handleLineSkuSelect}
                  handleLineClearSku={handleLineClearSku}
                  handleConfirmSave={handleConfirmSave}
                  onDiscard={() => { reset(); setPreviewUrl(null); setEditableLines([]); setManualEditMode(false); }}
                />
              )}

              {savedId && (
                <SavedSuccess savedId={savedId} onViewExpense={() => router.push(`/admin/expenses/${savedId}`)} onUploadAnother={() => { reset(); setPreviewUrl(null); setEditableLines([]); setSavedId(null); setManualEditMode(false); }} onAllExpenses={() => router.push('/admin/expenses')} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ReviewTable sub-component ───────────────────────────────────────────────

function ReviewTable({
  lines, finalResult, skus, saving,
  manualEditMode, manualVendor, manualDate, manualReceiptNo, manualTax, manualServiceCharge,
  setManualVendor, setManualDate, setManualReceiptNo, setManualTax, setManualServiceCharge,
  setManualEditMode, setEditableLines, editableLines,
  handleLineChange, handleLineSkuSelect, handleLineClearSku,
  handleConfirmSave, onDiscard,
}: {
  lines: EditableLine[];
  finalResult: AIExpenseFinalizerResult;
  skus: ExpenseSKU[];
  saving: boolean;
  manualEditMode: boolean;
  manualVendor: string; manualDate: string; manualReceiptNo: string; manualTax: number; manualServiceCharge: number;
  setManualVendor: (v: string) => void; setManualDate: (v: string) => void; setManualReceiptNo: (v: string) => void;
  setManualTax: (v: number) => void; setManualServiceCharge: (v: number) => void;
  setManualEditMode: (v: boolean | ((p: boolean) => boolean)) => void;
  setEditableLines: React.Dispatch<React.SetStateAction<EditableLine[]>>;
  editableLines: EditableLine[];
  handleLineChange: (idx: number, field: keyof AIFinalLine, value: string | number | boolean) => void;
  handleLineSkuSelect: (idx: number, sku: ExpenseSKU) => void;
  handleLineClearSku: (idx: number) => void;
  handleConfirmSave: () => Promise<void>;
  onDiscard: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-bold">EXTRACTED DATA — {finalResult.vendor_name} — {finalResult.expense_date}</p>
          <p className="text-[10px] text-gray-500">Review SKUs · edit data · then confirm</p>
        </div>
        <span className="text-[10px] font-bold bg-black text-white px-2 py-1">
          TOTAL: ฿{(finalResult.total ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* Quick review table */}
      <div className="overflow-x-auto border-2 border-black">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-black text-white">
              <th className="text-left px-3 py-2 font-bold">ITEM / SKU</th>
              <th className="text-right px-3 py-2 font-bold">QTY</th>
              <th className="text-left px-3 py-2 font-bold">UNIT</th>
              <th className="text-right px-3 py-2 font-bold">PRICE</th>
              <th className="text-right px-3 py-2 font-bold">TOTAL</th>
              <th className="text-center px-3 py-2 font-bold">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className={`border-t border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <td className="px-3 py-2 max-w-xs">
                  <SKUCombobox
                    currentSkuId={line.sku_id}
                    currentLabel={line.description}
                    skus={skus}
                    onSelect={(sku) => handleLineSkuSelect(idx, sku)}
                    onClearToNew={() => handleLineClearSku(idx)}
                  />
                  {line.sku_code && <span className="text-[9px] font-mono text-gray-400 block mt-0.5">{line.sku_code}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={line.purchase_qty}
                    onChange={(e) => handleLineChange(idx, 'purchase_qty', parseFloat(e.target.value))}
                    className="w-16 text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-black outline-none"
                  />
                </td>
                <td className="px-3 py-2 text-gray-500">{line.purchase_unit}</td>
                <td className="px-3 py-2 text-right font-mono">{line.unit_price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-right font-bold font-mono">฿{line.final_amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                <td className="px-3 py-2 text-center">
                  {line.is_new_sku
                    ? <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 py-0.5 rounded font-bold">NEW SKU</span>
                    : <CheckCircle size={12} className="mx-auto text-green-500" />}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black bg-gray-50">
              <td colSpan={4} className="px-3 py-2 font-bold text-right text-[11px]">GRAND TOTAL</td>
              <td className="px-3 py-2 font-bold text-right font-mono">฿{(finalResult.total ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={handleConfirmSave}
          disabled={saving}
          className="flex-1 py-3 bg-black text-white text-xs font-bold hover:bg-gray-800 disabled:bg-gray-400 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          {saving ? 'SAVING...' : 'CONFIRM & SAVE EXPENSE'}
        </button>
        <button
          onClick={() => {
            setManualVendor(finalResult.vendor_name ?? '');
            setManualDate(finalResult.expense_date ?? new Date().toISOString().slice(0, 10));
            setManualReceiptNo(finalResult.receipt_number ?? '');
            setManualTax(finalResult.tax ?? 0);
            setManualServiceCharge(finalResult.service_charge ?? 0);
            if (editableLines.length === 0) {
              setEditableLines(finalResult.lines.map(l => ({ ...l, _dirty: false })));
            }
            setManualEditMode(prev => !prev);
          }}
          className={`px-4 py-3 border-2 text-xs font-bold ${manualEditMode ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-black hover:bg-gray-50'}`}
        >
          {manualEditMode ? 'HIDE EDIT' : 'EDIT MANUALLY'}
        </button>
        <button onClick={onDiscard} className="px-4 py-3 border-2 border-gray-300 text-xs font-bold text-gray-500 hover:border-black">
          DISCARD
        </button>
      </div>

      {/* Manual Edit Expanded Panel */}
      {manualEditMode && (
        <div className="mt-4 border-2 border-blue-400 rounded-lg p-4 bg-blue-50/20">
          <p className="text-xs font-bold text-blue-700 mb-3">✏️ MANUAL EDIT — All fields & SKUs editable</p>

          {/* Document fields */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 block mb-0.5">VENDOR NAME</label>
              <input value={manualVendor} onChange={(e) => setManualVendor(e.target.value)} className="w-full text-xs border-b-2 border-blue-300 focus:border-blue-600 outline-none bg-transparent py-0.5 font-bold" placeholder="Vendor / Supplier" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 block mb-0.5">DATE</label>
              <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="w-full text-xs border-b-2 border-blue-300 focus:border-blue-600 outline-none bg-transparent py-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 block mb-0.5">RECEIPT NO.</label>
              <input value={manualReceiptNo} onChange={(e) => setManualReceiptNo(e.target.value)} className="w-full text-xs border-b-2 border-blue-300 focus:border-blue-600 outline-none bg-transparent py-0.5" placeholder="—" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-gray-500 block mb-0.5">TAX (฿)</label>
                <input type="number" value={manualTax} onChange={(e) => setManualTax(parseFloat(e.target.value) || 0)} className="w-full text-xs border-b-2 border-blue-300 focus:border-blue-600 outline-none bg-transparent py-0.5" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold text-gray-500 block mb-0.5">SVC CHARGE (฿)</label>
                <input type="number" value={manualServiceCharge} onChange={(e) => setManualServiceCharge(parseFloat(e.target.value) || 0)} className="w-full text-xs border-b-2 border-blue-300 focus:border-blue-600 outline-none bg-transparent py-0.5" />
              </div>
            </div>
          </div>

          {/* Full editable table with SKU selector */}
          <div className="overflow-x-auto border border-blue-200 rounded">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-blue-700 text-white">
                  <th className="text-left px-2 py-1.5 font-bold">ITEM / SKU</th>
                  <th className="text-left px-2 py-1.5 font-bold">CAT</th>
                  <th className="text-right px-2 py-1.5 font-bold">QTY</th>
                  <th className="text-left px-2 py-1.5 font-bold">BUY</th>
                  <th className="text-right px-2 py-1.5 font-bold">BASE</th>
                  <th className="text-left px-2 py-1.5 font-bold">B.UNIT</th>
                  <th className="text-right px-2 py-1.5 font-bold">PRICE</th>
                  <th className="text-right px-2 py-1.5 font-bold">DISC</th>
                  <th className="text-right px-2 py-1.5 font-bold">TOTAL</th>
                  <th className="px-1 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {editableLines.filter(l => !l._deleted).map((line, idx) => (
                  <tr key={idx} className={`border-t border-blue-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}`}>
                    <td className="px-2 py-1 max-w-xs">
                      <SKUCombobox
                        currentSkuId={line.sku_id}
                        currentLabel={line.description}
                        skus={skus}
                        onSelect={(sku) => handleLineSkuSelect(idx, sku)}
                        onClearToNew={() => handleLineClearSku(idx)}
                      />
                      {line.sku_code && <span className="text-[9px] font-mono text-blue-400 block">{line.sku_code}</span>}
                    </td>
                    <td className="px-2 py-1">
                      <select value={line.category ?? 'inventory_food'} onChange={(e) => handleLineChange(idx, 'category', e.target.value as AIFinalLine['category'])} className="text-[9px] border border-blue-200 outline-none bg-white py-0.5 max-w-24">
                        {ALL_SUB_CATEGORIES.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" value={line.purchase_qty} onChange={(e) => {
                        const q = parseFloat(e.target.value) || 0;
                        handleLineChange(idx, 'purchase_qty', q);
                        const sub = q * line.unit_price;
                        handleLineChange(idx, 'subtotal', sub);
                        handleLineChange(idx, 'final_amount', sub - (line.discount ?? 0));
                      }} className="w-12 text-right bg-transparent border-b border-blue-200 outline-none py-0.5" />
                    </td>
                    <td className="px-2 py-1">
                      <select value={line.purchase_unit} onChange={(e) => handleLineChange(idx, 'purchase_unit', e.target.value)} className="text-[9px] border border-blue-200 outline-none bg-white py-0.5">
                        {PURCHASE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" value={line.base_qty} onChange={(e) => handleLineChange(idx, 'base_qty', parseFloat(e.target.value) || 0)} className="w-12 text-right bg-transparent border-b border-blue-200 outline-none py-0.5" />
                    </td>
                    <td className="px-2 py-1">
                      <select value={line.base_unit} onChange={(e) => handleLineChange(idx, 'base_unit', e.target.value)} className="text-[9px] border border-blue-200 outline-none bg-white py-0.5">
                        {BASE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" value={line.unit_price} onChange={(e) => {
                        const p = parseFloat(e.target.value) || 0;
                        handleLineChange(idx, 'unit_price', p);
                        const sub = line.purchase_qty * p;
                        handleLineChange(idx, 'subtotal', sub);
                        handleLineChange(idx, 'final_amount', sub - (line.discount ?? 0));
                      }} className="w-16 text-right bg-transparent border-b border-blue-200 outline-none py-0.5" />
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" value={line.discount ?? 0} onChange={(e) => {
                        const d = parseFloat(e.target.value) || 0;
                        handleLineChange(idx, 'discount', d);
                        handleLineChange(idx, 'final_amount', line.subtotal - d);
                      }} className="w-12 text-right bg-transparent border-b border-blue-200 outline-none py-0.5" />
                    </td>
                    <td className="px-2 py-1 text-right font-bold font-mono text-blue-700">
                      ฿{line.final_amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-1 py-1">
                      <button onClick={() => setEditableLines(prev => prev.map((l, i) => i === idx ? { ...l, _deleted: true } : l))} className="p-1 text-red-400 hover:text-red-600">
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-blue-400 bg-blue-50">
                  <td colSpan={8} className="px-2 py-2 text-right text-[11px] font-bold">GRAND TOTAL</td>
                  <td className="px-2 py-2 text-right font-bold font-mono text-blue-800">
                    ฿{editableLines.filter(l => !l._deleted).reduce((s, l) => s + l.final_amount, 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Add line + Save */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setEditableLines(prev => [...prev, {
                line_item_index: prev.length, sku_id: null, sku_code: null,
                description: '', purchase_qty: 1, purchase_unit: 'unit',
                base_qty: 1, base_unit: 'unit', unit_price: 0,
                subtotal: 0, discount: 0, final_amount: 0,
                category: 'inventory_food', is_new_sku: true, _dirty: true,
              }])}
              className="px-3 py-2 border border-blue-400 text-blue-700 text-[11px] font-bold hover:bg-blue-100 flex items-center gap-1"
            >
              <Plus size={11} /> ADD LINE
            </button>
            <button
              onClick={() => {
                if (finalResult) {
                  finalResult.vendor_name = manualVendor || finalResult.vendor_name;
                  finalResult.expense_date = manualDate || finalResult.expense_date;
                  finalResult.receipt_number = manualReceiptNo || finalResult.receipt_number;
                  finalResult.tax = manualTax;
                  finalResult.service_charge = manualServiceCharge;
                }
                setManualEditMode(false);
                handleConfirmSave();
              }}
              disabled={saving}
              className="flex-1 py-2 bg-blue-700 text-white text-xs font-bold hover:bg-blue-800 disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              {saving ? 'SAVING...' : 'CONFIRM & SAVE (MANUAL EDIT)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SavedSuccess sub-component ──────────────────────────────────────────────

function SavedSuccess({ savedId, onViewExpense, onUploadAnother, onAllExpenses }: {
  savedId: string;
  onViewExpense: () => void;
  onUploadAnother: () => void;
  onAllExpenses: () => void;
}) {
  return (
    <div className="border-2 border-green-500 bg-green-50 p-6 text-center">
      <CheckCircle size={32} className="mx-auto mb-3 text-green-500" />
      <p className="text-sm font-bold text-green-700">EXPENSE SAVED SUCCESSFULLY</p>
      <p className="text-xs text-green-600 mt-1">All line items recorded and SKU costs updated · #{savedId.slice(-6)}</p>
      <div className="flex gap-2 justify-center mt-4">
        <button onClick={onViewExpense} className="px-4 py-2 bg-black text-white text-xs font-bold">VIEW EXPENSE</button>
        <button onClick={onUploadAnother} className="px-4 py-2 border-2 border-black text-xs font-bold hover:bg-gray-50">UPLOAD ANOTHER</button>
        <button onClick={onAllExpenses} className="px-4 py-2 border-2 border-gray-300 text-xs font-bold hover:border-black">ALL EXPENSES</button>
      </div>
    </div>
  );
}
