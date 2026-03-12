/**
 * Payment, Receipt & Reporting Types
 * Source: BA Data Model - dm-payments-transactions.md
 */

export type PaymentMethod = 'CASH' | 'PROMPTPAY';
export type DiscountType = 'PERCENTAGE' | 'FIXED';
export type PaymentStatus = 'COMPLETED' | 'VOIDED';

/** Split bill portion */
export type SplitPayment = {
  splitId: string;
  splitNumber: number;
  orderIds: string[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  processedAt: Date;
};

/** Payment document from Firestore */
export type Payment = {
  id: string;
  receiptNumber: string;
  tableId: string;
  orderIds: string[];
  sessionId: string;
  subtotal: number;
  discountAmount: number;
  subtotalAfterDiscount: number;
  tax: number;
  total: number;
  discountType?: DiscountType;
  discountPercent?: number;
  discountReason?: string;
  paymentMethod: PaymentMethod;
  amountReceived?: number;
  change?: number;
  promptpayReference?: string;
  promptpayQRGenerated?: boolean;
  isSplit: boolean;
  splitDetails?: SplitPayment[];
  processedBy: string;
  processedAt: Date;
  status: PaymentStatus;
  createdAt: Date;
};

/** Receipt line item */
export type ReceiptLineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifiers?: string[];
  isVoided?: boolean;
  isComped?: boolean;
};

/** Receipt document from Firestore */
export type Receipt = {
  id: string;
  receiptNumber: string;
  paymentId: string;
  restaurantName: string;
  restaurantAddress: string;
  taxId: string;
  tableId: string;
  date: Date;
  cashier: string;
  items: ReceiptLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountReceived?: number;
  change?: number;
  thankYouMessage: string;
  receiptHTML?: string;
  receiptPlainText?: string;
  generatedAt: Date;
};

/** Top-selling item for reports */
export type TopItem = {
  menuItemId: string;
  name: string;
  quantity: number;
  revenue: number;
  rank: number;
};

/** Daily summary for EOD reports */
export type DailySummary = {
  id: string;
  date: string;
  grossRevenue: number;
  discounts: number;
  comps: number;
  voids: number;
  netRevenue: number;
  tax: number;
  totalOrders: number;
  totalItems: number;
  averageOrderValue: number;
  tablesServed: number;
  tablesTurnover: number;
  cashTotal: number;
  cashCount: number;
  promptpayTotal: number;
  promptpayCount: number;
  averageTicketTime: number;
  longestTicketTime: number;
  voidRate: number;
  topItemsBySales: TopItem[];
  topItemsByQuantity: TopItem[];
  peakHour: string;
  peakHourRevenue: number;
  computedAt: Date;
};

/** Receipt sequence tracker per day */
export type ReceiptSequence = {
  id: string;
  date: string;
  lastSequence: number;
  updatedAt: Date;
};

/** Bill calculation result (used by cashier) */
export type BillCalculation = {
  subtotal: number;
  discountAmount: number;
  subtotalAfterDiscount: number;
  tax: number;
  total: number;
};

/** Input for processing a payment */
export type ProcessPaymentInput = {
  tableId: string;
  orderIds: string[];
  sessionId: string;
  subtotal: number;
  discountAmount: number;
  discountType?: DiscountType;
  discountPercent?: number;
  discountReason?: string;
  subtotalAfterDiscount: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountReceived?: number;
  change?: number;
  isSplit: boolean;
  splitDetails?: SplitPayment[];
  processedBy: string;
};
