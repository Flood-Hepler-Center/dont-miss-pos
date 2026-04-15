/* eslint-disable no-console */
/**
 * Expense AI Pipeline Service
 *
 * 5-Step AI Pipeline via OpenRouter:
 *  1. Bill Validator     – gemini-flash-1.5  – is this a valid bill/receipt?
 *  2. Quality Assessor   – gemini-flash-1.5  – image quality / OCR readiness
 *  3. OCR Extractor      – gemini-pro-1.5    – full structured extraction
 *  4. SKU Matcher        – gpt-4o-mini       – match items to SKU catalog
 *  5. Expense Finalizer  – claude-3-haiku    – build final expense record
 */

import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  collection,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
// import { generateObject } from 'ai';
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

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions';

const MODELS = {
  FAST_VISION: 'google/gemini-2.0-flash-001', // Fast vision for validation
  PRECISE_VISION: 'google/gemini-3.1-pro-preview', // Most reliable for JSON + Thai OCR
  SKU_MATCHER: 'openai/gpt-4o-mini', // Good reasoning at low cost
  FINALIZER: 'anthropic/claude-3.5-haiku', // Excellent structured output
} as const;

const STEP_MODELS: Record<AIPipelineStep, string> = {
  bill_validator: MODELS.FAST_VISION,
  quality_assessor: MODELS.FAST_VISION,
  ocr_extractor: MODELS.PRECISE_VISION,
  sku_matcher: MODELS.SKU_MATCHER,
  expense_finalizer: MODELS.FINALIZER,
};

const STEP_NUMBERS: Record<AIPipelineStep, 1 | 2 | 3 | 4 | 5> = {
  bill_validator: 1,
  quality_assessor: 2,
  ocr_extractor: 3,
  sku_matcher: 4,
  expense_finalizer: 5,
};

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
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

// ─── OpenRouter Helper ────────────────────────────────────────────────────────

async function callOpenRouter(
  model: string,
  messages: OpenRouterMessage[],
  jsonMode = true
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.1,
    max_tokens: 8192, // Increased for complex receipts with Thai text
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(OPENROUTER_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'DontMiss POS - Expense AI',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0]?.message?.content ?? '{}',
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

// ─── Job Management ───────────────────────────────────────────────────────────

const JOBS_COL = 'expense_ai_jobs';

async function updateJobStep(
  jobId: string,
  step: AIPipelineStep,
  update: Partial<AIPipelineStepResult>
): Promise<void> {
  const jobRef = doc(db, JOBS_COL, jobId);
  const snap = await getDoc(jobRef);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;
  const steps = (data.steps as AIPipelineStepResult[]) ?? [];
  const idx = steps.findIndex((s) => s.step === step);
  if (idx >= 0) {
    steps[idx] = { ...steps[idx], ...update };
  } else {
    steps.push({ step, stepNumber: STEP_NUMBERS[step], model: STEP_MODELS[step], status: 'pending', ...update });
  }
  await updateDoc(jobRef, { steps, currentStep: step, updatedAt: serverTimestamp() });
}

// ─── Step 1: Bill Validator ───────────────────────────────────────────────────

async function runBillValidator(
  jobId: string,
  imageUrl: string
): Promise<AIBillValidatorResult> {
  const startedAt = new Date();
  await updateJobStep(jobId, 'bill_validator', { status: 'running', startedAt });

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
  "document_type": "receipt" | "invoice" | "quotation" | "delivery_note" | "other",
  "confidence": number between 0 and 1,
  "rejection_reason": string or null,
  "detected_language": "th" | "en" | "mixed" | "other",
  "visible_merchant": string or null
}`,
        },
      ],
    },
  ];

  const { content, inputTokens, outputTokens } = await callOpenRouter(MODELS.FAST_VISION, messages);
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

async function runQualityAssessor(
  jobId: string,
  imageUrl: string
): Promise<AIQualityResult> {
  const startedAt = new Date();
  await updateJobStep(jobId, 'quality_assessor', { status: 'running', startedAt });

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

  const { content, inputTokens, outputTokens } = await callOpenRouter(MODELS.FAST_VISION, messages);
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

async function runOCRExtractor(
  jobId: string,
  imageUrl: string
): Promise<AIOCRResult> {
  const startedAt = new Date();
  await updateJobStep(jobId, 'ocr_extractor', { status: 'running', startedAt });

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `You are an expert OCR system specialized in Thai and English receipts/invoices.
CRITICAL: Preserve text EXACTLY as shown on receipt - DO NOT translate Thai to English.
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

  const { content, inputTokens, outputTokens } = await callOpenRouter(MODELS.PRECISE_VISION, messages);
  
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

async function runSKUMatcher(
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

  const { content, inputTokens, outputTokens } = await callOpenRouter(MODELS.SKU_MATCHER, messages, true);
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

async function runExpenseFinalizer(
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
Apply unit conversions correctly. All amounts in THB.
Respond with valid JSON only.`,
    },
    {
      role: 'user',
      content: `Build the final expense record.

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

Determine the expense_type:
- "capex" if majority of items are equipment/decor/furniture
- "inventory" if majority are food/drinks
- "operating" if operating expenses
- "mixed" if multiple categories

Mark requires_review=true if:
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

  const { content, inputTokens, outputTokens } = await callOpenRouter(MODELS.FINALIZER, messages, true);
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

// ─── Main Pipeline Orchestrator ───────────────────────────────────────────────

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

  async runPipeline(jobId: string, existingSKUs: ExpenseSKU[]): Promise<AIExpenseFinalizerResult> {
    const jobRef = doc(db, JOBS_COL, jobId);
    const snap = await getDoc(jobRef);
    if (!snap.exists()) throw new Error('Job not found');

    const jobData = snap.data() as { imageUrl: string };
    const imageUrl = jobData.imageUrl;

    await updateDoc(jobRef, { overallStatus: 'running', updatedAt: serverTimestamp() });

    try {
      // ── Steps 1 → 2 → 3 → 4 → 5 (sequential within a single image) ─────
      const step1 = await runBillValidator(jobId, imageUrl);
      if (!step1.is_valid_document) {
        await updateDoc(jobRef, {
          overallStatus: 'failed',
          errorMessage: `Not a valid document: ${step1.rejection_reason ?? step1.document_type}`,
          updatedAt: serverTimestamp(),
        });
        throw new Error(`Not a valid expense document: ${step1.rejection_reason}`);
      }

      const step2 = await runQualityAssessor(jobId, imageUrl);
      if (step2.recommended_action === 'request_better_image') {
        await updateDoc(jobRef, {
          overallStatus: 'needs_review',
          errorMessage: `Image quality too poor: ${step2.issues.join(', ')}`,
          updatedAt: serverTimestamp(),
        });
        throw new Error(`Image quality poor: ${step2.issues.join(', ')}`);
      }

      const step3 = await runOCRExtractor(jobId, imageUrl);
      const step4 = await runSKUMatcher(jobId, step3, existingSKUs);
      const step5 = await runExpenseFinalizer(jobId, step3, step4, existingSKUs);

      const finalStatus = step5.requires_review ? 'needs_review' : 'completed';
      await updateDoc(jobRef, {
        overallStatus: finalStatus,
        finalResult: step5,
        totalDurationMs: snap.data()?.steps?.reduce(
          (s: number, st: AIPipelineStepResult) => s + (st.durationMs ?? 0),
          0
        ) ?? 0,
        updatedAt: serverTimestamp(),
      });

      return step5;
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
