'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, logout, staffName, _hasHydrated } = useAuthStore();

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
    { path: '/staff/cashier', label: 'CASHIER' },
    { path: '/staff/kds', label: 'KITCHEN' },
  ];

  return (
    <div className="min-h-screen bg-white font-mono">
      {/* Top Navigation */}
      <div className="border-b-2 border-black sticky top-0 bg-white z-50">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo/Title */}
            <div className="flex items-center gap-4">
              <div className="text-sm">══════</div>
              <h1 className="text-xl font-bold">DON&apos;T MISS THIS SATURDAY</h1>
              <div className="text-sm">══════</div>
            </div>

            {/* User Info */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-bold">{staffName || 'STAFF'}</div>
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

      {/* Main Content */}
      <div className="m-0">
        {children}
      </div>
    </div>
  );
}
