import { NextRequest, NextResponse } from 'next/server';
import { expenseSKUService } from '@/lib/services/expense.service';
import type { CreateExpenseSKUInput } from '@/types/expense';

export async function GET() {
  try {
    const skus = await expenseSKUService.getAll();
    return NextResponse.json({ skus });
  } catch (error) {
    console.error('GET /api/expenses/skus error:', error);
    return NextResponse.json({ error: 'Failed to fetch SKUs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as CreateExpenseSKUInput;
    const id = await expenseSKUService.create(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/expenses/skus error:', error);
    return NextResponse.json({ error: 'Failed to create SKU' }, { status: 500 });
  }
}
