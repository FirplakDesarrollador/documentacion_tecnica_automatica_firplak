import 'server-only'

import { supabaseTable } from '@/lib/supabaseDynamic'
import {
  getSapItemsByCodes,
  getSapItemsByPrefix,
  type SapEntityPayload,
} from '@/lib/sap/serviceLayer'
import {
  buildComponentTechnicalMetadata,
  inferBaseItemName,
  inferComponentCategory,
  parseSapItemCode,
  readSapFrozen,
  readSapInventoryItem,
  readSapItemName,
  readSapUom,
  readSapValid,
} from '@/lib/bom/sapMapping'

const COMPONENT_ITEM_SELECT = [
  'ItemCode',
  'ItemName',
  'InventoryUOM',
  'SalesUnit',
  'Valid',
  'Frozen',
  'InventoryItem',
  'PurchaseUnitLength',
  'PurchaseLengthUnit',
  'PurchaseUnitWidth',
  'PurchaseWidthUnit',
  'PurchaseUnitHeight',
  'PurchaseHeightUnit',
]

export type SapComponentCatalogCandidate = {
  itemCode: string
  defaultIssueMethod: string | null
}

export type SapPhysicalBoardCatalogCandidate = {
  baseItemCode: string
  variantCode: string
  materialProfile: string
  thicknessMm: number
  defaultIssueMethod: string | null
}

export type SapComponentCatalogSyncResult = {
  importedItemCodes: string[]
  unavailableItemCodes: string[]
  missingInSapItemCodes: string[]
  errors: string[]
}

export type SapCatalogReviewStatus = 'pending' | 'approved' | 'rejected'

export type SapCatalogReviewItem = {
  itemCode: string
  itemName: string
  status: SapCatalogReviewStatus
  firstSeenAt: string | null
  reviewedAt: string | null
  reviewedBy: string | null
}

function emptyComponentStructure() {
  return {
    schema_version: 2,
    structure_type: 'component',
    input_warehouse_code: null,
    output_warehouse_code: null,
    lines: [],
  }
}

function normalizeCandidates(candidates: SapComponentCatalogCandidate[]): SapComponentCatalogCandidate[] {
  const byCode = new Map<string, SapComponentCatalogCandidate>()
  for (const candidate of candidates) {
    const itemCode = candidate.itemCode.trim().toUpperCase()
    if (!itemCode) continue
    byCode.set(itemCode, { itemCode, defaultIssueMethod: candidate.defaultIssueMethod })
  }
  return [...byCode.values()]
}

export async function syncMissingSapComponentsToCatalog(
  candidates: SapComponentCatalogCandidate[],
): Promise<SapComponentCatalogSyncResult> {
  const normalizedCandidates = normalizeCandidates(candidates)
  if (normalizedCandidates.length === 0) {
    return { importedItemCodes: [], unavailableItemCodes: [], missingInSapItemCodes: [], errors: [] }
  }

  try {
    const sapItems = await getSapItemsByCodes(normalizedCandidates.map(candidate => candidate.itemCode), COMPONENT_ITEM_SELECT, {
      timeoutMs: 30_000,
    })
    const rows: Record<string, unknown>[] = []
    const unavailableItemCodes: string[] = []
    const missingInSapItemCodes: string[] = []

    for (const candidate of normalizedCandidates) {
      const sapItem = sapItems.get(candidate.itemCode)
      if (!sapItem) {
        missingInSapItemCodes.push(candidate.itemCode)
        continue
      }
      if (readSapValid(sapItem) !== true || readSapFrozen(sapItem) === true) {
        unavailableItemCodes.push(candidate.itemCode)
        continue
      }
      rows.push(componentCatalogRow(candidate, sapItem))
    }

    if (rows.length > 0) {
      const { error } = await supabaseTable('component_items').upsert(rows, { onConflict: 'item_code' })
      if (error) throw new Error(`No se pudieron sincronizar component_items: ${error.message}`)
    }

    return {
      importedItemCodes: rows.map(row => String(row.item_code)),
      unavailableItemCodes,
      missingInSapItemCodes,
      errors: [],
    }
  } catch (error) {
    return {
      importedItemCodes: [],
      unavailableItemCodes: [],
      missingInSapItemCodes: [],
      errors: [error instanceof Error ? error.message : 'No se pudo consultar SAP para sincronizar componentes.'],
    }
  }
}

