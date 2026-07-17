import type { SapEntityPayload } from '@/lib/sap/serviceLayer'
import type { ComponentCategory, ComponentTechnicalMetadata, MaterialProfile } from './types'

export type ParsedSapCode = {
  itemCode: string
  baseItemCode: string
  variantCode4: string
  isSalesSku: boolean
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function cleanNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

const SAP_LENGTH_UNIT_TO_MM: Record<number, number> = {
  1: 1,
  2: 10,
  3: 100,
  4: 1000,
  5: 25.4,
  6: 304.8,
}

function roundedMillimeters(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function normalizeSapLengthToMm(value: unknown, unit: unknown): number | null {
  const numericValue = cleanNumber(value)
  const numericUnit = cleanNumber(unit)
  if (numericValue === null || numericUnit === null) return null
  const multiplier = SAP_LENGTH_UNIT_TO_MM[numericUnit]
  return multiplier ? roundedMillimeters(numericValue * multiplier) : null
}

export function inferMaterialProfile(itemName: string): {
  normalized: MaterialProfile | null
  source: string | null
} {
  const normalizedName = itemName.trim().toUpperCase()
  const carbSource = normalizedName.match(/\bCARB(?:2)?\b/)?.[0] ?? null
  if (carbSource) return { normalized: 'CARB2', source: carbSource }
  if (/\bRH\b/.test(normalizedName)) return { normalized: 'RH', source: 'RH' }
  if (/\bST\b/.test(normalizedName)) return { normalized: 'ST', source: 'ST' }
  return { normalized: null, source: null }
}

export function inferThicknessFromName(itemName: string): number | null {
  const matches = [...itemName.toUpperCase().matchAll(/(\d+(?:[.,]\d+)?)\s*MM\b/g)]
  const raw = matches.at(-1)?.[1]
  return raw ? cleanNumber(raw) : null
}

function inferMaterialKind(itemName: string): ComponentTechnicalMetadata['material_kind'] {
  const normalizedName = itemName.toUpperCase()
  if (normalizedName.includes('TABLERO') || normalizedName.includes('FONDO CARB')) return 'board'
  if (normalizedName.includes('CANTO')) return 'edge_band'
  return 'other'
}

function compatibleThickness(nameThickness: number | null, sapHeightMm: number | null): number | null {
  if (nameThickness === null) return null
  if (sapHeightMm === null) return nameThickness
  return Math.abs(nameThickness - sapHeightMm) <= 0.5 ? sapHeightMm : nameThickness
}

function formatDimension(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', '_')
}

export function buildComponentTechnicalMetadata(
  item: SapEntityPayload,
  itemName: string
): ComponentTechnicalMetadata {
  const materialKind = inferMaterialKind(itemName)
  const profile = inferMaterialProfile(itemName)
  const purchaseLength = cleanNumber(item.PurchaseUnitLength)
  const purchaseLengthUnit = cleanNumber(item.PurchaseLengthUnit)
  const purchaseLengthMm = normalizeSapLengthToMm(purchaseLength, purchaseLengthUnit)
  const purchaseWidth = cleanNumber(item.PurchaseUnitWidth)
  const purchaseWidthUnit = cleanNumber(item.PurchaseWidthUnit)
  const purchaseWidthMm = normalizeSapLengthToMm(purchaseWidth, purchaseWidthUnit)
  const purchaseHeight = cleanNumber(item.PurchaseUnitHeight)
  const purchaseHeightUnit = cleanNumber(item.PurchaseHeightUnit)
  const purchaseHeightMm = normalizeSapLengthToMm(purchaseHeight, purchaseHeightUnit)
  const nameThickness = inferThicknessFromName(itemName)
  const thicknessMm = materialKind === 'board'
    ? compatibleThickness(nameThickness, purchaseHeightMm)
    : nameThickness
  const formatKey = materialKind === 'board'
    && purchaseLengthMm !== null
    && purchaseWidthMm !== null
    && thicknessMm !== null
    ? [purchaseLengthMm, purchaseWidthMm, thicknessMm].map(formatDimension).join('x')
    : null
  const hasSapDimensions = purchaseLength !== null || purchaseWidth !== null || purchaseHeight !== null
  const hasNameMetadata = profile.normalized !== null || nameThickness !== null

  return {
    material_kind: materialKind,
    material_profile: profile.normalized,
    material_profile_source: profile.source,
    thickness_mm: thicknessMm,
    purchase_length: purchaseLength,
    purchase_length_unit: purchaseLengthUnit,
    purchase_length_mm: purchaseLengthMm,
    purchase_width: purchaseWidth,
    purchase_width_unit: purchaseWidthUnit,
    purchase_width_mm: purchaseWidthMm,
    purchase_height: purchaseHeight,
    purchase_height_unit: purchaseHeightUnit,
    purchase_height_mm: purchaseHeightMm,
    format_key: formatKey,
    metadata_source: hasSapDimensions && hasNameMetadata
      ? 'sap_and_name'
      : hasSapDimensions
        ? 'sap'
        : hasNameMetadata
          ? 'name'
          : 'unknown',
  }
}

export function sapBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['tyes', 'yes', 'si', 'sí', 'true', '1', 'y'].includes(normalized)) return true
  if (['tno', 'no', 'false', '0', 'n'].includes(normalized)) return false
  return null
}

