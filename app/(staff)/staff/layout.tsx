'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { StaffNotifications } from '@/components/staff/StaffNotifications';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, logout, staffId, staffName, _hasHydrated } = useAuthStore();
  const isKDS = pathname === '/staff/kds';
  const [navExpanded, setNavExpanded] = useState(!isKDS);

  // Whenever the route changes to/from KDS, sync the nav state
  useEffect(() => {
    setNavExpanded(!isKDS);
  }, [isKDS]);

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router, _hasHydrated]);

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

  if (!isAuthenticated) {
    return null;
  }

  const navItems = [
    { path: '/staff/dashboard', label: 'DASHBOARD' },
    { path: '/staff/orders', label: 'ORDERS' },
    { path: '/staff/tables', label: 'TABLES' },
    { path: '/staff/bookings', label: 'BOOKINGS' },
    { path: '/staff/cashier', label: 'CASHIER' },
    { path: '/staff/kds', label: 'KITCHEN' },
  ];

  return (
    <div className="min-h-screen bg-white font-mono">

      {/* KDS-only: floating toggle button when nav is hidden */}
      {isKDS && !navExpanded && (
        <button
          onClick={() => setNavExpanded(true)}
          title="Show navigation"
          className="fixed top-3 left-3 z-[100] flex items-center gap-2 bg-slate-800/90 hover:bg-slate-700 text-white text-sm font-bold px-3 py-2 rounded-xl shadow-xl backdrop-blur-sm transition-all border border-slate-600"
          style={{ fontFamily: "'Nunito', sans-serif" }}
        >
          <span className="text-lg">☰</span>
          <span className="text-xs tracking-wide">MENU</span>
        </button>
      )}

      {/* Top Navigation — hidden on KDS when collapsed */}
      {(!isKDS || navExpanded) && (
        <div className="border-b-2 border-black sticky top-0 bg-white z-50">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              {/* Logo/Title */}
              <div className="flex items-center gap-4">
                <div className="text-sm">══════</div>
                <h1 className="text-xl font-bold">DON&apos;T MISS THIS SATURDAY</h1>
                <div className="text-sm">══════</div>
              </div>

              {/* User Info + KDS close button */}
              <div className="flex items-center gap-4">
                {isKDS && navExpanded && (
                  <button
                    onClick={() => setNavExpanded(false)}
                    title="Hide navigation (KDS mode)"
                    className="text-xs font-bold px-3 py-1 bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    ✕ HIDE
                  </button>
                )}
                <div className="text-right">
                  <div className="text-sm font-bold">{staffName || 'STAFF'}</div>
                  <button
                    onClick={() => { logout(); router.push('/login'); }}
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
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  className={`px-6 py-3 text-sm font-bold border-r-2 border-black hover:bg-gray-100 transition-colors flex-shrink-0 ${
                    pathname.startsWith(item.path)
                      ? 'bg-black text-white'
                      : 'bg-white text-black'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content — no pb-24 on KDS since the notification bar is hidden there */}
      <div className={`m-0 ${isKDS ? '' : 'pb-24'}`}>
        {children}
      </div>

      {/* Staff Notifications — hidden on KDS when collapsed */}
      {(!isKDS || navExpanded) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-black p-4 z-40">
          <div className="max-w-7xl mx-auto flex justify-end">
            <div className="w-80">
              <StaffNotifications staffId={staffId || 'staff-unknown'} staffName={staffName || undefined} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
