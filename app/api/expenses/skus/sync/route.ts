import { NextResponse } from 'next/server';
import { expenseSyncService } from '@/lib/services/expense-sync.service';

export async function POST() {
  try {
    const result = await expenseSyncService.syncGlobalSKUData();

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('POST /api/expenses/skus/sync error:', error);
    return NextResponse.json(
      { error: 'Global sync failed', details: error.message },
      { status: 500 }
    );
  }
}
