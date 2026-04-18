/**
 * Cost Calculator Utility
 *
 * Shared logic for computing per-serving and per-line costs
 * based on Recipe BOM → Inventory unit cost.
 *
 * Used by:
 *  - Reports service (summary-by-day, GP% calcs)
 *  - Admin dashboard (live cost/GP per order and payment)
 */

import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { SelectedModifier } from '@/types';

export type RecipeIngredient = {
  inventoryItemId: string;
  quantity: number;
};

export type RecipeInfo = {
  ingredients: RecipeIngredient[];
  yield: number;
};

export type MenuItemFallback = {
  costPrice?: number;
};

export type CostMaps = {
  /** menuItemId → recipe */
  recipeByMenuItemId: Map<string, RecipeInfo>;
  /** inventoryItemId → unit cost (THB) */
  inventoryCostById: Map<string, number>;
  /** menuItemId → fallback costPrice */
  menuItemById: Map<string, MenuItemFallback>;
};

/**
 * Compute the cost for a single serving of a menu item.
 * Prefers BOM via recipe; falls back to menuItem.costPrice.
 * Applies recipeMultiplier for size-variant modifiers.
 */
export function getCostPerServing(
  menuItemId: string,
  maps: CostMaps,
  recipeMultiplier: number = 1,
): number {
  const recipe = maps.recipeByMenuItemId.get(menuItemId);
  if (recipe && recipe.ingredients.length > 0) {
    let total = 0;
    for (const ing of recipe.ingredients) {
      const unit = maps.inventoryCostById.get(ing.inventoryItemId) || 0;
      total += ing.quantity * unit;
    }
    return (total / (recipe.yield || 1)) * recipeMultiplier;
  }
  const menuItem = maps.menuItemById.get(menuItemId);
  return (menuItem?.costPrice || 0) * recipeMultiplier;
}

/**
 * Extract recipe multiplier from an order item's modifiers.
 * Returns 1 if no multiplier is present.
 */
export function getRecipeMultiplier(modifiers?: SelectedModifier[]): number {
  if (!modifiers || modifiers.length === 0) return 1;
  const m = modifiers.find((x) => x.recipeMultiplier && x.recipeMultiplier > 0);
  return m?.recipeMultiplier ?? 1;
}

/**
 * Compute line cost for an order item (cost × quantity).
 */
export function getLineCost(
  menuItemId: string,
  quantity: number,
  modifiers: SelectedModifier[] | undefined,
  maps: CostMaps,
): number {
  const multiplier = getRecipeMultiplier(modifiers);
  const perServing = getCostPerServing(menuItemId, maps, multiplier);
  return perServing * quantity;
}

/**
 * One-time fetch of all maps needed for cost calculation.
 * Fetches: menuItems, recipes (active only), inventory stock items.
 *
 * Call this once on dashboard mount / before building a report.
 * Handles both `costPerUnit` and legacy `unitCost` inventory fields.
 */
export async function fetchCostMaps(): Promise<CostMaps> {
  const [menuSnap, recipeSnap, invSnap] = await Promise.all([
    getDocs(collection(db, 'menuItems')),
    getDocs(collection(db, 'recipes')),
    getDocs(collection(db, 'inventory')),
  ]);

  const menuItemById = new Map<string, MenuItemFallback>();
  menuSnap.docs.forEach((doc) => {
    const data = doc.data();
    menuItemById.set(doc.id, { costPrice: data.costPrice || 0 });
  });

  const recipeByMenuItemId = new Map<string, RecipeInfo>();
  recipeSnap.docs.forEach((doc) => {
    const data = doc.data();
    if (data.isActive !== false && data.menuItemId) {
      recipeByMenuItemId.set(data.menuItemId, {
        ingredients: data.ingredients || [],
        yield: data.yield || 1,
      });
    }
  });

  const inventoryCostById = new Map<string, number>();
  invSnap.docs.forEach((doc) => {
    const data = doc.data();
    inventoryCostById.set(doc.id, data.costPerUnit || data.unitCost || 0);
  });

  return { menuItemById, recipeByMenuItemId, inventoryCostById };
}
