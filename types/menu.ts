/**
 * Menu & Category Types
 * Source: BA Data Model - dm-menu-inventory.md
 */
import { RecipeIngredient } from './inventory';

/** Menu category for grouping items (e.g., "Food", "Beverages") */
export type MenuCategory = {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Menu item available for ordering */
export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  categoryName: string;
  price: number;
  costPrice?: number;
  margin?: number;
  imageUrl?: string;
  imagePath?: string;
  isActive: boolean;
  isAvailable: boolean;
  displayOrder: number;
  isPopular?: boolean;
  hasStockTracking?: boolean;
  stock?: number;
  tags?: string[];
  prepStation?: 'HOT_KITCHEN' | 'COLD_KITCHEN' | 'DRINK' | 'DESSERT' | 'GENERAL';
  targetPrepMinutes?: number;
  batchCookable?: boolean;
  cookPriority?: number;
  modifiers?: ModifierGroup[];
  recipe?: RecipeIngredient[];
  salesCount?: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
};

/** Modifier group for item customization (e.g., "Spice Level") */
export type ModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  maxSelections: number;
  options: ModifierOption[];
};

/** Individual modifier option (e.g., "Extra Spicy") */
export type ModifierOption = {
  id: string;
  name: string;
  priceMode: 'adjustment' | 'absolute';  // adjustment: +/- base price, absolute: replace base price
  priceAdjustment: number;                // Used when priceMode = 'adjustment'
  absolutePrice?: number;                 // Used when priceMode = 'absolute' (e.g., Size M = ฿3000)
  recipeMultiplier?: number;              // Multiplier for recipe ingredients (e.g., Size S = 1.0, L = 2.0)
};


/** Input type for creating a new category */
export type CreateCategoryInput = {
  name: string;
  description?: string;
  displayOrder: number;
};

/** Input type for creating a new menu item */
export type CreateMenuItemInput = {
  name: string;
  description?: string;
  categoryId: string;
  categoryName: string;
  price: number;
  costPrice?: number;
  imageUrl?: string;
  imagePath?: string;
  isActive?: boolean;
  isAvailable?: boolean;
  displayOrder?: number;
  isPopular?: boolean;
  hasStockTracking?: boolean;
  stock?: number;
  tags?: string[];
  modifiers?: ModifierGroup[];
  recipe?: RecipeIngredient[];
};
