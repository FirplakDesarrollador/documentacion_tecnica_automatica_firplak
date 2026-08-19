import type { EstimationBomCostCategory } from './estimationBomCosting'
import { isPackagingPhysicalItemCode } from './estimationDraft'

const PACKAGING_NAME_PATTERN = /\b(?:EMPAQUE|EMPACADO|EMPAQUETADO|EMBALAJE|CAJA|CAJAS)\b/iu

export function inferEstimationSapCostCategory(
  itemCode: string,
  itemName: string,
): EstimationBomCostCategory {
  const code = itemCode.trim().toUpperCase()
  const name = itemName.trim().toUpperCase()
  if (code.startsWith('PZCO01-0001-') || name.includes('MANO OBRA')) return 'mo'
  if (code.startsWith('PZCO01-0002-') || /(^|\s)CIF(\s|$)/u.test(name)) return 'cif'
  if (isPackagingPhysicalItemCode(code) || PACKAGING_NAME_PATTERN.test(name)) return 'packaging'
  return 'material'
}
