import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type {
  ExpenseDocument,
  ExpenseLine,
  ExpenseSKU,
  ExpenseVendor,
  CreateExpenseDocumentInput,
  CreateExpenseLineInput,
  CreateExpenseSKUInput,
  ExpenseFilter,
  ExpenseStats,
  ExpenseMainCategory,
} from '@/types/expense';

export const COL = {
  DOCUMENTS: 'expense_documents',
  LINES: 'expense_lines',
  SKUS: 'expense_skus',
  VENDORS: 'expense_vendors',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(val: unknown): Date {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (val instanceof Timestamp) return val.toDate();
  if (typeof val === 'object' && 'seconds' in (val as object)) {
    return new Date(((val as { seconds: number }).seconds) * 1000);
  }
  return new Date(val as string);
}

function fromFirestoreDoc<T>(snap: { id: string; data: () => Record<string, unknown> }): T {
  const data = snap.data();
  const dateFields = ['documentDate', 'createdAt', 'updatedAt', 'confirmedAt', 'lastPurchaseDate'];
  const converted: Record<string, unknown> = { id: snap.id };
  for (const [k, v] of Object.entries(data)) {
    converted[k] = dateFields.includes(k) ? toDate(v) : v;
  }
  return converted as T;
}

function removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result as Partial<T>;
}

// ─── SKU Service ──────────────────────────────────────────────────────────────

