import { MenuClient } from '@/components/customer/MenuClient';
import { menuService } from '@/lib/services/menu.service';
import { db } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { notFound } from 'next/navigation';

export default async function MenuPage({
  params,
}: {
  params: { tableId: string };
}) {
  const tableNum = parseInt(params.tableId, 10);
  
  if (isNaN(tableNum) || tableNum < 1 || tableNum > 100) {
    notFound();
  }

  // Check if table exists and is active
  const tableDoc = await getDoc(doc(db, 'tables', params.tableId));
  if (!tableDoc.exists() || !tableDoc.data()?.isActive) {
    return (
      <div className="min-h-screen bg-white font-mono flex items-center justify-center p-6">
        <div className="max-w-md w-full border-2 border-black p-6 text-center">
          <div className="text-xl mb-4">════════</div>
          <h1 className="text-2xl font-bold mb-4">TABLE NOT AVAILABLE</h1>
          <p className="text-sm mb-6">This table is currently inactive. Please contact staff for assistance.</p>
          <div className="text-xl">════════</div>
        </div>
      </div>
    );
  }

  const [categories, items] = await Promise.all([
    menuService.getCategories(),
    menuService.getActiveItems(),
  ]);

  return (
    <MenuClient
      tableId={params.tableId}
      categories={categories}
      items={items}
    />
  );
}
