/**
 * Expense Excel Export Service
 * Generates CFO-ready Excel workbook with multiple sheets:
 *  - Sheet 1: Summary (totals by category & vendor)
 *  - Sheet 2: Expense Line Items (full detail - primary CFO view)
 *  - Sheet 3: CAPEX Register
 *  - Sheet 4: Inventory Cost Analysis
 */

import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import type { ExpenseLine, ExpenseDocument, ExpenseSKU, ExpenseExportFilter } from '@/types/expense';
import { expenseLineService, expenseDocumentService, expenseSKUService } from './expense.service';

const THB = (n: number | null | undefined) => Number((n || 0).toFixed(2));

const CATEGORY_LABELS: Record<string, string> = {
  capex_equipment: 'Equipment',
  capex_decor: 'Decor',
  capex_furniture: 'Furniture',
  capex_technology: 'Technology',
  capex_vehicle: 'Vehicle',
  capex_renovation: 'Renovation',
  inventory_food: 'Food Ingredient',
  inventory_drinks: 'Drinks',
  inventory_packaging: 'Packaging',
  inventory_cleaning: 'Cleaning',
  inventory_consumable: 'Consumable',
  operating_staff: 'Staff Cost',
  operating_marketing: 'Marketing',
  operating_admin: 'Admin',
  utility_electric: 'Electricity',
  utility_water: 'Water',
  utility_gas: 'Gas',
  utility_internet: 'Internet',
  other: 'Other',
};

const MAIN_CATEGORY_LABELS: Record<string, string> = {
  capex: 'CAPEX',
  inventory: 'Inventory',
  operating: 'Operating',
  utility: 'Utility',
  other: 'Other',
};

function styleHeader(ws: ExcelJS.Worksheet, row: ExcelJS.Row, bgColor = '1F2937') {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${bgColor}` } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
  });
  row.height = 28;
  void ws;
}

function styleDataRow(row: ExcelJS.Row, isEven: boolean) {
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isEven ? 'FFF9FAFB' : 'FFFFFFFF' },
    };
    cell.border = {
      top: { style: 'hair', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
      left: { style: 'hair', color: { argb: 'FFE5E7EB' } },
      right: { style: 'hair', color: { argb: 'FFE5E7EB' } },
    };
    cell.font = { size: 9 };
  });
  row.height = 18;
}

function currencyFormat(ws: ExcelJS.Worksheet, col: string) {
  ws.getColumn(col).numFmt = '#,##0.00';
}

// ─── Sheet 1: Summary ─────────────────────────────────────────────────────────

function buildSummarySheet(
  wb: ExcelJS.Workbook,
  lines: ExpenseLine[],
  filter: ExpenseExportFilter
) {
  const ws = wb.addWorksheet('Summary');
  ws.properties.tabColor = { argb: 'FF1F2937' };

  ws.mergeCells('A1:D1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `Expense Summary Report — ${format(filter.startDate, 'dd MMM yyyy')} to ${format(filter.endDate, 'dd MMM yyyy')}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF1F2937' } };
  titleCell.alignment = { horizontal: 'center' };
  ws.getRow(1).height = 32;

  ws.addRow([]);

  const categoryTotals: Record<string, { count: number; amount: number }> = {};
  const vendorTotals: Record<string, { count: number; amount: number }> = {};
  const monthlyTotals: Record<string, number> = {};
  let grandTotal = 0;

  for (const line of lines) {
    const cat = line.subCategory ?? 'other';
    if (!categoryTotals[cat]) categoryTotals[cat] = { count: 0, amount: 0 };
    categoryTotals[cat].count++;
    categoryTotals[cat].amount += line.finalAmount;

    const vendor = line.vendorName ?? 'Unknown';
    if (!vendorTotals[vendor]) vendorTotals[vendor] = { count: 0, amount: 0 };
    vendorTotals[vendor].count++;
    vendorTotals[vendor].amount += line.finalAmount;

    const month = format(line.documentDate, 'yyyy-MM');
    monthlyTotals[month] = (monthlyTotals[month] ?? 0) + line.finalAmount;
    grandTotal += line.finalAmount;
  }

  ws.addRow(['BY CATEGORY', '', '', '']);
  styleHeader(ws, ws.lastRow!, '374151');
  ws.mergeCells(`A${ws.rowCount}:D${ws.rowCount}`);

  const catHeader = ws.addRow(['Category', 'Sub-Category', 'Line Items', 'Total (฿)']);
  styleHeader(ws, catHeader);

  let i = 0;
  for (const [cat, { count, amount }] of Object.entries(categoryTotals).sort(([, a], [, b]) => b.amount - a.amount)) {
    const mainCat = cat.split('_')[0];
    const row = ws.addRow([MAIN_CATEGORY_LABELS[mainCat] ?? mainCat, CATEGORY_LABELS[cat] ?? cat, count, THB(amount)]);
    styleDataRow(row, i % 2 === 0);
    row.getCell(4).numFmt = '#,##0.00';
    i++;
  }
  const totalRow = ws.addRow(['', 'GRAND TOTAL', lines.length, THB(grandTotal)]);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
  });
  totalRow.getCell(4).numFmt = '#,##0.00';

  ws.addRow([]);

  ws.addRow(['BY VENDOR', '', '', '']);
  styleHeader(ws, ws.lastRow!, '374151');
  ws.mergeCells(`A${ws.rowCount}:D${ws.rowCount}`);

  const vendorHeader = ws.addRow(['Vendor', '', 'Line Items', 'Total (฿)']);
  styleHeader(ws, vendorHeader);
  i = 0;
  for (const [vendor, { count, amount }] of Object.entries(vendorTotals).sort(([, a], [, b]) => b.amount - a.amount)) {
    const row = ws.addRow([vendor, '', count, THB(amount)]);
    styleDataRow(row, i % 2 === 0);
    row.getCell(4).numFmt = '#,##0.00';
    i++;
  }

  ws.addRow([]);

  ws.addRow(['MONTHLY TREND', '', '', '']);
  styleHeader(ws, ws.lastRow!, '374151');
  ws.mergeCells(`A${ws.rowCount}:D${ws.rowCount}`);

  const monthHeader = ws.addRow(['Month', '', '', 'Total (฿)']);
  styleHeader(ws, monthHeader);
  i = 0;
  for (const [month, amount] of Object.entries(monthlyTotals).sort()) {
    const row = ws.addRow([month, '', '', THB(amount)]);
    styleDataRow(row, i % 2 === 0);
    row.getCell(4).numFmt = '#,##0.00';
    i++;
  }

  ws.getColumn('A').width = 18;
  ws.getColumn('B').width = 22;
  ws.getColumn('C').width = 12;
  ws.getColumn('D').width = 18;
}

