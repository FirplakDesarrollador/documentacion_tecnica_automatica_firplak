import { supabaseServer } from '@/lib/supabase';
import { parseSkuComplete } from './sku';

type TemplateRecord = Record<string, unknown>;

export type ParsedMassImportTemplate = {
  carga: TemplateRecord[];
  familias: TemplateRecord[];
  colores: TemplateRecord[];
  versiones: TemplateRecord[];
};

export type StrictRefAttrIssue = {
  rowNumber: number;
  skuComplete: string;
  field: string;
  value: string;
  expected: string[];
  message: string;
};

type RefAttrDefinition = {
  type?: unknown;
  active?: unknown;
  allowed_values?: unknown;
};

type RefAttrSchema = Record<string, RefAttrDefinition>;
type FamilySchemaRow = {
  family_code: unknown;
  ref_attrs_schema: unknown;
};

type PayloadRow = {
  sku_complete: string;
  sap_description_original: string;
  product_name: string;
  designation: string;
  line: string;
  commercial_measure: string;
  special_label: string;
  width_cm: number | null;
  depth_cm: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  stacking_max: number | null;
  ref_attrs: Record<string, unknown>;
  version_label: string;
  version_attrs: Record<string, unknown>;
  sku_attrs: Record<string, unknown>;
};

type PayloadFamily = {
  family_code: string;
  family_name: string;
  product_type: string;
  zone_home: string;
  use_destination: string;
  manufacturing_process: string;
  assembled_default: boolean;
  rh_default: boolean;
  allowed_lines: string[];
};

type PayloadColor = {
  code_4dig: string;
  name_color_sap: string;
  code_short: number | null;
};

type PayloadVersion = {
  version_code: string;
  version_description: string;
  automatic_version_rules: Record<string, unknown>;
  product_types: string[];
};

export type MassImportPayload = {
  rows: PayloadRow[];
  families: PayloadFamily[];
  colors: PayloadColor[];
  versions: PayloadVersion[];
};

const PLACEHOLDER_TEXT = new Set(['NA', 'N/A', 'N.A', 'NULL', 'NONE']);

