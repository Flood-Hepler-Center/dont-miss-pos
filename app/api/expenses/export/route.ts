import { NextRequest, NextResponse } from 'next/server';
import { expenseExportService } from '@/lib/services/expense-export.service';
import type { ExpenseExportFilter } from '@/types/expense';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      startDate: string;
      endDate: string;
      mainCategory?: ExpenseExportFilter['mainCategory'];
      subCategory?: ExpenseExportFilter['subCategory'];
      vendorId?: string;
      skuId?: string;
      status?: ExpenseExportFilter['status'];
      documentId?: string;
      documentIds?: string[];
    };

    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    const filter: ExpenseExportFilter = {
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      mainCategory: body.mainCategory,
      subCategory: body.subCategory,
      vendorId: body.vendorId,
      skuId: body.skuId,
      status: body.status,
      documentId: body.documentId,
      documentIds: body.documentIds,
    };

    const buffer = await expenseExportService.generateExcel(filter);
    const filename = expenseExportService.getFileName(filter);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('POST /api/expenses/export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
