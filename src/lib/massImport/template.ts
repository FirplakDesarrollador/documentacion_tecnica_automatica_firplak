import ExcelJS from 'exceljs';
import { dbQuery, supabaseServer } from '../supabase';
import { parseSkuComplete } from './sku';

export interface TemplateRow {
  row_number: number;
  import_action: 'CREAR' | 'IGNORAR';
  existing_in_supabase: 'SI' | 'NO';
  validation_status: 'PENDIENTE';
  validation_errors: string;
  validation_warnings: string;
  sku_complete: string;
  sap_description: string;
  product_name: string;
  designation: string;
  line: string;
  commercial_measure: string;
  special_label: string;
  width_cm: string | number;
  depth_cm: string | number;
  height_cm: string | number;
  weight_kg: string | number;
  stacking_max: string | number;
  version_label: string;
  version_attrs_json: string;
  sku_attrs_json: string;
  ref_attrs: Record<string, any>;
}

function normalizeSchemaKeys(schema: any): string[] {
  if (!schema || typeof schema !== 'object') return [];
  return Object.keys(schema)
    .filter(k => schema[k]?.active !== false)
    // product_type is inherited from family; don't expose it as an editable REF_ATTR column
    .filter(k => String(k).toLowerCase() !== 'product_type')
    .sort();
}

function safeJson(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(String(val));
  } catch {
    return null;
  }
}

function normalizeText(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    // Split digit/letter boundaries so "2MM" -> "2 MM" and "180CM" -> "180 CM"
    .replace(/(\d)([A-Z])/g, '$1 $2')
    .replace(/([A-Z])(\d)/g, '$1 $2')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Common SAP abbreviations we want to treat as canonical tokens for matching (designation, etc).
    // Keep this small and explicit to avoid unintended replacements.
    .replace(/\bSUP\b/g, 'SUPERIOR')
    .replace(/\bINF\b/g, 'INFERIOR');
}

function tokenize(raw: string): string[] {
  const t = normalizeText(raw);
  if (!t) return [];
  return t.split(' ').filter(w => w.length >= 2);
}

function bestProductNameMatch(sapDescription: string, candidates: string[]): { match: string | null; score: number } {
  const descTokens = tokenize(sapDescription);
  if (descTokens.length === 0 || candidates.length === 0) return { match: null, score: 0 };

  let best: { match: string | null; score: number } = { match: null, score: 0 };
  for (const cand of candidates) {
    const candTokens = tokenize(cand);
    if (candTokens.length === 0) continue;
    let matches = 0;
    for (const ct of candTokens) {
      const ok = descTokens.some(dt => {
        if (dt === ct) return true;
        if (dt.length >= 4 && ct.startsWith(dt)) return true;
        if (ct.length >= 4 && dt.startsWith(ct)) return true;
        return false;
      });
      if (ok) matches++;
    }
    const score = matches / candTokens.length;
    if (score > best.score) best = { match: cand, score };
  }

  // Conservative threshold: avoid spurious matches.
  if (best.score >= 0.7) return best;
  return { match: null, score: best.score };
}

function inferCommercialMeasureFromText(sapDescription: string): string | null {
  // Matches 48X43 or 48 x 43 or 180X60 etc.
  const s = normalizeText(sapDescription);
  const m = s.match(/\b(\d{2,3})\s*X\s*(\d{2,3})(?:\s*X\s*(\d{2,3}))?\b/);
  if (!m) return null;
  if (m[3]) return `${m[1]}X${m[2]}X${m[3]}`;
  return `${m[1]}X${m[2]}`;
}

function inferCommercialMeasureCmFromText(sapDescription: string): string | null {
  // Matches "150CM", "180 CM" etc. Returns just the number (e.g. "150").
  const s = normalizeText(sapDescription);
  const m = s.match(/\b(\d{2,3})\s*CM\b/);
  if (!m) return null;
  return String(m[1]);
}

