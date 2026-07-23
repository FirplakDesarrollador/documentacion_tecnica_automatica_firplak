import type {
  BomStructure,
  BomStructureLine,
  BomConsumption,
  ProductApplicationScope,
  ComponentItem,
} from '@/lib/bom/types'

export type BomBoardItem = {
  lineId: string
  itemCode: string
  itemName: string
  scope: ProductApplicationScope
  qty: number
  uom: string | null
}

export type BomEdgeItem = {
  lineId: string
  itemCode: string
  itemName: string
  scope: ProductApplicationScope
  qty: number
  uom: string | null
  thicknessMm: number | null
}

export type BomMaterialGroup = {
  lineId: string
  scope: ProductApplicationScope
  consumptions: BomConsumption[]
  defaultProfile: string | null
}

export type BomPackagingItem = {
  lineId: string
  itemCode: string
  itemName: string
  qty: number
  uom: string | null
}

export type BomProcessItem = {
  lineId: string
  itemCode: string
  itemName: string
  qty: number
  uom: string | null
}

export type BomKittingItem = {
  lineId: string
  itemCode: string
  itemName: string
  qty: number
  uom: string | null
  children: BomComponentItem[]
}

export type BomComponentItem = {
  lineId: string
  baseItemCode: string
  itemCode: string
  itemName: string | null
  componentCategory: string | null
  qty: number
  uom: string | null
}

export type BomProfileByRole = {
  structure: string | null
  inner_structure: string | null
  front: string | null
  drawer_bottom: string | null
}

export type BomSplitResult = {
  boardItems: BomBoardItem[]
  edgeItems: BomEdgeItem[]
  materialGroups: BomMaterialGroup[]
  packagingItems: BomPackagingItem[]
  processItems: BomProcessItem[]
  kittingItems: BomKittingItem[]
  defaultProfiles: BomProfileByRole
  warnings: string[]
}

const BOARD_SCOPES = new Set<ProductApplicationScope>(['full_product', 'structure', 'front', 'inner_structure', 'drawer_bottom'])
const EDGE_SCOPES = new Set<ProductApplicationScope>(['edge_band_full_product', 'edge_band_body', 'edge_band_front', 'edge_band_inner', 'edge_band_drawer_bottom'])

const KITTING_PATTERNS = [/KITTING/i, /KIT\s/i]

export function buildReferenceCode(familyCode: string, referenceCode: string): string {
  return `V${familyCode}-${referenceCode}`
}

export function buildSkuPrefix(familyCode: string, referenceCode: string, versionCode: string): string {
  return `V${familyCode}-${referenceCode}-${versionCode}`
}

export function splitBomByRole(bom: BomStructure): BomSplitResult {
  const result: BomSplitResult = {
    boardItems: [],
    edgeItems: [],
    materialGroups: [],
    packagingItems: [],
    processItems: [],
    kittingItems: [],
    defaultProfiles: { structure: null, inner_structure: null, front: null, drawer_bottom: null },
    warnings: [],
  }

  for (const line of bom.lines) {
    const scope = line.product_application_scope
    const kind = detectLineKind(line, scope)

    switch (kind) {
      case 'board':
        result.boardItems.push({
          lineId: line.line_id,
          itemCode: line.base_item_code ?? '',
          itemName: line.base_item_code ?? '',
          scope: scope as ProductApplicationScope,
          qty: line.qty ?? 1,
          uom: line.uom ?? null,
        })
        break

      case 'edge':
        result.edgeItems.push({
          lineId: line.line_id,
          itemCode: line.base_item_code ?? '',
          itemName: line.base_item_code ?? '',
          scope,
          qty: line.qty ?? 0,
          uom: line.uom ?? null,
          thicknessMm: null,
        })
        break

      case 'material_group':
        result.materialGroups.push({
          lineId: line.line_id,
          scope,
          consumptions: line.consumptions ?? [],
          defaultProfile: extractDefaultProfile(line.consumptions),
        })
        break

      case 'packaging':
        result.packagingItems.push({
          lineId: line.line_id,
          itemCode: line.base_item_code ?? '',
          itemName: line.base_item_code ?? '',
          qty: line.qty ?? 0,
          uom: line.uom ?? null,
        })
        break

      case 'process':
        result.processItems.push({
          lineId: line.line_id,
          itemCode: line.base_item_code ?? '',
          itemName: line.base_item_code ?? '',
          qty: line.qty ?? 0,
          uom: line.uom ?? null,
        })
        break

      case 'kitting':
        result.kittingItems.push({
          lineId: line.line_id,
          itemCode: line.base_item_code ?? '',
          itemName: line.base_item_code ?? '',
          qty: line.qty ?? 1,
          uom: line.uom ?? null,
          children: [],
        })
        break
    }
  }

  extractDefaultProfilesFromGroups(result)

  return result
}

