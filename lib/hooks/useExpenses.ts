'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  expenseDocumentService,
  expenseLineService,
  expenseSKUService,
  expenseVendorService,
  expenseStatsService,
} from '@/lib/services/expense.service';
import type {
  ExpenseDocument,
  ExpenseLine,
  ExpenseSKU,
  ExpenseVendor,
  ExpenseFilter,
  ExpenseStats,
} from '@/types/expense';

export function useExpenseDocuments(filter?: ExpenseFilter) {
  const [documents, setDocuments] = useState<ExpenseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = expenseDocumentService.subscribeAll((docs) => {
      let filtered = docs;
      if (filter?.startDate) filtered = filtered.filter((d) => d.documentDate >= filter.startDate!);
      if (filter?.endDate) filtered = filtered.filter((d) => d.documentDate <= filter.endDate!);
      if (filter?.status) filtered = filtered.filter((d) => d.status === filter.status);
      if (filter?.searchText) {
        const q = filter.searchText.toLowerCase();
        filtered = filtered.filter(
          (d) =>
            d.vendorName.toLowerCase().includes(q) ||
            (d.receiptNumber ?? '').toLowerCase().includes(q) ||
            (d.place ?? '').toLowerCase().includes(q)
        );
      }
      setDocuments(filtered);
      setLoading(false);
      setError(null);
    });
    return () => unsub();
  }, [
    filter?.startDate?.toISOString(),
    filter?.endDate?.toISOString(),
    filter?.status,
    filter?.searchText,
  ]);

  const confirmDocument = useCallback(async (id: string) => {
    await expenseDocumentService.confirm(id, 'admin');
  }, []);

  const deleteDocument = useCallback(async (id: string) => {
    await expenseDocumentService.delete(id);
  }, []);

  return { documents, loading, error, confirmDocument, deleteDocument };
}

export function useExpenseLines(documentId: string) {
  const [lines, setLines] = useState<ExpenseLine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!documentId) return;
    const unsub = expenseLineService.subscribeByDocument(documentId, (l) => {
      setLines(l);
      setLoading(false);
    });
    return () => unsub();
  }, [documentId]);

  return { lines, loading };
}

export function useExpenseSKUs() {
  const [skus, setSkus] = useState<ExpenseSKU[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = expenseSKUService.subscribeAll((s) => {
      setSkus(s);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const createSKU = useCallback(
    async (input: Parameters<typeof expenseSKUService.create>[0]) => {
      return expenseSKUService.create(input);
    },
    []
  );

  const updateSKU = useCallback(async (id: string, data: Partial<ExpenseSKU>) => {
    await expenseSKUService.update(id, data);
  }, []);

  const deleteSKU = useCallback(async (id: string) => {
    await expenseSKUService.delete(id);
  }, []);

  return { skus, loading, createSKU, updateSKU, deleteSKU };
}

export function useExpenseVendors() {
  const [vendors, setVendors] = useState<ExpenseVendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = expenseVendorService.subscribeAll((v) => {
      setVendors(v);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { vendors, loading };
}

export function useExpenseStats(filter: ExpenseFilter) {
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await expenseStatsService.compute(filter);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }, [
    filter?.startDate?.toISOString(),
    filter?.endDate?.toISOString(),
    filter?.mainCategory,
    filter?.status,
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, refresh };
}
