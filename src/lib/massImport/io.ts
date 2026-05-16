import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { firstNonEmpty, normalizeHeader } from './headers';

export interface BaseInputRow {
  sku_complete: string;
  sap_description: string;
}

export interface BaseInputReadResult {
  rows: BaseInputRow[];
  format: 'csv' | 'xlsx';
  found_headers: string[];
  detected_columns: {
    sku_candidates: string[];
    sap_description_candidates: string[];
  };
}

function normalizeSku(raw: string): string {
  return raw.trim().toUpperCase();
}

export async function readBaseInputFile(file: File): Promise<BaseInputReadResult> {
  const name = (file.name || '').toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith('.csv')) {
    const parsed = Papa.parse(buf.toString('utf8'), { header: true, skipEmptyLines: true });
    const rows = (parsed.data || []) as any[];
    const found_headers = (parsed.meta?.fields || []).map((f: any) => String(f || '')).filter(Boolean);
    const out: BaseInputRow[] = [];
    for (const r of rows) {
      const sku = firstNonEmpty(r.SKU_COMPLETE, r.SKU, r['SKU Codigo SAP'], r['SKU_CODIGO_SAP'], r.CODE, r.code);
      const desc = firstNonEmpty(r.SAP_DESCRIPTION, r.SAP_DESC, r['DescripciO del articulo'], r['DESCRIPCION_DEL_ARTICULO'], r.DESCRIPCION);
      if (!sku) continue;
      out.push({ sku_complete: normalizeSku(sku), sap_description: String(desc || '').trim() });
    }
    return {
      rows: out,
      format: 'csv',
      found_headers,
      detected_columns: {
        sku_candidates: ['SKU_COMPLETE', 'SKU', 'SKU Codigo SAP', 'CODE'],
        sap_description_candidates: ['SAP_DESCRIPTION', 'SAP_DESC', 'DescripciO del articulo', 'DESCRIPCION'],
      },
    };
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xlsm') || name.endsWith('.xls')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    if (!ws) {
      return {
        rows: [],
        format: 'xlsx',
        found_headers: [],
        detected_columns: {
          sku_candidates: ['SKU_COMPLETE', 'SKU', 'SKU Codigo SAP', 'CODE'],
          sap_description_candidates: ['SAP_DESCRIPTION', 'SAP_DESC', 'DescripciO del articulo', 'DESCRIPCION'],
        },
      };
    }

    const headerRow = ws.getRow(1);
    const headerMap = new Map<number, string>();
    const found_headers: string[] = [];
    headerRow.eachCell((cell, col) => {
      const h = normalizeHeader(cell.value as any);
      headerMap.set(col, h);
      if (h) found_headers.push(h);
    });

    const out: BaseInputRow[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: Record<string, any> = {};
      row.eachCell((cell, col) => {
        const h = headerMap.get(col);
        if (!h) return;
        record[h] = cell.value;
      });
      const sku = firstNonEmpty(record.SKU_COMPLETE, record.SKU, record.SKU_CODIGO_SAP, record.CODE);
      const desc = firstNonEmpty(record.SAP_DESCRIPTION, record.SAP_DESC, record.DESCRIPCION_DEL_ARTICULO, record.DESCRIPCION);
      if (!sku) return;
      out.push({ sku_complete: normalizeSku(String(sku)), sap_description: String(desc || '').trim() });
    });
    return {
      rows: out,
      format: 'xlsx',
      found_headers,
      detected_columns: {
        sku_candidates: ['SKU_COMPLETE', 'SKU', 'SKU_CODIGO_SAP', 'CODE'],
        sap_description_candidates: ['SAP_DESCRIPTION', 'SAP_DESC', 'DESCRIPCION_DEL_ARTICULO', 'DESCRIPCION'],
      },
    };
  }

  throw new Error('Formato no soportado. Sube CSV o XLSX.');
}

export async function readTemplateXlsx(file: File): Promise<{
  carga: Record<string, any>[];
  familias: Record<string, any>[];
  colores: Record<string, any>[];
  versiones: Record<string, any>[];
}> {
  const buf = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);

  const byName = (n: string) => wb.worksheets.find(w => (w.name || '').trim().toLowerCase() === n.toLowerCase());

  const wsCarga = byName('Carga') || wb.worksheets[0];
  const wsFamilies = byName('Familias_nuevas');
  const wsColors = byName('Colores_nuevos');
  const wsVersions = byName('Versiones_nuevas');

  const readSheet = (ws?: ExcelJS.Worksheet): Record<string, any>[] => {
    if (!ws) return [];
    const headerRow = ws.getRow(1);
    const headerMap = new Map<number, string>();
    headerRow.eachCell((cell, col) => headerMap.set(col, normalizeHeader(cell.value as any)));

    const rows: Record<string, any>[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rec: Record<string, any> = {};
      let hasAny = false;
      row.eachCell((cell, col) => {
        const h = headerMap.get(col);
        if (!h) return;
        const v = cell.value;
        const raw =
          v && typeof v === 'object' && 'text' in (v as any) ? (v as any).text :
          v && typeof v === 'object' && 'result' in (v as any) ? (v as any).result :
          v;
        if (raw !== null && raw !== undefined && String(raw).trim() !== '') hasAny = true;
        rec[h] = raw;
      });
      if (hasAny) rows.push(rec);
    });
    return rows;
  };

  return {
    carga: readSheet(wsCarga),
    familias: readSheet(wsFamilies),
    colores: readSheet(wsColors),
    versiones: readSheet(wsVersions),
  };
}
