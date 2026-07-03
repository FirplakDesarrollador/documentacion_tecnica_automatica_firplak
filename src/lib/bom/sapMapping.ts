import type { BomLine, SapEntityPayload } from '@/lib/sap/serviceLayer'
import type { ComponentCategory, ProductApplicationScope } from './types'

export type ParsedSapCode = {
  itemCode: string
  baseItemCode: string
  variantCode4: string
  isSalesSku: boolean
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
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

export function inferProductApplicationScope(line: BomLine): ProductApplicationScope {
  const parsed = parseSapItemCode(line.ItemCode)
  if (parsed.variantCode4 === '0000') return 'NA'
  if (inferComponentCategory(line.ItemCode, line.ItemName) !== 'material') return 'NA'
  return 'full_product'
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
  if (variantCode4 === '0000') return itemName
  return itemName.replace(/\s{2,}/g, ' ').trim()
}