function parseJsonObjectOrNull(val: unknown): Record<string, unknown> | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  try {
    const parsed: unknown = JSON.parse(s);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeBool(val: unknown): boolean | null {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  const s = String(val).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'si' || s === 'sí' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return null;
}

function toNumberOrNull(val: unknown): number | null {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  const n = Number(String(val).trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeOptionalText(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  return PLACEHOLDER_TEXT.has(s.toUpperCase()) ? null : s;
}

function normalizeComparable(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function getString(record: TemplateRecord, key: string): string {
  return String(record[key] ?? '').trim();
}

function getFamilyCodeFromSku(skuComplete: string): string | null {
  try {
    return parseSkuComplete(skuComplete).family_code;
  } catch {
    return null;
  }
}

function getSchemaType(definition: RefAttrDefinition | undefined): string {
  return String(definition?.type ?? '').trim().toLowerCase();
}

function getAllowedValues(definition: RefAttrDefinition | undefined): string[] {
  const allowed = definition?.allowed_values;
  if (!Array.isArray(allowed)) return [];
  return allowed.map(value => String(value ?? '').trim()).filter(Boolean);
}

function buildStrictMessage(issue: Omit<StrictRefAttrIssue, 'message'>): string {
  const where = issue.skuComplete ? `SKU ${issue.skuComplete}` : `fila ${issue.rowNumber}`;
  return `Hay un dato que difiere de lo esperado: ${where}, ${issue.field}="${issue.value}". Valores esperados: ${issue.expected.join(', ')}.`;
}

function normalizeEnumRefAttrValue(raw: unknown, allowedValues: string[]) {
  const rawText = String(raw).trim();
  const normalized = normalizeComparable(rawText);
  const match = allowedValues.find(value => normalizeComparable(value) === normalized);
  return { value: match ?? rawText, isValid: Boolean(match), rawText };
}

function normalizeBooleanRefAttrValue(raw: unknown) {
  const bool = normalizeBool(raw);
  return bool === null ? String(raw).trim() : bool;
}

function buildRefAttrsForRow(options: {
  row: TemplateRecord;
  rowNumber: number;
  skuComplete: string;
  schema: RefAttrSchema | null;
}) {
  const refAttrs: Record<string, unknown> = {};
  const issues: StrictRefAttrIssue[] = [];

  for (const sourceKey of Object.keys(options.row)) {
    if (!sourceKey.startsWith('REF_ATTR_')) continue;
    const key = sourceKey.replace('REF_ATTR_', '').toLowerCase();
    if (key === 'product_type') continue;

    const raw = options.row[sourceKey];
    if (raw === null || raw === undefined || String(raw).trim() === '') continue;

    const definition = options.schema?.[key];
    const schemaType = getSchemaType(definition);

    if (definition && definition.active !== false && schemaType === 'enum') {
      const expected = getAllowedValues(definition);
      const normalized = normalizeEnumRefAttrValue(raw, expected);
      refAttrs[key] = normalized.value;

      if (!normalized.isValid && expected.length > 0) {
        const issueBase = {
          rowNumber: options.rowNumber,
          skuComplete: options.skuComplete,
          field: `REF_ATTR_${key}`,
          value: normalized.rawText,
          expected,
        };
        issues.push({ ...issueBase, message: buildStrictMessage(issueBase) });
      }
      continue;
    }

    refAttrs[key] = definition && definition.active !== false && schemaType === 'boolean'
      ? normalizeBooleanRefAttrValue(raw)
      : String(raw).trim();
  }

  return { refAttrs, issues };
}

async function loadFamilySchemas(familyCodes: string[]): Promise<Map<string, RefAttrSchema>> {
  const unique = Array.from(new Set(familyCodes.map(code => code.trim()).filter(Boolean)));
  const schemas = new Map<string, RefAttrSchema>();
  if (unique.length === 0) return schemas;

  const { data, error } = await supabaseServer
    .from('families')
    .select('family_code, ref_attrs_schema')
    .in('family_code', unique);

  if (error) throw new Error('Error consultando schemas de familias: ' + error.message);

  for (const row of (data ?? []) as FamilySchemaRow[]) {
    const familyCode = String(row.family_code ?? '').trim();
    const schema = row.ref_attrs_schema;
    if (familyCode && schema && typeof schema === 'object' && !Array.isArray(schema)) {
      schemas.set(familyCode, schema as RefAttrSchema);
    }
  }

  return schemas;
}

export async function buildMassImportPayload(parsed: ParsedMassImportTemplate): Promise<{
  payload: MassImportPayload;
  strictIssues: StrictRefAttrIssue[];
}> {
  const familyCodes = (parsed.carga || [])
    .filter(row => String(row.IMPORT_ACTION || '').toUpperCase() === 'CREAR')
    .map(row => getFamilyCodeFromSku(getString(row, 'SKU_COMPLETE').toUpperCase()))
    .filter((familyCode): familyCode is string => Boolean(familyCode));

  const schemas = await loadFamilySchemas(familyCodes);
  const strictIssues: StrictRefAttrIssue[] = [];

  const rows = (parsed.carga || [])
    .filter(row => String(row.IMPORT_ACTION || '').toUpperCase() === 'CREAR')
    .map((row, index) => {
      const skuComplete = getString(row, 'SKU_COMPLETE').toUpperCase();
      if (!skuComplete) return null;

      const familyCode = getFamilyCodeFromSku(skuComplete);
      const { refAttrs, issues } = buildRefAttrsForRow({
        row,
        rowNumber: Number(row.ROW_NUMBER ?? index + 2),
        skuComplete,
        schema: familyCode ? schemas.get(familyCode) ?? null : null,
      });
      strictIssues.push(...issues);

      const versionAttrs = parseJsonObjectOrNull(row.VERSION_ATTRS_JSON) ?? {};
      const privateLabelClientName = versionAttrs.private_label_client_name;
      if (privateLabelClientName !== undefined && !normalizeOptionalText(privateLabelClientName)) {
        delete versionAttrs.private_label_client_name;
      }

      return {
        sku_complete: skuComplete,
        sap_description_original: getString(row, 'SAP_DESCRIPTION'),
        product_name: getString(row, 'PRODUCT_NAME'),
        designation: getString(row, 'DESIGNATION'),
        line: getString(row, 'LINE'),
        commercial_measure: getString(row, 'COMMERCIAL_MEASURE'),
        special_label: getString(row, 'SPECIAL_LABEL'),
        width_cm: toNumberOrNull(row.WIDTH_CM),
        depth_cm: toNumberOrNull(row.DEPTH_CM),
        height_cm: toNumberOrNull(row.HEIGHT_CM),
        weight_kg: toNumberOrNull(row.WEIGHT_KG),
        stacking_max: toNumberOrNull(row.STACKING_MAX),
        ref_attrs: refAttrs,
        version_label: getString(row, 'VERSION_LABEL'),
        version_attrs: versionAttrs,
        sku_attrs: parseJsonObjectOrNull(row.SKU_ATTRS_JSON) ?? {},
      };
    })
    .filter((row): row is PayloadRow => row !== null);

  const families = (parsed.familias || [])
    .map(row => ({
      family_code: getString(row, 'FAMILY_CODE'),
      family_name: getString(row, 'FAMILY_NAME'),
      product_type: getString(row, 'PRODUCT_TYPE'),
      zone_home: getString(row, 'ZONE_HOME'),
      use_destination: getString(row, 'USE_DESTINATION'),
      manufacturing_process: getString(row, 'MANUFACTURING_PROCESS'),
      assembled_default: normalizeBool(row.ASSEMBLED_DEFAULT) ?? false,
      rh_default: normalizeBool(row.RH_DEFAULT) ?? false,
      allowed_lines: getString(row, 'ALLOWED_LINES')
        .split('|')
        .map(part => part.trim())
        .filter(Boolean),
    }))
    .filter(row => row.family_code);

  const colors = (parsed.colores || [])
    .map(row => ({
      code_4dig: getString(row, 'COLOR_CODE_4DIG'),
      name_color_sap: getString(row, 'NAME_COLOR_SAP'),
      code_short: toNumberOrNull(row.CODE_SHORT),
    }))
    .filter(row => row.code_4dig);

  const versions = (parsed.versiones || [])
    .map(row => ({
      version_code: getString(row, 'VERSION_CODE').toUpperCase(),
      version_description: getString(row, 'VERSION_DESCRIPTION'),
      automatic_version_rules: parseJsonObjectOrNull(row.AUTOMATIC_VERSION_RULES_JSON) ?? {},
      product_types: getString(row, 'PRODUCT_TYPES')
        .split('|')
        .map(part => part.trim())
        .filter(Boolean),
    }))
    .filter(row => row.version_code && !row.version_code.toLowerCase().includes('no hay version_codes'));

  return { payload: { rows, families, colors, versions }, strictIssues };
}

export function buildStrictPreviewRows(rows: PayloadRow[], issues: StrictRefAttrIssue[]) {
  const issuesBySku = new Map<string, StrictRefAttrIssue[]>();
  for (const issue of issues) {
    const list = issuesBySku.get(issue.skuComplete) ?? [];
    list.push(issue);
    issuesBySku.set(issue.skuComplete, list);
  }

  return rows.map(row => ({
    sku_complete: row.sku_complete,
    errors: (issuesBySku.get(row.sku_complete) ?? []).map(issue => issue.message),
    warnings: [],
  }));
}

export function summarizeStrictIssues(issues: StrictRefAttrIssue[]): string {
  const shown = issues.slice(0, 5).map(issue => issue.message);
  const suffix = issues.length > shown.length ? ` (${issues.length - shown.length} errores mas)` : '';
  return `${shown.join(' | ')}${suffix}`;
}
