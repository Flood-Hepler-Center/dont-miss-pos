import { NextRequest, NextResponse } from 'next/server';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase/config';
import { expenseAIService } from '@/lib/services/expense-ai.service';
import { expenseSKUService } from '@/lib/services/expense.service';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File must be an image (JPEG, PNG, WebP, HEIC)' }, { status: 400 });
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    const timestamp = Date.now();
    const ext = file.name.split('.').pop() ?? 'jpg';
    const imagePath = `expense_receipts/${timestamp}_${Math.random().toString(36).slice(2)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const storageRef = ref(storage, imagePath);
    await uploadBytes(storageRef, uint8Array, { contentType: file.type });
    const imageUrl = await getDownloadURL(storageRef);

    const jobId = await expenseAIService.createJob(imageUrl, imagePath);

    const skus = await expenseSKUService.getAll();
    
    // 1. Immediately mark the job as 'running' so the UI progress bar jumps from 0% instantly
    await expenseAIService.updateJobStatus(jobId, 'running');

    // 2. Start the heavy pipeline in the background - DO NOT AWAIT it here
    // This prevents the 504 Gateway Timeout on Vercel
    expenseAIService.runPipeline(jobId, skus).catch((err) => {
      console.error(`AI background pipeline failed for job ${jobId}:`, err);
    });

    // 3. Return the jobId immediately so the frontend can start its Firestore subscription/polling
    return NextResponse.json({ jobId, imageUrl }, { status: 201 });
  } catch (error) {
    console.error('POST /api/expenses/ai/upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// Keep a reasonable timeout for the synchronous parts (upload + status update)
export const maxDuration = 30; 
