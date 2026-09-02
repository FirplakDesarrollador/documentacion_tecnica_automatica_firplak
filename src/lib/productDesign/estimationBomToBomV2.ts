import type { BomStructure } from '@/lib/bom/types'
import type { EstimationDraftBomLine } from './estimationDraft'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Converts only direct quotation lines to the reference-level BOM V2. */
export function estimationBomToBomV2(
  lines: EstimationDraftBomLine[],
  itemCodeOverrides: ReadonlyMap<string, string> = new Map(),
): BomStructure {
  const roots = lines.filter(line => line.parentId === null)
  return {
    schema_version: 2,
    structure_type: 'production',
    input_warehouse_code: null,
    output_warehouse_code: null,
    lines: roots.map((line, index) => {
      const itemCode = itemCodeOverrides.get(line.id)
        ?? text(line.sapItemCode ?? line.extensions.suggestedSapItemCode)?.toUpperCase()
      if (!itemCode) throw new Error(`La línea raíz ${line.itemName ?? line.id} no tiene un código SAP.`)
      if (line.quantity === null || !Number.isFinite(line.quantity) || line.quantity <= 0) {
        throw new Error(`La cantidad de ${line.itemName ?? itemCode} debe ser mayor que cero.`)
      }
      return {
        line_id: line.id,
        sort_order: index + 1,
        line_kind: 'fixed' as const,
        base_item_code: itemCode,
        product_application_scope: 'NA' as const,
        qty: line.quantity,
        uom: line.uom,
        input_warehouse_code: text(line.extensions.sapComponentWarehouse),
        issue_method_override: text(line.extensions.sapIssueMethod),
        alternatives: [],
        consumptions: [],
      }
    }),
  }
}