export async function syncPhysicalBoardCandidatesToCatalog(
  candidates: SapPhysicalBoardCatalogCandidate[],
): Promise<SapComponentCatalogSyncResult> {
  const uniqueCandidates = [...new Map(candidates.map(candidate => [
    [candidate.baseItemCode, candidate.variantCode, candidate.materialProfile, candidate.thicknessMm].join('|'),
    {
      ...candidate,
      baseItemCode: candidate.baseItemCode.trim().toUpperCase(),
      variantCode: candidate.variantCode.trim().toUpperCase(),
      materialProfile: candidate.materialProfile.trim().toUpperCase(),
    },
  ])).values()]
  if (uniqueCandidates.length === 0) return { importedItemCodes: [], unavailableItemCodes: [], missingInSapItemCodes: [], errors: [] }

  try {
    const rows: Record<string, unknown>[] = []
    const unavailableItemCodes: string[] = []
    const missingInSapItemCodes: string[] = []
    for (const candidate of uniqueCandidates) {
      const familyPrefix = candidate.baseItemCode.split('-')[0]
      if (!familyPrefix) continue
      const sapItems = await getSapItemsByPrefix(familyPrefix, COMPONENT_ITEM_SELECT, { timeoutMs: 30_000, top: 500 })
      const matches = sapItems.filter(sapItem => {
        const itemCode = typeof sapItem.ItemCode === 'string' ? sapItem.ItemCode.trim().toUpperCase() : ''
        if (!itemCode) return false
        const parsed = parseSapItemCode(itemCode)
        const metadata = buildComponentTechnicalMetadata(sapItem, readSapItemName(sapItem, itemCode))
        return parsed.variantCode4 === candidate.variantCode
          && metadata.material_kind === 'board'
          && metadata.material_profile === candidate.materialProfile
          && metadata.thickness_mm !== null
          && Math.abs(metadata.thickness_mm - candidate.thicknessMm) <= 0.5
      })
      const baseItemCodes = [...new Set(matches.map(item => parseSapItemCode(String(item.ItemCode)).baseItemCode))]
      if (baseItemCodes.length === 0) {
        missingInSapItemCodes.push(`${familyPrefix}-*-${candidate.variantCode}`)
        continue
      }
      if (baseItemCodes.length > 1) {
        unavailableItemCodes.push(`${familyPrefix}-*-${candidate.variantCode}`)
        continue
      }
      const item = matches[0]
      const itemCode = item && typeof item.ItemCode === 'string' ? item.ItemCode.trim().toUpperCase() : ''
      if (!item || !itemCode) continue
      if (readSapValid(item) !== true || readSapFrozen(item) === true) {
        unavailableItemCodes.push(itemCode)
        continue
      }
      rows.push(componentCatalogRow({ itemCode, defaultIssueMethod: candidate.defaultIssueMethod }, item))
    }
    if (rows.length > 0) {
      const { error } = await supabaseTable('component_items').upsert(rows, { onConflict: 'item_code' })
      if (error) throw new Error(`No se pudieron sincronizar equivalentes físicos de tablero: ${error.message}`)
    }
    return { importedItemCodes: rows.map(row => String(row.item_code)), unavailableItemCodes, missingInSapItemCodes, errors: [] }
  } catch (error) {
    return {
      importedItemCodes: [], unavailableItemCodes: [], missingInSapItemCodes: [],
      errors: [error instanceof Error ? error.message : 'No se pudo consultar SAP para resolver el tablero físico.'],
    }
  }
}

