import { NextRequest, NextResponse } from 'next/server';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase/config';
import { expenseAIService } from '@/lib/services/expense-ai.service';

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
    
    // Return early - the Client (browser) will now drive the execution of 
    // each AI step sequentially via /api/expenses/ai/[jobId]/step
    return NextResponse.json({ jobId, imageUrl }, { status: 201 });
  } catch (error) {
    console.error('POST /api/expenses/ai/upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// Low timeout is fine now as we only do basic upload/db write here
export const maxDuration = 10; 
