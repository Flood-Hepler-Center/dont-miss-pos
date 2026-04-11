import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MenuItem, SelectedModifier } from '@/types';
import { calculateItemSubtotal } from '@/lib/utils/price';

export interface CartItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers?: SelectedModifier[];
  subtotal: number;
}

interface CartState {
  items: CartItem[];
  tableId: string | null;
  sessionId: string | null;

  setTableId: (tableId: string) => void;
  setSessionId: (sessionId: string) => void;
  addItem: (item: MenuItem, quantity: number, modifiers?: SelectedModifier[]) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;

  getSubtotal: () => number;
  getTax: () => number;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      tableId: null,
      sessionId: null,

      setTableId: (tableId) => set({ tableId }),
      
      setSessionId: (sessionId) => set({ sessionId }),

      addItem: (item, quantity, modifiers = []) => {
        const existingItemIndex = get().items.findIndex(
          (cartItem) =>
            cartItem.menuItemId === item.id &&
            JSON.stringify(cartItem.modifiers) === JSON.stringify(modifiers)
        );

        if (existingItemIndex >= 0) {
          set((state) => ({
            items: state.items.map((cartItem, index) =>
              index === existingItemIndex
                ? {
                    ...cartItem,
                    quantity: cartItem.quantity + quantity,
                    subtotal: calculateItemSubtotal(
                      cartItem.price,
                      cartItem.quantity + quantity,
                      cartItem.modifiers
                    ),
                  }
                : cartItem
            ),
          }));
        } else {
          const cartItem: CartItem = {
            id: crypto.randomUUID(),
            menuItemId: item.id,
            name: item.name,
            price: item.price,
            quantity,
            modifiers,
            subtotal: calculateItemSubtotal(item.price, quantity, modifiers),
          };
          set((state) => ({ items: [...state.items, cartItem] }));
        }
      },

      removeItem: (itemId) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== itemId) })),

      updateQuantity: (itemId, quantity) => {
        if (quantity < 1) {
          get().removeItem(itemId);
          return;
        }
        set((state) => ({
          items: state.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  quantity,
                  subtotal: calculateItemSubtotal(item.price, quantity, item.modifiers),
                }
              : item
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      getSubtotal: () => {
        const subtotal = get().items.reduce((sum, item) => sum + item.subtotal, 0);
        return Math.round(subtotal * 100) / 100;
      },

      getTax: () => {
        return 0;
      },

      getTotal: () => {
        return get().getSubtotal();
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },
    }),
    {
      name: 'cart-storage',
    }
  )
);
