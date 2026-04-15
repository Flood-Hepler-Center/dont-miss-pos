/**
 * Expense Management Types
 * Covers CAPEX (equipment, decor) and Inventory (food, drinks) expenses
 * with AI-powered receipt processing and recipe sync
 */

// ─── Category Types ───────────────────────────────────────────────────────────

export type ExpenseMainCategory = 'capex' | 'inventory' | 'operating' | 'utility';

export type ExpenseSubCategory =
  | 'capex_equipment'
  | 'capex_decor'
  | 'capex_furniture'
  | 'capex_technology'
  | 'capex_vehicle'
  | 'capex_renovation'
  | 'inventory_food'
  | 'inventory_drinks'
  | 'inventory_packaging'
  | 'inventory_cleaning'
  | 'inventory_consumable'
  | 'operating_staff'
  | 'operating_marketing'
  | 'operating_admin'
  | 'utility_electric'
  | 'utility_water'
  | 'utility_gas'
  | 'utility_internet'
  | 'other';

// ─── Unit System ──────────────────────────────────────────────────────────────

export type BaseUnit = 'g' | 'ml' | 'unit' | 'piece' | 'sheet' | 'roll' | 'cm' | 'sqm';
export type PurchaseUnit =
  | 'kg'
  | 'g'
  | 'L'
  | 'ml'
  | 'pack'
  | 'box'
  | 'case'
  | 'bottle'
  | 'can'
  | 'bag'
  | 'unit'
  | 'piece'
  | 'roll'
  | 'sheet'
  | 'set';

// ─── SKU Master Catalog ───────────────────────────────────────────────────────

