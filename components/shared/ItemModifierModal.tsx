'use client';

import { useState, useEffect } from 'react';
import type { MenuItem, ModifierGroup, ModifierOption, SelectedModifier } from '@/types';
import { X } from 'lucide-react';

interface ItemModifierModalProps {
  item: MenuItem;
  quantity?: number;
  onClose: () => void;
  onConfirm: (quantity: number, modifiers: SelectedModifier[]) => void;
}

export function ItemModifierModal({ item, quantity: initialQuantity = 1, onClose, onConfirm }: ItemModifierModalProps) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Initialize selections for all groups
    const initial: Record<string, string[]> = {};
    item.modifiers?.forEach((group) => {
      initial[group.id] = [];
    });
    setSelections(initial);
    setError(''); // Reset error when item changes
  }, [item]);

  // Check if all required modifier groups have selections
  const validateRequiredSelections = (): { isValid: boolean; missingGroups: string[] } => {
    const missingGroups: string[] = [];
    item.modifiers?.forEach((group) => {
      if (group.required) {
        const groupSelections = selections[group.id] || [];
        if (groupSelections.length === 0) {
          missingGroups.push(group.name);
        }
      }
    });
    return { isValid: missingGroups.length === 0, missingGroups };
  };

  const { isValid: allRequiredSelected, missingGroups } = validateRequiredSelections();

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

  const handleConfirm = () => {
    // Validate required groups (should not happen if button is disabled, but safety check)
    if (!allRequiredSelected) {
      setError(`Please select: ${missingGroups.join(', ')}`);
      return;
    }

    // Build selected modifiers array
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
            priceAdjustment: option.priceAdjustment,
            priceMode: option.priceMode || 'adjustment',
            absolutePrice: option.absolutePrice,
            recipeMultiplier: option.recipeMultiplier,
          });
        }
      });
    });

    onConfirm(quantity, selectedModifiers);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white border-2 border-black max-w-2xl w-full max-h-[90vh] flex flex-col font-mono">
        {/* Header */}
        <div className="border-b-2 border-black p-4 sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex-1 text-center">
              <div className="text-sm">═══════</div>
              <h2 className="text-lg font-bold my-1">{item.name.toUpperCase()}</h2>
              <p className="text-xs">฿{item.price.toFixed(2)}</p>
              <div className="text-sm">═══════</div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modifier Groups */}
        <div className="flex-1 overflow-y-auto p-4">
          {item.modifiers && item.modifiers.length > 0 ? (
            <div className="space-y-4">
              {item.modifiers.map((group) => (
                <div key={group.id} className="border-2 border-black p-3">
                  <div className="mb-3">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-sm">
                        {group.name.toUpperCase()}
                      </h3>
                      {group.required && (
                        <span
                          className={`text-xs px-2 py-1 ${
                            (selections[group.id] || []).length > 0
                              ? 'bg-green-600 text-white'
                              : 'bg-red-600 text-white animate-pulse'
                          }`}
                        >
                          {(selections[group.id] || []).length > 0 ? '✓ SELECTED' : 'REQUIRED'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {group.maxSelections === 1
                        ? 'Select one'
                        : `Select up to ${group.maxSelections}`}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {group.options.map((option) => {
                      const isSelected = selections[group.id]?.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          onClick={() => handleOptionToggle(group, option)}
                          className={`w-full text-left p-3 border-2 border-black transition-colors ${
                            isSelected ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-sm">{option.name}</span>
                            {option.priceMode === 'absolute' && option.absolutePrice ? (
                              <span className="text-sm">฿{option.absolutePrice.toFixed(2)}</span>
                            ) : option.priceAdjustment !== 0 ? (
                              <span className="text-sm">
                                {option.priceAdjustment > 0 ? '+' : ''}฿{option.priceAdjustment.toFixed(2)}
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
            <div className="text-center py-12 text-gray-600">
              <p className="text-sm">NO MODIFIERS AVAILABLE</p>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 border-2 border-red-600 bg-red-50 text-red-600 text-sm font-bold">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t-2 border-black p-4 bg-white sticky bottom-0">
          {/* Quantity */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <span className="text-sm font-bold">QUANTITY:</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 border-2 border-black hover:bg-gray-100 font-bold"
              >
                -
              </button>
              <span className="w-12 text-center font-bold text-lg">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-10 border-2 border-black hover:bg-gray-100 font-bold"
              >
                +
              </button>
            </div>
          </div>

          {/* Total & Confirm */}
          <div className="space-y-3">
            <div className="flex justify-between text-lg font-bold border-t-2 border-dashed border-black pt-3">
              <span>TOTAL:</span>
              <span>฿{calculateTotal().toFixed(2)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onClose}
                className="px-6 py-3 border-2 border-black bg-white hover:bg-gray-100 font-bold text-sm"
              >
                [CANCEL]
              </button>
              <button
                onClick={handleConfirm}
                disabled={!allRequiredSelected}
                className={`px-6 py-3 border-2 font-bold text-sm transition-all ${
                  allRequiredSelected
                    ? 'border-black bg-black text-white hover:bg-gray-800'
                    : 'border-gray-300 bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {allRequiredSelected ? '[CONFIRM]' : '[SELECT REQUIRED]'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
