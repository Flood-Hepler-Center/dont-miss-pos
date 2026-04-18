'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { MenuItem, Recipe, RecipeIngredient, InventoryItem } from '@/types';


export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    menuItemId: '',
    ingredients: [] as RecipeIngredient[],
    yield: 1,
  });

  useEffect(() => {
    const recipesQuery = query(collection(db, 'recipes'), orderBy('menuItemName', 'asc'));
    const unsubscribe = onSnapshot(recipesQuery, (snapshot) => {
      const recipesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Recipe[];
      setRecipes(recipesData.filter((r) => r.isActive));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const menuQuery = query(collection(db, 'menuItems'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(menuQuery, (snapshot) => {
      const itemsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MenuItem[];
      setMenuItems(itemsData.filter((i) => i.isActive));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const inventoryQuery = query(collection(db, 'inventory'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(inventoryQuery, (snapshot) => {
      const inventoryData = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          currentStock: data.currentStock,
          unit: data.unit,
          unitCost: data.costPerUnit || data.unitCost || 0,
        };
      }) as InventoryItem[];
      setInventoryItems(inventoryData);
    });

    return () => unsubscribe();
  }, []);

  const handleAdd = () => {
    setEditingRecipe(null);
    setFormData({
      menuItemId: '',
      ingredients: [],
      yield: 1,
    });
    setModalVisible(true);
  };

  const handleEdit = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setFormData({
      menuItemId: recipe.menuItemId,
      ingredients: recipe.ingredients,
      yield: recipe.yield || 1,
    });
    setModalVisible(true);
  };

  const handleAddIngredient = () => {
    if (inventoryItems.length === 0) return;
    const firstItem = inventoryItems[0];
    setFormData({
      ...formData,
      ingredients: [
        ...formData.ingredients,
        {
          inventoryItemId: firstItem.id,
          inventoryItemName: firstItem.name,
          quantity: 1,
          unit: firstItem.unit,
        },
      ],
    });
  };

  const handleRemoveIngredient = (index: number) => {
    setFormData({
      ...formData,
      ingredients: formData.ingredients.filter((_, i) => i !== index),
    });
  };

  const handleUpdateIngredient = (index: number, field: keyof RecipeIngredient, value: string | number) => {
    const updated = [...formData.ingredients];
    if (field === 'inventoryItemId') {
      const item = inventoryItems.find((i) => i.id === value as string);
      if (item) {
        updated[index] = {
          ...updated[index],
          inventoryItemId: value as string,
          inventoryItemName: item.name,
          unit: item.unit,
        };
      }
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setFormData({ ...formData, ingredients: updated });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.menuItemId || formData.ingredients.length === 0) return;

    setLoading(true);
    try {
      const menuItem = menuItems.find((i) => i.id === formData.menuItemId);
      if (!menuItem) return;

      const recipeData = {
        menuItemId: formData.menuItemId,
        menuItemName: menuItem.name,
        ingredients: formData.ingredients,
        yield: formData.yield || 1,
        isActive: true,
      };

      // Calculate cost per serving
      let totalCost = 0;
      formData.ingredients.forEach(ing => {
        const invItem = inventoryItems.find(i => i.id === ing.inventoryItemId);
        if (invItem && invItem.unitCost) {
          totalCost += (ing.quantity * invItem.unitCost);
        }
      });
      const costPerServing = totalCost / (formData.yield || 1);

      if (editingRecipe) {
        await updateDoc(doc(db, 'recipes', editingRecipe.id), recipeData);
      } else {
        const newRecipeRef = doc(collection(db, 'recipes'));
        await setDoc(newRecipeRef, recipeData);
      }

      // Sync cost to MenuItem
      await updateDoc(doc(db, 'menuItems', formData.menuItemId), {
        costPrice: costPerServing,
        updatedAt: new Date()
      });

      setModalVisible(false);
      setFormData({ menuItemId: '', ingredients: [], yield: 1 });
    } catch (error) {
      console.error('Failed to save recipe:', error);
      alert('Failed to save recipe');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await updateDoc(doc(db, 'recipes', id), { isActive: false });
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete recipe:', error);
      alert('Failed to delete recipe');
    }
  };

  const checkAvailability = (recipe: Recipe): { available: boolean; missing: string[]; maxServings: number; costPerServing: number } => {
    const missing: string[] = [];
    let maxServings = Infinity;
    const recipeYield = recipe.yield || 1;
    let totalCost = 0;

    if (!recipe.ingredients || recipe.ingredients.length === 0) {
      return { available: false, missing: ['No ingredients defined'], maxServings: 0, costPerServing: 0 };
    }

    recipe.ingredients.forEach((ingredient) => {
      const invItem = inventoryItems.find((i) => i.id === ingredient.inventoryItemId);
      const quantityPerServing = ingredient.quantity / recipeYield;
      
      if (!invItem) {
        missing.push(ingredient.inventoryItemName);
        maxServings = 0;
        return;
      }

      if (invItem.unitCost) {
        totalCost += (ingredient.quantity * invItem.unitCost);
      }

      if (quantityPerServing > 0) {
        const possibleServings = Math.floor(invItem.currentStock / quantityPerServing);
        if (possibleServings < 1) {
          missing.push(ingredient.inventoryItemName);
        }
        if (possibleServings < maxServings) {
          maxServings = possibleServings;
        }
      }
    });

    if (maxServings === Infinity) maxServings = 0;

    return { available: maxServings >= 1, missing, maxServings, costPerServing: totalCost / recipeYield };
  };

  return (
    <div className="min-h-screen bg-white font-mono p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-2 border-black p-4 mb-6 text-center">
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
          <h1 className="text-xl md:text-2xl font-bold my-2">RECIPE MANAGEMENT</h1>
          <p className="text-xs md:text-sm">{recipes.length} Recipes • Auto-Stock System</p>
          <div className="text-sm hidden md:block">════════════════════════════════════</div>
          <div className="text-xl md:hidden">═══════════</div>
        </div>

        {/* Add Button */}
        <div className="mb-6">
          <button
            onClick={handleAdd}
            className="w-full md:w-auto px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800"
          >
            [+ ADD RECIPE]
          </button>
        </div>

        {/* Recipes List - Desktop */}
        <div className="hidden md:block border-2 border-black mb-6">
          <div className="border-b-2 border-black p-3 bg-white">
            <div className="grid grid-cols-6 gap-4 text-xs font-bold">
              <div>MENU ITEM</div>
              <div>INGREDIENTS</div>
              <div>COST / SERVING</div>
              <div>INVENTORY STATUS</div>
              <div className="text-center flex flex-col justify-center leading-tight">
                <span>AVAILABLE</span>
                <span className="text-[10px] text-gray-500">(SERVINGS)</span>
              </div>
              <div className="text-center">ACTIONS</div>
            </div>
          </div>
          <div className="divide-y-2 divide-black">
            {recipes.map((recipe) => {
              const { available, missing, maxServings, costPerServing } = checkAvailability(recipe);
              const menuItem = menuItems.find(i => i.id === recipe.menuItemId);
              const margin = menuItem && menuItem.price && costPerServing
                ? ((menuItem.price - costPerServing) / menuItem.price * 100).toFixed(1)
                : null;

              return (
                <div key={recipe.id} className="p-3 hover:bg-gray-50">
                  <div className="grid grid-cols-6 gap-4 text-sm items-center">
                    <div className="font-bold">
                      {recipe.menuItemName}
                      {menuItem && (
                        <div className="text-[10px] font-normal text-gray-500">
                          Price: ฿{menuItem.price.toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div className="text-xs">
                      {recipe.ingredients.map((ing, idx) => (
                        <div key={idx}>
                          {ing.quantity} {ing.unit} {ing.inventoryItemName}
                        </div>
                      ))}
                    </div>
                    <div className="font-bold">
                      ฿{costPerServing.toFixed(2)}
                      {margin && (
                        <div className="text-[10px] font-normal text-gray-500">
                          Margin: {margin}%
                        </div>
                      )}
                    </div>
                    <div className="text-xs">
                      {missing.length > 0 ? (
                        <span className="text-red-600">Missing: {missing.join(', ')}</span>
                      ) : (
                        <span className="text-green-600">All Available</span>
                      )}
                    </div>
                    <div className="text-center flex flex-col items-center justify-center gap-1">
                      <span
                        className={`px-2 py-1 border-2 border-black text-xs ${
                          available ? 'bg-green-100' : 'bg-red-100'
                        }`}
                      >
                        {available ? '✓' : '✗'}
                      </span>
                      <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-1 py-0.5 rounded">
                        {maxServings} SERVES
                      </span>
                    </div>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleEdit(recipe)}
                        className="px-3 py-1 border border-black text-xs hover:bg-gray-100"
                      >
                        [EDIT]
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(recipe.id)}
                        className="px-3 py-1 border border-black text-xs hover:bg-red-50"
                      >
                        [DEL]
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recipes List - Mobile */}
        <div className="md:hidden space-y-3">
          {recipes.map((recipe) => {
            return (
              <div key={recipe.id} className="border-2 border-black p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-sm">{recipe.menuItemName}</p>
                    {(() => {
                      const { available, maxServings, costPerServing, missing } = checkAvailability(recipe);
                      const menuItem = menuItems.find(i => i.id === recipe.menuItemId);
                      const margin = menuItem && menuItem.price && costPerServing
                        ? ((menuItem.price - costPerServing) / menuItem.price * 100).toFixed(1)
                        : null;
                      
                      return (
                        <>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <span
                              className={`inline-block px-2 py-1 border-2 border-black text-[10px] font-bold ${
                                available ? 'bg-green-100' : 'bg-red-100'
                              }`}
                            >
                              {available ? '✓ AVAILABLE' : '✗ UNAVAILABLE'} • {maxServings} SERVES
                            </span>
                            <span className="inline-block px-2 py-1 border-2 border-black text-[10px] font-bold bg-yellow-50">
                              COST: ฿{costPerServing.toFixed(2)}
                            </span>
                            {margin && (
                              <span className="inline-block px-2 py-1 border-2 border-black text-[10px] font-bold bg-blue-50">
                                MARGIN: {margin}%
                              </span>
                            )}
                          </div>
                          {missing.length > 0 && (
                            <div className="text-[10px] text-red-600 mt-2 font-bold">
                              Missing: {missing.join(', ')}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="text-xs mb-3">
                  <p className="font-bold mb-1">INGREDIENTS:</p>
                  {recipe.ingredients.map((ing, idx) => (
                    <div key={idx}>
                      • {ing.quantity} {ing.unit} {ing.inventoryItemName}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleEdit(recipe)}
                    className="px-3 py-2 border-2 border-black text-xs font-bold hover:bg-gray-100"
                  >
                    [EDIT]
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(recipe.id)}
                    className="px-3 py-2 border-2 border-black text-xs font-bold hover:bg-red-50"
                  >
                    [DELETE]
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {recipes.length === 0 && (
          <div className="border-2 border-black p-12 text-center">
            <p className="text-sm text-gray-600">NO RECIPES YET</p>
          </div>
        )}

        {/* Add/Edit Modal */}
        {modalVisible && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white border-2 border-black max-w-3xl w-full font-mono my-8">
              <div className="border-b-2 border-black p-4">
                <h2 className="text-lg font-bold text-center">
                  {editingRecipe ? '[EDIT RECIPE]' : '[ADD RECIPE]'}
                </h2>
              </div>
              <form onSubmit={handleSave} className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-2">MENU ITEM *</label>
                  <select
                    value={formData.menuItemId}
                    onChange={(e) => setFormData({ ...formData, menuItemId: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                    required
                  >
                    <option value="">SELECT MENU ITEM</option>
                    {menuItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-2">YIELD (SERVINGS PER RECIPE) *</label>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="number"
                      value={formData.yield}
                      onChange={(e) => setFormData({ ...formData, yield: parseFloat(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border-2 border-black text-sm focus:outline-none"
                      min={0.1}
                      step={0.1}
                      required
                    />
                    {(() => {
                      const tempRecipe = { ...formData, id: 'temp', menuItemName: '', isActive: true, createdAt: new Date(), updatedAt: new Date() } as Recipe;
                      const { costPerServing } = checkAvailability(tempRecipe);
                      const menuItem = menuItems.find(i => i.id === formData.menuItemId);
                      const margin = menuItem && menuItem.price && costPerServing
                        ? ((menuItem.price - costPerServing) / menuItem.price * 100).toFixed(1)
                        : null;

                      return (
                        <div className="border-2 border-black p-2 bg-yellow-50 text-xs flex flex-col justify-center">
                          <div className="font-bold text-center">COST PREVIEW</div>
                          <div className="flex justify-between mt-1">
                            <span>Cost/Serve:</span>
                            <span className="font-bold text-lg">฿{costPerServing.toFixed(2)}</span>
                          </div>
                          {margin && (
                            <div className="flex justify-between">
                              <span>Margin:</span>
                              <span className="font-bold">{margin}%</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 italic">Example: If this recipe makes 10 chicken pops, set yield to 10.</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold">INGREDIENTS *</label>
                    <button
                      type="button"
                      onClick={handleAddIngredient}
                      className="px-3 py-1 border border-black text-xs hover:bg-gray-100"
                    >
                      [+ ADD INGREDIENT]
                    </button>
                  </div>
                  <div className="border-2 border-black p-3 space-y-3">
                    {formData.ingredients.map((ingredient, index) => {
                      const invItem = inventoryItems.find(i => i.id === ingredient.inventoryItemId);
                      const rowCost = invItem && invItem.unitCost ? (ingredient.quantity * invItem.unitCost) : 0;
                      
                      return (
                        <div key={index} className="grid grid-cols-12 gap-2 items-end pb-3 border-b border-black last:border-0 last:pb-0">
                          <div className="col-span-4">
                            <label className="block text-[10px] mb-1">ITEM</label>
                            <select
                              value={ingredient.inventoryItemId}
                              onChange={(e) => handleUpdateIngredient(index, 'inventoryItemId', e.target.value)}
                              className="w-full px-2 py-1 border border-black text-xs focus:outline-none"
                            >
                              {inventoryItems.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[10px] mb-1">QTY</label>
                            <input
                              type="number"
                              step="0.01"
                              value={ingredient.quantity}
                              onChange={(e) =>
                                handleUpdateIngredient(index, 'quantity', parseFloat(e.target.value) || 0)
                              }
                              className="w-full px-2 py-1 border border-black text-xs focus:outline-none"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[10px] mb-1">UNIT</label>
                            <input
                              type="text"
                              value={ingredient.unit}
                              disabled
                              className="w-full px-2 py-1 border border-black text-xs bg-gray-100"
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="block text-[10px] mb-1 font-bold">COST</label>
                            <div className="px-2 py-1 border border-black text-xs bg-gray-50 font-bold">
                              ฿{rowCost.toFixed(2)}
                            </div>
                          </div>
                          <div className="col-span-1 flex items-end">
                            <button
                              type="button"
                              onClick={() => handleRemoveIngredient(index)}
                              className="px-2 py-1 border border-black text-xs hover:bg-red-50"
                            >
                              ✗
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {formData.ingredients.length === 0 && (
                      <p className="text-xs text-gray-600 text-center py-4">No ingredients added</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4 border-t-2 border-black">
                  <button
                    type="button"
                    onClick={() => setModalVisible(false)}
                    className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
                  >
                    [CANCEL]
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3 border-2 border-black bg-black text-white font-bold text-sm hover:bg-gray-800"
                  >
                    {loading ? 'SAVING...' : '[SAVE]'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-black max-w-md w-full font-mono p-6">
              <h3 className="text-lg font-bold mb-4 text-center">CONFIRM DELETE</h3>
              <p className="text-sm mb-6 text-center">Are you sure you want to delete this recipe?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-6 py-3 border-2 border-black bg-white text-black font-bold text-sm hover:bg-gray-100"
                >
                  [CANCEL]
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="px-6 py-3 border-2 border-black bg-red-600 text-white font-bold text-sm hover:bg-red-700"
                >
                  [DELETE]
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
