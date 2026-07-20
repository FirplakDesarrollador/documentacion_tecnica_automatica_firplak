import 'server-only'

import { supabaseTable } from '@/lib/supabaseDynamic'
import {
  getSapItemsByCodes,
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

export type SapComponentCatalogSyncResult = {
  importedItemCodes: string[]
  unavailableItemCodes: string[]
  missingInSapItemCodes: string[]
  errors: string[]
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
