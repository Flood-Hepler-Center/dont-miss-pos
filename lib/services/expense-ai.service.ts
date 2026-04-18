/* eslint-disable no-console */
/**
 * Expense AI Pipeline Service — Google Gemini native integration.
 *
 * OPTIMIZED 2-CALL BATCHED PIPELINE (free-tier friendly, $0 on Google AI Studio):
 *
 *   BATCH A — Vision call (gemini-2.5-flash): validator + quality + OCR merged
 *     into one structured JSON response with a strict responseSchema. Native
 *     Gemini multilingual OCR preserves Thai characters faithfully.
 *
 *   BATCH B — Reasoning call (gemini-2.5-flash-lite): SKU matcher + finalizer
 *     merged into one structured JSON response with a strict responseSchema.
 *     flash-lite is chosen for lower latency on pure-text reasoning.
 *
 * Each batch is claimed atomically via a Firestore transaction so parallel
 * nudges from the client cannot trigger duplicate API calls.
 *
 * Why Gemini over OpenRouter:
 *   1. responseSchema GUARANTEES the output matches our schema — eliminating
 *      the "Cannot read properties of undefined (reading 'matches')" class of
 *      bug completely.
 *   2. Native Thai support (100+ languages) — no romanization.
 *   3. Free tier on Google AI Studio is generous (15 RPM + 1000+ RPD) and
 *      Flash/Flash-Lite share separate rate limit pools by default.
 *   4. Direct API = no middleware = lower latency.
 *   5. `thinkingConfig.thinkingBudget = 0` disables Gemini's thinking mode
 *      for pure speed on structured-output tasks.
 */

import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  collection,
  serverTimestamp,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import { GoogleGenAI, Type } from '@google/genai';
import type { GenerateContentResponse, Schema } from '@google/genai';
import { db } from '@/lib/firebase/config';
import Fuse from 'fuse.js';
import type {
  AIExpenseJob,
  AIPipelineStep,
  AIPipelineStepResult,
  AIBillValidatorResult,
  AIQualityResult,
  AIOCRResult,
  AISKUMatcherResult,
  AIExpenseFinalizerResult,
  ExpenseSKU,
} from '@/types/expense';

/**
 * MODEL SELECTION — Google Gemini free-tier models from Google AI Studio.
 *
 *   VISION    → gemini-2.5-flash: native multimodal, best OCR quality at free
 *               tier, multilingual (Thai preserved natively).
 *   REASONING → gemini-2.5-flash-lite: faster/lighter for text-only structured
 *               reasoning; uses a SEPARATE free-tier RPM pool from flash so
 *               they don't compete for quota within the same pipeline run.
 *
 * Both models support:
 *   - responseSchema (guaranteed JSON structure — not best-effort)
 *   - inlineData image input (base64)
 *   - thinkingConfig.thinkingBudget=0 (disable thinking for speed)
 *   - temperature=0 (deterministic)
 */
const MODELS = {
  VISION: 'gemini-2.5-flash',
  REASONING: 'gemini-2.5-flash-lite',
  /**
   * Fallback chain: if the primary model hits 429/5xx, try the sibling
   * model. Both are Google AI Studio endpoints; they share no quota only
   * if we alternate, so a fallback order like flash → flash-lite effectively
   * gives us 2× the free tier for vision in worst-case.
   */
  VISION_FALLBACKS: ['gemini-2.5-flash-lite', 'gemini-2.0-flash'] as const,
  REASONING_FALLBACKS: ['gemini-2.5-flash', 'gemini-2.0-flash-lite'] as const,
} as const;

// ─── Google GenAI client (module-level singleton for connection reuse) ──────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const genAI: GoogleGenAI | null = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

const STEP_MODELS: Record<AIPipelineStep, string> = {
  bill_validator: MODELS.VISION,
  quality_assessor: MODELS.VISION,
  ocr_extractor: MODELS.VISION,
  sku_matcher: MODELS.REASONING,
  expense_finalizer: MODELS.REASONING,
};

const STEP_NUMBERS: Record<AIPipelineStep, 1 | 2 | 3 | 4 | 5> = {
  bill_validator: 1,
  quality_assessor: 2,
  ocr_extractor: 3,
  sku_matcher: 4,
  expense_finalizer: 5,
};

// ─── JSON Cleanup Helper ──────────────────────────────────────────────────────

function cleanJsonResponse(content: string): string {
  // Remove markdown code blocks if present
  let cleaned = content.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
  }
  return cleaned.trim();
}

// ─── JSON Repair for Truncated Responses ──────────────────────────────────────

function normalizeDescription(description: string): string {
  // Remove quantity patterns: "2x", "2 kg", "×3", "x2", "2 PACK", "3 bottles", etc.
  const normalized = description
    // Remove "x2", "×3", "2x" patterns
    .replace(/\s*[×x]\s*\d+/gi, '')
    .replace(/\s*\d+\s*[×x]/gi, '')
    // Remove quantity + unit (handle plurals with s? and Thai units)
    // Matches: "2 kg", "3 bottles", "1 pack", "2 packs", "5  " (Thai pack), etc.
    .replace(/\s*\d+\s*(kg|g|L|ml|pack|box|bottle|can|bag|unit|piece|set|roll|sheet|  )s?\b/gi, '')
    // Remove standalone trailing numbers (e.g., "Beer 2" -> "Beer")
    .replace(/\s*\d+\s*$/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return normalized;
}

function repairTruncatedJson(json: string): string {
  let repaired = json;

  // Count unescaped quotes to detect unclosed strings
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    // Odd number of quotes = unclosed string, close it
    repaired += '"';
  }

  // Count brackets and braces
  const openBraces = (repaired.match(/{/g) || []).length;
  const closeBraces = (repaired.match(/}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/]/g) || []).length;

  // Close unclosed arrays first (innermost)
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']';
  }

  // Then close unclosed objects
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}';
  }

  return repaired;
}

// ═══════════════════════════════════════════════════════════════════════════
// ░░░ GOOGLE GEMINI HELPER (primary AI backend) ░░░
// ═══════════════════════════════════════════════════════════════════════════

/** Per-call timeout — abort slow responses and try fallback. */
const GEMINI_TIMEOUT_MS = 60_000;

type GeminiCallOpts = {
  /** Must be a strict Gemini responseSchema (use the `Type` enum from @google/genai). */
  responseSchema: Schema;
  /** Optional chain of alternate models to try on quota / error failure. */
  fallbackModels?: readonly string[];
  /** For reasoning-enabled models — 0 disables thinking for speed (default: 0). */
  thinkingBudget?: number;
  maxOutputTokens?: number;
};

type GeminiInlineImage = {
  kind: 'image';
  mimeType: string;
  /** Base64-encoded image bytes (no data: URL prefix). */
  data: string;
};

type GeminiPart = string | GeminiInlineImage;

type GeminiCallResult = {
  parsed: unknown;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
};

