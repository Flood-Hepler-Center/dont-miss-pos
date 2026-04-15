/* eslint-disable no-console */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { AIExpenseJob, AIExpenseFinalizerResult, AIBillValidatorResult } from '@/types/expense';

type UploadState = 'idle' | 'uploading' | 'processing' | 'review' | 'done' | 'error';

export function useExpenseAI() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AIExpenseJob | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<AIExpenseFinalizerResult | null>(null);
  const processingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const unsub = onSnapshot(doc(db, 'expense_ai_jobs', jobId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as AIExpenseJob;
      setJob({ ...data, id: snap.id });
      
      if (data.overallStatus === 'completed') {
        setUploadState('done');
        setFinalResult(data.finalResult ?? null);
        processingRef.current = null;
      } else if (data.overallStatus === 'needs_review') {
        setUploadState('review');
        setFinalResult(data.finalResult ?? null);
        processingRef.current = null;
      } else if (data.overallStatus === 'failed') {
        setUploadState('error');
        setError(data.errorMessage ?? 'Pipeline failed');
        processingRef.current = null;
      } else if (data.overallStatus === 'running' || data.overallStatus === 'pending') {
        setUploadState('processing');
        
        // --- PARALLEL NUDGE LOGIC ---
        const pendingSteps = data.steps?.filter(s => s.status === 'pending') || [];
        
        for (const nextStep of pendingSteps) {
          // Rule 1: Step 1, 2, and 3 are independent and can run in parallel
          const isIndependent = nextStep.stepNumber <= 3;
          
          // Rule 2: Step 4 and 5 have dependencies
          const allPrereqsDone = data.steps?.filter(s => s.stepNumber < nextStep.stepNumber).every(s => s.status === 'done');
          
          // Rule 3: Validation Check
          const isValidToStart = isIndependent || (allPrereqsDone && (
            nextStep.step === 'sku_matcher' ? (
              // Ensure Step 1 didn't fail and Step 3 is truly done
              (data.steps?.find(s => s.step === 'bill_validator')?.result as AIBillValidatorResult)?.is_valid_document !== false
            ) : true
          ));

          if (isValidToStart && processingRef.current !== nextStep.step) {
            // Check if we are already "nudging" this specific step in this specific session
            // (We use a cache to avoid multiple triggers for the same step)
            processingRef.current = nextStep.step;
            console.log(`🧠 [AI] Nudging ${nextStep.stepNumber}/5: ${nextStep.step}`);
            
            fetch(`/api/expenses/ai/${jobId}/step`, { method: 'POST' })
              .then(async res => {
                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}));
                  throw new Error(errData.error ?? 'Step failed');
                }
                console.log(`✅ [AI] Step ${nextStep.step} triggered`);
              })
              .catch(err => {
                console.error(`❌ [AI] Nudge failed for ${nextStep.step}:`, err);
                processingRef.current = null; 
              });
          }
        }
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