function componentCatalogRow(candidate: SapComponentCatalogCandidate, sapItem: SapEntityPayload): Record<string, unknown> {
  const parsed = parseSapItemCode(candidate.itemCode)
  const itemName = readSapItemName(sapItem, candidate.itemCode)
  return {
    item_code: candidate.itemCode,
    base_item_code: parsed.baseItemCode,
    variant_code_4: parsed.variantCode4,
    item_name: itemName,
    base_item_name: inferBaseItemName(itemName, parsed.variantCode4),
    uom: readSapUom(sapItem, null),
    component_category: inferComponentCategory(candidate.itemCode, itemName),
    default_issue_method: candidate.defaultIssueMethod,
    sap_valid: readSapValid(sapItem),
    sap_frozen: readSapFrozen(sapItem),
    is_inventory_item: readSapInventoryItem(sapItem),
    item_bom_structure: emptyComponentStructure(),
    technical_metadata: buildComponentTechnicalMetadata(sapItem, itemName),
  }
}

function pendingCatalogMetadata(sapItem: SapEntityPayload, itemName: string): Record<string, unknown> {
  const metadata = buildComponentTechnicalMetadata(sapItem, itemName)
  return {
    ...metadata,
    catalog_review: {
      status: 'pending' satisfies SapCatalogReviewStatus,
      first_seen_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      source: 'sap_transfer_request',
    },
  }
}

/** Inserts only SAP components that are absent from the catalog. Existing rows are never updated. */
export async function registerMissingSapComponentsToCatalog(
  candidates: SapComponentCatalogCandidate[],
): Promise<SapComponentCatalogSyncResult> {
  const normalizedCandidates = normalizeCandidates(candidates).filter(candidate => !candidate.itemCode.startsWith('V'))
  if (normalizedCandidates.length === 0) return { importedItemCodes: [], unavailableItemCodes: [], missingInSapItemCodes: [], errors: [] }

  try {
    const existingResult = await supabaseTable('component_items')
      .select<Array<{ item_code: string }>>('item_code')
      .in('item_code', normalizedCandidates.map(candidate => candidate.itemCode))
    if (existingResult.error) throw new Error(`No se pudo consultar component_items: ${existingResult.error.message}`)
    const existingCodes = new Set((existingResult.data ?? []).map(row => row.item_code.trim().toUpperCase()))
    const missingCandidates = normalizedCandidates.filter(candidate => !existingCodes.has(candidate.itemCode))
    if (missingCandidates.length === 0) return { importedItemCodes: [], unavailableItemCodes: [], missingInSapItemCodes: [], errors: [] }

    const sapItems = await getSapItemsByCodes(missingCandidates.map(candidate => candidate.itemCode), COMPONENT_ITEM_SELECT, { timeoutMs: 30_000 })
    const rows: Record<string, unknown>[] = []
    const unavailableItemCodes: string[] = []
    const missingInSapItemCodes: string[] = []
    for (const candidate of missingCandidates) {
      const sapItem = sapItems.get(candidate.itemCode)
      if (!sapItem) {
        missingInSapItemCodes.push(candidate.itemCode)
        continue
      }
      if (readSapValid(sapItem) !== true || readSapFrozen(sapItem) === true) {
        unavailableItemCodes.push(candidate.itemCode)
        continue
      }
      const row = componentCatalogRow(candidate, sapItem)
      row.technical_metadata = pendingCatalogMetadata(sapItem, readSapItemName(sapItem, candidate.itemCode))
      rows.push(row)
    }
    if (rows.length > 0) {
      const insertResult = await supabaseTable('component_items').insert(rows)
      if (insertResult.error) throw new Error(`No se pudieron registrar componentes nuevos: ${insertResult.error.message}`)
    }
    return { importedItemCodes: rows.map(row => String(row.item_code)), unavailableItemCodes, missingInSapItemCodes, errors: [] }
  } catch (error) {
    return {
      importedItemCodes: [],
      unavailableItemCodes: [],
      missingInSapItemCodes: [],
      errors: [error instanceof Error ? error.message : 'No se pudieron registrar componentes nuevos.'],
    }
  }
}