export function parseSapItemCode(itemCode: string): ParsedSapCode {
  const normalized = itemCode.trim().toUpperCase()
  const parts = normalized.split('-')
  if (parts.length >= 4) {
    return {
      itemCode: normalized,
      baseItemCode: parts.slice(0, 3).join('-'),
      variantCode4: parts[3],
      isSalesSku: normalized.startsWith('V'),
    }
  }

  return {
    itemCode: normalized,
    baseItemCode: normalized,
    variantCode4: '0000',
    isSalesSku: normalized.startsWith('V'),
  }
}

export function buildSapItemCode(baseItemCode: string, variantCode4: string): string {
  return `${baseItemCode.trim().toUpperCase()}-${variantCode4.trim().toUpperCase().padStart(4, '0')}`
}

export function parseSalesSku(skuComplete: string): {
  skuComplete: string
  familyCode: string
  referenceCode: string
  versionCode: string
  colorCode: string
  skuBase: string
} {
  const normalized = skuComplete.trim().toUpperCase()
  const parts = normalized.split('-')
  if (parts.length < 4 || !parts[0].startsWith('V')) {
    throw new Error(`SKU SAP no tiene la forma esperada: ${skuComplete}`)
  }

  const familyCode = parts[0].slice(1)
  const referenceCode = parts[1]
  const versionCode = parts[2]
  const colorCode = parts[3]

  return {
    skuComplete: normalized,
    familyCode,
    referenceCode,
    versionCode,
    colorCode,
    skuBase: parts.slice(0, 3).join('-'),
  }
}

export function inferComponentCategory(itemCode: string, itemName: string): ComponentCategory {
  const code = itemCode.toUpperCase()
  const name = itemName.toUpperCase()

  if (code.startsWith('V')) return 'child_sku'
  if (code.startsWith('PZCO')) return 'process'
  if (code.startsWith('CEMP') || code.startsWith('PEMP')) return 'packaging'
  if (code.startsWith('CMPD06') || name.includes('TABLERO') || name.includes('CANTO PVC')) return 'material'
  if (code.startsWith('CMPD07') || name.includes('BISAGRA') || name.includes('MANIJA') || name.includes('RIEL')) return 'hardware'
  if (code.startsWith('CMPD09')) return 'substructure'
  return 'unknown'
}

export function readSapItemName(item: SapEntityPayload, fallback: string): string {
  return cleanString(item.ItemName) ?? fallback
}

export function readSapUom(item: SapEntityPayload, fallback: string | null): string | null {
  return cleanString(item.InventoryUOM) ?? cleanString(item.SalesUnit) ?? fallback
}

export function readSapValid(item: SapEntityPayload): boolean | null {
  return sapBoolean(item.Valid)
}

export function readSapFrozen(item: SapEntityPayload): boolean | null {
  return sapBoolean(item.Frozen)
}

export function readSapInventoryItem(item: SapEntityPayload): boolean | null {
  return sapBoolean(item.InventoryItem)
}

export function inferBaseItemName(itemName: string, variantCode4: string): string {
  const normalizedName = itemName.replace(/\s{2,}/g, ' ').trim()
  if (variantCode4 === '0000') return normalizedName

  const dimensionMatch = normalizedName.match(/\b\d+(?:[.,]\d+)?(?:\s?X\s?\d+(?:[.,]\d+)?)*\s?(?:MM|CM|M|IN)\b/i)
  if (!dimensionMatch || dimensionMatch.index === undefined) return normalizedName

  return normalizedName.slice(0, dimensionMatch.index + dimensionMatch[0].length).trim()
}
