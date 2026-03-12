'use client';

import { useState, useEffect } from 'react';
import type { MenuItem, ModifierGroup, ModifierOption, SelectedModifier } from '@/types';
import { X } from 'lucide-react';

interface ItemModifierModalProps {
  item: MenuItem;
  onClose: () => void;
  onAddToCart: (item: MenuItem, quantity: number, modifiers: SelectedModifier[]) => void;
}

export function ItemModifierModal({ item, onClose, onAddToCart }: ItemModifierModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Initialize selections for required groups
    const initial: Record<string, string[]> = {};
    item.modifiers?.forEach((group) => {
      initial[group.id] = [];
    });
    setSelections(initial);
  }, [item]);

  const handleOptionToggle = (group: ModifierGroup, option: ModifierOption) => {
    const groupSelections = selections[group.id] || [];
    const isSelected = groupSelections.includes(option.id);

    if (isSelected) {
      // Remove selection
      setSelections({
        ...selections,
        [group.id]: groupSelections.filter((id) => id !== option.id),
      });
    } else {
      // Add selection
      if (group.maxSelections === 1) {
        // Radio behavior - replace
        setSelections({
          ...selections,
          [group.id]: [option.id],
        });
      } else {
        // Checkbox behavior - add if under limit
        if (groupSelections.length < group.maxSelections) {
          setSelections({
            ...selections,
            [group.id]: [...groupSelections, option.id],
          });
        }
      }
    }
    setError('');
  };

  const calculateTotal = () => {
    let basePrice = item.price;
    let hasAbsolutePrice = false;
    
    // First pass: check for absolute price modifiers
    item.modifiers?.forEach((group) => {
      const groupSelections = selections[group.id] || [];
      groupSelections.forEach((optionId) => {
        const option = group.options.find((opt) => opt.id === optionId);
        if (option && option.priceMode === 'absolute' && option.absolutePrice) {
          basePrice = option.absolutePrice;
          hasAbsolutePrice = true;
        }
      });
    });
    
    // Second pass: add adjustments (only if no absolute price)
    if (!hasAbsolutePrice) {
      item.modifiers?.forEach((group) => {
        const groupSelections = selections[group.id] || [];
        groupSelections.forEach((optionId) => {
          const option = group.options.find((opt) => opt.id === optionId);
          if (option && option.priceMode === 'adjustment') {
            basePrice += option.priceAdjustment;
          }
        });
      });
    }
    
    return basePrice * quantity;
  };

  const handleAddToCart = () => {
    // Validate required groups
    const missingRequired: string[] = [];
    item.modifiers?.forEach((group) => {
      if (group.required && (!selections[group.id] || selections[group.id].length === 0)) {
        missingRequired.push(group.name);
      }
    });

    if (missingRequired.length > 0) {
      setError(`Please select: ${missingRequired.join(', ')}`);
      return;
    }

    // Convert selections to array format
    const selectedModifiers: SelectedModifier[] = [];
    item.modifiers?.forEach((group) => {
      const groupSelections = selections[group.id] || [];
      groupSelections.forEach((optionId) => {
        const option = group.options.find((opt) => opt.id === optionId);
        if (option) {
          selectedModifiers.push({
            modifierGroupId: group.id,
            modifierGroupName: group.name,
            optionId: option.id,
            optionName: option.name,
            priceMode: option.priceMode,
            priceAdjustment: option.priceAdjustment,
            absolutePrice: option.absolutePrice,
            recipeMultiplier: option.recipeMultiplier,
          });
        }
      });
    });

    onAddToCart(item, quantity, selectedModifiers);
    onClose();
  };

  const hasModifiers = item.modifiers && item.modifiers.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white border-t-4 md:border-2 border-black w-full md:max-w-lg max-h-[90vh] overflow-y-auto font-mono">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b-2 border-black p-4 z-10">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-lg font-bold mb-1">{item.name}</h2>
              <p className="text-xs text-gray-600">{item.description}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 border-2 border-black hover:bg-gray-100"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Modifiers */}
          {hasModifiers ? (
            <div className="space-y-4">
              {item.modifiers!.map((group) => (
                <div key={group.id} className="border-2 border-black p-3">
                  <div className="mb-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold">{group.name}</h3>
                      {group.required && (
                        <span className="text-xs bg-black text-white px-2 py-1">REQUIRED</span>
                      )}
                    </div>
                    {group.maxSelections > 1 && (
                      <p className="text-xs text-gray-600 mt-1">
                        Select up to {group.maxSelections}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    {group.options.map((option) => {
                      const isSelected = (selections[group.id] || []).includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => handleOptionToggle(group, option)}
                          className={`w-full p-3 border-2 transition-all text-left ${
                            isSelected
                              ? 'border-black bg-black text-white'
                              : 'border-black bg-white hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-bold">{option.name}</span>
                            {option.priceMode === 'absolute' && option.absolutePrice ? (
                              <span className="text-sm font-bold">
                                ฿{option.absolutePrice.toFixed(0)}
                              </span>
                            ) : option.priceAdjustment !== 0 ? (
                              <span className="text-sm">
                                {option.priceAdjustment > 0 ? '+' : ''}฿{option.priceAdjustment.toFixed(0)}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-2 border-black p-4 text-center">
              <p className="text-sm text-gray-600">No customization options</p>
            </div>
          )}

          {/* Quantity */}
          <div className="border-2 border-black p-3">
            <label className="block text-xs font-bold mb-2">QUANTITY</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 border-2 border-black bg-white text-xl font-bold hover:bg-gray-100"
              >
                −
              </button>
              <span className="flex-1 text-center text-2xl font-bold">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-10 border-2 border-black bg-white text-xl font-bold hover:bg-gray-100"
              >
                +
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="border-2 border-red-600 bg-red-50 p-3">
              <p className="text-sm text-red-600 font-bold">{error}</p>
            </div>
          )}

          {/* Add to Cart */}
          <button
            onClick={handleAddToCart}
            className="w-full p-4 border-2 border-black bg-black text-white font-bold text-lg hover:bg-gray-800"
          >
            ADD TO CART - ฿{calculateTotal().toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  );
}
