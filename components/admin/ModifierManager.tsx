'use client';

import { useState } from 'react';
import type { ModifierGroup, ModifierOption } from '@/types';

interface ModifierManagerProps {
  modifiers: ModifierGroup[];
  onChange: (modifiers: ModifierGroup[]) => void;
}

export function ModifierManager({ modifiers, onChange }: ModifierManagerProps) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const addGroup = () => {
    const newGroup: ModifierGroup = {
      id: `group_${Date.now()}`,
      name: '',
      required: false,
      maxSelections: 1,
      options: [],
    };
    onChange([...modifiers, newGroup]);
    setExpandedGroup(newGroup.id);
  };

  const updateGroup = (index: number, field: keyof ModifierGroup, value: string | boolean | number) => {
    const updated = [...modifiers];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeGroup = (index: number) => {
    onChange(modifiers.filter((_, i) => i !== index));
  };

  const addOption = (groupIndex: number) => {
    const updated = [...modifiers];
    const newOption: ModifierOption = {
      id: `opt_${Date.now()}`,
      name: '',
      priceMode: 'adjustment',
      priceAdjustment: 0,
      absolutePrice: 0,
      recipeMultiplier: 1.0,
    };
    updated[groupIndex].options = [...updated[groupIndex].options, newOption];
    onChange(updated);
  };

  const updateOption = (groupIndex: number, optionIndex: number, field: keyof ModifierOption, value: string | number) => {
    const updated = [...modifiers];
    updated[groupIndex].options[optionIndex] = {
      ...updated[groupIndex].options[optionIndex],
      [field]: value,
    };
    onChange(updated);
  };

  const removeOption = (groupIndex: number, optionIndex: number) => {
    const updated = [...modifiers];
    updated[groupIndex].options = updated[groupIndex].options.filter((_, i) => i !== optionIndex);
    onChange(updated);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="text-xs font-bold">OPTIONS & MODIFIERS</label>
        <button
          type="button"
          onClick={addGroup}
          className="px-3 py-1 border border-black text-xs hover:bg-gray-100"
        >
          [+ ADD GROUP]
        </button>
      </div>

      <div className="border-2 border-black p-3 space-y-3">
        {modifiers.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4">
            No options yet. Add groups like &quot;Size&quot;, &quot;Sugar Level&quot;, etc.
          </p>
        ) : (
          modifiers.map((group, groupIndex) => (
            <div key={group.id} className="border border-black p-3">
              {/* Group Header */}
              <div className="flex justify-between items-start mb-2">
                <button
                  type="button"
                  onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
                  className="flex-1 text-left text-xs font-bold hover:underline"
                >
                  {group.name || `[Group ${groupIndex + 1}]`} {expandedGroup === group.id ? '▼' : '▶'}
                </button>
                <button
                  type="button"
                  onClick={() => removeGroup(groupIndex)}
                  className="px-2 py-1 border border-black text-xs hover:bg-red-50"
                >
                  ✗
                </button>
              </div>

              {expandedGroup === group.id && (
                <div className="space-y-3 mt-3">
                  {/* Group Details */}
                  <div>
                    <label className="block text-xs mb-1">GROUP NAME *</label>
                    <input
                      type="text"
                      value={group.name}
                      onChange={(e) => updateGroup(groupIndex, 'name', e.target.value)}
                      placeholder="e.g., Size, Sugar Level, Toppings"
                      className="w-full px-2 py-1 border border-black text-xs focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={group.required}
                          onChange={(e) => updateGroup(groupIndex, 'required', e.target.checked)}
                          className="border-2 border-black"
                        />
                        Required
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs mb-1">MAX SELECT</label>
                      <input
                        type="number"
                        min="1"
                        value={group.maxSelections}
                        onChange={(e) => updateGroup(groupIndex, 'maxSelections', parseInt(e.target.value) || 1)}
                        className="w-full px-2 py-1 border border-black text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Options */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs font-bold">OPTIONS</label>
                      <button
                        type="button"
                        onClick={() => addOption(groupIndex)}
                        className="px-2 py-1 border border-black text-xs hover:bg-gray-100"
                      >
                        [+ OPTION]
                      </button>
                    </div>

                    <div className="space-y-3">
                      {group.options.map((option, optionIndex) => (
                        <div key={option.id} className="border border-black p-2 space-y-2">
                          {/* Option Name */}
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="block text-xs mb-1 font-bold">OPTION NAME *</label>
                              <input
                                type="text"
                                value={option.name}
                                onChange={(e) => updateOption(groupIndex, optionIndex, 'name', e.target.value)}
                                placeholder="e.g., Small, Medium, Large"
                                className="w-full px-2 py-1 border border-black text-xs focus:outline-none"
                              />
                            </div>
                            <div className="flex items-end">
                              <button
                                type="button"
                                onClick={() => removeOption(groupIndex, optionIndex)}
                                className="px-2 py-1 border border-black text-xs hover:bg-red-50"
                              >
                                ✗ DEL
                              </button>
                            </div>
                          </div>

                          {/* Price Mode */}
                          <div>
                            <label className="block text-xs mb-1 font-bold">PRICE MODE</label>
                            <select
                              value={option.priceMode || 'adjustment'}
                              onChange={(e) => updateOption(groupIndex, optionIndex, 'priceMode', e.target.value)}
                              className="w-full px-2 py-1 border border-black text-xs focus:outline-none"
                            >
                              <option value="adjustment">Adjustment (+/- Base Price)</option>
                              <option value="absolute">Absolute (Override Price)</option>
                            </select>
                          </div>

                          {/* Price Fields */}
                          {option.priceMode === 'adjustment' ? (
                            <div>
                              <label className="block text-xs mb-1 font-bold">PRICE ADJUSTMENT (±฿)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={option.priceAdjustment || 0}
                                onChange={(e) => updateOption(groupIndex, optionIndex, 'priceAdjustment', parseFloat(e.target.value) || 0)}
                                placeholder="e.g., +10, -5, 0"
                                className="w-full px-2 py-1 border border-black text-xs focus:outline-none"
                              />
                              <p className="text-xs text-gray-600 mt-1">Positive = add, Negative = subtract</p>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-xs mb-1 font-bold">ABSOLUTE PRICE (฿)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={option.absolutePrice || 0}
                                onChange={(e) => updateOption(groupIndex, optionIndex, 'absolutePrice', parseFloat(e.target.value) || 0)}
                                placeholder="e.g., 2000, 3000"
                                className="w-full px-2 py-1 border border-black text-xs focus:outline-none"
                              />
                              <p className="text-xs text-gray-600 mt-1">Replaces base item price</p>
                            </div>
                          )}

                          {/* Recipe Multiplier */}
                          <div>
                            <label className="block text-xs mb-1 font-bold">RECIPE MULTIPLIER</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={option.recipeMultiplier || 1.0}
                              onChange={(e) => updateOption(groupIndex, optionIndex, 'recipeMultiplier', parseFloat(e.target.value) || 1.0)}
                              placeholder="e.g., 0.5, 1.0, 2.0"
                              className="w-full px-2 py-1 border border-black text-xs focus:outline-none"
                            />
                            <p className="text-xs text-gray-600 mt-1">Inventory scaling (Small=0.5x, Medium=1.0x, Large=2.0x)</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
