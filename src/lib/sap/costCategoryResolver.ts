export const SAP_BOM_COST_CATEGORY_MAPPING_SETTING_KEY = 'sap_bom_cost_category_mapping'

export const SAP_BOM_COST_CATEGORIES = ['material', 'packaging', 'mo', 'cif'] as const

export type SapBomCostCategory = (typeof SAP_BOM_COST_CATEGORIES)[number]

export type SapBomCostCategoryMapping = {
  itemsGroupCode: Record<string, SapBomCostCategory>
  materialGroup: Record<string, SapBomCostCategory>
  family: Record<string, SapBomCostCategory>
  group: Record<string, SapBomCostCategory>
}

export type SapItemCostClassification = {
  itemsGroupCode: string | null
  materialGroup: string | null
  family: string | null
  group: string | null
}

export function resolveComponentCostCategory(
  componentCategory: unknown,
  parentCategory: SapBomCostCategory | null = null,
): SapBomCostCategory {
  if (componentCategory === 'material' || componentCategory === 'packaging'
    || componentCategory === 'mo' || componentCategory === 'cif') return componentCategory
  return parentCategory ?? 'material'
}

export const EMPTY_SAP_BOM_COST_CATEGORY_MAPPING: SapBomCostCategoryMapping = {
  itemsGroupCode: {},
  materialGroup: {},
  family: {},
  group: {},
}

function normalizeKey(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const normalized = String(value).trim().toLocaleUpperCase('es-CO')
  return normalized || null
}

function isCategory(value: unknown): value is SapBomCostCategory {
  return typeof value === 'string' && (SAP_BOM_COST_CATEGORIES as readonly string[]).includes(value)
}

function normalizeSourceMapping(value: unknown): Record<string, SapBomCostCategory> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.entries(value).reduce<Record<string, SapBomCostCategory>>((mapping, [key, category]) => {
    const normalizedKey = normalizeKey(key)
    if (normalizedKey && isCategory(category)) mapping[normalizedKey] = category
    return mapping
  }, {})
}

export function normalizeSapBomCostCategoryMapping(value: unknown): SapBomCostCategoryMapping {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_SAP_BOM_COST_CATEGORY_MAPPING
  const mapping = value as Record<string, unknown>
  return {
    itemsGroupCode: normalizeSourceMapping(mapping.itemsGroupCode),
    materialGroup: normalizeSourceMapping(mapping.materialGroup),
    family: normalizeSourceMapping(mapping.family),
    group: normalizeSourceMapping(mapping.group),
  }
}

export function resolveSapBomCostCategory(
  classification: SapItemCostClassification,
  mapping: SapBomCostCategoryMapping,
  parentCategory: SapBomCostCategory | null = null,
): SapBomCostCategory {
  const candidates: Array<[Record<string, SapBomCostCategory>, string | null]> = [
    [mapping.itemsGroupCode, normalizeKey(classification.itemsGroupCode)],
    [mapping.materialGroup, normalizeKey(classification.materialGroup)],
    [mapping.family, normalizeKey(classification.family)],
    [mapping.group, normalizeKey(classification.group)],
  ]
  for (const [sourceMapping, value] of candidates) {
    if (value && sourceMapping[value]) return sourceMapping[value]
  }
  return parentCategory ?? 'material'
}
