/**
 * Order & Order Item Types
 * Source: BA Data Model - dm-orders-tables.md
 */

/** Order type classification */
export type OrderType = 'DINE_IN' | 'TAKE_AWAY';

/** Order status lifecycle: PLACED → PREPARING → READY → SERVED → COMPLETED */
export type OrderStatus =
  | 'PLACED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'COMPLETED'
  | 'CANCELLED';

/** Selected modifier on an ordered item */
export type SelectedModifier = {
  modifierGroupId: string;
  modifierGroupName: string;
  optionId: string;
  optionName: string;
  priceMode?: 'adjustment' | 'absolute';
  priceAdjustment: number;
  absolutePrice?: number;
  recipeMultiplier?: number;
};

/** Individual item within an order */
export type OrderItem = {
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  modifiers?: SelectedModifier[];
  /** Per-item kitchen status — allows chefs/waiters to advance each item independently */
  itemStatus?: 'PLACED' | 'PREPARING' | 'READY' | 'SERVED';
  isVoided?: boolean;
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: Date;
  isComped?: boolean;
  compReason?: string;
};

/** Order document from Firestore */
export type Order = {
  id: string;
  orderNumber?: string;
  orderType: OrderType;  // NEW - Required field
  tableId?: string | null;  // MODIFIED - Now optional
  sessionId?: string | null;  // MODIFIED - Now optional
  
  // Customer Info (for take-away)
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  
  // Take-away Specific
  pickupTime?: Date;
  actualPickupTime?: Date;
  
  items: OrderItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  status: OrderStatus;
  entryMethod: 'QR' | 'MANUAL';
  paymentMethod?: 'CASH' | 'PROMPTPAY' | 'CARD';
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Table Assignment Audit
  tableAssignedAt?: Date;
  tableAssignedBy?: string;
  
  placedAt?: Date;
  preparingAt?: Date;
  readyAt?: Date;
  servedAt?: Date;
  completedAt?: Date;
  isVoided?: boolean;
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: Date;
  specialInstructions?: string;
};

/** Input for creating a new order */
export type CreateOrderInput = {
  orderType: OrderType;  // NEW - Required
  tableId?: string | null;  // MODIFIED - Optional
  sessionId?: string | null;  // MODIFIED - Optional
  items: OrderItem[];
  entryMethod: 'QR' | 'MANUAL';
  createdBy?: string;
  
  // Customer info for take-away
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  
  // Take-away specific
  pickupTime?: Date;
  
  specialInstructions?: string;
};
