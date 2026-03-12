export interface RecipeIngredient {
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  unit: string;
}

export interface Recipe {
  id: string;
  menuItemId: string;
  menuItemName: string;
  ingredients: RecipeIngredient[];
  yield: number; // How many servings this recipe makes
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  unit: string; // kg, liter, piece, etc.
  minimumStock: number;
  reorderPoint: number;
  cost: number;
  supplier?: string;
  lastRestocked?: Date;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface StockMovement {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  movementType: 'IN' | 'OUT' | 'ADJUSTMENT' | 'WASTE';
  quantity: number;
  unit: string;
  reason: string;
  orderId?: string; // If movement is due to order
  performedBy: string;
  timestamp: Date;
  previousStock: number;
  newStock: number;
}
