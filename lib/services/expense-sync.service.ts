import { collection, getDocs, doc, writeBatch, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COL } from './expense.service';
import type { ExpenseDocument, ExpenseLine, ExpenseSKU } from '@/types/expense';

export const expenseSyncService = {
  /**
   * Performs a global sync operation.
   * 1. Fetches all CONFIRMED documents.
   * 2. Fetches all lines. Filters out lines belonging to unconfirmed/cancelled documents.
   * 3. Fetches all SKUs.
   * 4. Aligns historical line units with the master SKU units.
   * 5. Recalculates total base quantities and cost averages from scratch.
   * 6. Batches the updates to Firestore.
   */
  async syncGlobalSKUData(): Promise<{ fixedLinesCount: number; updatedSkusCount: number }> {
    // 1. Fetch confirmed Docs
    const docsSnap = await getDocs(query(collection(db, COL.DOCUMENTS), where('status', '==', 'confirmed')));
    const validDocIds = new Set(docsSnap.docs.map(skip => skip.id));

    // 2. Fetch all Lines
    const linesSnap = await getDocs(collection(db, COL.LINES));
    const allLines = linesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpenseLine));
    
    // Filter lines to only those from confirmed docs
    const validLines = allLines.filter(line => validDocIds.has(line.documentId) && line.skuId);

    // 3. Fetch all SKUs
    const skusSnap = await getDocs(collection(db, COL.SKUS));
    const skusDB = skusSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpenseSKU));
    const skuMap = new Map(skusDB.map(s => [s.id, s]));

    // Maps to track accumulated totals for SKUs
    const skuAccums: Record<string, { totalQty: number; totalCost: number; latestDate: Date; latestPrice: number }> = {};
    
    const linesToUpdate: { id: string; baseQty: number; purchaseUnit: string; baseUnit: string; conversionFactor: number; skuCode: string; skuName: string; }[] = [];
    const skusToUpdate: { id: string; averageUnitCost: number; lastPurchasePrice: number; totalPurchasedQty: number }[] = [];

    // 4. Iterate valid lines and check units vs master SKU
    for (const line of validLines) {
      const sku = skuMap.get(line.skuId!);
      if (!sku) continue;

      let lineBaseQty = line.baseQty;

      // Check alignment
      if (
        line.purchaseUnit !== sku.purchaseUnit || 
        line.baseUnit !== sku.baseUnit || 
        line.conversionFactor !== sku.conversionFactor ||
        line.skuCode !== sku.code ||
        line.skuName !== sku.name
      ) {
        // Recalculate baseQty using master SKU's definitions
        lineBaseQty = line.purchaseQty * sku.conversionFactor;
        
        linesToUpdate.push({
          id: line.id,
          purchaseUnit: sku.purchaseUnit,
          baseUnit: sku.baseUnit,
          conversionFactor: sku.conversionFactor,
          baseQty: lineBaseQty,
          skuCode: sku.code,
          skuName: sku.name
        });
      }

      // Track accumulators
      if (!skuAccums[sku.id]) {
        skuAccums[sku.id] = { totalQty: 0, totalCost: 0, latestDate: new Date(0), latestPrice: 0 };
      }
      skuAccums[sku.id].totalQty += lineBaseQty;
      skuAccums[sku.id].totalCost += line.finalAmount;
      
      const docDate = line.documentDate instanceof Date ? line.documentDate : new Date(line.documentDate as any);
      if (docDate >= skuAccums[sku.id].latestDate) {
        skuAccums[sku.id].latestDate = docDate;
        skuAccums[sku.id].latestPrice = lineBaseQty > 0 ? line.finalAmount / lineBaseQty : 0;
      }
    }

    // 5. Build SKU update definitions
    for (const sku of skusDB) {
      const acc = skuAccums[sku.id] ?? { totalQty: 0, totalCost: 0, latestPrice: 0 };
      const newTotalQty = acc.totalQty;
      const newAvgCost = newTotalQty > 0 ? acc.totalCost / newTotalQty : 0;
      
      // Compare with DB to avoid unnecessary writes
      const currentQty = sku.totalPurchasedQty ?? 0;
      const currentAvg = sku.averageUnitCost ?? 0;
      const currentPrice = sku.lastPurchasePrice ?? 0;

      // Allow small floating point variances
      if (
        Math.abs(currentQty - newTotalQty) > 0.001 || 
        Math.abs(currentAvg - newAvgCost) > 0.001 || 
        Math.abs(currentPrice - acc.latestPrice) > 0.001
      ) {
        skusToUpdate.push({
          id: sku.id,
          averageUnitCost: newAvgCost,
          lastPurchasePrice: acc.latestPrice,
          totalPurchasedQty: newTotalQty
        });
      }
    }

    // 6. Execute Batched Writes (Firebase limits to 500 ops per batch)
    const BATCH_LIMIT = 450;
    let currentBatch = writeBatch(db);
    let opCount = 0;

    const commitBatch = async () => {
      if (opCount > 0) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        opCount = 0;
      }
    };

    for (const update of linesToUpdate) {
      currentBatch.update(doc(db, COL.LINES, update.id), {
        purchaseUnit: update.purchaseUnit,
        baseUnit: update.baseUnit,
        conversionFactor: update.conversionFactor,
        baseQty: update.baseQty,
        skuCode: update.skuCode,
        skuName: update.skuName,
        updatedAt: serverTimestamp()
      });
      opCount++;
      if (opCount >= BATCH_LIMIT) await commitBatch();
    }

    for (const update of skusToUpdate) {
      currentBatch.update(doc(db, COL.SKUS, update.id), {
        averageUnitCost: update.averageUnitCost,
        lastPurchasePrice: update.lastPurchasePrice,
        totalPurchasedQty: update.totalPurchasedQty,
        updatedAt: serverTimestamp()
      });
      opCount++;
      if (opCount >= BATCH_LIMIT) await commitBatch();
    }

    if (opCount > 0) {
      await commitBatch();
    }

    return {
      fixedLinesCount: linesToUpdate.length,
      updatedSkusCount: skusToUpdate.length
    };
  }
};