function parseCommercialMeasureNumbers(commercialMeasure: string): number[] {
  const s = normalizeText(commercialMeasure || '');
  const parts = s.split('X').map(p => p.trim()).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function bestPhraseInText(textNorm: string, candidates: string[]): string | null {
  // Pick the longest candidate (by token count, then length) that appears as a substring in textNorm.
  if (!textNorm || !candidates || candidates.length === 0) return null;
  let best: { val: string; tokens: number; len: number } | null = null;
  for (const c of candidates) {
    const cNorm = normalizeText(c);
    if (!cNorm) continue;
    if (!textNorm.includes(cNorm)) continue;
    const tok = cNorm.split(' ').filter(Boolean).length;
    const len = cNorm.length;
    if (!best || tok > best.tokens || (tok === best.tokens && len > best.len)) best = { val: c, tokens: tok, len };
  }
  return best ? best.val : null;
}

function inferSpecialLabelFromText(sapDescription: string): string | null {
  const s = normalizeText(sapDescription);
  if (!s) return null;

  // Keep legacy fallback patterns, but keep them tight to avoid over-capturing
  // e.g. "PARA CAMPANA CANTO 2 MM" should yield "PARA CAMPANA".
  const para = s.match(/\bPARA\s+([A-Z0-9]+)(?:\s+([A-Z0-9]+))?/);
  if (para && para[1]) {
    const t1 = String(para[1]).trim();
    const t2 = String(para[2] || '').trim();
    const stop = new Set(['CANTO', 'CM', 'MM']);
    const out = ['PARA', t1];
    if (t2 && !stop.has(t2) && !/^\d+$/.test(t2)) out.push(t2);
    return out.join(' ').trim();
  }

  // "2 PUERTAS" / "1 PUERTA"
  const puertas = s.match(/\b(\d{1,2})\s+PUERTAS?\b/);
  if (puertas && puertas[0]) return puertas[0].trim();

  // "1C 4P" / "2C 3P" etc
  const cp = s.match(/\b(\d{1,2})\s*C\s+(\d{1,2})\s*P\b/);
  if (cp && cp[1] && cp[2]) return `${cp[1]}C ${cp[2]}P`;

  // "SIN HORNO", "SIN CAMPANA" etc (up to 3 words after SIN)
  const sin = s.match(/\bSIN\s+([A-Z0-9]+(?:\s+[A-Z0-9]+){0,2})\b/);
  if (sin && sin[1]) return `SIN ${sin[1]}`.trim();

  return null;
}

function inferEnumRefAttrsFromText(sapDescription: string, schema: any): Record<string, string> {
  const out: Record<string, string> = {};
  const s = normalizeText(sapDescription);
  if (!s) return out;
  if (!schema || typeof schema !== 'object') return out;

  for (const [k, def] of Object.entries(schema as Record<string, any>)) {
    if (!def || typeof def !== 'object') continue;
    if (def.active === false) continue;
    if (String(def.type || '').toLowerCase() !== 'enum') continue;
    const allowed = def.allowed_values;
    if (!Array.isArray(allowed) || allowed.length === 0) continue;

    let best: { val: string; len: number } | null = null;
    for (const av of allowed) {
      const avStr = String(av || '').trim();
      if (!avStr) continue;
      const avNorm = normalizeText(avStr);
      if (!avNorm) continue;
      if (!s.includes(avNorm)) continue;
      if (!best || avNorm.length > best.len) best = { val: avStr, len: avNorm.length };
    }
    if (best) out[String(k)] = best.val;
  }

  return out;
}

function isMeaningfulAttrValue(v: any): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (!s) return false;
  const up = s.toUpperCase();
  if (up === 'NA' || up === 'N/A') return false;
  return true;
}

