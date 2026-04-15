import { NextRequest, NextResponse } from 'next/server';
import {
  expenseDocumentService,
  expenseLineService,
  expenseStatsService,
} from '@/lib/services/expense.service';
import type { ExpenseFilter } from '@/types/expense';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const filter: ExpenseFilter = {
      startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
      endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
      mainCategory: searchParams.get('mainCategory') as ExpenseFilter['mainCategory'] ?? undefined,
      subCategory: searchParams.get('subCategory') as ExpenseFilter['subCategory'] ?? undefined,
      vendorId: searchParams.get('vendorId') ?? undefined,
      status: searchParams.get('status') as ExpenseFilter['status'] ?? undefined,
      searchText: searchParams.get('q') ?? undefined,
    };

    const includeStats = searchParams.get('includeStats') === 'true';
    const [documents, stats] = await Promise.all([
      expenseDocumentService.getFiltered(filter),
      includeStats ? expenseStatsService.compute(filter) : Promise.resolve(null),
    ]);

    return NextResponse.json({ documents, stats });
  } catch (error) {
    console.error('GET /api/expenses error:', error);
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      document: Parameters<typeof expenseDocumentService.create>[0];
      lines?: Parameters<typeof expenseLineService.bulkCreate>[0];
    };

    const documentId = await expenseDocumentService.create(body.document);

    if (body.lines && body.lines.length > 0) {
      const linesWithDocId = body.lines.map((l) => ({ ...l, documentId }));
      await expenseLineService.bulkCreate(linesWithDocId);
    }

    return NextResponse.json({ documentId }, { status: 201 });
  } catch (error) {
    console.error('POST /api/expenses error:', error);
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}
