'use client';

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { AIExpenseJob, AIExpenseFinalizerResult } from '@/types/expense';

type UploadState = 'idle' | 'uploading' | 'processing' | 'review' | 'done' | 'error';

export function useExpenseAI() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AIExpenseJob | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<AIExpenseFinalizerResult | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const unsub = onSnapshot(doc(db, 'expense_ai_jobs', jobId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as AIExpenseJob;
      setJob({ ...data, id: snap.id });
      if (data.overallStatus === 'completed') {
        setUploadState('done');
        setFinalResult(data.finalResult ?? null);
      } else if (data.overallStatus === 'needs_review') {
        setUploadState('review');
        setFinalResult(data.finalResult ?? null);
      } else if (data.overallStatus === 'failed') {
        setUploadState('error');
        setError(data.errorMessage ?? 'Pipeline failed');
      } else if (data.overallStatus === 'running') {
        setUploadState('processing');
      }
    });
    return () => unsub();
  }, [jobId]);

  const startPipeline = useCallback(async (file: File): Promise<string> => {
    setUploadState('uploading');
    setError(null);
    setJob(null);
    setFinalResult(null);

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/expenses/ai/upload', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json() as { error: string };
      setUploadState('error');
      setError(err.error ?? 'Upload failed');
      throw new Error(err.error);
    }

    const { jobId: newJobId } = await res.json() as { jobId: string };
    setJobId(newJobId);
    setUploadState('processing');
    return newJobId;
  }, []);

  const reset = useCallback(() => {
    setJobId(null);
    setJob(null);
    setUploadState('idle');
    setError(null);
    setFinalResult(null);
  }, []);

  const currentStepIndex = job
    ? job.steps.findIndex((s) => s.step === job.currentStep)
    : -1;

  const completedSteps = job ? job.steps.filter((s) => s.status === 'done').length : 0;
  const totalSteps = job ? job.steps.length : 5;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return {
    jobId,
    job,
    uploadState,
    error,
    finalResult,
    startPipeline,
    reset,
    currentStepIndex,
    progressPercent,
    isProcessing: uploadState === 'uploading' || uploadState === 'processing',
  };
}