/** Download an image URL and return its base64 + MIME type for inlineData. */
async function fetchImageAsBase64(
  imageUrl: string
): Promise<{ mimeType: string; data: string }> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}) from ${imageUrl}`);
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg';
  const arrayBuf = await res.arrayBuffer();
  const data = Buffer.from(arrayBuf).toString('base64');
  return { mimeType, data };
}

/** Build the `contents` array for a single Gemini request. */
function buildGeminiContents(
  systemInstruction: string,
  parts: GeminiPart[]
): { systemInstruction: string; contents: Array<{ role: 'user'; parts: Array<Record<string, unknown>> }> } {
  const userParts: Array<Record<string, unknown>> = parts.map((p) => {
    if (typeof p === 'string') return { text: p };
    return { inlineData: { mimeType: p.mimeType, data: p.data } };
  });
  return {
    systemInstruction,
    contents: [{ role: 'user', parts: userParts }],
  };
}

/**
 * Make a Gemini API call with strict responseSchema enforcement.
 * Falls back through `fallbackModels` on quota (429) / 5xx errors.
 * Returns the parsed JSON object directly — no secondary JSON.parse needed
 * because responseSchema GUARANTEES the model output matches the schema.
 */
async function callGemini(
  primaryModel: string,
  systemInstruction: string,
  parts: GeminiPart[],
  opts: GeminiCallOpts
): Promise<GeminiCallResult> {
  if (!genAI) {
    throw new Error(
      'GEMINI_API_KEY (or GOOGLE_API_KEY) env var is not set. ' +
        'Get a free key at https://aistudio.google.com/app/apikey.'
    );
  }

  // Dedupe primary + fallbacks, preserve order.
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const m of [primaryModel, ...(opts.fallbackModels ?? [])]) {
    if (!seen.has(m)) {
      seen.add(m);
      chain.push(m);
    }
  }

  const { systemInstruction: sys, contents } = buildGeminiContents(systemInstruction, parts);

  let lastError = '';
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    if (i > 0) console.log(`[Gemini] → fallback attempt ${i + 1}/${chain.length}: ${model}`);

    // Race the API call against a timeout using AbortController's abortSignal.
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const response: GenerateContentResponse = await genAI.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: sys,
          responseMimeType: 'application/json',
          responseSchema: opts.responseSchema,
          temperature: 0,
          maxOutputTokens: opts.maxOutputTokens,
          thinkingConfig: { thinkingBudget: opts.thinkingBudget ?? 0 },
          abortSignal: controller.signal,
        },
      });
      clearTimeout(timeoutHandle);

      const text = response.text ?? '';
      if (!text.trim()) {
        lastError = `Empty response from ${model}`;
        console.warn(`[Gemini] ${model} returned empty text — trying next model`);
        continue;
      }

      // responseSchema makes this JSON.parse near-guaranteed to succeed.
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Extremely rare with responseSchema, but keep a repair fallback.
        try {
          parsed = JSON.parse(repairTruncatedJson(cleanJsonResponse(text)));
        } catch (err) {
          lastError = `JSON parse failed: ${(err as Error).message}`;
          console.warn(`[Gemini] ${model} returned invalid JSON — trying next model`);
          console.warn(`  preview: ${text.substring(0, 200)}`);
          continue;
        }
      }

      const usage = response.usageMetadata;
      return {
        parsed,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        modelUsed: model,
      };
    } catch (e) {
      clearTimeout(timeoutHandle);
      const err = e as Error & { status?: number; code?: number };
      const msg = err.message ?? String(err);
      const status = err.status ?? err.code ?? 0;
      lastError = `${model}: ${msg} (status=${status})`;

      // Retryable: quota (429), service unavailable (5xx), timeout.
      const retryable = status === 429 || (status >= 500 && status < 600) || err.name === 'AbortError';
      if (retryable) {
        console.warn(`[Gemini] ${model} failed (${status || err.name}) — trying next model`);
        continue;
      }
      // Non-retryable (bad schema, auth, invalid key) — stop immediately.
      console.error(`[Gemini] ${model} non-retryable error:`, msg);
      throw new Error(`Gemini error: ${msg}`);
    }
  }

  throw new Error(`Gemini: all ${chain.length} models exhausted. Last error: ${lastError}`);
}

// ─── OpenRouter Helper — DEPRECATED (unused after Gemini migration) ───────────
// The code below is dead code preserved for git-blame context. It will be
// removed in a follow-up cleanup. Only callGemini (above) is used in
// production. Minimal shims ensure the file compiles.

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions';
type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
};

type CallOpts = {
  maxTokens?: number;
  temperature?: number;
  /** For reasoning-enabled models (e.g. gpt-oss, glm-air) — "low"/"medium"/"high". Omit to use default. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /**
   * Explicit fallback chain. When provided, models are tried IN ORDER as
   * separate single-model API calls. On 429/503 (rate-limit / upstream down)
   * we skip to the next model IMMEDIATELY without delay — since each entry
   * uses a different upstream provider, its pool is independent.
   *
   * The primary `model` argument is treated as the first attempt and does not
   * need to be repeated in fallbackModels.
   */
  fallbackModels?: readonly string[];
};

const CHAIN_RETRY_DELAY_MS = 2000;
/** Per-attempt timeout — abort slow/queued free-tier calls and fail over fast. */
const PER_ATTEMPT_TIMEOUT_MS = 45_000;

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
  model?: string;
  error?: { message?: string; code?: number };
};

type CallResult = {
  content: string;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
};

/** Build the request body for a SINGLE model attempt. */
function buildBody(
  model: string,
  messages: OpenRouterMessage[],
  jsonMode: boolean,
  opts: CallOpts
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.1,
    max_tokens: opts.maxTokens ?? 8192,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  if (opts.reasoningEffort) {
    // effort controls how much reasoning; exclude=true hides reasoning from content
    // so thinking-mode models (GLM, Nemotron) don't leak chain-of-thought as prose.
    body.reasoning = { effort: opts.reasoningEffort, exclude: true };
  } else if (jsonMode) {
    // For non-reasoning-aware callers that still need JSON, explicitly disable
    // reasoning so any model that silently enables it won't leak prose.
    body.reasoning = { enabled: false, exclude: true };
  }
  return body;
}

/**
 * Quick sanity check: does `content` look like valid JSON?
 * Handles markdown fences and partial trailing garbage. Returns true iff
 * JSON.parse succeeds on the cleaned content OR on the longest JSON-looking
 * prefix. This lets us reject prose responses from models that ignore JSON
 * mode (e.g. NVIDIA reasoning models) BEFORE wasting further processing.
 */
function looksLikeJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  // Fast path: if it starts with a non-JSON character, reject immediately.
  const first = trimmed[0];
  if (first !== '{' && first !== '[' && first !== '"' && first !== '`') return false;

  // Strip common markdown fences before parsing.
  let cleaned = trimmed;
  if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');

  try {
    JSON.parse(cleaned);
    return true;
  } catch {
    // Maybe truncated — try the repair heuristic used elsewhere.
    try {
      JSON.parse(repairTruncatedJson(cleaned));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Try a single model. Returns the result on success, or { retryable, error }
 * describing the failure so the caller can decide whether to advance the chain.
 *
 * Wraps the fetch in an AbortController with PER_ATTEMPT_TIMEOUT_MS so a
 * hung/queued free-tier model cannot stall the whole pipeline — we abort
 * and fall through to the next fallback immediately.
 */
async function tryModel(
  model: string,
  messages: OpenRouterMessage[],
  jsonMode: boolean,
  opts: CallOpts,
  apiKey: string
): Promise<
  | { ok: true; result: CallResult }
  | { ok: false; retryable: boolean; status: number; error: string }
> {
  const body = buildBody(model, messages, jsonMode, opts);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(OPENROUTER_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'X-Title': 'DontMiss POS - Expense AI',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutHandle);
    const aborted = (e as Error)?.name === 'AbortError';
    return {
      ok: false,
      retryable: true, // both timeouts and network errors are worth a fallback
      status: aborted ? 408 : 0,
      error: aborted ? `timeout after ${PER_ATTEMPT_TIMEOUT_MS}ms` : (e as Error).message,
    };
  }
  clearTimeout(timeoutHandle);

  // ── HTTP-level failure ──
  if (!res.ok) {
    const error = await res.text();
    const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
    return { ok: false, retryable, status: res.status, error };
  }

  // ── HTTP 200 but still possibly shape-invalid ──
  let data: OpenRouterResponse;
  try {
    data = (await res.json()) as OpenRouterResponse;
  } catch (e) {
    return {
      ok: false,
      retryable: true,
      status: 200,
      error: `Invalid JSON body: ${(e as Error).message}`,
    };
  }

  // Some providers return HTTP 200 with an `error` field instead of `choices`.
  if (data.error) {
    const msg = data.error.message ?? 'Unknown upstream error';
    const code = data.error.code ?? 0;
    const retryable = code === 429 || code === 502 || code === 503;
    return { ok: false, retryable, status: code || 200, error: msg };
  }

  const first = Array.isArray(data.choices) ? data.choices[0] : undefined;
  const content = first?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return {
      ok: false,
      retryable: true,
      status: 200,
      error: `Empty/missing content. Got keys: ${Object.keys(data).join(', ')}`,
    };
  }

  // When JSON mode is requested, verify the model actually returned JSON.
  // Some reasoning-first models (e.g. NVIDIA Nemotron) ignore response_format
  // and return raw chain-of-thought prose. Reject those early so the chain
  // can advance to a JSON-compliant model instead of accepting garbage.
  if (jsonMode && !looksLikeJson(content)) {
    return {
      ok: false,
      retryable: true,
      status: 200,
      error: `Model returned non-JSON content (JSON mode ignored). Preview: ${content.substring(0, 120).replace(/\s+/g, ' ')}…`,
    };
  }

  return {
    ok: true,
    result: {
      content,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      modelUsed: data.model ?? model,
    },
  };
}

async function callOpenRouter(
  model: string,
  messages: OpenRouterMessage[],
  jsonMode = true,
  opts: CallOpts = {}
): Promise<CallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  // Build full chain with primary first, dedup while preserving order.
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const m of [model, ...(opts.fallbackModels ?? [])]) {
    if (!seen.has(m)) {
      seen.add(m);
      chain.push(m);
    }
  }

  const walkChain = async (): Promise<CallResult | { failed: true; status: number; error: string }> => {
    let lastStatus = 0;
    let lastError = '';
    for (let i = 0; i < chain.length; i++) {
      const candidate = chain[i];
      if (i > 0) console.log(`[OpenRouter] → fallback attempt ${i + 1}/${chain.length}: ${candidate}`);
      const outcome = await tryModel(candidate, messages, jsonMode, opts, apiKey);
      if (outcome.ok) return outcome.result;
      lastStatus = outcome.status;
      lastError = outcome.error;
      if (!outcome.retryable) {
        // Non-retryable (auth, bad request, etc.) → stop immediately.
        break;
      }
      console.warn(`[OpenRouter] ${candidate} returned ${outcome.status} — trying next model`);
    }
    return { failed: true, status: lastStatus, error: lastError };
  };

  // Walk chain; if the entire chain failed with retryable errors, wait and retry ONCE.
  let result = await walkChain();
  if ('failed' in result && result.status === 429) {
    console.warn(
      `[OpenRouter] Full chain (${chain.length} models) rate-limited. Waiting ${CHAIN_RETRY_DELAY_MS}ms and retrying once.`
    );
    await new Promise((r) => setTimeout(r, CHAIN_RETRY_DELAY_MS));
    result = await walkChain();
  }

  if ('failed' in result) {
    throw new Error(
      `OpenRouter error ${result.status} (all ${chain.length} models exhausted): ${result.error}`
    );
  }
  return result;
}

// ─── Job Management ───────────────────────────────────────────────────────────

const JOBS_COL = 'expense_ai_jobs';

export async function updateJobStep(
  jobId: string,
  step: AIPipelineStep,
  update: Partial<AIPipelineStepResult>
): Promise<void> {
  const jobRef = doc(db, JOBS_COL, jobId);
  
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(jobRef);
    if (!snap.exists()) return;
    
    const data = snap.data() as Record<string, unknown>;
    const steps = [...((data.steps as AIPipelineStepResult[]) ?? [])];
    const idx = steps.findIndex((s) => s.step === step);
    
    if (idx >= 0) {
      steps[idx] = { ...steps[idx], ...update, updatedAt: new Date() };
    } else {
      steps.push({ 
        step, 
        stepNumber: STEP_NUMBERS[step], 
        model: STEP_MODELS[step], 
        status: 'pending', 
        ...update,
        updatedAt: new Date()
      });
    }

    transaction.update(jobRef, { 
      steps, 
      currentStep: step, 
      updatedAt: serverTimestamp() 
    });
  });
}

// ─── Step 1: Bill Validator ───────────────────────────────────────────────────

export async function runBillValidator(
  jobId: string,
  imageUrl: string
): Promise<AIBillValidatorResult> {
  // Redundant status update removed (Dispatcher handles 'running' state)
  const startedAt = new Date();

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content:
        'You are a document classifier specialized in Thai and international receipts. Respond with valid JSON only.',
    },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        {
          type: 'text',
          text: `Analyze this image and determine if it is a purchase document (receipt, invoice, etc.).
Respond with JSON matching this exact schema:
{
  "is_valid_document": boolean,
  "document_type": "receipt" | "invoice" | "quotation" | "delivery_note" | "bank_transfer_slip" | "other",
  "confidence": number between 0 and 1,
  "rejection_reason": string or null,
  "detected_language": "th" | "en" | "mixed" | "other",
  "visible_merchant": string or null
}`,
        },
      ],
    },
  ];

  const { content, inputTokens, outputTokens } = await callOpenRouter(MODELS.VISION, messages);
  const result = JSON.parse(content) as AIBillValidatorResult;
  const completedAt = new Date();
  await updateJobStep(jobId, 'bill_validator', {
    status: 'done',
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    inputTokens,
    outputTokens,
    result,
  });
  return result;
}

// ─── Step 2: Quality Assessor ─────────────────────────────────────────────────

