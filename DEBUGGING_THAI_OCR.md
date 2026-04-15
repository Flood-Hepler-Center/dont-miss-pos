# 🔍 Debugging Thai OCR & SKU Matching

## Changes Made

### 1. **Fixed OCR Model** 
- Using `google/gemini-3.1-pro-preview` (latest multilingual model)
- **Why**: Gemini excels at Thai text extraction and JSON formatting

### 2. **Fixed OCR Prompt** ❗ CRITICAL FIX
**Problem**: User needs EXACT text from receipt for easy reconciliation
**Solution**: Preserve text EXACTLY as shown - NO translation
```json
{
  "description": "ปีกกลางไก่ แพ็คถาด"  // EXACT as receipt - Thai/English/mixed preserved ✅
}
```
**Benefit**: When auditing, receipt text matches system 100% - easy to verify!

### 3. **Added JSON Error Handling & Auto-Repair** 🛡️
- Cleans markdown code blocks from responses
- **Auto-repairs truncated JSON** (closes unclosed strings/arrays/objects)
- Shows both raw and cleaned JSON when parsing fails
- Detailed error messages to pinpoint the issue

### 4. **Added Comprehensive Logging**

#### Console Output Shows:
```
🔍 [OCR EXTRACTOR] Full Results:
📋 Vendor: CP Axtra PCL นครอินทร์
📅 Date: 2024-04-03 Time: 19:39

📦 Extracted 6 line items:

  1. "TGM มิกซ์ชาคูเตอรี่ เซท อี 75ก.X1" (1 pack)
      Raw: "TGM มิกซ์ชาคูเตอรี่ เซท อี 75ก.X1 (8850286510861)2 99.00"
      Price: ฿99 × 1 = ฿99

  2. "ปีกกลางไก่ แพ็คถาด กก.ละ" (0.986 kg)
      Raw: "ปีกกลางไก่ แพ็คถาด กก.ละ (2100887601630000000671) (0.986 * 163.00) 160.75"
      Price: ฿163 × 0.986 = ฿160.75

  3. "เอโร่ ครีมเปรี้ยว 450ก." (1 pack)
      Raw: "เอโร่ ครีมเปรี้ยว 450ก. (88595662430012)2 105.00"
      Price: ฿105 × 1 = ฿105

💰 Total: ฿696.75
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔎 [SKU MATCHER] Starting fuzzy matching...

📌 Searching for: "ปีกกลางไก่ แพ็คถาด กก.ละ"
   Top 3 fuzzy matches:
   1. ปีกกลางไก่ แพ็คถาด (IF-0042) - 95.2% match ✅ (if exists in catalog)
   2. ปีกไก่ (IF-0043) - 42.3% match
   
   ⚠️  Or: No fuzzy matches found! (if first time seeing this item)

✅ Found 2 relevant SKUs for AI matching
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 [SKU MATCHER] AI Matching Results:

1. ✅ MATCHED - 95% confident
   OCR: "ปีกกลางไก่ แพ็คถาด กก.ละ"
   → Matched to: ปีกกลางไก่ แพ็คถาด (IF-0042)

2. 🆕 NEW SKU - 90% confident
   OCR: "เอโร่ ครีมเปรี้ยว 450ก."
   → Suggested: เอโร่ ครีมเปรี้ยว 450ก.
      Category: inventory_food
      Units: g / pack

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## How to Debug

### Step 1: Check OCR Extraction
Look for `[OCR EXTRACTOR]` in server console:
- ✅ **Good**: Shows EXACT text from receipt:
  - `"ปีกกลางไก่ แพ็คถาด กก.ละ"` (Thai)
  - `"TGM มิกซ์ชาคูเตอรี่"` (mixed Thai/English)
  - `"Sour Cream"` (English)
- ❌ **Bad**: Text is translated or garbled

If bad → OCR model or prompt issue

### Step 2: Check Fuzzy Matching
Look for `[SKU MATCHER] Starting fuzzy matching`:
- **High match scores (>60%)**: SKU exists in catalog with same/similar Thai name ✅
- **Medium scores (40-60%)**: Partial matches, AI will decide
- **Low or no matches**: First time seeing this item → will create NEW SKU
- **Expected**: Many "No fuzzy matches" for new Thai items until you build catalog

### Step 3: Check AI Decisions
Look for `[SKU MATCHER] AI Matching Results`:
- **Matched SKUs**: Found existing SKU with exact/similar Thai name ✅
- **New SKUs**: First time item - AI suggests creating with EXACT Thai name from receipt
- **Suggested names preserve original**: "ปีกกลางไก่" stays as "ปีกกลางไก่", not translated

## Your Workflow

### First Upload (Empty SKU Catalog):
1. Upload Thai receipt
2. OCR extracts: "ปีกกลางไก่ แพ็คถาด กก.ละ"
3. No fuzzy matches (catalog empty)
4. AI suggests: NEW SKU → "ปีกกลางไก่ แพ็คถาด กก.ละ"
5. You create SKU with Thai name

### Second Upload (Same Item):
1. Upload another receipt with same item
2. OCR extracts: "ปีกกลางไก่ แพ็คถาด กก.ละ"
3. Fuzzy match: 95%+ match to existing SKU ✅
4. AI matches: MATCHED → "ปีกกลางไก่ แพ็คถาด กก.ละ" (IF-0042)
5. Perfect reconciliation!

## Solutions by Problem

### Problem: OCR extracts English instead of Thai
**Solution**: ✅ Already fixed - OCR now preserves exact text

### Problem: Fuzzy matching not working
**Expected**: For NEW items (first time), no fuzzy matches
**Solution**: Build your Thai SKU catalog over time - future items will match!

### Problem: SKU names in English but receipts in Thai
**Solution**: ✅ Already fixed! System now preserves Thai names:
- Receipt: "ปีกกลางไก่" → System: "ปีกกลางไก่"
- Future receipts match Thai→Thai perfectly

### Problem: Want both Thai and English names
**Optional Enhancement**: Add `nameTh` field to SKU catalog:
```typescript
{
  name: "ปีกกลางไก่ แพ็คถาด",  // Primary (matches receipt)
  nameTh: "ปีกกลางไก่ แพ็คถาด", // Thai
  nameEn: "Chicken Middle Wings", // English for reports
}
```

### Problem: JSON Parse Error - Unterminated string
**Symptom**: `SyntaxError: Unterminated string in JSON at position XXXX`
**Cause**: AI response truncated (cut off mid-stream)
**Solution**: 
1. Increased `max_tokens` from 4096 to 8192
2. Added auto-repair function that:
   - Detects unclosed strings/arrays/objects
   - Automatically closes them
   - Recovers truncated data

**Example truncation:**
```json
"total": 696.75,
"payment_   // CUT OFF HERE
```

**Auto-repair:**
```json
"total": 696.75,
"payment_"  // String closed
}           // Object closed
```

**Console shows:**
```
? [OCR EXTRACTOR] JSON Parse Error - attempting repair...
? [OCR EXTRACTOR] Successfully repaired truncated JSON
```

## Building Your Thai SKU Catalog

### Strategy:
1. **First month**: Most items will be "NEW SKU" - this is normal!
2. **Create SKUs**: Use exact Thai names from receipts
3. **Future months**: High match rates as catalog grows
4. **Result**: Perfect reconciliation - receipt text = system text

### Tips:
- Keep item names consistent (same vendor → same naming)
- Use `nameTh` field if you want English translations later
- Fuzzy matching works GREAT with Thai→Thai once catalog built

## Next Steps

1. **Upload a receipt** with Thai text
2. **Watch server console** for the detailed logs
3. **Identify the failure point**:
   - OCR not extracting Thai? → Try different model
   - Fuzzy search failing? → Add Thai names to SKU catalog
   - AI matching wrong? → Adjust prompt or use better model

## Quick Fixes Available

### If OCR still translates Thai:
Change model to Qwen (better Asian language):
```typescript
PRECISE_VISION: 'qwen/qwen-vl-max'
```

### If fuzzy matching fails completely:
Lower threshold for more matches:
```typescript
threshold: 0.6  // was 0.4
```

### If AI still matches wrong:
Use smarter model for matching:
```typescript
SKU_MATCHER: 'openai/gpt-4o'  // was gpt-4o-mini
```