// ─── Sheet 2: Full Line Items (Primary CFO View) ──────────────────────────────

function buildLineItemsSheet(wb: ExcelJS.Workbook, lines: ExpenseLine[], docs: ExpenseDocument[]) {
  const ws = wb.addWorksheet('Expense Lines');
  ws.properties.tabColor = { argb: 'FF065F46' };

  const docMap = new Map(docs.map((d) => [d.id, d]));

  const headers = [
    'Date',
    'Vendor',
    'Place',
    'Source',
    'Main Category',
    'Sub Category',
    'SKU Code',
    'Item Name',
    'Purchase Qty',
    'Purchase Unit',
    'Base Qty',
    'Base Unit',
    'Unit Price (฿)',
    'Subtotal (฿)',
    'Discount (฿)',
    'Final Amount (฿)',
    'Receipt No.',
    'AI Extracted',
    'AI Confidence',
    'Notes',
  ];

  const headerRow = ws.addRow(headers);
  styleHeader(ws, headerRow, '065F46');

  const COL_WIDTHS = [12, 20, 16, 12, 14, 18, 12, 30, 12, 14, 12, 10, 14, 14, 12, 16, 14, 12, 14, 20];
  headers.forEach((_, idx) => {
    ws.getColumn(idx + 1).width = COL_WIDTHS[idx] ?? 14;
  });

  ['M', 'N', 'O', 'P'].forEach((col) => currencyFormat(ws, col));
  ws.getColumn('I').numFmt = '#,##0.###';
  ws.getColumn('K').numFmt = '#,##0.###';

  let i = 0;
  for (const line of lines) {
    const parentDoc = docMap.get(line.documentId);
    const row = ws.addRow([
      format(line.documentDate, 'dd/MM/yyyy'),
      line.vendorName,
      line.place ?? '',
      parentDoc?.source ?? '',
      MAIN_CATEGORY_LABELS[line.mainCategory] ?? line.mainCategory,
      CATEGORY_LABELS[line.subCategory] ?? line.subCategory,
      line.skuCode ?? '',
      line.skuName,
      line.purchaseQty,
      line.purchaseUnit,
      line.baseQty,
      line.baseUnit,
      THB(line.unitPrice),
      THB(line.subtotal),
      THB(line.discount),
      THB(line.finalAmount),
      parentDoc?.receiptNumber ?? '',
      line.isAiExtracted ? 'Yes' : 'No',
      line.aiConfidence != null ? `${Math.round((line.aiConfidence ?? 0) * 100)}%` : '',
      line.notes ?? '',
    ]);
    styleDataRow(row, i % 2 === 0);
    i++;
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
}

// ─── Sheet 3: CAPEX Register ──────────────────────────────────────────────────

function buildCAPEXSheet(wb: ExcelJS.Workbook, lines: ExpenseLine[]) {
  const ws = wb.addWorksheet('CAPEX Register');
  ws.properties.tabColor = { argb: 'FF7C3AED' };

  const capexLines = lines.filter((l) => l.mainCategory === 'capex');

  const headers = ['Date', 'Sub Category', 'SKU Code', 'Item Name', 'Vendor', 'Qty', 'Unit', 'Unit Price (฿)', 'Total Cost (฿)', 'Notes'];
  const headerRow = ws.addRow(headers);
  styleHeader(ws, headerRow, '7C3AED');

  [8, 9].forEach((col) => {
    ws.getColumn(col).numFmt = '#,##0.00';
  });

  const colWidths = [12, 18, 12, 30, 20, 8, 8, 16, 16, 24];
  headers.forEach((_, i) => { ws.getColumn(i + 1).width = colWidths[i] ?? 14; });

  let i = 0;
  let capexTotal = 0;
  for (const line of capexLines) {
    ws.addRow([
      format(line.documentDate, 'dd/MM/yyyy'),
      CATEGORY_LABELS[line.subCategory] ?? line.subCategory,
      line.skuCode ?? '',
      line.skuName,
      line.vendorName,
      line.purchaseQty,
      line.purchaseUnit,
      THB(line.unitPrice),
      THB(line.finalAmount),
      line.notes ?? '',
    ]);
    styleDataRow(ws.lastRow!, i % 2 === 0);
    capexTotal += line.finalAmount;
    i++;
  }

  ws.addRow([]);
  const totalRow = ws.addRow(['', '', '', '', 'CAPEX TOTAL', '', '', '', THB(capexTotal), '']);
  totalRow.eachCell((cell) => { cell.font = { bold: true }; cell.numFmt = '#,##0.00'; });
}

// ─── Sheet 4: Inventory Cost Analysis ────────────────────────────────────────

function buildInventorySheet(wb: ExcelJS.Workbook, lines: ExpenseLine[], skus: ExpenseSKU[]) {
  const ws = wb.addWorksheet('Inventory Cost Analysis');
  ws.properties.tabColor = { argb: 'FFD97706' };

  const skuMap = new Map(skus.map((s) => [s.id, s]));
  const inventoryLines = lines.filter((l) => l.mainCategory === 'inventory');

  const skuAgg: Record<string, {
    sku: ExpenseSKU | null;
    skuCode: string;
    skuName: string;
    totalBaseQty: number;
    totalCost: number;
    purchaseCount: number;
    latestUnitCost: number;
    latestDate: Date;
  }> = {};

  for (const line of inventoryLines) {
    const key = line.skuId ?? `no_sku_${line.skuName}`;
    if (!skuAgg[key]) {
      skuAgg[key] = {
        sku: line.skuId ? (skuMap.get(line.skuId) ?? null) : null,
        skuCode: line.skuCode ?? '',
        skuName: line.skuName,
        totalBaseQty: 0,
        totalCost: 0,
        purchaseCount: 0,
        latestUnitCost: 0,
        latestDate: line.documentDate,
      };
    }
    skuAgg[key].totalBaseQty += line.baseQty;
    skuAgg[key].totalCost += line.finalAmount;
    skuAgg[key].purchaseCount++;
    if (line.documentDate >= skuAgg[key].latestDate) {
      skuAgg[key].latestDate = line.documentDate;
      skuAgg[key].latestUnitCost = line.baseQty > 0 ? line.finalAmount / line.baseQty : 0;
    }
  }

  const headers = [
    'SKU Code', 'Item Name', 'Sub Category', 'Base Unit',
    'Total Purchased Qty', 'Average Unit Cost (฿/base unit)',
    'Latest Unit Cost (฿/base unit)', 'Total Cost (฿)',
    'Purchase Count', 'Last Purchase Date',
  ];
  const headerRow = ws.addRow(headers);
  styleHeader(ws, headerRow, 'D97706');

  const colWidths = [12, 30, 18, 10, 18, 26, 26, 16, 14, 18];
  headers.forEach((_, i) => { ws.getColumn(i + 1).width = colWidths[i] ?? 14; });
  [6, 7, 8].forEach((col) => { ws.getColumn(col).numFmt = '#,##0.0000'; });
  ws.getColumn(5).numFmt = '#,##0.###';

  let i = 0;
  for (const agg of Object.values(skuAgg).sort((a, b) => b.totalCost - a.totalCost)) {
    const avgCost = agg.totalBaseQty > 0 ? agg.totalCost / agg.totalBaseQty : 0;
    const row = ws.addRow([
      agg.skuCode,
      agg.skuName,
      CATEGORY_LABELS[agg.sku?.subCategory ?? ''] ?? '',
      agg.sku?.baseUnit ?? '',
      THB(agg.totalBaseQty),
      THB(avgCost),
      THB(agg.latestUnitCost),
      THB(agg.totalCost),
      agg.purchaseCount,
      format(agg.latestDate, 'dd/MM/yyyy'),
    ]);
    styleDataRow(row, i % 2 === 0);
    i++;
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
}

// ─── Main Export Function ─────────────────────────────────────────────────────

export const expenseExportService = {
  async generateExcel(filter: ExpenseExportFilter): Promise<Buffer> {
    const isSingleDoc = !!filter.documentId;

    // 1. Fetch the documents and lines
    // If single doc, we ignore the date range and category filters
    const [rawLines, rawDocs, skus] = await Promise.all([
      expenseLineService.getFiltered({
        startDate: filter.startDate,
        endDate: filter.endDate,
        documentId: filter.documentId,
      }),
      expenseDocumentService.getFiltered({
        startDate: filter.startDate,
        endDate: filter.endDate,
        status: filter.status,
        documentId: filter.documentId,
      }),
      expenseSKUService.getAll(),
    ]);

    // 2. Data Preparation
    const docs = rawDocs.filter(d => d.status !== 'cancelled');
    const docMap = new Map(docs.map(d => [d.id, d]));
    const validDocIds = new Set(docs.map(d => d.id));
    const allLines = rawLines.filter(l => validDocIds.has(l.documentId));

    // For "Summary" and "Expense Lines" sheets, we respect the user's category/vendor filters
    let displayLines = [...allLines];
    if (!isSingleDoc) {
      if (filter.mainCategory) displayLines = displayLines.filter(l => l.mainCategory === filter.mainCategory);
      if (filter.subCategory) displayLines = displayLines.filter(l => l.subCategory === filter.subCategory);
      if (filter.vendorId) displayLines = displayLines.filter(l => docMap.get(l.documentId)?.vendorId === filter.vendorId);
      if (filter.skuId) displayLines = displayLines.filter(l => l.skuId === filter.skuId);
    }

    // 3. Workbook Generation
    const wb = new ExcelJS.Workbook();
    wb.creator = "Don't Miss POS";
    wb.created = new Date();

    // Standard detailed sheets (respect filters)
    buildSummarySheet(wb, displayLines, filter);
    buildLineItemsSheet(wb, displayLines, docs);

    // Global analysis sheets (always use ALL lines in the date range to keep registers complete)
    // UNLESS it's a single document export, then we keep it focused
    const analysisLines = isSingleDoc ? displayLines : allLines;
    buildCAPEXSheet(wb, analysisLines);
    buildInventorySheet(wb, analysisLines, skus);

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },

  getFileName(filter: ExpenseExportFilter): string {
    const from = format(filter.startDate, 'yyyyMMdd');
    const to = format(filter.endDate, 'yyyyMMdd');
    return `expense_report_${from}_${to}.xlsx`;
  },
};
