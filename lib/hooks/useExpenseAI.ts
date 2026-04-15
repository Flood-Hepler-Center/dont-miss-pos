/* eslint-disable no-console */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  const processingRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!jobId) return;
    const unsub = onSnapshot(doc(db, 'expense_ai_jobs', jobId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as AIExpenseJob;
      setJob({ ...data, id: snap.id });

      if (data.overallStatus === 'completed') {
        setUploadState('done');
        setFinalResult(data.finalResult ?? null);
        processingRef.current.clear();
      } else if (data.overallStatus === 'needs_review') {
        setUploadState('review');
        setFinalResult(data.finalResult ?? null);
        processingRef.current.clear();
      } else if (data.overallStatus === 'failed') {
        setUploadState('error');
        setError(data.errorMessage ?? 'Pipeline failed');
        processingRef.current.clear();
      } else if (data.overallStatus === 'running' || data.overallStatus === 'pending') {
        setUploadState('processing');

        // --- SELF-HEAL & NUDGE LOGIC ---
        const now = Date.now();
        const pendingSteps = data.steps?.filter(s => s.status === 'pending') || [];

        if (pendingSteps.length > 0) {
          console.group(`🧠 [AI Logic] Job: ${jobId}`);
          data.steps?.forEach(s => console.log(`Step ${s.stepNumber} (${s.step}): ${s.status}`));

          for (const nextStep of pendingSteps) {
            const isIndependent = nextStep.stepNumber <= 3;
            const allPrereqsDone = data.steps?.filter(s => s.stepNumber < nextStep.stepNumber).every(s => s.status === 'done');
            const isValidToStart = isIndependent || allPrereqsDone;

            // Lock Check with Self-Heal (30s timeout)
            const lockTime = processingRef.current.get(nextStep.step);
            const isStale = lockTime && (now - lockTime > 30000);
            const isLocked = lockTime && !isStale;

            if (isValidToStart && !isLocked) {
              if (isStale) console.warn(`⚠️ [AI] Re-nudging stale step: ${nextStep.step} (timed out)`);
              
              processingRef.current.set(nextStep.step, now);
              
              // Stagger the parallel nudges to reduce DB contention
              const delay = isIndependent ? (nextStep.stepNumber - 1) * 200 : 0;
              
              setTimeout(() => {
                console.log(`🚀 [AI] TRIGGERING Step ${nextStep.stepNumber}: ${nextStep.step} (Delay: ${delay}ms)`);

                fetch(`/api/expenses/ai/${jobId}/step`, { 
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ step: nextStep.step })
                })
                  .then(async res => {
                    if (!res.ok) {
                      const errData = await res.json().catch(() => ({}));
                      throw new Error(errData.error ?? 'Step failed');
                    }
                    console.log(`✅ [AI] Nudge success for ${nextStep.step}`);
                  })
                  .catch(err => {
                    console.error(`❌ [AI] Nudge failed for ${nextStep.step}:`, err);
                    processingRef.current.delete(nextStep.step);
                  });
              }, delay);
            } else if (!isValidToStart) {
              console.log(`⏳ [AI] Step ${nextStep.stepNumber} is waiting for prerequisites.`);
            } else {
              console.log(`🔄 [AI] Already processing: ${nextStep.step}`);
            }
          }
          console.groupEnd();
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
