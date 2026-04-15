import { NextRequest, NextResponse } from 'next/server';
import {
  expenseDocumentService,
  expenseLineService,
  expenseStatsService,
} from '@/lib/services/expense.service';
import type { ExpenseDocument, ExpenseLine } from '@/types/expense';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const [document, lines] = await Promise.all([
      expenseDocumentService.getById(params.id),
      expenseLineService.getByDocumentId(params.id),
    ]);
    if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ document, lines });
  } catch (error) {
    console.error(`GET /api/expenses/${params.id} error:`, error);
    return NextResponse.json({ error: 'Failed to fetch expense' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json() as {
      document?: Partial<ExpenseDocument>;
      lines?: ExpenseLine[];
      action?: 'confirm' | 'cancel';
    };

    if (body.action === 'confirm') {
      const [document, lines] = await Promise.all([
        expenseDocumentService.getById(params.id),
        expenseLineService.getByDocumentId(params.id),
      ]);
      if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      await expenseDocumentService.confirm(params.id, 'admin');
      await expenseStatsService.updateSKUCostAfterConfirm(lines);
      return NextResponse.json({ success: true });
    }

    if (body.document) {
      await expenseDocumentService.update(params.id, body.document);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`PUT /api/expenses/${params.id} error:`, error);
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await expenseDocumentService.delete(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/expenses/${params.id} error:`, error);
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}