function readCatalogReview(value: unknown): SapCatalogReviewItem['status'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const review = (value as Record<string, unknown>).catalog_review
  if (!review || typeof review !== 'object' || Array.isArray(review)) return null
  const status = (review as Record<string, unknown>).status
  return status === 'pending' || status === 'approved' || status === 'rejected' ? status : null
}

export async function listPendingSapCatalogItems(): Promise<SapCatalogReviewItem[]> {
  const result = await supabaseTable('component_items')
    .select<Array<Record<string, unknown>>>('item_code, item_name, technical_metadata')
    .eq('technical_metadata->catalog_review->>status', 'pending')
  if (result.error) throw new Error(`No se pudieron consultar artículos pendientes: ${result.error.message}`)
  return (result.data ?? []).flatMap(row => {
    const metadata = row.technical_metadata && typeof row.technical_metadata === 'object' && !Array.isArray(row.technical_metadata)
      ? row.technical_metadata as Record<string, unknown>
      : {}
    const review = metadata.catalog_review && typeof metadata.catalog_review === 'object' && !Array.isArray(metadata.catalog_review)
      ? metadata.catalog_review as Record<string, unknown>
      : {}
    const status = readCatalogReview(row.technical_metadata)
    if (!status) return []
    return [{
      itemCode: typeof row.item_code === 'string' ? row.item_code : '',
      itemName: typeof row.item_name === 'string' ? row.item_name : '',
      status,
      firstSeenAt: typeof review.first_seen_at === 'string' ? review.first_seen_at : null,
      reviewedAt: typeof review.reviewed_at === 'string' ? review.reviewed_at : null,
      reviewedBy: typeof review.reviewed_by === 'string' ? review.reviewed_by : null,
    }]
  })
}

export async function reviewSapCatalogItem(
  itemCode: string,
  status: Exclude<SapCatalogReviewStatus, 'pending'>,
  reviewerId: string,
): Promise<SapCatalogReviewItem> {
  const normalizedCode = itemCode.trim().toUpperCase()
  const current = await supabaseTable('component_items')
    .select<Record<string, unknown>>('item_code, item_name, technical_metadata')
    .eq('item_code', normalizedCode)
    .maybeSingle()
  if (current.error) throw new Error(`No se pudo leer el artículo para revisión: ${current.error.message}`)
  if (!current.data) throw new Error('El artículo de catálogo no existe.')
  const metadata = current.data.technical_metadata && typeof current.data.technical_metadata === 'object' && !Array.isArray(current.data.technical_metadata)
    ? current.data.technical_metadata as Record<string, unknown>
    : {}
  const review = metadata.catalog_review && typeof metadata.catalog_review === 'object' && !Array.isArray(metadata.catalog_review)
    ? metadata.catalog_review as Record<string, unknown>
    : {}
  const reviewedAt = new Date().toISOString()
  const updated = await supabaseTable('component_items')
    .update<Record<string, unknown>>({ technical_metadata: { ...metadata, catalog_review: { ...review, status, reviewed_at: reviewedAt, reviewed_by: reviewerId } } })
    .eq('item_code', normalizedCode)
    .select('item_code, item_name, technical_metadata')
    .maybeSingle()
  if (updated.error || !updated.data) throw new Error(`No se pudo guardar la revisión: ${updated.error?.message ?? 'sin respuesta'}`)
  const updatedMetadata = updated.data.technical_metadata as Record<string, unknown>
  const updatedReview = updatedMetadata.catalog_review as Record<string, unknown>
  return {
    itemCode: String(updated.data.item_code),
    itemName: String(updated.data.item_name),
    status,
    firstSeenAt: typeof updatedReview.first_seen_at === 'string' ? updatedReview.first_seen_at : null,
    reviewedAt: typeof updatedReview.reviewed_at === 'string' ? updatedReview.reviewed_at : null,
    reviewedBy: typeof updatedReview.reviewed_by === 'string' ? updatedReview.reviewed_by : null,
  }
}
