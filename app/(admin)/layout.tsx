'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { useLateBookingsCount } from '@/lib/hooks/useLateBookingsCount';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, role, logout, _hasHydrated } = useAuthStore();
  const lateBookingsCount = useLateBookingsCount();

  useEffect(() => {
    if (_hasHydrated && (!isAuthenticated || role !== 'ADMIN')) {
      router.push('/login');
    }
  }, [isAuthenticated, role, router, _hasHydrated]);

  if (!_hasHydrated) {
    return (
      <div className="min-h-screen bg-white font-mono flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl">═══════════</div>
          <p className="text-sm my-2">LOADING...</p>
          <div className="text-xl">═══════════</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="min-h-screen bg-white font-mono">
      {/* Top Navigation */}
      <div className="border-b-2 border-black sticky top-0 bg-white z-50">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo/Title */}
            <div className="flex items-center gap-2 md:gap-4">
              <div className="text-xs md:text-sm hidden md:block">══════</div>
              <div className="text-sm md:hidden">═══</div>
              <h1 className="text-base md:text-xl font-bold">ADMIN PANEL</h1>
              <div className="text-xs md:text-sm hidden md:block">══════</div>
              <div className="text-sm md:hidden">═══</div>
            </div>

            {/* User Info */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-bold">ADMINISTRATOR</div>
                <button
                  onClick={() => {
                    logout();
                    router.push('/login');
                  }}
                  className="text-xs underline hover:no-underline"
                >
                  [LOGOUT]
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="border-t-2 border-black">
          <div className="flex overflow-x-auto">

            {/* ── STAFF OPERATIONS (shown first) ── */}
            <div className="flex items-center px-2 text-[10px] font-bold text-gray-400 flex-shrink-0 border-r-2 border-black bg-gray-50 select-none">
              OPS
            </div>

            <button
              onClick={() => router.push('/admin/cashier')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/cashier' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              CASHIER
            </button>

            <button
              onClick={() => router.push('/admin/table-status')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/table-status' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              TABLE STATUS
            </button>

            <button
              onClick={() => router.push('/admin/live-orders')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/live-orders' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              LIVE ORDERS
            </button>

            <button
              onClick={() => router.push('/admin/kds')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/kds' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              KITCHEN
            </button>

            <button
              onClick={() => router.push('/admin/bookings')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 relative ${
                pathname === '/admin/bookings' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              BOOKINGS
              {/* Late bookings badge */}
              {lateBookingsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {lateBookingsCount}
                </span>
              )}
            </button>

            {/* ── ADMIN MANAGEMENT ── */}
            <div className="flex items-center px-2 text-[10px] font-bold text-gray-400 flex-shrink-0 border-r-2 border-black bg-gray-50 select-none">
              ADMIN
            </div>

            <button
              onClick={() => router.push('/admin/dashboard')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/dashboard' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              DASHBOARD
            </button>

            <button
              onClick={() => router.push('/admin/orders')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/orders' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              ALL ORDERS
            </button>

            <button
              onClick={() => router.push('/admin/payments')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/payments' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              PAYMENTS
            </button>

            <button
              onClick={() => router.push('/admin/analytics')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/analytics' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              ANALYTICS
            </button>

            <button
              onClick={() => router.push('/admin/reports')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/reports' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              REPORTS
            </button>

            <button
              onClick={() => router.push('/admin/menu/categories')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/menu/categories' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              CATEGORIES
            </button>

            <button
              onClick={() => router.push('/admin/menu/items')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/menu/items' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              MENU ITEMS
            </button>

            <button
              onClick={() => router.push('/admin/inventory')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname.startsWith('/admin/inventory') && pathname !== '/admin/inventory/history'
                  ? 'bg-black text-white'
                  : 'bg-white text-black'
              }`}
            >
              INVENTORY
            </button>

            <button
              onClick={() => router.push('/admin/inventory/history')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/inventory/history' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              STOCK HISTORY
            </button>

            <button
              onClick={() => router.push('/admin/recipes')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/recipes' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              RECIPES
            </button>

            {/* ── EXPENSE MANAGEMENT ── */}
            <div className="flex items-center px-2 text-[10px] font-bold text-gray-400 flex-shrink-0 border-r-2 border-black bg-gray-50 select-none">
              EXPENSE
            </div>

            <button
              onClick={() => router.push('/admin/expenses')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname.startsWith('/admin/expenses') && !pathname.startsWith('/admin/expenses/skus') ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              EXPENSES
            </button>

            <button
              onClick={() => router.push('/admin/expenses/skus')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname.startsWith('/admin/expenses/skus') ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              SKU CATALOG
            </button>

            <button
              onClick={() => router.push('/admin/settings/general')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/settings/general' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              SETTINGS
            </button>

            <button
              onClick={() => router.push('/admin/settings/tables')}
              className={`px-4 md:px-6 py-3 text-xs md:text-sm font-bold hover:bg-gray-100 transition-colors flex-shrink-0 ${
                pathname === '/admin/settings/tables' ? 'bg-black text-white' : 'bg-white text-black'
              }`}
            >
              TABLE SETUP
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-0">
        {children}
      </div>
    </div>
  );
}
