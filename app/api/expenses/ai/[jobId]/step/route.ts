/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { expenseAIService } from '@/lib/services/expense-ai.service';
import { expenseSKUService } from '@/lib/services/expense.service';

export async function POST(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobId = params.jobId;
    const skus = await expenseSKUService.getAll();
    
    // Execute exactly one pending step
    const result = await expenseAIService.runStep(jobId, skus);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error(`POST /api/expenses/ai/${params.jobId}/step error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Step execution failed' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60; 