export type ExpenseSKU = {
  id: string;
  code: string;
  name: string;
  nameTh?: string;
  mainCategory: ExpenseMainCategory;
  subCategory: ExpenseSubCategory;
  baseUnit: BaseUnit;
  purchaseUnit: PurchaseUnit;
  purchaseSize?: number; // e.g., 5 for "5kg bottle"
  purchaseUnitLabel?: string; // e.g., "5kg bottle" for display
  conversionFactor: number;
  defaultVendorId?: string;
  defaultVendorName?: string;
  averageUnitCost: number;
  lastPurchasePrice: number;
  lastPurchaseDate?: Date;
  totalPurchasedQty: number;
  inventoryItemId?: string;
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateExpenseSKUInput = Omit<
  ExpenseSKU,
  'id' | 'code' | 'averageUnitCost' | 'lastPurchasePrice' | 'lastPurchaseDate' | 'totalPurchasedQty' | 'createdAt' | 'updatedAt'
> & { code?: string };

// ─── Vendor / Place ───────────────────────────────────────────────────────────

export type ExpenseVendor = {
  id: string;
  name: string;
  nameTh?: string;
  address?: string;
  phone?: string;
  taxId?: string;
  lineGroupName?: string;
  sourceType: 'market' | 'supplier' | 'online' | 'retail' | 'other';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Expense Document (Receipt Level) ────────────────────────────────────────

export type ExpenseDocumentStatus =
  | 'draft'
  | 'confirmed'
  | 'ai_processing'
  | 'ai_review'
  | 'cancelled';

export type ExpenseSource = 'line_group' | 'manual' | 'email' | 'direct_upload';

export type ExpenseDocument = {
  id: string;
  documentDate: Date;
  vendorId?: string;
  vendorName: string;
  place?: string;
  source: ExpenseSource;
  receiptImageUrl?: string;
  receiptImagePath?: string;
  receiptNumber?: string;
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  total: number;
  currency: string;
  status: ExpenseDocumentStatus;
  aiJobId?: string;
  isAiExtracted: boolean;
  overallConfidence?: number;
  requiresReview: boolean;
  reviewReasons?: string[];
  notes?: string;
  confirmedBy?: string;
  confirmedAt?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateExpenseDocumentInput = Omit<
  ExpenseDocument,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;

// ─── Expense Line Items ───────────────────────────────────────────────────────

export type ExpenseLine = {
  id: string;
  documentId: string;
  skuId?: string;
  skuCode?: string;
  skuName: string;
  rawDescription?: string;
  mainCategory: ExpenseMainCategory;
  subCategory: ExpenseSubCategory;
  purchaseQty: number;
  purchaseUnit: PurchaseUnit;
  baseQty: number;
  baseUnit: BaseUnit;
  conversionFactor: number;
  unitPrice: number;
  subtotal: number;
  discount: number;
  finalAmount: number;
  isAiExtracted: boolean;
  aiConfidence?: number;
  isNewSku: boolean;
  documentDate: Date;
  vendorName: string;
  place?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateExpenseLineInput = Omit<
  ExpenseLine,
  'id' | 'createdAt' | 'updatedAt'
>;

// ─── AI Pipeline Types ────────────────────────────────────────────────────────

export type AIPipelineStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export type AIPipelineStep =
  | 'bill_validator'
  | 'quality_assessor'
  | 'ocr_extractor'
  | 'sku_matcher'
  | 'expense_finalizer';

export type AIPipelineStepResult = {
  step: AIPipelineStep;
  stepNumber: 1 | 2 | 3 | 4 | 5;
  status: AIPipelineStepStatus;
  model: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  result?: unknown;
  error?: string;
};

export type AIBillValidatorResult = {
  is_valid_document: boolean;
  document_type: 'receipt' | 'invoice' | 'quotation' | 'delivery_note' | 'other';
  confidence: number;
  rejection_reason: string | null;
  detected_language: 'th' | 'en' | 'mixed' | 'other';
  visible_merchant: string | null;
};

export type AIQualityResult = {
  overall_quality: 'excellent' | 'good' | 'acceptable' | 'poor';
  ocr_confidence: number;
  issues: string[];
  text_visibility: 'clear' | 'partially_visible' | 'blurry' | 'cut_off';
  recommended_action: 'proceed' | 'warn_and_proceed' | 'request_better_image';
};

export type AIExtractedLineItem = {
  raw_text: string;
  description: string; // EXACT item name from receipt (Thai/English/mixed as shown)
  quantity: number;
  unit: string;
  unit_price: number;
  subtotal: number;
  discount: number | null;
};

export type AIOCRResult = {
  vendor: {
    name: string;
    address: string | null;
    phone: string | null;
    tax_id: string | null;
  };
  date: string | null;
  time: string | null;
  receipt_number: string | null;
  currency: string;
  line_items: AIExtractedLineItem[];
  subtotal: number;
  tax: number | null;
  service_charge: number | null;
  total: number;
  payment_method: string | null;
  notes: string | null;
};

export type AISKUMatch = {
  line_item_index: number;
  matched_sku_id: string | null;
  matched_sku_code: string | null;
  matched_sku_name: string | null;
  match_confidence: number;
  is_new_sku: boolean;
  suggested_sku_name: string;
  suggested_category: ExpenseSubCategory;
  suggested_base_unit: BaseUnit;
  suggested_purchase_unit: PurchaseUnit;
  suggested_purchase_size?: number; // e.g., 5 for "5kg bottle"
  suggested_purchase_unit_label?: string; // e.g., "5kg bottle" for display
  suggested_conversion_factor: number;
};

export type AISKUMatcherResult = {
  matches: AISKUMatch[];
};

export type AIFinalLine = {
  line_item_index: number;
  sku_id: string | null;
  sku_code: string | null;
  description: string;
  purchase_qty: number;
  purchase_unit: string;
  purchase_size?: number; // e.g., 5 for "5kg bottle"
  purchase_unit_label?: string; // e.g., "5kg bottle" for display
  base_qty: number;
  base_unit: string;
  unit_price: number;
  subtotal: number;
  discount: number;
  final_amount: number;
  category: ExpenseSubCategory;
  is_new_sku: boolean;
};

export type AIExpenseFinalizerResult = {
  expense_date: string;
  vendor_name: string;
  place: string;
  receipt_number: string | null;
  expense_type: ExpenseMainCategory;
  lines: AIFinalLine[];
  subtotal: number;
  tax: number;
  service_charge: number;
  total: number;
  confidence_score: number;
  requires_review: boolean;
  review_reasons: string[];
};

export type AIExpenseJob = {
  id: string;
  documentId?: string;
  imageUrl: string;
  imagePath: string;
  overallStatus: 'pending' | 'running' | 'completed' | 'failed' | 'needs_review';
  currentStep: AIPipelineStep | null;
  steps: AIPipelineStepResult[];
  finalResult?: AIExpenseFinalizerResult;
  totalCost?: number;
  totalDurationMs?: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Export Types ─────────────────────────────────────────────────────────────

export type ExpenseExportFilter = {
  startDate: Date;
  endDate: Date;
  mainCategory?: ExpenseMainCategory;
  subCategory?: ExpenseSubCategory;
  vendorId?: string;
  skuId?: string;
  status?: ExpenseDocumentStatus;
};

export type ExpenseExportRow = {
  date: string;
  receiptNumber: string;
  vendorName: string;
  place: string;
  source: string;
  mainCategory: string;
  subCategory: string;
  skuCode: string;
  itemName: string;
  purchaseQty: number;
  purchaseUnit: string;
  baseQty: number;
  baseUnit: string;
  unitPrice: number;
  subtotal: number;
  discount: number;
  finalAmount: number;
  aiExtracted: string;
  confidence: string;
  notes: string;
};

// ─── Filter & Stats ───────────────────────────────────────────────────────────

export type ExpenseFilter = {
  startDate?: Date;
  endDate?: Date;
  mainCategory?: ExpenseMainCategory;
  subCategory?: ExpenseSubCategory;
  vendorId?: string;
  skuId?: string;
  status?: ExpenseDocumentStatus;
  searchText?: string;
};

export type ExpenseStats = {
  totalDocuments: number;
  totalAmount: number;
  capexTotal: number;
  inventoryTotal: number;
  operatingTotal: number;
  utilityTotal: number;
  aiProcessed: number;
  pendingReview: number;
  topCategories: { category: string; amount: number }[];
  topVendors: { vendorName: string; amount: number }[];
};
