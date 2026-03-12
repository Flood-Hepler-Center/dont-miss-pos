import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'STAFF' | 'ADMIN' | null;

interface AuthState {
  isAuthenticated: boolean;
  role: UserRole;
  staffId: string | null;
  staffName: string | null;
  _hasHydrated: boolean;
  
  setHasHydrated: (state: boolean) => void;
  login: (pin: string, role: 'STAFF' | 'ADMIN') => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      role: null,
      staffId: null,
      staffName: null,
      _hasHydrated: false,

      setHasHydrated: (state: boolean) => {
        set({ _hasHydrated: state });
      },

      login: async (pin: string, role: 'STAFF' | 'ADMIN') => {
        const validPin = role === 'ADMIN'
          ? process.env.NEXT_PUBLIC_ADMIN_PIN || '1234'
          : process.env.NEXT_PUBLIC_STAFF_PIN || '1234';

        if (pin === validPin) {
          set({
            isAuthenticated: true,
            role,
            staffId: `staff_${Date.now()}`,
            staffName: role === 'ADMIN' ? 'Admin User' : 'Staff User',
          });
          return true;
        }
        return false;
      },

      logout: () => {
        set({
          isAuthenticated: false,
          role: null,
          staffId: null,
          staffName: null,
        });
      },
    }),
    {
      name: 'auth-storage',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