export async function runQualityAssessor(
  jobId: string,
  imageUrl: string
): Promise<AIQualityResult> {
  // Redundant status update removed
  const startedAt = new Date();

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content:
        'You are an image quality specialist for OCR document processing. Respond with valid JSON only.',
    },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        {
          type: 'text',
          text: `Assess this receipt image quality for OCR text extraction.
Respond with JSON matching this exact schema:
{
  "overall_quality": "excellent" | "good" | "acceptable" | "poor",
  "ocr_confidence": number between 0 and 1,
  "issues": array of string describing problems found,
  "text_visibility": "clear" | "partially_visible" | "blurry" | "cut_off",
  "recommended_action": "proceed" | "warn_and_proceed" | "request_better_image"
}`,
        },
      ],
    },
  ];

  const { content, inputTokens, outputTokens } = await callOpenRouter(MODELS.VISION, messages);
  const result = JSON.parse(content) as AIQualityResult;
  const completedAt = new Date();
  await updateJobStep(jobId, 'quality_assessor', {
    status: 'done',
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    inputTokens,
    outputTokens,
    result,
  });
  return result;
}

// ─── Step 3: OCR Extractor ────────────────────────────────────────────────────

export async function runOCRExtractor(
  jobId: string,
  imageUrl: string
): Promise<AIOCRResult> {
  // Redundant status update removed
  const startedAt = new Date();

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `You are an expert OCR system specialized in Thai and English receipts/invoices.
CRITICAL: Preserve text EXACTLY as shown on receipt - DO NOT translate Thai to English.
CONTEXT: Today is ${new Date().toLocaleDateString('en-GB')}.
THAI DATE HANDLING:
- Thai receipts often use the Buddhist Era (BE).
- If you see a year like 2567, 2568, 2569, it is BE.
- BE Year - 543 = CE Year (e.g., 2569 BE = 2026 CE).
- If you see a short year like '69', '68', '67' on a Thai receipt, it likely refers to the last two digits of the BE year (e.g., '69' = 2569 BE = 2026 CE).

MONETARY & TAX HANDLING (THAI CONTEXT):
- VAT (7%) is called "ภาษีมูลค่าเพิ่ม" or "VAT".
- Service Charge (usually 10%) is called "ค่าบริการ" or "Service".
- "Total" is called "ยอดรวม", "ยอดสุทธิ", or "Grand Total".
- CRITICAL: Grand Total is the final amount paid.
- FORMULA: Total = Subtotal + Tax + Service Charge.
- VAT INCLUSIVE: If the receipt says "VAT Included" or "รวมภาษีแล้ว", the Total is the printed total, and you should extract the tax amount if shown, but DO NOT subtract it from the subtotal in a way that changes the Grand Total.

BANK TRANSFER SLIP HANDLING:
- If the image is a Thai Bank Transfer Slip (e.g., K-Plus, SCB Easy, PromptPay), extract the following:
- "Vendor Name" = The recipient of the transfer (e.g., "Mr. Somchai", "Tops Supermarket").
- "Total" = The transfer amount.
- Create ONE line item in "line_items" representing the transfer.
- "line_items[0].description" = "Bank Transfer to [Recipient Name]".
- "line_items[0].quantity" = 1.
- "line_items[0].unit" = "unit".
- "line_items[0].unit_price" = transfer amount.
- "line_items[0].subtotal" = transfer amount.
Extract ALL information precisely maintaining original language (Thai, English, or mixed).
All monetary values should be numbers (no currency symbols).
Respond with valid JSON only.`,
    },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        {
          type: 'text',
          text: `Extract all data from this receipt/invoice. Be thorough and precise.
CRITICAL: Extract item names EXACTLY as shown on receipt - preserve Thai/English/mixed text.
DATE EXTRACTION:
- Today's date is ${new Date().toLocaleDateString('en-GB')}.
- Ensure the extracted "date" is in YYYY-MM-DD format (Christian Era).
- If the year is missing but a date like "15 Apr" is present, assume the current year (2026).
- If a Buddhist year is present (e.g., 2569 or 69), convert it to CE (2026).

BANK TRANSFER SLIP SPECIAL RULES:
- If it is a bank transfer slip, extract the recipient name from the "To" (ไปยัง) field as the vendor name.
- If it is a bank transfer slip, create exactly one line item in "line_items" with the total amount.

TAX & TOTAL EXTRACTION:
- Identify "Subtotal" (before tax), "Tax" (VAT), and "Grand Total".
- The "total" field MUST be the final amount paid.
- Check the math: subtotal + tax + service_charge should equal total.
- If the receipt says "Included VAT", the subtotal is the amount before tax, and total = subtotal + tax.

Examples:
- Receipt shows: "ปีกกลางไก่ แพ็คถาด" → "description": "ปีกกลางไก่ แพ็คถาด"
- Receipt shows: "TGM Cheese Corn" → "description": "TGM Cheese Corn"
- Receipt shows: "TGM มิกซ์ชาคูเตอรี่ เซท อี" → "description": "TGM มิกซ์ชาคูเตอรี่ เซท อี"

DO NOT translate Thai to English. Keep text exactly as printed.

Respond with JSON matching this exact schema:
{
  "vendor": {
    "name": string,
    "address": string or null,
    "phone": string or null,
    "tax_id": string or null
  },
  "date": "YYYY-MM-DD" or null,
  "time": "HH:MM" or null,
  "receipt_number": string or null,
  "currency": "THB" | "USD" | "EUR" | "other",
  "line_items": [
    {
      "raw_text": string (full line text from receipt),
      "description": string (item name EXACTLY as shown - Thai/English/mixed),
      "quantity": number,
      "unit": string (kg, g, L, ml, unit, pack, etc.),
      "unit_price": number,
      "subtotal": number,
      "discount": number or null
    }
  ],
  "subtotal": number,
  "tax": number or null,
  "service_charge": number or null,
  "total": number,
  "payment_method": string or null,
  "notes": string or null
}`,
        },
      ],
    },
  ];

  const { content, inputTokens, outputTokens } = await callOpenRouter(MODELS.VISION, messages);

  // Clean and parse JSON with error handling
  const cleanedContent = cleanJsonResponse(content);
  let result: AIOCRResult;
  try {
    result = JSON.parse(cleanedContent) as AIOCRResult;
  } catch (error) {
    // Try to repair truncated JSON
    console.warn('\n? [OCR EXTRACTOR] JSON Parse Error - attempting repair...');
    const repairedContent = repairTruncatedJson(cleanedContent);
    try {
      result = JSON.parse(repairedContent) as AIOCRResult;
      console.log('? [OCR EXTRACTOR] Successfully repaired truncated JSON');
    } catch {
      console.error('\n? [OCR EXTRACTOR] JSON Parse Error!');
      console.error('Raw response (first 2000 chars):');
      console.error(content.substring(0, 2000));
      console.error('\nCleaned response (first 2000 chars):');
      console.error(cleanedContent.substring(0, 2000));
      console.error('\nRepaired response (first 2000 chars):');
      console.error(repairedContent.substring(0, 2000));
      console.error('\nError:', error);
      throw new Error(`OCR returned invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ━━━ DETAILED LOGGING FOR DEBUGGING ━━━
  console.log('\n🔍 [OCR EXTRACTOR] Full Results:');
  console.log('📋 Vendor:', result.vendor.name);
  console.log('📅 Date:', result.date, 'Time:', result.time);
  console.log(`\n📦 Extracted ${result.line_items.length} line items:\n`);
  result.line_items.forEach((item, idx) => {
    console.log(`  ${idx + 1}. "${item.description}" (${item.quantity} ${item.unit})`);
    console.log(`      Raw: "${item.raw_text}"`);
    console.log(`      Price: ฿${item.unit_price} × ${item.quantity} = ฿${item.subtotal}\n`);
  });
  console.log('💰 Total: ฿' + result.total);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const completedAt = new Date();
  await updateJobStep(jobId, 'ocr_extractor', {
    status: 'done',
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    inputTokens,
    outputTokens,
    result,
  });
  return result;
}

// --- Step 4: SKU Matcher ---

export async function runSKUMatcher(
  jobId: string,
  ocrResult: AIOCRResult,
  existingSKUs: ExpenseSKU[]
): Promise<AISKUMatcherResult> {
  const startedAt = new Date();
  await updateJobStep(jobId, 'sku_matcher', { status: 'running', startedAt });

  const fuse = new Fuse(existingSKUs, {
    keys: ['name', 'nameTh', 'code'],
    threshold: 0.4,
    includeScore: true,
  });

  // --- GROUP ITEMS BY NORMALIZED DESCRIPTION ---
  // Handles two cases:
  // 1) Same product with different qty text: "Chicken 2kg" + "Chicken 3kg" → normalised to "chicken"
  // 2) Exact same description string on separate receipt lines
  const itemGroups: Map<string, number[]> = new Map();
  ocrResult.line_items.forEach((item, idx) => {
    const normalized = normalizeDescription(item.description);
    if (!itemGroups.has(normalized)) {
      itemGroups.set(normalized, []);
    }
    itemGroups.get(normalized)!.push(idx);
  });

  // Secondary pass: merge groups where the raw description is exactly identical
  // (catches cases where normalizeDescription still leaves slight differences)
  const rawDescGroups: Map<string, number[]> = new Map();
  ocrResult.line_items.forEach((item, idx) => {
    const rawKey = item.description.trim().toLowerCase();
    if (!rawDescGroups.has(rawKey)) rawDescGroups.set(rawKey, []);
    rawDescGroups.get(rawKey)!.push(idx);
  });
  // For any raw-desc group with multiple items, ensure they map to the same normalised group key
  for (const [, rawIndices] of rawDescGroups) {
    if (rawIndices.length > 1) {
      // Find the normalised key for the first occurrence
      const firstNorm = normalizeDescription(ocrResult.line_items[rawIndices[0]].description);
      const existingGroup = itemGroups.get(firstNorm) ?? [];
      const merged = Array.from(new Set([...existingGroup, ...rawIndices]));
      itemGroups.set(firstNorm, merged);
    }
  }

  // Log grouping for debugging
  console.log('\n [SKU MATCHER] Item grouping analysis:');
  for (const [normalized, indices] of itemGroups) {
    if (indices.length > 1) {
      console.log(`  Group "${normalized}": ${indices.length} items`);
      indices.forEach(idx => {
        console.log(`    - [${idx}] "${ocrResult.line_items[idx].description}"`);
      });
    }
  }

  // --- FUZZY MATCHING WITH DETAILED LOGGING ---
  console.log('\n [SKU MATCHER] Starting fuzzy matching...\n');

  const relevantSKUs: ExpenseSKU[] = [];
  for (const item of ocrResult.line_items) {
    console.log(` Searching for: "${item.description}"`);
    const results = fuse.search(item.description, { limit: 3 });

    if (results.length > 0) {
      console.log('   Top 3 fuzzy matches:');
      results.forEach((r, idx) => {
        const score = ((1 - (r.score ?? 0)) * 100).toFixed(1);
        console.log(`   ${idx + 1}. ${r.item.name} (${r.item.code}) - ${score}% match`);
      });
    } else {
      console.log('    No fuzzy matches found!');
    }
    console.log('');

    for (const r of results) {
      if (!relevantSKUs.find((s) => s.id === r.item.id)) {
        relevantSKUs.push(r.item);
      }
    }
  }

  console.log(` Found ${relevantSKUs.length} relevant SKUs for AI matching`);
  console.log('---\n');

  const skuContext = relevantSKUs.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    subCategory: s.subCategory,
    baseUnit: s.baseUnit,
    purchaseUnit: s.purchaseUnit,
    conversionFactor: s.conversionFactor,
  }));

  // Build grouping info for AI prompt
  const groupingInfo = Array.from(itemGroups.entries())
    .filter(([, indices]) => indices.length > 1)
    .map(([normalized, indices]) => ({
      normalized_name: normalized,
      line_indices: indices,
      original_descriptions: indices.map(i => ocrResult.line_items[i].description),
    }));

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `You are a product catalog matching specialist for a Thai restaurant/bar expense system.
IMPORTANT: Item descriptions are in their ORIGINAL language (Thai/English/mixed) from receipts.
Match items to existing SKUs by semantic meaning, even across languages.
When suggesting new SKUs, keep the original Thai/English/mixed naming for easy reconciliation.
Respond with valid JSON only.`,
    },
    {
      role: 'user',
      content: `Match these extracted items to our SKU catalog.
CRITICAL: Items are in original receipt language - match semantically across Thai/English.

EXTRACTED ITEMS:
${JSON.stringify(ocrResult.line_items, null, 2)}

${groupingInfo.length > 0 ? `DUPLICATE ITEM GROUPS (items with same product, different quantities):
${JSON.stringify(groupingInfo, null, 2)}

CRITICAL RULE FOR DUPLICATES: Items in the same group MUST be matched to the SAME SKU.
For example, if line 0 is "Chicken 2kg" and line 1 is "Chicken 3kg", they are the SAME product and must get the SAME SKU.
Do NOT create separate SKUs for items that are clearly the same product with different quantities.
` : ''}
EXISTING SKUs (pre-filtered by fuzzy search):
${JSON.stringify(skuContext, null, 2)}

CATEGORY OPTIONS for subCategory field:
capex_equipment, capex_decor, capex_furniture, capex_technology, capex_vehicle, capex_renovation,
inventory_food, inventory_drinks, inventory_packaging, inventory_cleaning, inventory_consumable,
operating_staff, operating_marketing, operating_admin,
utility_electric, utility_water, utility_gas, utility_internet, other

BASE UNIT OPTIONS: g, ml, unit, piece, sheet, roll, cm, sqm
PURCHASE UNIT OPTIONS: kg, g, L, ml, pack, box, case, bottle, can, bag, unit, piece, roll, sheet, set

IMPORTANT RULES:
- If item is sugar/flour/rice/spice -> base_unit = g (buy kg -> 1 kg = 1000 g)
- If item is liquid -> base_unit = ml (buy L -> 1 L = 1000 ml)
- If item is equipment/furniture -> base_unit = unit
- Match by semantic meaning across languages (e.g. " " Thai = "Sugar" English)
- When suggesting new SKU name, keep ORIGINAL text (Thai/English/mixed) for reconciliation
- confidence 0.9+ = very confident match, 0.7-0.9 = likely match, below 0.7 = suggest new
- DUPLICATE ITEMS (same product, different quantities) MUST share the same SKU

Respond with JSON:
{
  "matches": [
    {
      "line_item_index": number (0-based),
      "matched_sku_id": string or null,
      "matched_sku_code": string or null,
      "matched_sku_name": string or null,
      "match_confidence": number 0-1,
      "is_new_sku": boolean,
      "suggested_sku_name": string (original name from receipt - Thai/English/mixed),
      "suggested_category": string (from category options above),
      "suggested_base_unit": string (from base unit options),
      "suggested_purchase_unit": string (from purchase unit options),
      "suggested_purchase_size": number or null (e.g., 5 for "5kg bottle", 1 for "1L bottle"),
      "suggested_purchase_unit_label": string or null (e.g., "5kg bottle", "1L pack" - for display),
      "suggested_conversion_factor": number (how many base units in 1 purchase unit)
    }
  ]
}`,
    },
  ];

  const { content, inputTokens, outputTokens } = await callOpenRouter(MODELS.REASONING, messages, true);
  const result = JSON.parse(content) as AISKUMatcherResult;

  // --- POST-PROCESS: ENSURE CONSISTENCY FOR GROUPED ITEMS ---
  // If AI made mistakes, consolidate to the best match for each group.
  // This covers both "same product different qty" groups AND exact-duplicate description groups.
  for (const [, indices] of itemGroups) {
    if (indices.length > 1) {
      const groupMatches = indices
        .map(idx => result.matches.find(m => m.line_item_index === idx))
        .filter((m): m is NonNullable<typeof m> => m != null);

      if (groupMatches.length > 0) {
        // Pick the best match: prefer an existing SKU match over new; then highest confidence
        const bestMatch = groupMatches.reduce((best, m) => {
          if (!best.is_new_sku && m.is_new_sku) return best; // prefer existing SKU
          if (best.is_new_sku && !m.is_new_sku) return m;    // prefer existing SKU
          return m.match_confidence > best.match_confidence ? m : best;
        }, groupMatches[0]);

        // Apply the best match to all items in the group
        for (const idx of indices) {
          const match = result.matches.find(m => m.line_item_index === idx);
          if (match && match !== bestMatch) {
            console.log(` [CONSOLIDATE] Item ${idx} "${ocrResult.line_items[idx].description}" consolidated to match item ${bestMatch.line_item_index}`);
            match.matched_sku_id = bestMatch.matched_sku_id;
            match.matched_sku_code = bestMatch.matched_sku_code;
            match.matched_sku_name = bestMatch.matched_sku_name;
            match.is_new_sku = bestMatch.is_new_sku;
            match.suggested_sku_name = bestMatch.suggested_sku_name;
            match.suggested_category = bestMatch.suggested_category;
            match.suggested_base_unit = bestMatch.suggested_base_unit;
            match.suggested_purchase_unit = bestMatch.suggested_purchase_unit;
            match.suggested_conversion_factor = bestMatch.suggested_conversion_factor;
            match.match_confidence = Math.max(match.match_confidence, bestMatch.match_confidence);
          }
        }
      }
    }
  }

  // --- LOG AI SKU MATCHING DECISIONS ---
  console.log('\n [SKU MATCHER] AI Matching Results:\n');
  result.matches.forEach((match, idx) => {
    const ocrItem = ocrResult.line_items[match.line_item_index];
    const status = match.is_new_sku ? ' NEW SKU' : ' MATCHED';
    const confidence = (match.match_confidence * 100).toFixed(0);

    console.log(`${idx + 1}. ${status} - ${confidence}% confident`);
    console.log(`   OCR: "${ocrItem.description}"`);
    if (match.matched_sku_id) {
      console.log(`   -> Matched to: ${match.matched_sku_name} (${match.matched_sku_code})`);
    } else {
      console.log(`   -> Suggested: ${match.suggested_sku_name}`);
      console.log(`      Category: ${match.suggested_category}`);
      console.log(`      Units: ${match.suggested_base_unit} / ${match.suggested_purchase_unit}`);
    }
    console.log('');
  });
  console.log('---\n');

  const completedAt = new Date();
  await updateJobStep(jobId, 'sku_matcher', {
    status: 'done',
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    inputTokens,
    outputTokens,
    result,
  });
  return result;
}

// ─── Step 5: Expense Finalizer ────────────────────────────────────────────────

export async function runExpenseFinalizer(
  jobId: string,
  ocrResult: AIOCRResult,
  skuMatches: AISKUMatcherResult,
  existingSKUs: ExpenseSKU[]
): Promise<AIExpenseFinalizerResult> {
  const startedAt = new Date();
  await updateJobStep(jobId, 'expense_finalizer', { status: 'running', startedAt });

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `You are an expense management system for a Thai restaurant/bar.
Build the final structured expense record from extracted and matched data.
CONTEXT: Today is ${new Date().toLocaleDateString('en-GB')}.
DATE GUIDELINES:
- Use today's date (${new Date().toLocaleDateString('en-GB')}) as reference.
- If OCR extracted 2024 but today is 2026, and the document looks recent, it is likely an extraction error or a missing year. Prefer the current year (2026).
- Handle Buddhist Era (BE) to Christian Era (CE) conversion: BE - 543 = CE.

MATH & TAX RULES:
- CRITICAL: Total = Subtotal + Tax + Service Charge.
- Tax is ALWAYS an addition to the subtotal, NEVER a subtraction from the total.
- If the OCR result shows a Total that is smaller than the Subtotal, the OCR is wrong.
- Verify: Sum of line item final_amounts + Tax + Service Charge = Grand Total.
- If there is a discrepancy, prioritize the "Grand Total" or "ยอดสุทธิ" printed on the receipt and adjust subtotal/tax accordingly.
Apply unit conversions correctly. All amounts in THB.
Respond with valid JSON only.`,
    },
    {
      role: 'user',
      content: `Build the final expense record.
CRITICAL DATE CHECK:
- Today is ${new Date().toLocaleDateString('en-GB')}.
- Review the OCR date: ${ocrResult.date}.
- If the year seems wrong (e.g., 2024 when it's now 2026), correct it to 2026 unless the receipt clearly shows it's an old document.
- Ensure expense_date is in YYYY-MM-DD (CE) format.

CRITICAL MATH CHECK:
- Subtotal: ${ocrResult.subtotal}
- Tax: ${ocrResult.tax ?? 0}
- Service Charge: ${ocrResult.service_charge ?? 0}
- Total: ${ocrResult.total}
- Ensure: Subtotal + Tax + Service Charge = Total. If this doesn't add up, fix the subtotal or tax to match the printed Grand Total.

OCR RESULT:
${JSON.stringify(ocrResult, null, 2)}

SKU MATCHES:
${JSON.stringify(skuMatches.matches, null, 2)}

EXISTING SKU DATA (for matched items):
${JSON.stringify(existingSKUs.filter((s) => skuMatches.matches.some((m) => m.matched_sku_id === s.id)).map((s) => ({ id: s.id, code: s.code, name: s.name, baseUnit: s.baseUnit, conversionFactor: s.conversionFactor })), null, 2)}

UNIT CONVERSION RULES:
- purchase_unit=kg, base_unit=g → base_qty = purchase_qty * 1000
- purchase_unit=L, base_unit=ml → base_qty = purchase_qty * 1000
- purchase_unit=g, base_unit=g → base_qty = purchase_qty
- otherwise use the suggested_conversion_factor from SKU matcher

BANK TRANSFER SLIP HANDLING:
- If the document is a bank transfer slip, expense_type is likely "operating" or "other".
- Set requires_review = true for all bank transfer slips to ensure the category is correct.

Determine the expense_type:
- "capex" if majority of items are equipment/decor/furniture
- "inventory" if majority are food/drinks
- "operating" if operating expenses
- "utility" if utility bills
- "mixed" if multiple categories

Mark requires_review=true if:
- Document is a "bank_transfer_slip"
- Any match confidence < 0.7
- Total calculated differs from OCR total by >5%
- Date is ambiguous or missing
- Any new SKU detected (is_new_sku=true)

Respond with JSON:
{
  "expense_date": "YYYY-MM-DD",
  "vendor_name": string,
  "place": string (same as vendor name or location),
  "receipt_number": string or null,
  "expense_type": "capex" | "inventory" | "operating" | "utility" | "mixed",
  "lines": [
    {
      "line_item_index": number,
      "sku_id": string or null,
      "sku_code": string or null,
      "description": string,
      "purchase_qty": number,
      "purchase_unit": string,
      "purchase_size": number or null (from SKU matcher, e.g., 5 for "5kg bottle"),
      "purchase_unit_label": string or null (from SKU matcher, e.g., "5kg bottle"),
      "base_qty": number,
      "base_unit": string,
      "unit_price": number,
      "subtotal": number,
      "discount": number,
      "final_amount": number,
      "category": string (subCategory),
      "is_new_sku": boolean
    }
  ],
  "subtotal": number,
  "tax": number,
  "service_charge": number,
  "total": number,
  "confidence_score": number 0-1 (overall confidence),
  "requires_review": boolean,
  "review_reasons": array of string
}`,
    },
  ];

  const { content, inputTokens, outputTokens } = await callOpenRouter(MODELS.REASONING, messages, true);
  const result = JSON.parse(content) as AIExpenseFinalizerResult;

  // --- POST-PROCESS: MERGE DUPLICATE NEW-SKU LINES ---
  // When several receipt lines were consolidated to the same new SKU in Step 4,
  // the finalizer may still emit separate output lines. Merge them so the save
  // handler only creates ONE SKU record per unique new product.
  const newSkuGroups: Map<string, typeof result.lines> = new Map();
  const finalLines: typeof result.lines = [];

  for (const line of result.lines) {
    if (line.is_new_sku && !line.sku_id) {
      // Use a normalised version of the description as the dedup key
      const dedupeKey = normalizeDescription(line.description);
      if (!newSkuGroups.has(dedupeKey)) {
        newSkuGroups.set(dedupeKey, []);
      }
      newSkuGroups.get(dedupeKey)!.push(line);
    } else {
      finalLines.push(line);
    }
  }

  for (const [, dupeLines] of newSkuGroups) {
    if (dupeLines.length === 1) {
      finalLines.push(dupeLines[0]);
    } else {
      // Merge: sum purchase_qty, base_qty, subtotal, final_amount; keep unit_price of first
      const base = { ...dupeLines[0] };
      for (let i = 1; i < dupeLines.length; i++) {
        base.purchase_qty += dupeLines[i].purchase_qty;
        base.base_qty += dupeLines[i].base_qty;
        base.subtotal += dupeLines[i].subtotal;
        base.discount = (base.discount ?? 0) + (dupeLines[i].discount ?? 0);
        base.final_amount += dupeLines[i].final_amount;
      }
      console.log(` [MERGE NEW SKU] Merged ${dupeLines.length} lines into 1 for new SKU: "${base.description}" (total qty: ${base.purchase_qty} ${base.purchase_unit})`);
      finalLines.push(base);
    }
  }

  // Re-index line_item_index to be sequential
  finalLines.sort((a, b) => a.line_item_index - b.line_item_index);
  finalLines.forEach((line, idx) => { line.line_item_index = idx; });
  result.lines = finalLines;

  const completedAt = new Date();
  await updateJobStep(jobId, 'expense_finalizer', {
    status: 'done',
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    inputTokens,
    outputTokens,
    result,
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// ░░░ OPTIMIZED BATCHED PIPELINE (2 API calls instead of 5) ░░░
// ═══════════════════════════════════════════════════════════════════════════
//
// The pipeline is still reported to the UI as 5 discrete steps, but these
// two functions perform the actual OpenRouter requests: one vision call that
// produces validator+quality+OCR results together, and one reasoning call
// that produces SKU matches + finalized expense record together.

const BATCH_A: AIPipelineStep[] = ['bill_validator', 'quality_assessor', 'ocr_extractor'];
const BATCH_B: AIPipelineStep[] = ['sku_matcher', 'expense_finalizer'];

// Proportional splits so UI duration/token display remains informative.
// Tokens are attributed mostly to OCR / finalizer which do the heavy work.
const BATCH_A_WEIGHTS = { bill_validator: 0.05, quality_assessor: 0.05, ocr_extractor: 0.9 } as const;
const BATCH_B_WEIGHTS = { sku_matcher: 0.3, expense_finalizer: 0.7 } as const;

type BatchClaim = {
  claimed: boolean;
  imageUrl: string;
  steps: AIPipelineStepResult[];
};

/**
 * Atomically claim a batch of steps by marking all currently-pending members
 * as "running". Returns `claimed: false` if any step in the batch is already
 * running or done — meaning another caller already owns the batch.
 */
async function claimBatch(jobId: string, batch: AIPipelineStep[]): Promise<BatchClaim> {
  const jobRef = doc(db, JOBS_COL, jobId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists()) throw new Error('Job not found');
    const data = snap.data();
    const steps = [...((data.steps as AIPipelineStepResult[]) ?? [])];

    // If ANY step in the batch is already running/done, another caller owns it
    const alreadyOwned = batch.some((s) => {
      const rec = steps.find((x) => x.step === s);
      return rec?.status === 'running' || rec?.status === 'done';
    });
    if (alreadyOwned) {
      return { claimed: false, imageUrl: data.imageUrl as string, steps };
    }

    const now = new Date();
    for (const stepName of batch) {
      const idx = steps.findIndex((x) => x.step === stepName);
      if (idx >= 0) {
        steps[idx] = {
          ...steps[idx],
          status: 'running',
          startedAt: now,
          updatedAt: now,
        };
      }
    }

    const updates: Record<string, unknown> = {
      steps,
      currentStep: batch[0],
      updatedAt: serverTimestamp(),
    };
    if (data.overallStatus === 'pending') updates.overallStatus = 'running';

    tx.update(jobRef, updates);
    return { claimed: true, imageUrl: data.imageUrl as string, steps };
  });
}

/**
 * Atomically mark all steps in a batch as done and attach their individual
 * `result` payloads, plus split duration/tokens proportionally so the UI
 * continues to show per-step progress and cost.
 */
async function completeBatch(
  jobId: string,
  batch: AIPipelineStep[],
  stepResults: Record<string, unknown>,
  totalDurationMs: number,
  inputTokens: number,
  outputTokens: number,
  weights: Record<string, number>,
  options: { skippedSteps?: AIPipelineStep[]; finalResult?: AIExpenseFinalizerResult } = {}
): Promise<void> {
  const jobRef = doc(db, JOBS_COL, jobId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const steps = [...((data.steps as AIPipelineStepResult[]) ?? [])];
    const completedAt = new Date();

    for (const stepName of batch) {
      const idx = steps.findIndex((x) => x.step === stepName);
      if (idx < 0) continue;
      const isSkipped = options.skippedSteps?.includes(stepName);
      const w = weights[stepName] ?? 1 / batch.length;
      steps[idx] = {
        ...steps[idx],
        status: isSkipped ? 'skipped' : 'done',
        completedAt,
        durationMs: Math.round(totalDurationMs * w),
        inputTokens: Math.round(inputTokens * w),
        outputTokens: Math.round(outputTokens * w),
        result: stepResults[stepName],
        updatedAt: completedAt,
      };
    }

    const updates: Record<string, unknown> = {
      steps,
      currentStep: batch[batch.length - 1],
      updatedAt: serverTimestamp(),
    };
    if (options.finalResult) {
      updates.finalResult = options.finalResult;
      updates.overallStatus = options.finalResult.requires_review ? 'needs_review' : 'completed';
      updates.totalDurationMs = steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
    }

    tx.update(jobRef, updates);
  });
}

// ─── BATCH A: Vision Analyzer (validator + quality + OCR in 1 call) ─────────

type MergedVisionResponse = {
  validation: AIBillValidatorResult;
  quality: AIQualityResult;
  ocr: AIOCRResult | null;
};

/**
 * Resilient normaliser: models sometimes return keys with different casing or
 * alternate names (e.g. `billValidation`, `quality_check`, `extracted`).
 * Map whatever shape arrived into our canonical MergedVisionResponse.
 */
function normaliseVisionShape(raw: unknown): MergedVisionResponse {
  const r = (raw ?? {}) as Record<string, unknown>;

  const validation = (r.validation ?? r.bill_validation ?? r.billValidation ?? r.valid ?? {}) as Record<string, unknown>;
  const quality = (r.quality ?? r.quality_assessment ?? r.qualityAssessment ?? r.image_quality ?? {}) as Record<string, unknown>;
  const ocr = (r.ocr ?? r.ocr_result ?? r.extraction ?? r.extracted ?? r.receipt ?? null) as Record<string, unknown> | null;

  return {
    validation: {
      is_valid_document: Boolean(validation.is_valid_document ?? validation.isValid ?? validation.valid ?? true),
      document_type: (validation.document_type ?? validation.type ?? 'receipt') as AIBillValidatorResult['document_type'],
      confidence: Number(validation.confidence ?? 0.8),
      rejection_reason: (validation.rejection_reason ?? validation.reason ?? null) as string | null,
      detected_language: (validation.detected_language ?? validation.language ?? 'en') as AIBillValidatorResult['detected_language'],
      visible_merchant: (validation.visible_merchant ?? validation.merchant ?? null) as string | null,
    },
    quality: {
      overall_quality: (quality.overall_quality ?? quality.quality ?? 'good') as AIQualityResult['overall_quality'],
      ocr_confidence: Number(quality.ocr_confidence ?? quality.confidence ?? 0.85),
      issues: Array.isArray(quality.issues) ? (quality.issues as string[]) : [],
      text_visibility: (quality.text_visibility ?? quality.visibility ?? 'clear') as AIQualityResult['text_visibility'],
      recommended_action: (quality.recommended_action ?? quality.action ?? 'proceed') as AIQualityResult['recommended_action'],
    },
    ocr: ocr ? (ocr as unknown as AIOCRResult) : null,
  };
}

/**
 * Strict Gemini responseSchema for Batch A (validator + quality + OCR).
 * Gemini GUARANTEES the output matches this shape — no more "undefined .matches" bugs.
 */
const VISION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    validation: {
      type: Type.OBJECT,
      properties: {
        is_valid_document: { type: Type.BOOLEAN },
        document_type: {
          type: Type.STRING,
          enum: ['receipt', 'invoice', 'quotation', 'delivery_note', 'bank_transfer_slip', 'other'],
        },
        confidence: { type: Type.NUMBER },
        rejection_reason: { type: Type.STRING, nullable: true },
        detected_language: { type: Type.STRING, enum: ['th', 'en', 'mixed', 'other'] },
        visible_merchant: { type: Type.STRING, nullable: true },
      },
      required: ['is_valid_document', 'document_type', 'confidence', 'detected_language'],
    },
    quality: {
      type: Type.OBJECT,
      properties: {
        overall_quality: { type: Type.STRING, enum: ['excellent', 'good', 'acceptable', 'poor'] },
        ocr_confidence: { type: Type.NUMBER },
        issues: { type: Type.ARRAY, items: { type: Type.STRING } },
        text_visibility: { type: Type.STRING, enum: ['clear', 'partially_visible', 'blurry', 'cut_off'] },
        recommended_action: { type: Type.STRING, enum: ['proceed', 'warn_and_proceed', 'request_better_image'] },
      },
      required: ['overall_quality', 'ocr_confidence', 'recommended_action'],
    },
    ocr: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        vendor: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            address: { type: Type.STRING, nullable: true },
            phone: { type: Type.STRING, nullable: true },
            tax_id: { type: Type.STRING, nullable: true },
          },
          required: ['name'],
        },
        date: { type: Type.STRING, nullable: true },
        time: { type: Type.STRING, nullable: true },
        receipt_number: { type: Type.STRING, nullable: true },
        currency: { type: Type.STRING },
        line_items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              raw_text: { type: Type.STRING },
              description: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              unit: { type: Type.STRING },
              unit_price: { type: Type.NUMBER },
              subtotal: { type: Type.NUMBER },
              discount: { type: Type.NUMBER, nullable: true },
            },
            required: ['description', 'quantity', 'unit_price', 'subtotal'],
          },
        },
        subtotal: { type: Type.NUMBER },
        tax: { type: Type.NUMBER, nullable: true },
        service_charge: { type: Type.NUMBER, nullable: true },
        total: { type: Type.NUMBER },
        payment_method: { type: Type.STRING, nullable: true },
        notes: { type: Type.STRING, nullable: true },
      },
      required: ['vendor', 'line_items', 'subtotal', 'total'],
    },
  },
  required: ['validation', 'quality'],
};

export async function runVisionAnalyzer(
  jobId: string,
  imageUrl: string
): Promise<MergedVisionResponse> {
  const startedAt = Date.now();
  const today = new Date().toLocaleDateString('en-GB');
  const currentYear = new Date().getFullYear();

  const systemInstruction = `You are a receipt analyst for a Thai restaurant expense system. You perform 3 tasks in one structured JSON response.

1. validation: classify the document + decide if valid (receipt/invoice/bank slip). If NOT valid, set ocr=null.
2. quality: grade image for OCR readiness.
3. ocr: extract every field.

★★★ CRITICAL LANGUAGE PRESERVATION ★★★
Preserve ALL text EXACTLY as printed — in its ORIGINAL script.
- If the receipt shows Thai characters, KEEP Thai characters in your output.
- DO NOT transliterate/romanize Thai to Latin letters.
- DO NOT translate Thai to English.
- Examples (WRONG → CORRECT):
    "CP Astra PCL" → "บริษัท ซีพี ออลล์ จำกัด (มหาชน)"
    "Pad Thai"     → "ผัดไทย"
    "Fried Pork Rice" → "ข้าวหมูทอด"
Only use the language actually printed. If mixed, preserve the mix.

Rules:
- Dates: return YYYY-MM-DD in CE. Buddhist Era (BE) − 543 = CE. Short years '69/'68/'67 on Thai receipts are BE (2569/2568/2567 → 2026/2025/2024). Today=${today}, assume year=${currentYear} if missing.
- Totals: Total = Subtotal + Tax + ServiceCharge. If printed Grand Total disagrees, trust the printed Grand Total.
- VAT 7% = "ภาษีมูลค่าเพิ่ม"/"VAT". Service 10% = "ค่าบริการ"/"Service".
- Bank transfer slip: vendor=recipient, create ONE line "Bank Transfer to [Recipient]" with quantity=1, unit="unit", unit_price=total, subtotal=total.

Set ocr=null ONLY when validation.is_valid_document=false.`;

  // Fetch image and convert to base64 for Gemini inlineData
  const { mimeType, data } = await fetchImageAsBase64(imageUrl);

  const userText = 'Analyze this receipt image and return the structured JSON response.';

  const { parsed: rawParsed, inputTokens, outputTokens, modelUsed } = await callGemini(
    MODELS.VISION,
    systemInstruction,
    [userText, { kind: 'image', mimeType, data }],
    {
      responseSchema: VISION_SCHEMA,
      fallbackModels: MODELS.VISION_FALLBACKS,
      maxOutputTokens: 3500,
      thinkingBudget: 0,
    }
  );

  // responseSchema guarantees shape, but normaliseVisionShape is cheap defence.
  const parsed: MergedVisionResponse = normaliseVisionShape(rawParsed);

  if (modelUsed !== MODELS.VISION) {
    console.log(`[VISION ANALYZER] served by fallback: ${modelUsed}`);
  }

  // Safety: if OCR missing but document is valid, surface the issue clearly.
  if (parsed.validation.is_valid_document && !parsed.ocr) {
    console.warn('[VISION ANALYZER] Document valid but ocr=null — treating as invalid');
    parsed.validation.is_valid_document = false;
    parsed.validation.rejection_reason = parsed.validation.rejection_reason ?? 'OCR extraction failed';
  }

  // ━━━ LOGGING ━━━
  console.log('\n[BATCH A] Vision analyzer done');
  console.log(
    `  validation: ${parsed.validation.document_type} (valid=${parsed.validation.is_valid_document}, conf=${(
      parsed.validation.confidence * 100
    ).toFixed(0)}%)`
  );
  console.log(
    `  quality: ${parsed.quality.overall_quality} (ocr_conf=${(parsed.quality.ocr_confidence * 100).toFixed(0)}%, action=${parsed.quality.recommended_action})`
  );
  if (parsed.ocr) {
    console.log(
      `  ocr: vendor="${parsed.ocr.vendor?.name ?? 'n/a'}" items=${parsed.ocr.line_items?.length ?? 0} total=฿${parsed.ocr.total ?? 0}`
    );
  }

  const totalDurationMs = Date.now() - startedAt;

  // Decide which steps to mark skipped vs done for correct UI display
  const skipped: AIPipelineStep[] = [];
  if (!parsed.validation.is_valid_document) {
    skipped.push('quality_assessor', 'ocr_extractor');
  } else if (parsed.quality.recommended_action === 'request_better_image') {
    skipped.push('ocr_extractor');
  }

  await completeBatch(
    jobId,
    BATCH_A,
    {
      bill_validator: parsed.validation,
      quality_assessor: parsed.quality,
      ocr_extractor: parsed.ocr ?? undefined,
    },
    totalDurationMs,
    inputTokens,
    outputTokens,
    BATCH_A_WEIGHTS,
    { skippedSteps: skipped }
  );

  return parsed;
}

// ─── BATCH B: Expense Builder (SKU matcher + finalizer in 1 call) ───────────

// ★ FLAT SCHEMA — models are much more reliable with flat top-level keys.
// Old nested shape `{ sku_matches: { matches: [...] }, finalized_expense: {...} }`
// caused frequent "Cannot read properties of undefined (reading 'matches')" errors.
type MergedBuilderResponse = {
  matches: AISKUMatch[];
  finalized: AIExpenseFinalizerResult;
};

type AISKUMatch = AISKUMatcherResult['matches'][number];

/**
 * Resilient normaliser for Batch B. Accepts any of these shapes:
 *   { matches: [...], finalized: {...} }                       ← canonical
 *   { matches: [...], finalized_expense: {...} }
 *   { sku_matches: { matches: [...] }, finalized_expense: {...} } ← old nested
 *   { sku_matches: [...], finalized: {...} }
 *   { results: [...], expense: {...} }                         ← paranoid fallback
 */
function normaliseBuilderShape(raw: unknown): MergedBuilderResponse {
  const r = (raw ?? {}) as Record<string, unknown>;

  // ── Extract matches array from any known shape ──
  let matches: unknown = null;
  if (Array.isArray(r.matches)) matches = r.matches;
  else if (Array.isArray(r.results)) matches = r.results;
  else if (r.sku_matches) {
    const sm = r.sku_matches as Record<string, unknown>;
    if (Array.isArray(sm)) matches = sm;
    else if (Array.isArray(sm.matches)) matches = sm.matches;
  } else if (r.skuMatches) {
    const sm = r.skuMatches as Record<string, unknown>;
    if (Array.isArray(sm)) matches = sm;
    else if (Array.isArray(sm.matches)) matches = sm.matches;
  }

  // ── Extract finalized object from any known shape ──
  const finalized =
    (r.finalized ??
      r.finalized_expense ??
      r.finalizedExpense ??
      r.expense ??
      r.result ??
      null) as Record<string, unknown> | null;

  if (!Array.isArray(matches)) {
    throw new Error(
      `Builder response missing matches array. Keys present: ${Object.keys(r).join(', ')}`
    );
  }
  if (!finalized || typeof finalized !== 'object') {
    throw new Error(
      `Builder response missing finalized object. Keys present: ${Object.keys(r).join(', ')}`
    );
  }

  return {
    matches: matches as AISKUMatch[],
    finalized: finalized as unknown as AIExpenseFinalizerResult,
  };
}

/**
 * Strict Gemini responseSchema for Batch B (SKU matcher + expense finalizer).
 * Flat top-level keys `matches` and `finalized` — Gemini will emit exactly
 * this shape or the API call will fail, eliminating the class of "missing
 * key" bugs we hit with OpenRouter's best-effort JSON mode.
 */
const BUILDER_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    matches: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          line_item_index: { type: Type.NUMBER },
          matched_sku_id: { type: Type.STRING, nullable: true },
          matched_sku_code: { type: Type.STRING, nullable: true },
          matched_sku_name: { type: Type.STRING, nullable: true },
          match_confidence: { type: Type.NUMBER },
          is_new_sku: { type: Type.BOOLEAN },
          suggested_sku_name: { type: Type.STRING },
          suggested_category: { type: Type.STRING },
          suggested_base_unit: { type: Type.STRING },
          suggested_purchase_unit: { type: Type.STRING },
          suggested_purchase_size: { type: Type.NUMBER, nullable: true },
          suggested_purchase_unit_label: { type: Type.STRING, nullable: true },
          suggested_conversion_factor: { type: Type.NUMBER },
        },
        required: [
          'line_item_index',
          'match_confidence',
          'is_new_sku',
          'suggested_sku_name',
          'suggested_category',
          'suggested_base_unit',
          'suggested_purchase_unit',
          'suggested_conversion_factor',
        ],
      },
    },
    finalized: {
      type: Type.OBJECT,
      properties: {
        expense_date: { type: Type.STRING },
        vendor_name: { type: Type.STRING },
        place: { type: Type.STRING },
        receipt_number: { type: Type.STRING, nullable: true },
        expense_type: { type: Type.STRING },
        lines: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              line_item_index: { type: Type.NUMBER },
              sku_id: { type: Type.STRING, nullable: true },
              sku_code: { type: Type.STRING, nullable: true },
              description: { type: Type.STRING },
              purchase_qty: { type: Type.NUMBER },
              purchase_unit: { type: Type.STRING },
              purchase_size: { type: Type.NUMBER, nullable: true },
              purchase_unit_label: { type: Type.STRING, nullable: true },
              base_qty: { type: Type.NUMBER },
              base_unit: { type: Type.STRING },
              unit_price: { type: Type.NUMBER },
              subtotal: { type: Type.NUMBER },
              discount: { type: Type.NUMBER },
              final_amount: { type: Type.NUMBER },
              category: { type: Type.STRING },
              is_new_sku: { type: Type.BOOLEAN },
            },
            required: [
              'line_item_index',
              'description',
              'purchase_qty',
              'purchase_unit',
              'base_qty',
              'base_unit',
              'unit_price',
              'subtotal',
              'discount',
              'final_amount',
              'category',
              'is_new_sku',
            ],
          },
        },
        subtotal: { type: Type.NUMBER },
        tax: { type: Type.NUMBER },
        service_charge: { type: Type.NUMBER },
        total: { type: Type.NUMBER },
        confidence_score: { type: Type.NUMBER },
        requires_review: { type: Type.BOOLEAN },
        review_reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        'expense_date',
        'vendor_name',
        'place',
        'expense_type',
        'lines',
        'subtotal',
        'tax',
        'service_charge',
        'total',
        'confidence_score',
        'requires_review',
        'review_reasons',
      ],
    },
  },
  required: ['matches', 'finalized'],
};

export async function runExpenseBuilder(
  jobId: string,
  ocrResult: AIOCRResult,
  existingSKUs: ExpenseSKU[]
): Promise<AIExpenseFinalizerResult> {
  const startedAt = Date.now();

  // ─── Pre-filter SKUs via Fuse for context efficiency (unchanged) ──────────
  const fuse = new Fuse(existingSKUs, {
    keys: ['name', 'nameTh', 'code'],
    threshold: 0.4,
    includeScore: true,
  });

  // ─── Group duplicate items (unchanged logic) ──────────────────────────────
  const itemGroups: Map<string, number[]> = new Map();
  ocrResult.line_items.forEach((item, idx) => {
    const normalized = normalizeDescription(item.description);
    if (!itemGroups.has(normalized)) itemGroups.set(normalized, []);
    itemGroups.get(normalized)!.push(idx);
  });
  const rawDescGroups: Map<string, number[]> = new Map();
  ocrResult.line_items.forEach((item, idx) => {
    const rawKey = item.description.trim().toLowerCase();
    if (!rawDescGroups.has(rawKey)) rawDescGroups.set(rawKey, []);
    rawDescGroups.get(rawKey)!.push(idx);
  });
  for (const [, rawIndices] of rawDescGroups) {
    if (rawIndices.length > 1) {
      const firstNorm = normalizeDescription(ocrResult.line_items[rawIndices[0]].description);
      const existingGroup = itemGroups.get(firstNorm) ?? [];
      const merged = Array.from(new Set([...existingGroup, ...rawIndices]));
      itemGroups.set(firstNorm, merged);
    }
  }

  const relevantSKUs: ExpenseSKU[] = [];
  for (const item of ocrResult.line_items) {
    const results = fuse.search(item.description, { limit: 3 });
    for (const r of results) {
      if (!relevantSKUs.find((s) => s.id === r.item.id)) relevantSKUs.push(r.item);
    }
  }

  const skuContext = relevantSKUs.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    subCategory: s.subCategory,
    baseUnit: s.baseUnit,
    purchaseUnit: s.purchaseUnit,
    conversionFactor: s.conversionFactor,
  }));

  const groupingInfo = Array.from(itemGroups.entries())
    .filter(([, indices]) => indices.length > 1)
    .map(([normalized, indices]) => ({
      normalized_name: normalized,
      line_indices: indices,
      original_descriptions: indices.map((i) => ocrResult.line_items[i].description),
    }));

  const today = new Date().toLocaleDateString('en-GB');
  const currentYear = new Date().getFullYear();

  const systemInstruction = `Two-task specialist for a Thai restaurant expense system. Today=${today}.

TASK 1 — SKU matching: map each OCR line_item_index to an existing SKU or mark is_new_sku=true.
TASK 2 — Finalization: build the canonical expense record using YOUR own matches above (stay consistent).

★ LANGUAGE PRESERVATION (critical):
- Copy every "description", "vendor_name", "place", "suggested_sku_name" EXACTLY as it appears in the OCR input — in its ORIGINAL script.
- NEVER transliterate/romanize/translate Thai text. If OCR gave Thai, your output is Thai. If mixed, preserve the mix.
- Example: OCR description "ผัดไทย" → output description "ผัดไทย" (NOT "Pad Thai").

Rules:
- Match semantically across Thai/English/mixed (e.g. recognise "น้ำตาล" ≡ "Sugar" for matching purposes, but keep whichever string appeared in the input verbatim in the output).
- Confidence ≥0.9 confident, 0.7-0.9 likely, <0.7 → is_new_sku=true.
- Items in the pre-computed duplicate groups below MUST share one SKU.
- Dates CE: BE−543=CE. If OCR year looks wrong, prefer ${currentYear}. Handle printed short years as BE.
- Totals: Total = Subtotal + Tax + ServiceCharge (never subtract). If printed total disagrees, trust the printed total & adjust subtotal/tax.
- Units: kg↔g ×1000, L↔ml ×1000; else use suggested_conversion_factor.
- requires_review=true if: bank transfer | any confidence<0.7 | total diff >5% | ambiguous date | any is_new_sku=true.

BASE_UNIT: g|ml|unit|piece|sheet|roll|cm|sqm
PURCHASE_UNIT: kg|g|L|ml|pack|box|case|bottle|can|bag|unit|piece|roll|sheet|set
CATEGORY: capex_equipment|capex_decor|capex_furniture|capex_technology|capex_vehicle|capex_renovation|inventory_food|inventory_drinks|inventory_packaging|inventory_cleaning|inventory_consumable|operating_staff|operating_marketing|operating_admin|utility_electric|utility_water|utility_gas|utility_internet|other`;

  const userText = `OCR:
${JSON.stringify(ocrResult)}

${groupingInfo.length ? `DUPLICATE_GROUPS (each group must share one SKU):\n${JSON.stringify(groupingInfo)}\n\n` : ''}EXISTING_SKUS (pre-filtered):
${JSON.stringify(skuContext)}

Totals to reconcile: subtotal=${ocrResult.subtotal}, tax=${ocrResult.tax ?? 0}, service=${ocrResult.service_charge ?? 0}, total=${ocrResult.total}.`;

  const { parsed: rawParsed, inputTokens, outputTokens, modelUsed } = await callGemini(
    MODELS.REASONING,
    systemInstruction,
    [userText],
    {
      responseSchema: BUILDER_SCHEMA,
      fallbackModels: MODELS.REASONING_FALLBACKS,
      maxOutputTokens: 4500,
      thinkingBudget: 0,
    }
  );

  // responseSchema guarantees shape, but normaliseBuilderShape is cheap defence.
  const normalised = normaliseBuilderShape(rawParsed);
  const skuMatches: AISKUMatcherResult = { matches: normalised.matches };
  const finalResult: AIExpenseFinalizerResult = normalised.finalized;

  if (modelUsed !== MODELS.REASONING) {
    console.log(`[EXPENSE BUILDER] served by fallback: ${modelUsed}`);
  }

  // ─── POST-PROCESS 1: Consolidate duplicate-group SKU matches (unchanged) ──
  for (const [, indices] of itemGroups) {
    if (indices.length > 1) {
      const groupMatches = indices
        .map((idx) => skuMatches.matches.find((m) => m.line_item_index === idx))
        .filter((m): m is NonNullable<typeof m> => m != null);
      if (groupMatches.length > 0) {
        const bestMatch = groupMatches.reduce((best, m) => {
          if (!best.is_new_sku && m.is_new_sku) return best;
          if (best.is_new_sku && !m.is_new_sku) return m;
          return m.match_confidence > best.match_confidence ? m : best;
        }, groupMatches[0]);

        for (const idx of indices) {
          const match = skuMatches.matches.find((m) => m.line_item_index === idx);
          if (match && match !== bestMatch) {
            match.matched_sku_id = bestMatch.matched_sku_id;
            match.matched_sku_code = bestMatch.matched_sku_code;
            match.matched_sku_name = bestMatch.matched_sku_name;
            match.is_new_sku = bestMatch.is_new_sku;
            match.suggested_sku_name = bestMatch.suggested_sku_name;
            match.suggested_category = bestMatch.suggested_category;
            match.suggested_base_unit = bestMatch.suggested_base_unit;
            match.suggested_purchase_unit = bestMatch.suggested_purchase_unit;
            match.suggested_conversion_factor = bestMatch.suggested_conversion_factor;
            match.match_confidence = Math.max(match.match_confidence, bestMatch.match_confidence);
          }
        }
      }
    }
  }

  // ─── POST-PROCESS 2: Merge duplicate NEW-SKU finalizer lines (unchanged) ──
  const newSkuGroups: Map<string, typeof finalResult.lines> = new Map();
  const finalLines: typeof finalResult.lines = [];
  for (const line of finalResult.lines) {
    if (line.is_new_sku && !line.sku_id) {
      const dedupeKey = normalizeDescription(line.description);
      if (!newSkuGroups.has(dedupeKey)) newSkuGroups.set(dedupeKey, []);
      newSkuGroups.get(dedupeKey)!.push(line);
    } else {
      finalLines.push(line);
    }
  }
  for (const [, dupeLines] of newSkuGroups) {
    if (dupeLines.length === 1) {
      finalLines.push(dupeLines[0]);
    } else {
      const base = { ...dupeLines[0] };
      for (let i = 1; i < dupeLines.length; i++) {
        base.purchase_qty += dupeLines[i].purchase_qty;
        base.base_qty += dupeLines[i].base_qty;
        base.subtotal += dupeLines[i].subtotal;
        base.discount = (base.discount ?? 0) + (dupeLines[i].discount ?? 0);
        base.final_amount += dupeLines[i].final_amount;
      }
      console.log(
        `[MERGE NEW SKU] Merged ${dupeLines.length} lines into 1: "${base.description}" total qty ${base.purchase_qty} ${base.purchase_unit}`
      );
      finalLines.push(base);
    }
  }
  finalLines.sort((a, b) => a.line_item_index - b.line_item_index);
  finalLines.forEach((line, idx) => {
    line.line_item_index = idx;
  });
  finalResult.lines = finalLines;

  // ━━━ LOGGING ━━━
  console.log('\n🔧 [BATCH B] Expense builder results');
  console.log(`  matched ${skuMatches.matches.length} items`);
  console.log(`  finalized ${finalResult.lines.length} lines — total ฿${finalResult.total}`);
  console.log(
    `  confidence=${(finalResult.confidence_score * 100).toFixed(0)}% requires_review=${finalResult.requires_review}`
  );

  const totalDurationMs = Date.now() - startedAt;

  await completeBatch(
    jobId,
    BATCH_B,
    {
      sku_matcher: skuMatches,
      expense_finalizer: finalResult,
    },
    totalDurationMs,
    inputTokens,
    outputTokens,
    BATCH_B_WEIGHTS,
    { finalResult }
  );

  return finalResult;
}

// ═══════════════════════════════════════════════════════════════════════════

export const expenseAIService = {
  async createJob(imageUrl: string, imagePath: string): Promise<string> {
    const ref = doc(collection(db, JOBS_COL));
    const initialSteps: AIPipelineStepResult[] = (
      ['bill_validator', 'quality_assessor', 'ocr_extractor', 'sku_matcher', 'expense_finalizer'] as AIPipelineStep[]
    ).map((step) => ({
      step,
      stepNumber: STEP_NUMBERS[step],
      model: STEP_MODELS[step],
      status: 'pending' as const,
    }));

    await setDoc(ref, {
      imageUrl,
      imagePath,
      overallStatus: 'pending',
      currentStep: null,
      steps: initialSteps,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  async getJob(jobId: string): Promise<AIExpenseJob | null> {
    const snap = await getDoc(doc(db, JOBS_COL, jobId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
    } as AIExpenseJob;
  },

  /**
   * Execute the next available batch of work for this job. Despite the name,
   * a single `runStep` call may resolve multiple UI "steps" at once because
   * the pipeline is physically organised into two batches (vision, builder).
   *
   * The targetStep parameter is kept for API compatibility with the client
   * nudge logic, but is effectively used only to route the call to the
   * correct batch. Whichever step in a batch arrives first wins the claim;
   * subsequent nudges for the same batch are no-ops.
   */
  async runStep(
    jobId: string,
    skus: ExpenseSKU[],
    targetStep?: string
  ): Promise<{ status: string; currentStep: string | null }> {
    const jobRef = doc(db, JOBS_COL, jobId);

    // Decide which batch this nudge belongs to. If targetStep is unspecified,
    // run whichever batch is next (vision first, then builder).
    const batchA_hasPending = async () => {
      const snap = await getDoc(jobRef);
      const steps = (snap.data()?.steps as AIPipelineStepResult[]) ?? [];
      return BATCH_A.some((s) => steps.find((x) => x.step === s)?.status === 'pending');
    };

    let batch: AIPipelineStep[];
    if (targetStep && BATCH_A.includes(targetStep as AIPipelineStep)) {
      batch = BATCH_A;
    } else if (targetStep && BATCH_B.includes(targetStep as AIPipelineStep)) {
      batch = BATCH_B;
    } else {
      // No target → pick whichever batch still has pending work
      batch = (await batchA_hasPending()) ? BATCH_A : BATCH_B;
    }

    // Try to atomically claim the batch. Another caller may already own it.
    const claim = await claimBatch(jobId, batch);

    if (!claim.claimed) {
      // Batch is already running or already done. Return current job state.
      const snap = await getDoc(jobRef);
      const data = snap.data()!;
      const steps = (data.steps as AIPipelineStepResult[]) ?? [];
      const nextPending = steps.find((s) => s.status === 'pending');
      return { status: data.overallStatus, currentStep: nextPending?.step ?? null };
    }

    console.log(
      `\n🚀 [AI BATCH] Executing ${batch === BATCH_A ? 'BATCH A (vision)' : 'BATCH B (builder)'} for job: ${jobId}${
        targetStep ? ` (trigger: ${targetStep})` : ''
      }`
    );

    try {
      if (batch === BATCH_A) {
        const vision = await runVisionAnalyzer(jobId, claim.imageUrl);

        // Early-exit on validation / quality failures (saves Batch B call)
        if (!vision.validation.is_valid_document) {
          await updateDoc(jobRef, {
            overallStatus: 'failed',
            errorMessage: `Not a valid document: ${vision.validation.rejection_reason ?? vision.validation.document_type}`,
            updatedAt: serverTimestamp(),
          });
        } else if (vision.quality.recommended_action === 'request_better_image') {
          await updateDoc(jobRef, {
            overallStatus: 'needs_review',
            errorMessage: `Image quality too poor: ${vision.quality.issues.join(', ')}`,
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        // BATCH_B: builder needs Batch A's OCR result
        const freshSnap = await getDoc(jobRef);
        const freshSteps = (freshSnap.data()?.steps as AIPipelineStepResult[]) ?? [];
        const ocrStep = freshSteps.find((s) => s.step === 'ocr_extractor');
        if (!ocrStep || ocrStep.status !== 'done' || !ocrStep.result) {
          throw new Error('OCR result missing — cannot run builder batch');
        }
        await runExpenseBuilder(jobId, ocrStep.result as AIOCRResult, skus);
      }

      const updatedSnap = await getDoc(jobRef);
      const updatedData = updatedSnap.data()!;
      const updatedSteps = (updatedData.steps as AIPipelineStepResult[]) ?? [];
      const nextPending = updatedSteps.find((s) => s.status === 'pending');
      return {
        status: updatedData.overallStatus,
        currentStep: nextPending?.step ?? null,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Batch execution failed';
      await updateDoc(jobRef, {
        overallStatus: 'failed',
        errorMessage: msg,
        updatedAt: serverTimestamp(),
      });
      throw error;
    }
  },

  /**
   * Run the full pipeline end-to-end in a single invocation.
   * Makes exactly TWO OpenRouter API calls in the happy path (one vision,
   * one builder). Invalid-document / poor-image rejections exit after the
   * first call, using only ONE API request.
   */
  async runPipeline(jobId: string, existingSKUs: ExpenseSKU[]): Promise<AIExpenseFinalizerResult> {
    const jobRef = doc(db, JOBS_COL, jobId);
    const snap = await getDoc(jobRef);
    if (!snap.exists()) throw new Error('Job not found');

    const jobData = snap.data() as { imageUrl: string };
    const imageUrl = jobData.imageUrl;

    console.log(`\n🚀 [AI PIPELINE] Starting 2-call batched execution for job: ${jobId}`);
    const pipeStart = Date.now();

    try {
      // ── BATCH A (1 API call): validator + quality + OCR ─────────────────
      console.log('  ⏳ [Batch A] Running vision analyzer (validator+quality+OCR)...');
      const batchA_claim = await claimBatch(jobId, BATCH_A);
      if (!batchA_claim.claimed) {
        console.log('  ℹ️  [Batch A] already in progress/done — skipping.');
      }
      const vision = await runVisionAnalyzer(jobId, imageUrl);

      if (!vision.validation.is_valid_document) {
        console.warn('  ❌ [Batch A] REJECTED: Not a valid document.');
        await updateDoc(jobRef, {
          overallStatus: 'failed',
          errorMessage: `Not a valid document: ${vision.validation.rejection_reason ?? vision.validation.document_type}`,
          updatedAt: serverTimestamp(),
        });
        throw new Error(`Not a valid expense document: ${vision.validation.rejection_reason}`);
      }
      if (vision.quality.recommended_action === 'request_better_image') {
        console.warn('  ❌ [Batch A] REJECTED: Poor image quality.');
        await updateDoc(jobRef, {
          overallStatus: 'needs_review',
          errorMessage: `Image quality too poor: ${vision.quality.issues.join(', ')}`,
          updatedAt: serverTimestamp(),
        });
        throw new Error(`Image quality poor: ${vision.quality.issues.join(', ')}`);
      }
      if (!vision.ocr) throw new Error('Vision analyzer returned no OCR result');
      console.log(`  ✅ [Batch A] Validated + ${vision.ocr.line_items.length} items extracted.`);

      // ── BATCH B (1 API call): SKU matcher + finalizer ────────────────────
      console.log('  ⏳ [Batch B] Running expense builder (SKU matcher + finalizer)...');
      const batchB_claim = await claimBatch(jobId, BATCH_B);
      if (!batchB_claim.claimed) {
        console.log('  ℹ️  [Batch B] already in progress/done — skipping.');
      }
      const finalResult = await runExpenseBuilder(jobId, vision.ocr, existingSKUs);
      console.log('  ✅ [Batch B] Expense record built.');

      const finalStatus = finalResult.requires_review ? 'needs_review' : 'completed';
      const totalDuration = Date.now() - pipeStart;
      console.log(
        `\n🎉 [AI PIPELINE] SUCCESS in ${Math.round(totalDuration / 1000)}s (2 API calls) - Status: ${finalStatus}\n`
      );
      return finalResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Pipeline failed';
      await updateDoc(jobRef, {
        overallStatus: 'failed',
        errorMessage: msg,
        updatedAt: serverTimestamp(),
      });
      throw error;
    }
  },
};
