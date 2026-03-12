/**
 * Order & Order Item Types
 * Source: BA Data Model - dm-orders-tables.md
 */

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
  tableId: string;
  sessionId: string;
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
  tableId: string;
  sessionId: string;
  items: OrderItem[];
  entryMethod: 'QR' | 'MANUAL';
  createdBy?: string;
};
