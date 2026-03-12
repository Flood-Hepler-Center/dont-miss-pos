import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { MenuItem } from '@/types';

export async function deductInventoryForOrder(items: Array<{ menuItem: MenuItem; quantity: number }>) {
  const deductionPromises: Promise<void>[] = [];

  for (const { menuItem, quantity } of items) {
    if (!menuItem.recipe || menuItem.recipe.length === 0) {
      continue;
    }

    for (const ingredient of menuItem.recipe) {
      const deductionPromise = async () => {
        try {
          const inventoryRef = doc(db, 'inventory', ingredient.inventoryItemId);
          const inventorySnap = await getDoc(inventoryRef);
          
          if (!inventorySnap.exists()) {
            console.warn(`Inventory item ${ingredient.inventoryItemName} not found`);
            return;
          }

          const currentStock = inventorySnap.data().currentStock || 0;
          const totalDeduction = ingredient.quantity * quantity;

          await updateDoc(inventoryRef, {
            currentStock: Math.max(0, currentStock - totalDeduction),
            lastUsed: new Date(),
          });

          console.log(`Deducted ${totalDeduction} ${ingredient.unit} of ${ingredient.inventoryItemName}`);
        } catch (error) {
          console.error(`Failed to deduct inventory for ${ingredient.inventoryItemName}:`, error);
        }
      };

      deductionPromises.push(deductionPromise());
    }
  }

  await Promise.all(deductionPromises);
}

export async function checkInventoryAvailability(menuItem: MenuItem, quantity: number): Promise<{
  available: boolean;
  missingIngredients: string[];
}> {
  if (!menuItem.recipe || menuItem.recipe.length === 0) {
    return { available: true, missingIngredients: [] };
  }

  const missingIngredients: string[] = [];

  for (const ingredient of menuItem.recipe) {
    try {
      const inventoryRef = doc(db, 'inventory', ingredient.inventoryItemId);
      const inventorySnap = await getDoc(inventoryRef);

      if (!inventorySnap.exists()) {
        missingIngredients.push(ingredient.inventoryItemName);
        continue;
      }

      const currentStock = inventorySnap.data().currentStock || 0;
      const requiredQuantity = ingredient.quantity * quantity;

      if (currentStock < requiredQuantity) {
        missingIngredients.push(`${ingredient.inventoryItemName} (need ${requiredQuantity}, have ${currentStock})`);
      }
    } catch (error) {
      console.error(`Failed to check inventory for ${ingredient.inventoryItemName}:`, error);
      missingIngredients.push(ingredient.inventoryItemName);
    }
  }

  return {
    available: missingIngredients.length === 0,
    missingIngredients,
  };
}
