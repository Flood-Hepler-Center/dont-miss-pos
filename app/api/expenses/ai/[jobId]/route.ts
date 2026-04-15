import { NextRequest, NextResponse } from 'next/server';
import { expenseAIService } from '@/lib/services/expense-ai.service';

type Params = { params: { jobId: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const job = await expenseAIService.getJob(params.jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    return NextResponse.json({ job });
  } catch (error) {
    console.error(`GET /api/expenses/ai/${params.jobId} error:`, error);
    return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 });
  }
}
