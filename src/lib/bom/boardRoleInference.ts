import { isBoardMaterialApplicationScope } from './referenceImportScopes'
import { inferBoardApplicationScope } from './sapMapping'
import type { BoardMatrixRole, BoardMatrixRoleSource, DirectBomSnapshot, ReferenceImportContext } from './referenceImportTypes'

export function boardRoleFromReferenceContext(input: {
  context: ReferenceImportContext
  snapshot: DirectBomSnapshot
  line: DirectBomSnapshot['normalizedLines'][number]
}): { role: BoardMatrixRole; roleSource: BoardMatrixRoleSource } {
  const boardNameScope = inferBoardApplicationScope({
    itemName: input.line.itemName,
    baseItemCode: input.line.baseItemCode,
    materialKind: input.line.technicalMetadata?.material_kind,
  })
  if (boardNameScope) return { role: boardNameScope, roleSource: 'evidence' }

  const sourceColorCode = input.snapshot.skuColorCode?.trim().toUpperCase()
  const override = sourceColorCode
    ? input.context.skuColorOverrides?.get(input.snapshot.skuComplete)?.filter(candidate =>
        candidate.color_code.trim().toUpperCase() === sourceColorCode
        && (!candidate.base_item_code || candidate.base_item_code === input.line.baseItemCode)
        && isBoardMaterialApplicationScope(candidate.product_application_scope)
        && (!candidate.target_color_code || candidate.target_color_code.trim().toUpperCase() === input.line.variantCode4)
      ).at(-1)
    : undefined
  if (override) return { role: override.product_application_scope, roleSource: 'sku_override' }

  const primaryBoardLineCount = input.snapshot.normalizedLines.filter(candidate => {
    if (candidate.technicalMetadata?.material_kind !== 'board' || candidate.variantCode4 === '0000') return false
    // A named board role, currently drawer bottom, is already resolved by SAP
    // semantics and must not make the sole body board look ambiguous.
    return inferBoardApplicationScope({
      itemName: candidate.itemName,
      baseItemCode: candidate.baseItemCode,
      materialKind: candidate.technicalMetadata?.material_kind,
    }) === null
  }).length
  return primaryBoardLineCount === 1
    ? { role: 'full_product', roleSource: 'evidence' }
    : { role: 'role_pending', roleSource: 'pending' }
}
