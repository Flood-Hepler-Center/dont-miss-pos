'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { Layout, Menu, Button, Dropdown } from 'antd';
import {
  LayoutDashboard,
  ClipboardList,
  Grid3x3,
  ChefHat,
  CreditCard,
  LogOut,
  User,
} from 'lucide-react';
import { useEffect } from 'react';

const { Sider, Content, Header } = Layout;

interface StaffLayoutProps {
  children: React.ReactNode;
}

export function StaffLayout({ children }: StaffLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, staffName, logout } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const menuItems = [
    {
      key: '/staff/dashboard',
      icon: <LayoutDashboard size={20} strokeWidth={2} />,
      label: 'Dashboard',
    },
    {
      key: '/staff/tables',
      icon: <Grid3x3 size={20} strokeWidth={2} />,
      label: 'Tables',
    },
    {
      key: '/staff/orders',
      icon: <ClipboardList size={20} strokeWidth={2} />,
      label: 'Orders',
    },
    {
      key: '/staff/kds',
      icon: <ChefHat size={20} strokeWidth={2} />,
      label: 'Kitchen',
    },
    {
      key: '/staff/cashier',
      icon: <CreditCard size={20} strokeWidth={2} />,
      label: 'Cashier',
    },
  ];

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogOut size={16} />,
      label: 'Logout',
      onClick: handleLogout,
    },
  ];

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Layout className="min-h-screen">
      <Sider
        width={240}
        theme="light"
        className="border-r border-gray-200"
        style={{ background: '#ffffff' }}
      >
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-lg font-semibold text-gray-900">
            Don&apos;t Miss This Saturday
          </h1>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[pathname]}
          items={menuItems}
          onClick={({ key }: {key: string}) => router.push(key)}
          className="border-0"
          style={{ background: 'transparent' }}
        />
      </Sider>

      <Layout>
        <Header
          className="bg-white border-b border-gray-200 px-6 flex items-center justify-between"
          style={{ height: '64px', lineHeight: '64px', padding: '0 24px' }}
        >
          <h2 className="text-lg font-semibold text-gray-900">
            {menuItems.find((item) => item.key === pathname)?.label || 'Staff Portal'}
          </h2>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Button
              type="text"
              icon={<User size={20} />}
              className="flex items-center gap-2"
            >
              {staffName}
            </Button>
          </Dropdown>
        </Header>

        <Content className="bg-gray-50 p-6">
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
