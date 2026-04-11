import type { SelectedModifier } from '@/types';

/**
 * Calculate the correct subtotal for an order item, handling both
 * absolute price modifiers (e.g., Size L = 229) and adjustment modifiers.
 * 
 * Priority:
 * 1. If any modifier has priceMode='absolute' with absolutePrice, use that price
 * 2. Otherwise, use base price + sum of all priceAdjustments
 * 
 * @param basePrice - The item's base price
 * @param quantity - Quantity ordered
 * @param modifiers - Selected modifiers with pricing info
 * @returns The calculated subtotal
 */
export function calculateItemSubtotal(
  basePrice: number,
  quantity: number,
  modifiers: SelectedModifier[] = []
): number {
  let finalPrice = basePrice;
  let hasAbsolutePrice = false;

  // Check for absolute price modifiers (takes precedence)
  for (const mod of modifiers) {
    if (mod.priceMode === 'absolute' && mod.absolutePrice !== undefined) {
      finalPrice = mod.absolutePrice;
      hasAbsolutePrice = true;
      break; // Only one absolute price should apply
    }
  }

  // Apply adjustments only if no absolute price was set
  if (!hasAbsolutePrice) {
    const totalAdjustment = modifiers.reduce(
      (sum, mod) => sum + (mod.priceAdjustment || 0),
      0
    );
    finalPrice = basePrice + totalAdjustment;
  }

  return Math.round(finalPrice * quantity * 100) / 100;
}

/**
 * Get the unit price for an item after applying modifiers.
 * Useful for displaying the effective price per unit.
 * 
 * @param basePrice - The item's base price
 * @param modifiers - Selected modifiers with pricing info
 * @returns The effective unit price
 */
export function getEffectiveUnitPrice(
  basePrice: number,
  modifiers: SelectedModifier[] = []
): number {
  return calculateItemSubtotal(basePrice, 1, modifiers);
}
