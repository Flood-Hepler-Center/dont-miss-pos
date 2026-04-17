'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { StaffNotifications } from '@/components/staff/StaffNotifications';
import { useLateBookingsCount } from '@/lib/hooks/useLateBookingsCount';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Table, 
  Calendar, 
  CreditCard, 
  ChefHat,
  Menu as MenuIcon,
  X,
  Bell
} from 'lucide-react';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, logout, staffId, staffName, _hasHydrated } = useAuthStore();
  const lateBookingsCount = useLateBookingsCount();
  
  const isKDS = pathname === '/staff/kds';
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router, _hasHydrated]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

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
    { path: '/staff/dashboard', label: 'DASHBOARD', icon: LayoutDashboard },
    { path: '/staff/orders', label: 'ORDERS', icon: ShoppingCart },
    { path: '/staff/tables', label: 'TABLES', icon: Table },
    { path: '/staff/bookings', label: 'BOOKINGS', icon: Calendar, badge: lateBookingsCount },
    { path: '/staff/cashier', label: 'CASHIER', icon: CreditCard },
    { path: '/staff/kds', label: 'KITCHEN', icon: ChefHat },
  ];

  return (
    <div className="min-h-screen bg-white font-mono flex flex-col">
      {/* Top Navigation Bar */}
      <header className={`${isKDS ? 'bg-white/80 backdrop-blur-sm shadow-sm' : 'bg-white border-b-2 border-black'} sticky top-0 z-[60] flex flex-col transition-all`}>
        {/* Row 1: Header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-[10px] font-bold text-gray-400 hidden sm:block uppercase">Staff Panel</div>
            <h1 className="text-sm font-bold border-2 border-black px-3 py-1 bg-black text-white tracking-tighter">
              SATURDAY POS
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{staffName || 'Staff Member'}</p>
              <button 
                onClick={() => { logout(); router.push('/login'); }}
                className="text-[10px] font-black underline hover:no-underline uppercase"
              >
                [LOGOUT]
              </button>
            </div>
            
            <button 
              onClick={() => setShowNotifications(true)}
              className="p-1.5 border-2 border-black bg-white relative active:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none transition-all"
            >
              <Bell size={18} />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
            </button>

            {/* Mobile/Small Menu Toggle */}
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-1.5 border-2 border-black active:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none bg-white"
            >
              {isMobileMenuOpen ? <X size={18} /> : <MenuIcon size={18} />}
            </button>
          </div>
        </div>

        {/* Row 2: Nav Items (Desktop Only) */}
        {!isKDS && (
          <nav className="hidden md:flex border-t-2 border-black bg-white overflow-x-auto no-scrollbar">
            {navItems.map((item) => {
              const isActive = pathname === item.path || (item.path !== '/staff/dashboard' && pathname.startsWith(item.path));
              return (
                <button
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  className={`flex items-center gap-2 px-6 py-3 text-[11px] font-black tracking-widest transition-all border-r-2 border-black ${
                    isActive ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-50'
                  }`}
                >
                  <item.icon size={14} />
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 && (
                    <span className={`flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] ${
                      isActive ? 'bg-white text-black' : 'bg-red-500 text-white'
                    } animate-pulse`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
            {/* KDS Mode Toggle Button */}
            <div className="flex-1"></div>
            <button
              onClick={() => router.push('/staff/kds')}
              className="flex items-center gap-2 px-6 py-3 text-[11px] font-black tracking-widest bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              <ChefHat size={14} />
              <span>KITCHEN MODE</span>
            </button>
          </nav>
        )}

        {/* Mobile Menu (Inside header to prevent gap) */}
        {isMobileMenuOpen && (
          <div 
            className="md:hidden w-full bg-white border-t-2 border-black animate-in slide-in-from-top duration-200 overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 grid grid-cols-2 gap-3">
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-black bg-white active:bg-gray-100"
                >
                  <item.icon size={20} />
                  <span className="text-[10px] font-black tracking-tighter">{item.label}</span>
                </button>
              ))}
            </div>
            <div className="p-4 border-t-2 border-black bg-gray-50">
              <button 
                onClick={() => { logout(); router.push('/login'); }}
                className="w-full p-3 border-2 border-black bg-black text-white font-bold text-xs uppercase"
              >
                [LOGOUT]
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        {children}
      </main>

      {/* Notifications Sidebar Overlay */}
      {showNotifications && (
        <>
          <div 
            className="fixed inset-0 bg-black/20 z-[80] backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setShowNotifications(false)}
          />
          <aside className="fixed right-0 top-0 bottom-0 w-80 bg-white border-l-2 border-black z-[90] shadow-[-4px_0px_0px_0px_rgba(0,0,0,0.1)] animate-in slide-in-from-right duration-300">
            <div className="flex flex-col h-full">
              <div className="p-4 border-b-2 border-black flex items-center justify-between bg-black text-white">
                <h3 className="font-bold text-sm tracking-widest flex items-center gap-2 uppercase font-mono">
                  <Bell size={16} /> NOTIFICATIONS
                </h3>
                <button onClick={() => setShowNotifications(false)} className="hover:rotate-90 transition-transform">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono">
                <StaffNotifications staffId={staffId || 'staff-unknown'} staffName={staffName || undefined} />
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