export async function buildMassImportTemplateXlsx(baseRows: { sku_complete: string; sap_description: string }[]) {
  // Avoid mutating the input objects later.
  const baseRowsCopy = baseRows.map(r => ({ sku_complete: r.sku_complete, sap_description: r.sap_description }));

  const globalVersionRuleColumns = new Set<string>();
  try {
    const cols = await dbQuery(
      "select column_name from information_schema.columns where table_schema='public' and table_name='global_version_rules'"
    );
    for (const r of (cols || []) as any[]) {
      if (r?.column_name) globalVersionRuleColumns.add(String(r.column_name));
    }
  } catch {
    // Non-fatal: template still works; we just won't tailor the versions sheet columns.
  }

  // Token frequency within the input file, used to avoid treating very-common words as "special labels".
  const tokenCounts = new Map<string, number>();
  for (const r of baseRowsCopy) {
    for (const t of tokenize(r.sap_description || '')) {
      tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
    }
  }
  const stopTokens = new Set<string>();
  const denom = Math.max(1, baseRowsCopy.length);
  for (const [t, c] of tokenCounts.entries()) {
    if (c / denom >= 0.35) stopTokens.add(t);
  }

  const uniqSkus = Array.from(new Set(baseRows.map(r => r.sku_complete).filter(Boolean)));
  const parsed = uniqSkus
    .map(s => {
      try {
        return parseSkuComplete(s);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as ReturnType<typeof parseSkuComplete>[];

  const familiesInFile = Array.from(new Set(parsed.map(p => p.family_code))).sort();
  const colorsInFile = Array.from(new Set(parsed.map(p => p.color_code.padStart(4, '0')))).sort();
  const versionCodesInFile = Array.from(new Set(parsed.map(p => p.version_code))).sort();

  // Existing SKUs
  const existingSkus = new Set<string>();
  if (uniqSkus.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < uniqSkus.length; i += CHUNK) {
      const chunk = uniqSkus.slice(i, i + CHUNK);
      const { data, error } = await supabaseServer.from('product_skus').select('sku_complete').in('sku_complete', chunk);
      if (error) throw new Error('Error consultando SKUs existentes: ' + error.message);
      (data || []).forEach((r: any) => existingSkus.add(String(r.sku_complete).toUpperCase()));
    }
  }

  // Reference catalog (data-driven inference + similarity inheritance)
  const refByKey = new Map<string, any>();
  const referencesByFamily = new Map<string, any[]>();
  const productNamesByFamily = new Map<string, string[]>();
  const designationsByFamily = new Map<string, string[]>();
  const linesByFamily = new Map<string, string[]>();
  const specialLabelsByFamily = new Map<string, string[]>();

  if (familiesInFile.length > 0) {
    const { data, error } = await supabaseServer
      .from('product_references')
      .select(
        'id, family_code, reference_code, product_name, designation, line, commercial_measure, special_label, width_cm, depth_cm, height_cm, weight_kg, stacking_max, ref_attrs'
      )
      .in('family_code', familiesInFile);
    if (error) throw new Error('Error consultando product_references: ' + error.message);

    for (const r of (data || []) as any[]) {
      const fc = String(r.family_code || '').trim();
      const rc = String(r.reference_code || '').trim();
      if (!fc || !rc) continue;

      const k = `${fc}|${rc}`;
      refByKey.set(k, r);

      if (!referencesByFamily.has(fc)) referencesByFamily.set(fc, []);
      referencesByFamily.get(fc)!.push(r);

      const pn = String(r.product_name || '').trim();
      if (pn) {
        if (!productNamesByFamily.has(fc)) productNamesByFamily.set(fc, []);
        productNamesByFamily.get(fc)!.push(pn);
      }

      const des = String(r.designation || '').trim();
      if (des) {
        if (!designationsByFamily.has(fc)) designationsByFamily.set(fc, []);
        designationsByFamily.get(fc)!.push(des);
      }

      const li = String(r.line || '').trim();
      if (li) {
        if (!linesByFamily.has(fc)) linesByFamily.set(fc, []);
        linesByFamily.get(fc)!.push(li);
      }

      const sl = String(r.special_label || '').trim();
      if (sl && sl.toUpperCase() !== 'NA') {
        if (!specialLabelsByFamily.has(fc)) specialLabelsByFamily.set(fc, []);
        specialLabelsByFamily.get(fc)!.push(sl);
      }
    }

    // Deduplicate candidate lists
    for (const [fc, arr] of productNamesByFamily.entries()) productNamesByFamily.set(fc, Array.from(new Set(arr)));
    for (const [fc, arr] of designationsByFamily.entries()) designationsByFamily.set(fc, Array.from(new Set(arr)));
    for (const [fc, arr] of linesByFamily.entries()) linesByFamily.set(fc, Array.from(new Set(arr)));
    for (const [fc, arr] of specialLabelsByFamily.entries()) specialLabelsByFamily.set(fc, Array.from(new Set(arr)));
  }

  // Global version rules (hints like CME accessory_text override)
  const versionRulesByCode = new Map<string, any>();
  if (versionCodesInFile.length > 0) {
    const { data, error } = await supabaseServer.from('global_version_rules').select('version_code, automatic_version_rules').in('version_code', versionCodesInFile);
    if (error) throw new Error('Error consultando global_version_rules: ' + error.message);
    (data || []).forEach((r: any) => {
      versionRulesByCode.set(String(r.version_code).toUpperCase(), safeJson(r.automatic_version_rules) || {});
    });
  }
  const missingVersionCodes = versionCodesInFile.filter(vc => !versionRulesByCode.has(String(vc || '').toUpperCase())).sort();

  // Families + schema
  const familySchemas = new Map<string, any>();
  const familyMeta = new Map<string, { family_name: string; product_type: string }>();
  if (familiesInFile.length > 0) {
    const { data, error } = await supabaseServer
      .from('families')
      .select('family_code, family_name, product_type, ref_attrs_schema')
      .in('family_code', familiesInFile);
    if (error) throw new Error('Error consultando families: ' + error.message);
    (data || []).forEach((f: any) => {
      const fc = String(f.family_code || '').trim();
      if (!fc) return;
      familySchemas.set(fc, f.ref_attrs_schema || {});
      familyMeta.set(fc, { family_name: String(f.family_name || ''), product_type: String(f.product_type || '') });
    });
  }

  // Colors existence + name (for hints)
  const colorExists = new Set<string>();
  const colorNameByCode = new Map<string, string>();
  if (colorsInFile.length > 0) {
    const { data, error } = await supabaseServer.from('colors').select('code_4dig, name_color_sap').in('code_4dig', colorsInFile);
    if (error) throw new Error('Error consultando colors: ' + error.message);
    (data || []).forEach((c: any) => {
      const code = String(c.code_4dig);
      colorExists.add(code);
      if (c.name_color_sap) colorNameByCode.set(code, String(c.name_color_sap));
    });
  }

  // Dynamic REF_ATTR columns: union of schemas for existing families.
  const allRefAttrKeys = new Set<string>();
  for (const schema of familySchemas.values()) {
    normalizeSchemaKeys(schema).forEach(k => allRefAttrKeys.add(k));
  }
  // Baseline columns to guide users even for brand-new families.
  ['accessory_text', 'door_color_text', 'bisagras', 'canto_puertas', 'armado_con_lvm', 'assembled_flag', 'rh', 'carb2'].forEach(
    k => allRefAttrKeys.add(k)
  );

  const refAttrKeysSorted = Array.from(allRefAttrKeys).sort();

  const newBaseRows = baseRowsCopy.filter(r => !existingSkus.has(String(r.sku_complete || '').toUpperCase()));
  const existingBaseRows = baseRowsCopy.filter(r => existingSkus.has(String(r.sku_complete || '').toUpperCase()));

  const cargaRows: TemplateRow[] = newBaseRows.map((r, idx) => {
    const sku = String(r.sku_complete).toUpperCase();
    const parsedSku = (() => {
      try {
        return parseSkuComplete(sku);
      } catch {
        return null;
      }
    })();
    const fam = parsedSku?.family_code || '';
    const schema = fam ? familySchemas.get(fam) || null : null;
    const famSchemaValid = !!schema && typeof schema === 'object' && Object.keys(schema).length > 0;

    const warnings: string[] = [];
    const errors: string[] = [];
    const ref_attrs: Record<string, any> = {};
    const infoNotes: string[] = [];

    let product_name = '';
    let designation = '';
    let line = '';
    let commercial_measure = '';
    let special_label = 'NA';
    let width_cm: string | number = '';
    let depth_cm: string | number = '';
    let height_cm: string | number = '';
    let weight_kg: string | number = '';
    let stacking_max: string | number = '';
    const version_label = '';
    const version_attrs_json = '';
    const sku_attrs_json = '';

    if (!parsedSku) errors.push('SKU_COMPLETE invalido (formato esperado: VFAM-REF-VER-COLOR)');

    if (parsedSku) {
      const descNorm = normalizeText(r.sap_description || '');
      const col = parsedSku.color_code.padStart(4, '0');
      if (!colorExists.has(col)) warnings.push(`Color ${col} no existe: diligenciar hoja Colores_nuevos`);
      if (!famSchemaValid)
        warnings.push(`Familia ${fam} sin schema: validar/crear schema en /configuration/reference-editor o crear familia con PRODUCT_TYPE`);

      const meta = familyMeta.get(fam);
      const isKitchenMeta =
        !!meta && (normalizeText(meta.family_name).includes('COCINA') || normalizeText(meta.product_type).includes('COCINA'));
      const isKitchenByCode = fam.startsWith('COC');
      const isKitchenByDesc = descNorm.includes('COCINA');
      const isKitchen = isKitchenMeta || isKitchenByCode || isKitchenByDesc;

      // Inherit from existing reference when it exists
      const refKey = `${fam}|${parsedSku.reference_code}`;
      const ref = refByKey.get(refKey);
      if (ref) {
        product_name = String(ref.product_name || '').trim();
        designation = String(ref.designation || '').trim();
        line = String(ref.line || '').trim();
        commercial_measure = String(ref.commercial_measure || '').trim();
        special_label = String(ref.special_label || '').trim() || 'NA';
        width_cm = ref.width_cm ?? '';
        depth_cm = ref.depth_cm ?? '';
        height_cm = ref.height_cm ?? '';
        weight_kg = ref.weight_kg ?? '';
        stacking_max = ref.stacking_max ?? '';

        const baseAttrs = safeJson(ref.ref_attrs) || {};
        if (baseAttrs && typeof baseAttrs === 'object') {
          // Only inherit keys allowed by the family's schema (governed).
          // This prevents propagating legacy/stale keys that are not part of ref_attrs_schema.
          if (famSchemaValid && schema && typeof schema === 'object') {
            for (const [k, v] of Object.entries(baseAttrs)) {
              if ((schema as any)[k] !== undefined) ref_attrs[k] = v;
            }
          } else {
            // If there's no schema yet, do not auto-inherit attrs (preview should block anyway).
          }
        }

        if (isKitchen) {
          // Kitchens don't use LINE (NA by rule) even if historical data had something set.
          if (line && line.toUpperCase() !== 'NA') infoNotes.push(`LINE="${line}" ignorado por regla de cocina (se fuerza a NA)`);
          line = 'NA';
        } else if (product_name && line && normalizeText(line) === normalizeText(product_name)) {
          // Avoid reusing key token already used for PRODUCT_NAME (ex: "AMBAR").
          line = 'NA';
          infoNotes.push(`LINE="NA" (se evitó reutilizar PRODUCT_NAME="${product_name}" como LINE)`);
        }

        infoNotes.push(`Herencia: referencia ${fam}-${parsedSku.reference_code} existe; se copiaron campos base + ref_attrs.`);
      } else {
        // Data-driven inference from SAP_DESCRIPTION (writes directly into fields; user can correct).
        // descNorm/isKitchen already computed above.

        // 1) Commercial measure
        const inferredX = inferCommercialMeasureFromText(r.sap_description || '');
        const inferredCm = inferCommercialMeasureCmFromText(r.sap_description || '');
        const inferredMeasure = inferredX || inferredCm;
        if (inferredMeasure) {
          commercial_measure = inferredMeasure;
          infoNotes.push(`Inferido: COMMERCIAL_MEASURE=${inferredMeasure}`);
        }

        // 2) RH
        if (/\bRH\b/.test(descNorm)) {
          ref_attrs.rh = 'RH';
          infoNotes.push('Inferido: REF_ATTR_rh=RH');
        }

        // 3) Product name: match against existing names in this family
        const pnCandidates = productNamesByFamily.get(fam) || [];
        const bestPn = bestProductNameMatch(r.sap_description || '', pnCandidates);
        if (bestPn.match) {
          product_name = bestPn.match;
          infoNotes.push(`Inferido: PRODUCT_NAME="${bestPn.match}" (match ${Math.round(bestPn.score * 100)}%)`);
        }

        // 4) Designation: match against existing designations in this family
        const desCandidates = designationsByFamily.get(fam) || [];
        const des = bestPhraseInText(descNorm, desCandidates);
        if (des) {
          designation = des;
          infoNotes.push(`Inferido: DESIGNATION="${des}"`);
        }

        // 5) Line: kitchen families should default to NA; otherwise try to match existing lines in this family.
        if (isKitchen) {
          line = 'NA';
        } else {
          const lineCandidates = linesByFamily.get(fam) || [];
          const li = bestPhraseInText(descNorm, lineCandidates);
          if (li) {
            // Avoid reusing the same key token/phrase already used for PRODUCT_NAME (ex: "AMBAR").
            if (product_name && normalizeText(li) === normalizeText(product_name)) {
              line = 'NA';
              infoNotes.push(`Inferido: LINE="NA" (se evitó reutilizar PRODUCT_NAME="${product_name}" como LINE)`);
            } else {
              line = li;
              infoNotes.push(`Inferido: LINE="${li}"`);
            }
          }
        }

        // 6) Special label: prefer values that already exist in DB for this family; fallback to generic patterns.
        const slCandidates = specialLabelsByFamily.get(fam) || [];
        const slFromDb = bestPhraseInText(descNorm, slCandidates);
        const sl = slFromDb || inferSpecialLabelFromText(r.sap_description || '');
        if (sl) {
          const slTokens = tokenize(sl);
          const isCp = /^\d{1,2}C\s+\d{1,2}P$/i.test(sl.trim());
          const hasNonStop = slTokens.some(t => !stopTokens.has(t));
          if (isCp || hasNonStop) {
            special_label = sl;
            infoNotes.push(`Inferido: SPECIAL_LABEL="${sl}"`);
          }
        }

        // 7) Enum REF_ATTR inference based on schema allowed_values (strict, canonical values).
        const enumAttrs = inferEnumRefAttrsFromText(r.sap_description || '', schema);
        for (const [k, v] of Object.entries(enumAttrs)) {
          if (ref_attrs[k] === undefined) {
            ref_attrs[k] = v;
            infoNotes.push(`Inferido: REF_ATTR_${k}="${v}"`);
          }
        }

        // 7.1) Fallback for "CANTO <n> MM" if present in text, but only if schema allows it.
        const cantoM = descNorm.match(/\bCANTO\s+(\d{1,2})\s*MM\b/);
        if (cantoM && cantoM[1]) {
          const candidate = `CANTO ${cantoM[1]} MM`;
          const def = schema && typeof schema === 'object' ? (schema as any).canto_puertas : null;
          if (def && def.active !== false) {
            const t = String(def.type || '').toLowerCase();
            if (t === 'enum') {
              const allowed = Array.isArray(def.allowed_values) ? def.allowed_values.map((x: any) => String(x)) : [];
              const ok = allowed.some((av: string) => normalizeText(av) === normalizeText(candidate));
              if (ok) ref_attrs.canto_puertas = allowed.find((av: string) => normalizeText(av) === normalizeText(candidate)) || candidate;
            } else {
              ref_attrs.canto_puertas = candidate;
            }
          }
        }

        // 8) Similarity inheritance: if we can identify the same product, inherit dimensions/ref_attrs
        // from an existing reference in this family.
        //
        // NOTE: We intentionally require SPECIAL_LABEL to match too. This prevents accidental inheritance
        // from "module" references (which often carry specific special_label text) when the incoming row
        // is a cabinet with SPECIAL_LABEL=NA.
        if (product_name && designation && commercial_measure) {
          const refs = referencesByFamily.get(fam) || [];
          const pnN = normalizeText(product_name);
          const desN = normalizeText(designation);
          const cmN = normalizeText(commercial_measure);
          const slN = normalizeText(special_label || 'NA') || 'NA';

          let bestRef: any | null = null;
          let bestScore = -1;
          for (const rr of refs) {
            if (!rr) continue;
            if (normalizeText(String(rr.product_name || '')) !== pnN) continue;
            if (normalizeText(String(rr.designation || '')) !== desN) continue;
            if (normalizeText(String(rr.commercial_measure || '')) !== cmN) continue;
            const rrSlN = normalizeText(String(rr.special_label || 'NA')) || 'NA';
            if (rrSlN !== slN) continue;

            const score =
              (rr.width_cm != null ? 1 : 0) +
              (rr.depth_cm != null ? 1 : 0) +
              (rr.height_cm != null ? 1 : 0) +
              (rr.weight_kg != null ? 1 : 0) +
              (rr.stacking_max != null ? 1 : 0);
            if (score > bestScore) {
              bestScore = score;
              bestRef = rr;
            }
          }

          if (bestRef) {
            // Sanity-check: if COMMERCIAL_MEASURE looks like AxB( xC ), don't inherit clearly unrelated dimensions.
            // This prevents accidental copying from "module" references that share the same name/designation/measure string.
            const mNums = parseCommercialMeasureNumbers(commercial_measure);
            const bw = bestRef.width_cm != null ? Number(bestRef.width_cm) : null;
            const bd = bestRef.depth_cm != null ? Number(bestRef.depth_cm) : null;
            const dimsLookCompatible = (() => {
              if (mNums.length < 2) return true;
              if (!Number.isFinite(bw as any) || !Number.isFinite(bd as any)) return true;
              const a = mNums[0];
              const b = mNums[1];
              const near = (x: number, y: number) => Math.abs(x - y) <= Math.max(2, Math.round(y * 0.08));
              // Allow swapped width/depth
              return (near(bw as number, a) && near(bd as number, b)) || (near(bw as number, b) && near(bd as number, a));
            })();

            if (dimsLookCompatible) {
              if (width_cm === '' && bestRef.width_cm != null) width_cm = bestRef.width_cm;
              if (depth_cm === '' && bestRef.depth_cm != null) depth_cm = bestRef.depth_cm;
              if (height_cm === '' && bestRef.height_cm != null) height_cm = bestRef.height_cm;
              if (weight_kg === '' && bestRef.weight_kg != null) weight_kg = bestRef.weight_kg;
              if (stacking_max === '' && bestRef.stacking_max != null) stacking_max = bestRef.stacking_max;
            } else {
              infoNotes.push(
                `Herencia por similitud: se evitó heredar medidas desde ${fam}-${bestRef.reference_code} por incompatibilidad con COMMERCIAL_MEASURE="${commercial_measure}".`
              );
            }

            const bAttrs = safeJson(bestRef.ref_attrs) || {};
            if (bAttrs && typeof bAttrs === 'object') {
              for (const [k, v] of Object.entries(bAttrs)) {
                // Govern inheritance by schema to avoid propagating non-schema keys.
                if (famSchemaValid && schema && typeof schema === 'object' && (schema as any)[k] === undefined) continue;
                if (!isMeaningfulAttrValue(ref_attrs[k]) && isMeaningfulAttrValue(v)) ref_attrs[k] = v;
              }
            }

            if ((special_label === 'NA' || !special_label) && bestRef.special_label && String(bestRef.special_label).trim().toUpperCase() !== 'NA') {
              const slNorm = normalizeText(String(bestRef.special_label));
              if (slNorm && descNorm.includes(slNorm)) special_label = String(bestRef.special_label).trim();
            }

            infoNotes.push(
              `Herencia por similitud: se heredaron medidas/ref_attrs desde referencia existente ${fam}-${bestRef.reference_code} (match por PRODUCT_NAME+DESIGNATION+COMMERCIAL_MEASURE+SPECIAL_LABEL).`
            );
          }
        }
      }

      // Version rules hints
      const verRules = versionRulesByCode.get(parsedSku.version_code.toUpperCase());
      if (verRules && typeof verRules === 'object' && Object.keys(verRules).length > 0) {
        if (verRules.private_label_client_name) infoNotes.push(`Regla de version ${parsedSku.version_code}: private_label_client_name="${String(verRules.private_label_client_name).trim()}"`);
        if (verRules.accessory_text) {
          // Don't overwrite REF_ATTR_accessory_text (it's reference-level). Just surface as info.
          infoNotes.push(`Regla de version ${parsedSku.version_code}: accessory_text="${String(verRules.accessory_text).trim()}" (override)`);
        }
      }

      const colName = colorNameByCode.get(col);
      if (colName) infoNotes.push(`Color (por codigo ${col}): ${colName}`);
    }

    // Push non-blocking info into VALIDATION_WARNINGS (since SUGG_* columns were removed).
    if (infoNotes.length > 0) warnings.push(...infoNotes.map(s => `Info: ${s}`));

    return {
      row_number: idx + 1,
      import_action: 'CREAR',
      existing_in_supabase: 'NO',
      validation_status: 'PENDIENTE',
      validation_errors: errors.join(' | '),
      validation_warnings: warnings.join(' | '),
      sku_complete: sku,
      sap_description: r.sap_description || '',
      product_name,
      designation,
      line,
      commercial_measure,
      special_label,
      width_cm,
      depth_cm,
      height_cm,
      weight_kg,
      stacking_max,
      version_label,
      version_attrs_json,
      sku_attrs_json,
      ref_attrs,
    };
  });

  // Families_nuevas rows
  const missingFamilies = familiesInFile.filter(fc => !familySchemas.has(fc));
  const familiasRows = missingFamilies.map(fc => ({
    FAMILY_CODE: fc,
    FAMILY_NAME: '',
    PRODUCT_TYPE: '',
    ZONE_HOME: '',
    USE_DESTINATION: '',
    MANUFACTURING_PROCESS: 'FABRICADO',
    ASSEMBLED_DEFAULT: false,
    RH_DEFAULT: false,
    ALLOWED_LINES: '',
  }));

  // Colores_nuevos rows
  const missingColors = colorsInFile.filter(c => !colorExists.has(c));
  const coloresRows = missingColors.map(c => ({
    COLOR_CODE_4DIG: c,
    NAME_COLOR_SAP: '',
    CODE_SHORT: parseInt(c, 10),
  }));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Firplak V6';
  wb.created = new Date();

  const wsInst = wb.addWorksheet('Instrucciones');
  wsInst.columns = [{ width: 110 }];
  [
    'PLANTILLA V6 - CARGA MASIVA DE PRODUCTOS',
    '',
    'Paso 1: Llenar la hoja "Carga" para las filas con IMPORT_ACTION=CREAR.',
    'Paso 2: Si hay colores faltantes, diligenciar la hoja "Colores_nuevos".',
    'Paso 3: Si hay familias nuevas, diligenciar la hoja "Familias_nuevas" (PRODUCT_TYPE es obligatorio).',
    'Paso 4: Si hay version_codes nuevos, diligenciar la hoja "Versiones_nuevas" para crear global_version_rules.',
    '',
    'Gobernanza de atributos (REF_ATTR_*):',
    '- Las columnas REF_ATTR_<key> se validan contra families.ref_attrs_schema.',
    '- Si una familia no tiene schema, el preview bloqueara la importacion y guiara a /configuration/reference-editor.',
    '- Si una key REF_ATTR_<key> no existe en el schema de la familia, se IGNORA (warning) y no se guarda.',
    '- Enums: se intentan mapear a allowed_values (normaliza trim/upper). Si no mapea, se guarda igual y deja warning para actualizar el schema.',
    '',
    'Notas:',
    '- Si el SKU es nuevo pero la referencia ya existe, la plantilla intenta heredar campos base + ref_attrs.',
    '- Las reglas de version (global_version_rules) se reflejan como "Info:" dentro de VALIDATION_WARNINGS cuando aplican.',
  ].forEach(l => wsInst.addRow([l]));
  wsInst.getRow(1).font = { bold: true, size: 14 };

  const wsCarga = wb.addWorksheet('Carga', { views: [{ state: 'frozen', ySplit: 1 }] });
  const baseHeaders = [
    'ROW_NUMBER',
    'IMPORT_ACTION',
    'EXISTING_IN_SUPABASE',
    'VALIDATION_STATUS',
    'VALIDATION_ERRORS',
    'VALIDATION_WARNINGS',
    'SKU_COMPLETE',
    'SAP_DESCRIPTION',
    'PRODUCT_NAME',
    'DESIGNATION',
    'LINE',
    'COMMERCIAL_MEASURE',
    'SPECIAL_LABEL',
    'WIDTH_CM',
    'DEPTH_CM',
    'HEIGHT_CM',
    'WEIGHT_KG',
    'STACKING_MAX',
    'VERSION_LABEL',
    'VERSION_ATTRS_JSON',
    'SKU_ATTRS_JSON',
  ];
  const refAttrHeaders = refAttrKeysSorted.map(k => `REF_ATTR_${k}`);
  const columns = [...baseHeaders, ...refAttrHeaders].map(h => ({
    header: h,
    key: h,
    width: h.length > 22 ? 30 : 18,
  }));
  columns.find(c => c.key === 'SAP_DESCRIPTION')!.width = 55;
  columns.find(c => c.key === 'VALIDATION_ERRORS')!.width = 45;
  columns.find(c => c.key === 'VALIDATION_WARNINGS')!.width = 45;
  wsCarga.columns = columns;

  for (const row of cargaRows) {
    const rec: Record<string, any> = {
      ROW_NUMBER: row.row_number,
      IMPORT_ACTION: row.import_action,
      EXISTING_IN_SUPABASE: row.existing_in_supabase,
      VALIDATION_STATUS: row.validation_status,
      VALIDATION_ERRORS: row.validation_errors,
      VALIDATION_WARNINGS: row.validation_warnings,
      SKU_COMPLETE: row.sku_complete,
      SAP_DESCRIPTION: row.sap_description,
      PRODUCT_NAME: row.product_name,
      DESIGNATION: row.designation,
      LINE: row.line,
      COMMERCIAL_MEASURE: row.commercial_measure,
      SPECIAL_LABEL: row.special_label,
      WIDTH_CM: row.width_cm,
      DEPTH_CM: row.depth_cm,
      HEIGHT_CM: row.height_cm,
      WEIGHT_KG: row.weight_kg,
      STACKING_MAX: row.stacking_max,
      VERSION_LABEL: row.version_label,
      VERSION_ATTRS_JSON: row.version_attrs_json,
      SKU_ATTRS_JSON: row.sku_attrs_json,
    };
    for (const k of refAttrKeysSorted) {
      const v = (row.ref_attrs || ({} as any))[k];
      rec[`REF_ATTR_${k}`] = v === null || v === undefined ? '' : String(v);
    }
    wsCarga.addRow(rec);
  }
  wsCarga.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsCarga.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  wsCarga.autoFilter = { from: { row: 1, column: 1 }, to: { row: cargaRows.length + 1, column: columns.length } };

  // Existing SKUs (diagnostic only)
  const wsExisting = wb.addWorksheet('SKU_en_Supabase', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsExisting.columns = [
    { header: 'SKU_COMPLETE', key: 'SKU_COMPLETE', width: 22 },
    { header: 'SAP_DESCRIPTION', key: 'SAP_DESCRIPTION', width: 70 },
    { header: 'NOTE', key: 'NOTE', width: 40 },
  ];
  wsExisting.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsExisting.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  for (const r of existingBaseRows) {
    wsExisting.addRow({
      SKU_COMPLETE: String(r.sku_complete || '').toUpperCase(),
      SAP_DESCRIPTION: String(r.sap_description || '').trim(),
      NOTE: 'Existe en Supabase (no se incluye en Carga).',
    });
  }

  // New version codes (diagnostic + capture global_version_rules data needed for preview/import)
  const wsVersions = wb.addWorksheet('Versiones_nuevas', { views: [{ state: 'frozen', ySplit: 1 }] });
  const versionCols = [
    { header: 'VERSION_CODE', key: 'VERSION_CODE', width: 14 },
    { header: 'VERSION_DESCRIPTION', key: 'VERSION_DESCRIPTION', width: 40 },
    { header: 'AUTOMATIC_VERSION_RULES_JSON', key: 'AUTOMATIC_VERSION_RULES_JSON', width: 70 },
  ];
  if (globalVersionRuleColumns.has('product_types')) {
    versionCols.push({ header: 'PRODUCT_TYPES', key: 'PRODUCT_TYPES', width: 40 } as any);
  }
  wsVersions.columns = versionCols as any;
  wsVersions.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsVersions.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  if (missingVersionCodes.length === 0) {
    wsVersions.addRow({
      VERSION_CODE: '',
      VERSION_DESCRIPTION: '',
      AUTOMATIC_VERSION_RULES_JSON: '',
      PRODUCT_TYPES: '',
    });
    wsVersions.getCell('A2').value = 'No hay version_codes nuevos detectados en este archivo.';
  } else {
    for (const vc of missingVersionCodes) {
      wsVersions.addRow({
        VERSION_CODE: vc,
        VERSION_DESCRIPTION: '',
        AUTOMATIC_VERSION_RULES_JSON: '{}',
        PRODUCT_TYPES: '',
      });
    }
  }

  const wsFam = wb.addWorksheet('Familias_nuevas', { views: [{ state: 'frozen', ySplit: 1 }] });
  if (familiasRows.length > 0) {
    wsFam.columns = Object.keys(familiasRows[0]).map(k => ({ header: k, key: k, width: 22 }));
    familiasRows.forEach(r => wsFam.addRow(r));
    wsFam.getRow(1).font = { bold: true };
  } else {
    wsFam.columns = [{ header: 'INFO', key: 'INFO', width: 60 }];
    wsFam.addRow({ INFO: 'No hay familias nuevas detectadas en este archivo.' });
  }

  const wsCol = wb.addWorksheet('Colores_nuevos', { views: [{ state: 'frozen', ySplit: 1 }] });
  if (coloresRows.length > 0) {
    wsCol.columns = Object.keys(coloresRows[0]).map(k => ({ header: k, key: k, width: 22 }));
    coloresRows.forEach(r => wsCol.addRow(r));
    wsCol.getRow(1).font = { bold: true };
  } else {
    wsCol.columns = [{ header: 'INFO', key: 'INFO', width: 60 }];
    wsCol.addRow({ INFO: 'No hay colores nuevos detectados en este archivo.' });
  }

  const wsDiag = wb.addWorksheet('Diagnostico');
  wsDiag.columns = [{ width: 110 }];
  wsDiag.addRow([`Total SKUs en archivo: ${uniqSkus.length}`]);
  wsDiag.addRow([`Existentes en Supabase: ${existingSkus.size}`]);
  wsDiag.addRow([`Nuevos a crear (segun SKU inexistente): ${newBaseRows.length}`]);
  wsDiag.addRow([`Familias nuevas: ${missingFamilies.length}`]);
  wsDiag.addRow([`Colores nuevos: ${missingColors.length}`]);

  const buf = await wb.xlsx.writeBuffer();
  return { buffer: Buffer.from(buf), meta: { missingFamilies, missingColors, refAttrKeys: refAttrKeysSorted } };
}