export const expenseSKUService = {
  async getAll(): Promise<ExpenseSKU[]> {
    const q = query(collection(db, COL.SKUS), where('isActive', '==', true), orderBy('code', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => fromFirestoreDoc<ExpenseSKU>(d));
  },

  async getByCategory(category: ExpenseMainCategory): Promise<ExpenseSKU[]> {
    const q = query(
      collection(db, COL.SKUS),
      where('mainCategory', '==', category),
      where('isActive', '==', true),
      orderBy('code', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => fromFirestoreDoc<ExpenseSKU>(d));
  },

  async getById(id: string): Promise<ExpenseSKU | null> {
    const snap = await getDoc(doc(db, COL.SKUS, id));
    if (!snap.exists()) return null;
    return fromFirestoreDoc<ExpenseSKU>(snap);
  },

  async create(input: CreateExpenseSKUInput): Promise<string> {
    const code = await this._generateCode(input.subCategory);
    const ref = doc(collection(db, COL.SKUS));
    const data = removeUndefined({
      ...input,
      code,
      averageUnitCost: 0,
      lastPurchasePrice: 0,
      totalPurchasedQty: 0,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, data);
    return ref.id;
  },

  async update(id: string, data: Partial<ExpenseSKU>): Promise<void> {
    const { id: _id, createdAt: _ca, ...rest } = data as Partial<ExpenseSKU> & { id?: string; createdAt?: unknown };
    void _id; void _ca;
    await updateDoc(doc(db, COL.SKUS, id), { ...removeUndefined(rest), updatedAt: serverTimestamp() });
  },

  async delete(id: string): Promise<void> {
    await updateDoc(doc(db, COL.SKUS, id), { isActive: false, updatedAt: serverTimestamp() });
  },

  subscribeAll(callback: (skus: ExpenseSKU[]) => void): Unsubscribe {
    const q = query(collection(db, COL.SKUS), where('isActive', '==', true), orderBy('code', 'asc'));
    return onSnapshot(q, (snap) => callback(snap.docs.map((d) => fromFirestoreDoc<ExpenseSKU>(d))));
  },

  async _generateCode(subCategory: string): Promise<string> {
    const prefixMap: Record<string, string> = {
      capex_equipment: 'EQ',
      capex_decor: 'DC',
      capex_furniture: 'FN',
      capex_technology: 'TK',
      capex_vehicle: 'VH',
      capex_renovation: 'RN',
      inventory_food: 'IF',
      inventory_drinks: 'ID',
      inventory_packaging: 'PK',
      inventory_cleaning: 'CL',
      inventory_consumable: 'CS',
      operating_staff: 'OS',
      operating_marketing: 'MK',
      operating_admin: 'AD',
      utility_electric: 'UE',
      utility_water: 'UW',
      utility_gas: 'UG',
      utility_internet: 'UI',
      other: 'OT',
    };
    const prefix = prefixMap[subCategory] ?? 'OT';
    const q = query(
      collection(db, COL.SKUS),
      where('code', '>=', `${prefix}-`),
      where('code', '<', `${prefix}.`),
      orderBy('code', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    let nextNum = 1;
    if (!snap.empty) {
      const lastCode = snap.docs[0].data().code as string;
      const parts = lastCode.split('-');
      nextNum = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
    }
    return `${prefix}-${String(nextNum).padStart(4, '0')}`;
  },
};

// ─── Vendor Service ───────────────────────────────────────────────────────────

export const expenseVendorService = {
  async getAll(): Promise<ExpenseVendor[]> {
    const q = query(collection(db, COL.VENDORS), where('isActive', '==', true), orderBy('name', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => fromFirestoreDoc<ExpenseVendor>(d));
  },

  async create(input: Omit<ExpenseVendor, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = doc(collection(db, COL.VENDORS));
    await setDoc(ref, { ...removeUndefined(input), isActive: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return ref.id;
  },

  async update(id: string, data: Partial<ExpenseVendor>): Promise<void> {
    await updateDoc(doc(db, COL.VENDORS, id), { ...removeUndefined(data), updatedAt: serverTimestamp() });
  },

  subscribeAll(callback: (vendors: ExpenseVendor[]) => void): Unsubscribe {
    const q = query(collection(db, COL.VENDORS), where('isActive', '==', true), orderBy('name', 'asc'));
    return onSnapshot(q, (snap) => callback(snap.docs.map((d) => fromFirestoreDoc<ExpenseVendor>(d))));
  },
};

// ─── Expense Document Service ─────────────────────────────────────────────────

export const expenseDocumentService = {
  async create(input: CreateExpenseDocumentInput): Promise<string> {
    const ref = doc(collection(db, COL.DOCUMENTS));
    const data = removeUndefined({
      ...input,
      documentDate: input.documentDate instanceof Date ? Timestamp.fromDate(input.documentDate) : input.documentDate,
      status: 'draft',
      isAiExtracted: false,
      requiresReview: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, data);
    return ref.id;
  },

  async update(id: string, data: Partial<ExpenseDocument>): Promise<void> {
    const { id: _id, createdAt: _ca, ...rest } = data as Partial<ExpenseDocument> & { id?: string; createdAt?: unknown };
    void _id; void _ca;
    const payload: Record<string, unknown> = removeUndefined({ ...rest, updatedAt: serverTimestamp() }) as Record<string, unknown>;
    if (rest.documentDate instanceof Date) {
      payload.documentDate = Timestamp.fromDate(rest.documentDate);
    }
    await updateDoc(doc(db, COL.DOCUMENTS, id), payload);
  },

  async confirm(id: string, confirmedBy: string): Promise<void> {
    await updateDoc(doc(db, COL.DOCUMENTS, id), {
      status: 'confirmed',
      confirmedBy,
      confirmedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  async delete(id: string): Promise<void> {
    await updateDoc(doc(db, COL.DOCUMENTS, id), { status: 'cancelled', updatedAt: serverTimestamp() });
  },

  async getById(id: string): Promise<ExpenseDocument | null> {
    const snap = await getDoc(doc(db, COL.DOCUMENTS, id));
    if (!snap.exists()) return null;
    return fromFirestoreDoc<ExpenseDocument>(snap);
  },

  async getFiltered(filter: ExpenseFilter): Promise<ExpenseDocument[]> {
    let q = query(collection(db, COL.DOCUMENTS), orderBy('documentDate', 'desc'));
    if (filter.status) {
      q = query(q, where('status', '==', filter.status));
    }
    if (filter.mainCategory) {
      q = query(q, where('mainCategory', '==', filter.mainCategory));
    }
    const snap = await getDocs(q);
    let docs = snap.docs.map((d) => fromFirestoreDoc<ExpenseDocument>(d));
    if (filter.startDate) {
      docs = docs.filter((d) => d.documentDate >= filter.startDate!);
    }
    if (filter.endDate) {
      docs = docs.filter((d) => d.documentDate <= filter.endDate!);
    }
    if (filter.vendorId) {
      docs = docs.filter((d) => d.vendorId === filter.vendorId);
    }
    return docs;
  },

  subscribeRecent(callback: (docs: ExpenseDocument[]) => void, limitCount = 50): Unsubscribe {
    const q = query(
      collection(db, COL.DOCUMENTS),
      where('status', '!=', 'cancelled'),
      orderBy('status', 'asc'),
      orderBy('documentDate', 'desc'),
      limit(limitCount)
    );
    return onSnapshot(q, (snap) => callback(snap.docs.map((d) => fromFirestoreDoc<ExpenseDocument>(d))));
  },

  subscribeAll(callback: (docs: ExpenseDocument[]) => void): Unsubscribe {
    const q = query(collection(db, COL.DOCUMENTS), orderBy('documentDate', 'desc'), limit(200));
    return onSnapshot(q, (snap) => callback(snap.docs.map((d) => fromFirestoreDoc<ExpenseDocument>(d))));
  },
};

// ─── Expense Line Service ─────────────────────────────────────────────────────

export const expenseLineService = {
  async bulkCreate(lines: CreateExpenseLineInput[]): Promise<void> {
    const batch = writeBatch(db);
    for (const line of lines) {
      const ref = doc(collection(db, COL.LINES));
      batch.set(ref, removeUndefined({
        ...line,
        documentDate: line.documentDate instanceof Date ? Timestamp.fromDate(line.documentDate) : line.documentDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
    }
    await batch.commit();
  },

  async create(line: CreateExpenseLineInput): Promise<string> {
    const ref = doc(collection(db, COL.LINES));
    await setDoc(ref, removeUndefined({
      ...line,
      documentDate: line.documentDate instanceof Date ? Timestamp.fromDate(line.documentDate) : line.documentDate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    return ref.id;
  },

  async update(id: string, data: Partial<ExpenseLine>): Promise<void> {
    await updateDoc(doc(db, COL.LINES, id), { ...removeUndefined(data), updatedAt: serverTimestamp() });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, COL.LINES, id));
  },

  async getByDocumentId(documentId: string): Promise<ExpenseLine[]> {
    const q = query(collection(db, COL.LINES), where('documentId', '==', documentId), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => fromFirestoreDoc<ExpenseLine>(d));
  },

  async getFiltered(filter: ExpenseFilter): Promise<ExpenseLine[]> {
    let q = query(collection(db, COL.LINES), orderBy('documentDate', 'desc'));
    if (filter.mainCategory) {
      q = query(q, where('mainCategory', '==', filter.mainCategory));
    }
    if (filter.skuId) {
      q = query(q, where('skuId', '==', filter.skuId));
    }
    const snap = await getDocs(q);
    let lines = snap.docs.map((d) => fromFirestoreDoc<ExpenseLine>(d));
    if (filter.startDate) lines = lines.filter((l) => l.documentDate >= filter.startDate!);
    if (filter.endDate) lines = lines.filter((l) => l.documentDate <= filter.endDate!);
    return lines;
  },

  async getHistoryBySku(skuId: string): Promise<(ExpenseLine & { document?: ExpenseDocument })[]> {
    // We omit orderBy('documentDate', 'desc') from the query to avoid requiring a custom Firestore composite index.
    const q = query(collection(db, COL.LINES), where('skuId', '==', skuId));
    const snap = await getDocs(q);
    const lines = snap.docs.map((d) => fromFirestoreDoc<ExpenseLine>(d));
    
    // Perform the sorting manually in JavaScript
    lines.sort((a, b) => b.documentDate.getTime() - a.documentDate.getTime());
    
    // Fetch unique documents representing these lines
    const docIds = Array.from(new Set(lines.map(l => l.documentId)));
    const docMap = new Map<string, ExpenseDocument>();
    
    // Chunk requests in groups of 10 for 'in' query limitations
    for (let i = 0; i < docIds.length; i += 10) {
      const chunk = docIds.slice(i, i + 10);
      const docQ = query(collection(db, COL.DOCUMENTS), where('id', 'in', chunk));
      const docSnap = await getDocs(docQ);
      docSnap.docs.forEach(d => docMap.set(d.id, fromFirestoreDoc<ExpenseDocument>(d)));
    }

    // Since 'id' is technically doc.id, if we saved it in the document body as 'id', the above works.
    // If not, we should just fetch doc by id using getDoc in a Promise.all to be absolutely safe:
    /* We will fallback to Promise.all of `getDoc` to be perfectly safe, as it handles caching well anyway */
    const docPromises = docIds.map(id => getDoc(doc(db, COL.DOCUMENTS, id)));
    const docSnaps = await Promise.all(docPromises);
    docSnaps.forEach(dSnap => {
      if (dSnap.exists()) {
        docMap.set(dSnap.id, fromFirestoreDoc<ExpenseDocument>(dSnap));
      }
    });

    return lines.map(line => ({
      ...line,
      document: docMap.get(line.documentId)
    }));
  },

  subscribeByDocument(documentId: string, callback: (lines: ExpenseLine[]) => void): Unsubscribe {
    const q = query(collection(db, COL.LINES), where('documentId', '==', documentId), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snap) => callback(snap.docs.map((d) => fromFirestoreDoc<ExpenseLine>(d))));
  },
};

// ─── Stats Service ────────────────────────────────────────────────────────────

export const expenseStatsService = {
  async compute(filter: ExpenseFilter): Promise<ExpenseStats> {
    const [documents, lines] = await Promise.all([
      expenseDocumentService.getFiltered(filter),
      expenseLineService.getFiltered(filter),
    ]);

    const confirmed = documents.filter((d) => d.status === 'confirmed');
    const totalAmount = confirmed.reduce((s, d) => s + d.total, 0);

    const categoryTotals: Record<string, number> = {};
    const vendorTotals: Record<string, number> = {};

    for (const line of lines) {
      const cat = line.subCategory ?? 'other';
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + line.finalAmount;
      vendorTotals[line.vendorName] = (vendorTotals[line.vendorName] ?? 0) + line.finalAmount;
    }

    return {
      totalDocuments: confirmed.length,
      totalAmount,
      capexTotal: lines.filter((l) => l.mainCategory === 'capex').reduce((s, l) => s + l.finalAmount, 0),
      inventoryTotal: lines.filter((l) => l.mainCategory === 'inventory').reduce((s, l) => s + l.finalAmount, 0),
      operatingTotal: lines.filter((l) => l.mainCategory === 'operating').reduce((s, l) => s + l.finalAmount, 0),
      utilityTotal: lines.filter((l) => l.mainCategory === 'utility').reduce((s, l) => s + l.finalAmount, 0),
      aiProcessed: documents.filter((d) => d.isAiExtracted).length,
      pendingReview: documents.filter((d) => d.requiresReview && d.status === 'ai_review').length,
      topCategories: Object.entries(categoryTotals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([category, amount]) => ({ category, amount })),
      topVendors: Object.entries(vendorTotals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([vendorName, amount]) => ({ vendorName, amount })),
    };
  },

  async updateSKUCostAfterConfirm(lines: ExpenseLine[]): Promise<void> {
    const skuGroups: Record<string, ExpenseLine[]> = {};
    for (const line of lines) {
      if (!line.skuId) continue;
      skuGroups[line.skuId] = [...(skuGroups[line.skuId] ?? []), line];
    }
    const batch = writeBatch(db);
    for (const [skuId, skuLines] of Object.entries(skuGroups)) {
      const skuRef = doc(db, COL.SKUS, skuId);
      const snap = await getDoc(skuRef);
      if (!snap.exists()) continue;
      const skuData = snap.data();
      const totalQty = skuLines.reduce((s, l) => s + l.baseQty, 0);
      const totalCost = skuLines.reduce((s, l) => s + l.finalAmount, 0);
      const lastLine = skuLines[skuLines.length - 1];
      const unitCostInBase = lastLine.baseQty > 0 ? lastLine.finalAmount / lastLine.baseQty : 0;
      const prevQty = (skuData.totalPurchasedQty as number) ?? 0;
      const prevAvg = (skuData.averageUnitCost as number) ?? 0;
      const newTotalQty = prevQty + totalQty;
      const newAvgCost = newTotalQty > 0 ? (prevAvg * prevQty + totalCost) / newTotalQty : 0;
      batch.update(skuRef, {
        averageUnitCost: newAvgCost,
        lastPurchasePrice: unitCostInBase,
        lastPurchaseDate: serverTimestamp(),
        totalPurchasedQty: newTotalQty,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  },

  async reverseSKUCostAfterCancel(lines: ExpenseLine[]): Promise<void> {
    const skuGroups: Record<string, ExpenseLine[]> = {};
    for (const line of lines) {
      if (!line.skuId) continue;
      skuGroups[line.skuId] = [...(skuGroups[line.skuId] ?? []), line];
    }
    const batch = writeBatch(db);
    for (const [skuId, skuLines] of Object.entries(skuGroups)) {
      const skuRef = doc(db, COL.SKUS, skuId);
      const snap = await getDoc(skuRef);
      if (!snap.exists()) continue;
      const skuData = snap.data();
      const totalQty = skuLines.reduce((s, l) => s + l.baseQty, 0);
      const totalCost = skuLines.reduce((s, l) => s + l.finalAmount, 0);
      const prevQty = (skuData.totalPurchasedQty as number) ?? 0;
      const prevAvg = (skuData.averageUnitCost as number) ?? 0;
      const newTotalQty = Math.max(0, prevQty - totalQty);
      // Reverse the average cost: remove this purchase from the calculation
      const newAvgCost = newTotalQty > 0 ? (prevAvg * prevQty - totalCost) / newTotalQty : prevAvg;
      batch.update(skuRef, {
        averageUnitCost: newAvgCost,
        totalPurchasedQty: newTotalQty,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  },
};
