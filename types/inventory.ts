/**
 * Inventory & Stock Movement Types
 * Source: BA Data Model - dm-menu-inventory.md
 */

export type InventoryCategory =
  | 'PROTEINS'
  | 'VEGETABLES'
  | 'DRY_GOODS'
  | 'BEVERAGES'
  | 'CONDIMENTS'
  | 'OTHER';

export type MovementType =
  | 'DEDUCTION'
  | 'ADDITION'
  | 'ADJUSTMENT'
  | 'VOID_REVERSAL';

export type AlertSeverity = 'WARNING' | 'CRITICAL';

/** Inventory item (ingredient/supply) */
export type InventoryItem = {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  unitSize?: string;
  currentStock: number;
  initialStock: number;
  reorderPoint: number;
  unitCost: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastRestockedAt?: Date;
};

/** Recipe ingredient linking menu item to inventory */
export type RecipeIngredient = {
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  unit: string;
};

/** Recipe definition for a menu item */
export type Recipe = {
  id: string;
  menuItemId: string;
  menuItemName: string;
  ingredients: RecipeIngredient[];
  yield: number; // How many servings this recipe makes
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Stock movement record for audit trail */
export type StockMovement = {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  type: MovementType;
  quantity: number;
  unit: string;
  reason: string;
  relatedOrderId?: string;
  performedBy: string;
  timestamp: Date;
  previousStock: number;
  newStock: number;
};

/** Low stock alert */
export type LowStockAlert = {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  currentStock: number;
  reorderPoint: number;
  percentRemaining: number;
  severity: AlertSeverity;
  isAcknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  triggeredAt: Date;
  clearedAt?: Date;
};

/** Input for stock adjustment */
export type StockAdjustmentInput = {
  type: 'ADDITION' | 'DEDUCTION' | 'SET_EXACT';
  quantity: number;
  reason: string;
  notes?: string;
  performedBy: string;
};

/** Input for creating an inventory item */
export type CreateInventoryItemInput = {
  name: string;
  category: InventoryCategory;
  unit: string;
  unitSize?: string;
  initialStock: number;
  reorderPoint: number;
  unitCost: number;
};