function detectLineKind(line: BomStructureLine, scope: ProductApplicationScope): 'board' | 'edge' | 'material_group' | 'packaging' | 'process' | 'kitting' | 'other' {
  if (line.line_kind === 'material_group') return 'material_group'

  const code = (line.base_item_code ?? '').toUpperCase()

  const isKitting = KITTING_PATTERNS.some(p => {
    const name = line.base_item_code ?? ''
    return p.test(name)
  })
  if (isKitting) return 'kitting'

  if (EDGE_SCOPES.has(scope)) return 'edge'

  if (code.startsWith('CMPD07')) return 'kitting'
  if (code.startsWith('CEMP')) return 'packaging'
  if (code.startsWith('PZCO')) return 'process'
  if (code.startsWith('CMPD09')) return 'board'

  if (BOARD_SCOPES.has(scope)) return 'board'

  return 'other'
}

function extractDefaultProfile(consumptions: BomConsumption[]): string | null {
  if (consumptions.length === 0) return null
  const defaultConsumption = consumptions.find(c => c.status === 'confirmed' || c.status === 'observed')
  return defaultConsumption?.material_profile ?? consumptions[0]?.material_profile ?? null
}

function extractDefaultProfilesFromGroups(result: BomSplitResult): void {
  for (const group of result.materialGroups) {
    const defaultProfile = group.defaultProfile
    if (!defaultProfile) continue

    const scopeLower = group.scope.toLowerCase()
    if (scopeLower === 'full_product') {
      if (!result.defaultProfiles.structure) result.defaultProfiles.structure = defaultProfile
      if (!result.defaultProfiles.front) result.defaultProfiles.front = defaultProfile
      if (!result.defaultProfiles.inner_structure) result.defaultProfiles.inner_structure = defaultProfile
      if (!result.defaultProfiles.drawer_bottom) result.defaultProfiles.drawer_bottom = defaultProfile
    }
    if (scopeLower === 'structure') {
      if (!result.defaultProfiles.structure) result.defaultProfiles.structure = defaultProfile
    }
    if (scopeLower === 'front') {
      if (!result.defaultProfiles.front) result.defaultProfiles.front = defaultProfile
    }
    if (scopeLower === 'inner_structure') {
      if (!result.defaultProfiles.inner_structure) result.defaultProfiles.inner_structure = defaultProfile
    }
    if (scopeLower === 'drawer_bottom') {
      if (!result.defaultProfiles.drawer_bottom) result.defaultProfiles.drawer_bottom = defaultProfile
    }
  }

  if (result.defaultProfiles.structure && !result.defaultProfiles.inner_structure) {
    result.defaultProfiles.inner_structure = result.defaultProfiles.structure
  }
  if (result.defaultProfiles.structure && !result.defaultProfiles.drawer_bottom) {
    result.defaultProfiles.drawer_bottom = result.defaultProfiles.structure
  }
}

interface ComponentItemRow {
  item_code: string
  item_name: string
  base_item_code: string
  component_category: string | null
  uom: string | null
  item_bom_structure: unknown
}

export async function resolveComponentItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  itemCode: string
): Promise<BomComponentItem[]> {
  const { data, error } = await supabase
    .from('component_items')
    .select('item_code, item_name, base_item_code, component_category, uom, item_bom_structure')
    .eq('base_item_code', itemCode)

  if (error || !data || data.length === 0) return []

  const items = data as ComponentItemRow[]
  const children: BomComponentItem[] = []

  for (const item of items) {
    const childBom = item.item_bom_structure as BomStructure | null
    if (!childBom?.lines || childBom.lines.length === 0) continue

    for (const childLine of childBom.lines) {
      children.push({
        lineId: childLine.line_id,
        baseItemCode: childLine.base_item_code ?? '',
        itemCode: childLine.base_item_code ?? '',
        itemName: childLine.base_item_code ?? null,
        componentCategory: item.component_category,
        qty: childLine.qty ?? 1,
        uom: childLine.uom ?? null,
      })
    }
  }

  return children
}

export function findItemByCode(items: BomBoardItem[] | BomEdgeItem[], code: string): typeof items[0] | undefined {
  const norm = code.toUpperCase()
  return items.find(i => i.itemCode.toUpperCase() === norm || i.itemCode.toUpperCase().startsWith(norm))
}

export function buildComparisonKey(code: string, name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()

  const tokens = normalized.split(/\s+/).filter(t => !['DE', 'DEL', 'LA', 'EL', 'MUEBLE', 'MUEBLES'].includes(t))
  return tokens.join(' ')
}
