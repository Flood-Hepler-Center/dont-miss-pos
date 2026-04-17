'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { useLateBookingsCount } from '@/lib/hooks/useLateBookingsCount';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  UtensilsCrossed, 
  Table, 
  Calendar, 
  FileText, 
  BarChart3, 
  Settings, 
  ChevronDown, 
  Package,
  History,
  BookOpen,
  DollarSign,
  Receipt,
  Menu as MenuIcon,
  X,
  CreditCard,
  ChefHat
} from 'lucide-react';

import { LucideIcon } from 'lucide-react';

type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: number;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, role, logout, _hasHydrated } = useAuthStore();
  const lateBookingsCount = useLateBookingsCount();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const priorityItems: NavItem[] = [
    { label: 'CASHIER', path: '/admin/cashier', icon: CreditCard },
    { label: 'TABLE STATUS', path: '/admin/table-status', icon: Table },
    { label: 'LIVE ORDERS', path: '/admin/live-orders', icon: ShoppingCart },
    { label: 'KITCHEN KDS', path: '/admin/kds', icon: ChefHat },
    { label: 'BOOKINGS', path: '/admin/bookings', icon: Calendar, badge: lateBookingsCount },
    { label: 'MENU ITEMS', path: '/admin/menu/items', icon: UtensilsCrossed },
  ];

  const dropdownGroups: NavGroup[] = [
    {
      title: 'MANAGEMENT',
      items: [
        { label: 'DASHBOARD', path: '/admin/dashboard', icon: LayoutDashboard },
        { label: 'ALL ORDERS', path: '/admin/orders', icon: FileText },
        { label: 'ANALYTICS', path: '/admin/analytics', icon: BarChart3 },
        { label: 'REPORTS', path: '/admin/reports', icon: FileText },
      ]
    },
    {
      title: 'FINANCE',
      items: [
        { label: 'PAYMENTS', path: '/admin/payments', icon: DollarSign },
        { label: 'EXPENSES', path: '/admin/expenses', icon: Receipt },
        { label: 'SKU CATALOG', path: '/admin/expenses/skus', icon: Package },
      ]
    },
    {
      title: 'CATALOG & STOCK',
      items: [
        { label: 'CATEGORIES', path: '/admin/menu/categories', icon: LayoutDashboard },
        { label: 'STOCK', path: '/admin/inventory', icon: Package },
        { label: 'HISTORY', path: '/admin/inventory/history', icon: History },
        { label: 'RECIPES', path: '/admin/recipes', icon: BookOpen },
      ]
    },
    {
      title: 'SYSTEM',
      items: [
        { label: 'GENERAL SETTINGS', path: '/admin/settings/general', icon: Settings },
        { label: 'TABLE SETUP', path: '/admin/settings/tables', icon: Table },
      ]
    }
  ];

  useEffect(() => {
    if (_hasHydrated && (!isAuthenticated || role !== 'ADMIN')) {
      router.push('/login');
    }
  }, [isAuthenticated, role, router, _hasHydrated]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setActiveDropdown(null);
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

  if (!isAuthenticated || role !== 'ADMIN') {
    return null;
  }

  const NavContent = ({ isMobile = false }) => (
    <div className={`${isMobile ? 'flex flex-col p-4 space-y-4' : 'flex items-center'}`}>
      {/* Priority Items */}
      <div className={`${isMobile ? 'grid grid-cols-2 gap-3' : 'flex items-center'}`}>
        {priorityItems.map((item) => {
          const isActive = pathname === item.path || (item.path !== '/admin/dashboard' && pathname.startsWith(item.path));
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex items-center justify-center gap-2 px-4 py-3 text-[11px] font-black tracking-widest transition-all border-r-2 border-black border-y-0 ${
                isActive ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'
              } ${isMobile ? 'border-2 flex-col h-20' : 'h-full'}`}
            >
              <item.icon size={isMobile ? 18 : 14} />
              <span className={isMobile ? 'text-[9px]' : ''}>{item.label}</span>
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
      </div>

      {!isMobile && <div className="h-10 w-[2px] bg-black mx-2" />}

      {/* Dropdown Groups */}
      {dropdownGroups.map((group) => {
        const isActiveGroup = group.items.some(item => 
          pathname === item.path || (item.path !== '/admin/dashboard' && pathname.startsWith(item.path))
        );
        const isOpen = activeDropdown === group.title;

        return (
          <div 
            key={group.title} 
            className={`relative ${isMobile ? 'w-full' : ''}`}
            onMouseEnter={() => !isMobile && setActiveDropdown(group.title)}
            onMouseLeave={() => !isMobile && setActiveDropdown(null)}
          >
            <button
              onClick={() => isMobile && setActiveDropdown(isOpen ? null : group.title)}
              className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-[10px] font-bold tracking-[0.15em] transition-all border-r-2 border-black ${
                isActiveGroup ? 'bg-gray-100 underline underline-offset-4' : 'bg-white text-gray-500 hover:text-black hover:bg-gray-50'
              } ${isMobile ? 'border-2 text-[11px] font-black' : ''}`}
            >
              <span>{group.title}</span>
              <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {(isOpen || (!isMobile && activeDropdown === group.title)) && (
              <div className={`${
                isMobile 
                  ? 'mt-2 space-y-1 pl-4 border-l-2 border-black animate-in slide-in-from-top-1' 
                  : 'absolute top-full left-0 w-56 bg-white border-2 border-black z-[100] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-in fade-in slide-in-from-top-2 duration-200'
              }`}>
                {group.items.map((item) => {
                  const isActiveItem = pathname === item.path || (item.path !== '/admin/dashboard' && pathname.startsWith(item.path));
                  return (
                    <button
                      key={item.path}
                      onClick={() => router.push(item.path)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-[10px] font-bold transition-all border-b last:border-b-0 border-black hover:bg-gray-50 text-left ${
                        isActiveItem ? 'bg-black text-white' : 'bg-white'
                      }`}
                    >
                      <item.icon size={14} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && item.badge > 0 && (
                        <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white rounded-full text-[9px] animate-pulse">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-white font-mono flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b-2 border-black sticky top-0 bg-white z-[60] flex flex-col">
        {/* Row 1: Brand + User */}
        <div className="px-4 py-3 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="text-[10px] font-bold text-gray-400 hidden sm:block">ADMIN PANEL</div>
            <div className="text-sm font-bold border-2 border-black px-3 py-1 bg-black text-white tracking-tighter">
              POS SYSTEM
            </div>
            <div className="hidden lg:block text-[10px] font-bold tracking-[0.2em] text-gray-400 ml-4">══════════════════════════════════════</div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Administrator</p>
              <button 
                onClick={() => { logout(); router.push('/login'); }}
                className="text-[10px] font-black underline hover:no-underline uppercase"
              >
                [LOGOUT]
              </button>
            </div>
            <div className="w-8 h-8 border-2 border-black flex items-center justify-center font-bold text-xs bg-gray-50">
              AD
            </div>
            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-1.5 border-2 border-black active:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none bg-white"
            >
              {isMobileMenuOpen ? <X size={20} /> : <MenuIcon size={20} />}
            </button>
          </div>
        </div>

        {/* Row 2: Navigation Groups (Desktop Only) */}
        <nav className="hidden md:flex border-t-2 border-black bg-white overflow-visible">
          <NavContent />
        </nav>

        {/* Mobile Menu (Inside header to prevent gap) */}
        {isMobileMenuOpen && (
          <div 
            className="md:hidden w-full bg-white border-t-2 border-black animate-in slide-in-from-top duration-200 overflow-y-auto max-h-[calc(100vh-100px)]"
            onClick={e => e.stopPropagation()}
          >
            <NavContent isMobile={true} />
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

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
