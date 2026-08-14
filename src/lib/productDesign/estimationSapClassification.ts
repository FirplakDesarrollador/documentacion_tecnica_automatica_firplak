import type { EstimationBomCostCategory } from './estimationBomCosting'

export function inferEstimationSapCostCategory(
  itemCode: string,
  itemName: string,
): EstimationBomCostCategory {
  const code = itemCode.trim().toUpperCase()
  const name = itemName.trim().toUpperCase()
  if (code.startsWith('PZCO01-0001-') || name.includes('MANO OBRA')) return 'mo'
  if (code.startsWith('PZCO01-0002-') || /(^|\s)CIF(\s|$)/u.test(name)) return 'cif'
  return 'material'
}
