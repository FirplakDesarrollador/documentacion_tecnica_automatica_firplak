'use client'

import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, Copy, Download, Layers, Loader2, RefreshCw, Search, X } from 'lucide-react'
import { OrderConsultaPanel } from './OrderConsultaPanel'
import { DEFAULT_SALES_PRICING_FORMULAS, evaluateSalesPricing, type SalesPricingFormulaConfig } from '@/lib/productDesign/salesPricingFormulas'
import { buildEstimationBomClipboardText, type EstimationBomExportRow } from '@/lib/sales/estimationBomExport'

type SapItem = Record<string, unknown>

type ConsultaMode = 'items' | 'production-orders' | 'sales-orders'

const CONSULTA_MODES: Array<{ id: ConsultaMode; label: string }> = [
  { id: 'items', label: 'Artículos y LdM' },
  { id: 'production-orders', label: 'Órdenes de fabricación' },
  { id: 'sales-orders', label: 'Órdenes de venta' },
]

type ConsultaSapClientProps = {
  initialCode: string
  initialItem: SapItem | null
  initialError: string | null
}

type FieldKind = 'amount' | 'boolean' | 'date' | 'enum' | 'quantity' | 'uomGroup'

type FieldDefinition = {
  label: string
  key: string
  kind?: FieldKind
  wide?: boolean
}

type SapApiItemResponse =
  | { success: true; item: SapItem }
  | { success: false; error: string; sapCode?: string | number | null }

type SearchResult = {
  itemCode: string
  itemName: string
}

type ColorOption = {
  code: string
  name: string
}

type SearchCriteria = {
  code: string
  description: string
  color: string
}

type SapApiSearchResponse =
  | {
      success: true
      items: SearchResult[]
      hasMore: boolean
      nextSkip: number | null
    }
  | { success: false; error: string; sapCode?: string | number | null }

type SapApiColorsResponse =
  | { success: true; colors: ColorOption[] }
  | { success: false; error: string }

type CostSource = 'last_purchase_receipt_warehouse_average' | 'mp01_warehouse_average' | 'unavailable' | 'bom_rollup'

type DirectSapCost = {
  unitCost: number | null
  source: Exclude<CostSource, 'bom_rollup'>
  warehouseCode: string | null
  documentEntry: number | null
  documentNumber: number | null
  documentDate: string | null
  warning: string | null
}

type BomNode = {
  itemCode: string
  itemName: string
  quantity: number
  inventoryUom: string | null
  level: number
  lines: BomNode[]
  bomQuantity: number | null
  componentWarehouse: string | null
  outputWarehouse: string | null
  directCost: DirectSapCost
  structuralUnitCost: number | null
  knownStructuralUnitCost: number
  lineSubtotalCost: number | null
  knownLineSubtotalCost: number
  pendingCostCount: number
  isPartial: boolean
  costSource: CostSource
  costCategory: 'material' | 'packaging' | 'mo' | 'cif'
  loaded: boolean
}

type CostedBomNode = Omit<BomNode, 'lines' | 'loaded'> & {
  lines: CostedBomNode[]
}

type BomApiResponse =
  | { success: true; hasBom: true; tree: CostedBomNode; rows: CostedBomExportRow[]; costsAsOf: string; costCacheTtlSeconds: number; pricingFormulaConfig: SalesPricingFormulaConfig }
  | { success: true; hasBom: false }
  | { success: false; error: string }

type FastBomNode = {
  itemCode: string
  itemName: string
  quantity: number
  inventoryUom: string | null
  level: number
  lines: FastBomNode[]
  loaded: boolean
}

type FastBomApiResponse =
  | { success: true; hasBom: true; tree: FastBomNode }
  | { success: true; hasBom: false }
  | { success: false; error: string }

type BomChildrenResponse =
  | { success: true; lines: FastBomNode[] }
  | { success: false; error: string }

type CostedBomExportRow = {
  level: number
  itemCode: string
  itemName: string
  quantity: number
  accumulatedQuantity: number
  inventoryUom: string | null
  componentWarehouse: string | null
  outputWarehouse: string | null
  warehouseCode: string | null
  receiptDate: string | null
  receiptDocument: number | null
  costSource: CostSource
  unitCost: number | null
  subtotalCost: number | null
  knownSubtotalCost: number
  isPartial: boolean
  pendingCostCount: number
  warning: string | null
  costCategory: 'material' | 'packaging' | 'mo' | 'cif'
  subtotalMP: number | null
  subtotalMO: number | null
  subtotalCIF: number | null
}

type PriceRow = {
  priceList: string
  price: number | null
  currency: string
}

type WarehouseInventoryRow = {
  warehouseCode: string
  warehouseName: string | null
  inStock: number | null
  committed: number | null
  ordered: number | null
  available: number | null
  standardAveragePrice: number | null
}

const USER_FIELDS: FieldDefinition[] = [
  { label: 'Inventariable', key: 'U_Inventariable' },
  { label: 'Área', key: 'U_Area' },
  { label: 'Prefijo', key: 'U_Prefijo' },
  { label: 'Versión', key: 'U_Version' },
  { label: 'Color', key: 'U_Color' },
  { label: 'Línea', key: 'U_Linea' },
  { label: 'Línea orden de fabricación', key: 'U_LineaOF' },
  { label: 'Familia', key: 'U_Familia' },
  { label: 'Tipo OC', key: 'U_TypeOC' },
  { label: 'Molde', key: 'U_Molde' },
  { label: '¿Plano?', key: 'U_Plano' },
  { label: '¿Código de barras?', key: 'U_CodBarras' },
  { label: 'Grupo', key: 'U_Grupo' },
  { label: 'Código MRB', key: 'U_CodigoMRB' },
  { label: 'Garantía', key: 'U_Garantia' },
  { label: 'Código DANE', key: 'U_CodDaneArt' },
  { label: 'Descripción DANE', key: 'U_DescDaneArt', wide: true },
  { label: 'Unidad de medida DANE', key: 'U_UndMedDaneArt' },
  { label: 'Localizaciones de activo fijo', key: 'U_Localizaciones' },
  { label: 'Placa de activo fijo', key: 'U_Placa_Actv' },
  { label: 'Fecha de compra de activo fijo', key: 'U_FCompra_Actv', kind: 'date' },
  { label: 'Fecha de baja de activo fijo', key: 'U_Fbaja_Actv', kind: 'date' },
  { label: 'Altura de apilamiento', key: 'U_AltApilam', kind: 'quantity' },
  { label: 'Máximas unidades a apilar', key: 'U_MaxApilam', kind: 'quantity' },
  { label: 'Partida arancelaria', key: 'U_PArancelaria' },
  { label: 'Descripción de molde', key: 'U_DescMolde', wide: true },
  { label: 'Valor de compra de activo fijo', key: 'U_AFVlorCompra', kind: 'amount' },
  { label: 'Familia TOC', key: 'U_FamiliaToc' },
  { label: 'Artículo TOC', key: 'U_Articulo_TOC' },
  { label: 'Requiere molde', key: 'U_Req_Molde' },
  { label: 'PLU del artículo', key: 'U_PLU' },
  { label: 'SN compra', key: 'U_HBT_TerceroFacPro' },
  { label: 'SN amortización', key: 'U_HBT_TerceroAmorti' },
  { label: 'SN baja', key: 'U_HBT_TerceroBaja' },
  { label: 'Costo necesario de terminación', key: 'U_IFRS_TERM', kind: 'amount' },
  { label: 'Costo necesario de venta', key: 'U_IFRS_VENT', kind: 'amount' },
  { label: 'Costo de marketing', key: 'U_IFRS_MARK', kind: 'amount' },
  { label: '% de garantía', key: 'U_IFRS_GTIA' },
  { label: 'Tiempo de garantía', key: 'U_IFRS_Tiempo' },
  { label: 'Activo padre', key: 'U_IFRS_ActPadre' },
  { label: 'Fecha de vencimiento de póliza', key: 'U_HBT_FecPoliza', kind: 'date' },
  { label: 'Fecha de vencimiento de garantía', key: 'U_HBT_FecVtoGarn', kind: 'date' },
  { label: 'Fecha de mantenimiento', key: 'U_HBT_FecMantto', kind: 'date' },
  { label: 'Tipo de activo', key: 'U_IFRS_TipoAF' },
]

const SAP_TABS = [
  { id: 'general', label: 'General' },
  { id: 'purchases', label: 'Compras' },
  { id: 'sales', label: 'Ventas' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'planning', label: 'Planificación' },
  { id: 'production', label: 'Producción' },
  { id: 'properties', label: 'Propiedades' },
  { id: 'comments', label: 'Comentarios' },
  { id: 'attachments', label: 'Anexos' },
] as const

type SapTabId = (typeof SAP_TABS)[number]['id']

const GENERAL_IDENTIFICATION_FIELDS: FieldDefinition[] = [
  { label: 'Número de artículo', key: 'ItemCode' },
  { label: 'Descripción', key: 'ItemName', wide: true },
  { label: 'Nombre extranjero', key: 'ForeignName', wide: true },
  { label: 'Tipo de artículo', key: 'ItemType', kind: 'enum' },
  { label: 'Grupo de artículos', key: 'ItemsGroupCode' },
  { label: 'Grupo de unidades de medida', key: 'UoMGroupEntry', kind: 'uomGroup' },
  { label: 'Código de barras', key: 'BarCode' },
  { label: 'Código de fabricante', key: 'Manufacturer' },
  { label: 'Activo fijo', key: 'AssetItem', kind: 'boolean' },
]

const GENERAL_STATUS_FIELDS: FieldDefinition[] = [
  { label: 'Activo', key: 'Valid', kind: 'boolean' },
  { label: 'Bloqueado', key: 'Frozen', kind: 'boolean' },
  { label: 'Fecha de inicio de vigencia', key: 'ValidFrom', kind: 'date' },
  { label: 'Fecha final de vigencia', key: 'ValidTo', kind: 'date' },
  { label: 'Creado el', key: 'CreateDate', kind: 'date' },
  { label: 'Actualizado el', key: 'UpdateDate', kind: 'date' },
]

const PURCHASE_FIELDS: FieldDefinition[] = [
  { label: 'Artículo de compra', key: 'PurchaseItem', kind: 'boolean' },
  { label: 'Proveedor principal', key: 'Mainsupplier' },
  { label: 'Código de catálogo del proveedor', key: 'SupplierCatalogNo' },
  { label: 'Unidad de compra', key: 'PurchaseUnit' },
  { label: 'Artículos por unidad', key: 'PurchaseItemsPerUnit', kind: 'quantity' },
  { label: 'Unidad de empaque', key: 'PurchasePackagingUnit' },
  { label: 'Cantidad por empaque', key: 'PurchaseQtyPerPackUnit', kind: 'quantity' },
  { label: 'IVA de compra', key: 'PurchaseVATGroup' },
]

const PURCHASE_DIMENSION_FIELDS: FieldDefinition[] = [
  { label: 'Largo de compra', key: 'PurchaseUnitLength', kind: 'quantity' },
  { label: 'Unidad de largo', key: 'PurchaseLengthUnit' },
  { label: 'Ancho de compra', key: 'PurchaseUnitWidth', kind: 'quantity' },
  { label: 'Unidad de ancho', key: 'PurchaseWidthUnit' },
  { label: 'Alto de compra', key: 'PurchaseUnitHeight', kind: 'quantity' },
  { label: 'Unidad de alto', key: 'PurchaseHeightUnit' },
  { label: 'Peso de compra', key: 'PurchaseUnitWeight', kind: 'quantity' },
  { label: 'Unidad de peso', key: 'PurchaseWeightUnit' },
]

const SALES_FIELDS: FieldDefinition[] = [
  { label: 'Artículo de venta', key: 'SalesItem', kind: 'boolean' },
  { label: 'Unidad de venta', key: 'SalesUnit' },
  { label: 'Artículos por unidad', key: 'SalesItemsPerUnit', kind: 'quantity' },
  { label: 'Unidad de empaque', key: 'SalesPackagingUnit' },
  { label: 'Cantidad por empaque', key: 'SalesQtyPerPackUnit', kind: 'quantity' },
  { label: 'Forma de envío', key: 'ShipType' },
  { label: 'IVA de venta', key: 'SalesVATGroup' },
  { label: 'Sujeto a IVA', key: 'VatLiable', kind: 'boolean' },
  { label: 'Sujeto a retención', key: 'WTLiable', kind: 'boolean' },
  { label: 'Impuesto indirecto', key: 'IndirectTax', kind: 'boolean' },
  { label: 'No aplicar descuentos', key: 'NoDiscounts', kind: 'boolean' },
]

const INVENTORY_FIELDS: FieldDefinition[] = [
  { label: 'Artículo de inventario', key: 'InventoryItem', kind: 'boolean' },
  { label: 'Unidad de inventario', key: 'InventoryUOM' },
  { label: 'Bodega predeterminada', key: 'DefaultWarehouse' },
  { label: 'Inventario actual', key: 'QuantityOnStock', kind: 'quantity' },
  { label: 'Solicitado a proveedores', key: 'QuantityOrderedFromVendors', kind: 'quantity' },
  { label: 'Solicitado por clientes', key: 'QuantityOrderedByCustomers', kind: 'quantity' },
  { label: 'Inventario mínimo', key: 'MinInventory', kind: 'quantity' },
  { label: 'Inventario máximo', key: 'MaxInventory', kind: 'quantity' },
  { label: 'Inventario deseado', key: 'DesiredInventory', kind: 'quantity' },
  { label: 'Gestiona inventario por bodega', key: 'ManageStockByWarehouse', kind: 'boolean' },
  { label: 'Gestionado por números de serie', key: 'ManageSerialNumbers', kind: 'boolean' },
  { label: 'Gestionado por lotes', key: 'ManageBatchNumbers', kind: 'boolean' },
]

const INVENTORY_COST_FIELDS: FieldDefinition[] = [
  { label: 'Método de valoración', key: 'CostAccountingMethod', kind: 'enum' },
  { label: 'Costo promedio móvil', key: 'MovingAveragePrice', kind: 'amount' },
  { label: 'Costo estándar promedio', key: 'AvgStdPrice', kind: 'amount' },
]

const PLANNING_FIELDS: FieldDefinition[] = [
  { label: 'Sistema de planificación', key: 'PlanningSystem', kind: 'enum' },
  { label: 'Método de aprovisionamiento', key: 'ProcurementMethod', kind: 'enum' },
  { label: 'Intervalo de pedido', key: 'OrderIntervals' },
  { label: 'Múltiplo de pedido', key: 'OrderMultiple', kind: 'quantity' },
  { label: 'Tiempo de entrega', key: 'LeadTime', kind: 'quantity' },
  { label: 'Cantidad mínima de pedido', key: 'MinOrderQuantity', kind: 'quantity' },
]

const PRODUCTION_FIELDS: FieldDefinition[] = [
  { label: 'Tipo de LDM', key: 'TreeType', kind: 'enum' },
  { label: 'Método de emisión', key: 'IssueMethod', kind: 'enum' },
  { label: 'Bodega de componentes', key: 'ComponentWarehouse', kind: 'enum' },
  { label: 'Artículo fantasma', key: 'IsPhantom', kind: 'boolean' },
  { label: 'Clase de artículo', key: 'ItemClass', kind: 'enum' },
  { label: 'Tipo de material', key: 'MaterialType', kind: 'enum' },
  { label: 'Grupo de material', key: 'MaterialGroup' },
  { label: 'País o región de origen', key: 'ItemCountryOrg' },
  { label: 'Clasificación estándar', key: 'NCMCode' },
  { label: 'Incluir en cálculo de costos', key: 'InCostRollup', kind: 'boolean' },
]

const COMMENT_FIELDS: FieldDefinition[] = [
  { label: 'Comentarios', key: 'User_Text', wide: true },
  { label: 'Observaciones de vigencia', key: 'ValidRemarks', wide: true },
  { label: 'Observaciones de bloqueo', key: 'FrozenRemarks', wide: true },
]

const SAP_ENUM_LABELS: Record<string, string> = {
  bis_MovingAverage: 'Promedio móvil',
  bom_Buy: 'Comprar',
  bom_Make: 'Fabricar',
  bomcw_BOM: 'Por lista de materiales',
  iNotATree: 'Sin lista de materiales',
  iProductionTree: 'Lista de materiales de producción',
  im_Backflush: 'Automático (backflush)',
  im_Manual: 'Manual',
  itItems: 'Artículo',
  itcMaterial: 'Material',
  bop_MRP: 'MRP',
  mt_FinishedGoods: 'Producto terminado',
}

const PROPERTY_KEYS = Array.from({ length: 64 }, (_, index) => 'Properties' + String(index + 1))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasSapValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ''
}

function sapBoolean(value: unknown): boolean {
  return value === true || value === 'tYES' || value === 'Y' || value === 'SI'
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value)
}

function displayValue(value: unknown): string {
  if (!hasSapValue(value)) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? formatNumber(value, 6) : ''
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  return String(value)
}

function formatSapQuantity(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return displayValue(value)
  return formatNumber(value, 2)
}

function formatSapAmount(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return displayValue(value)
  return formatNumber(value, 6)
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  return [match[3], match[2], match[1]].join('/')
}

function formatEnum(value: unknown): string {
  const raw = displayValue(value)
  return SAP_ENUM_LABELS[raw] ?? raw
}

function itemValue(item: SapItem | null, key: string): string {
  return item ? displayValue(item[key]) : ''
}

function formatFieldValue(item: SapItem, field: FieldDefinition): string {
  const value = item[field.key]
  if (!hasSapValue(value)) return 'Sin dato en SAP'

  switch (field.kind) {
    case 'amount':
      return formatSapAmount(value)
    case 'boolean':
      return sapBoolean(value) ? 'Sí' : 'No'
    case 'date':
      return formatDate(value) || 'Sin dato en SAP'
    case 'enum':
      return formatEnum(value) || 'Sin dato en SAP'
    case 'quantity':
      return formatSapQuantity(value) || 'Sin dato en SAP'
    case 'uomGroup':
      return value === -1 || value === '-1' ? 'Manual' : displayValue(value)
    default:
      return displayValue(value) || 'Sin dato en SAP'
  }
}

function getPriceRows(item: SapItem | null): PriceRow[] {
  if (!item || !Array.isArray(item.ItemPrices)) return []

  const rows = item.ItemPrices.flatMap((entry): PriceRow[] => {
    if (!isRecord(entry) || !hasSapValue(entry.PriceList)) return []
    return [{
      priceList: displayValue(entry.PriceList),
      price: typeof entry.Price === 'number' && Number.isFinite(entry.Price) ? entry.Price : null,
      currency: displayValue(entry.Currency),
    }]
  })

  const rowsWithPrice = rows.filter(row => (row.price !== null && row.price !== 0) || Boolean(row.currency))
  return rowsWithPrice.length > 0 ? rowsWithPrice : rows.slice(0, 1)
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getWarehouseInventoryRows(item: SapItem): WarehouseInventoryRow[] {
  if (!Array.isArray(item.ItemWarehouseInfoCollection)) return []

  return item.ItemWarehouseInfoCollection.flatMap((entry): WarehouseInventoryRow[] => {
    if (!isRecord(entry)) return []

    const warehouseCode = displayValue(entry.WarehouseCode).trim()
    if (!warehouseCode) return []

    const warehouseName = displayValue(entry.WarehouseName).trim() || null

    const inStock = numberValue(entry.InStock)
    const committed = numberValue(entry.Committed)
    const ordered = numberValue(entry.Ordered)
    if ([inStock, committed, ordered].every(value => value === null || value === 0)) return []

    return [{
      warehouseCode,
      warehouseName,
      inStock,
      committed,
      ordered,
      available: inStock === null || committed === null ? null : inStock - committed,
      standardAveragePrice: numberValue(entry.StandardAveragePrice),
    }]
  }).toSorted((left, right) => left.warehouseCode.localeCompare(right.warehouseCode, 'es-CO'))
}

function countBomComponents(node: BomNode): number {
  return node.lines.reduce((total, child) => total + 1 + countBomComponents(child), 0)
}

function formatCost(value: number | null, isPartial: boolean, knownValue: number, maximumFractionDigits = 6): string {
  if (value !== null) return formatNumber(value, maximumFractionDigits)
  if (isPartial && knownValue > 0) return formatNumber(knownValue, maximumFractionDigits) + ' parcial'
  return 'Pendiente'
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) return null
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(durationMs / 1000) + ' s'
}

function formatCostSnapshotDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function formatCacheTtl(seconds: number | null): string | null {
  if (!seconds || seconds < 1) return null
  if (seconds % 86_400 === 0) return String(seconds / 86_400) + ' días'
  if (seconds % 3_600 === 0) return String(seconds / 3_600) + ' h'
  return String(Math.round(seconds / 60)) + ' min'
}

function createPendingCostBomNode(node: FastBomNode): BomNode {
  const lines = node.lines.map(createPendingCostBomNode)
  const pendingCostCount = lines.length === 0 ? 1 : lines.reduce((total, line) => total + line.pendingCostCount, 0)
  return {
    ...node,
    lines,
    bomQuantity: null,
    componentWarehouse: null,
    outputWarehouse: null,
    directCost: {
      unitCost: null,
      source: 'unavailable',
      warehouseCode: null,
      documentEntry: null,
      documentNumber: null,
      documentDate: null,
      warning: null,
    },
    structuralUnitCost: null,
    knownStructuralUnitCost: 0,
    lineSubtotalCost: null,
    knownLineSubtotalCost: 0,
    pendingCostCount,
    isPartial: true,
    costSource: 'unavailable',
    costCategory: 'material',
  }
}

function createCostedBomNode(node: CostedBomNode): BomNode {
  return {
    ...node,
    loaded: true,
    lines: node.lines.map(createCostedBomNode),
  }
}

function replaceBomNodeAtPath(node: BomNode, path: number[], updated: BomNode): BomNode {
  if (path.length === 0) return updated

  const [childIndex, ...remainingPath] = path
  if (!node.lines[childIndex]) return node

  return {
    ...node,
    lines: node.lines.map((child, index) => (
      index === childIndex ? replaceBomNodeAtPath(child, remainingPath, updated) : child
    )),
  }
}

function SectionCard({
  title,
  description,
  children,
  action,
}: {
  title: string
  description?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function FieldGrid({ item, fields }: { item: SapItem; fields: FieldDefinition[] }) {
  return (
    <dl className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {fields.map(field => {
        const value = formatFieldValue(item, field)
        return (
          <div
            key={field.key}
            className={[
              'min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5',
              field.wide ? 'md:col-span-2 xl:col-span-3' : '',
            ].filter(Boolean).join(' ')}
          >
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{field.label}</dt>
            <dd title={value} className="mt-1 break-words text-sm font-medium leading-5 text-slate-900">
              {value}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
      {children}
    </div>
  )
}

function PriceListTable({ rows }: { rows: PriceRow[] }) {
  if (rows.length === 0) {
    return <EmptyPanel>SAP no devolvió listas de precios para este artículo.</EmptyPanel>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[360px] text-left text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Lista</th>
            <th className="px-3 py-2 text-right">Precio</th>
            <th className="px-3 py-2">Moneda</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(row => (
            <tr key={[row.priceList, row.currency, String(row.price)].join('-')} className="bg-white">
              <td className="px-3 py-2 font-medium text-slate-800">{row.priceList}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                {row.price === null ? 'Sin dato en SAP' : formatSapAmount(row.price)}
              </td>
              <td className="px-3 py-2 text-slate-600">{row.currency || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WarehouseInventoryTable({ item }: { item: SapItem }) {
  const rows = getWarehouseInventoryRows(item)
  const totals = rows.reduce(
    (current, row) => ({
      inStock: current.inStock + (row.inStock ?? 0),
      committed: current.committed + (row.committed ?? 0),
      ordered: current.ordered + (row.ordered ?? 0),
      available: current.available + (row.available ?? 0),
    }),
    { inStock: 0, committed: 0, ordered: 0, available: 0 },
  )

  if (rows.length === 0) {
    return <EmptyPanel>SAP no reporta existencias, comprometidos ni pedidos pendientes por bodega para este artículo.</EmptyPanel>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Bodega</th>
            <th className="px-3 py-2 text-right">Costo promedio</th>
            <th className="px-3 py-2 text-right">En existencia</th>
            <th className="px-3 py-2 text-right">Comprometido</th>
            <th className="px-3 py-2 text-right">Solicitado</th>
            <th className="px-3 py-2 text-right">Disponible</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(row => (
            <tr key={row.warehouseCode} className="bg-white">
              <td className="px-3 py-2 text-slate-800">
                <div className="font-mono font-medium">{row.warehouseCode}</div>
                {row.warehouseName ? <div className="mt-0.5 text-xs font-normal text-slate-500">{row.warehouseName}</div> : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-900">{row.standardAveragePrice === null ? 'Sin dato en SAP' : formatSapAmount(row.standardAveragePrice)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-900">{formatSapQuantity(row.inStock)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatSapQuantity(row.committed)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatSapQuantity(row.ordered)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700">{formatSapQuantity(row.available)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
          <tr>
            <td className="px-3 py-2">Total por bodegas</td>
            <td className="px-3 py-2 text-right text-slate-500">{'\u2014'}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatSapQuantity(totals.inStock)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatSapQuantity(totals.committed)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatSapQuantity(totals.ordered)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{formatSapQuantity(totals.available)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function GeneralTab({
  item,
  customFields,
  customFieldsVisible,
  onToggleCustomFields,
}: {
  item: SapItem
  customFields: FieldDefinition[]
  customFieldsVisible: boolean
  onToggleCustomFields: () => void
}) {
  return (
    <div className="space-y-4">
      <SectionCard title="Identificación" description="Datos maestros leídos de SAP para el artículo consultado.">
        <FieldGrid item={item} fields={GENERAL_IDENTIFICATION_FIELDS} />
      </SectionCard>
      <SectionCard title="Estado" description="Vigencia y trazabilidad del registro en SAP.">
        <FieldGrid item={item} fields={GENERAL_STATUS_FIELDS} />
      </SectionCard>
      {customFields.length > 0 ? (
        <SectionCard
          title="Campos propios"
          description={String(customFields.length) + ' campos con información para este artículo.'}
          action={(
            <button
              type="button"
              onClick={onToggleCustomFields}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {customFieldsVisible ? 'Ocultar campos' : 'Ver campos'}
            </button>
          )}
        >
          {customFieldsVisible ? (
            <FieldGrid item={item} fields={customFields} />
          ) : (
            <p className="text-sm text-slate-500">Expande esta sección para revisar los campos específicos que SAP sí reporta.</p>
          )}
        </SectionCard>
      ) : null}
    </div>
  )
}

function PropertiesTab({ activeProperties }: { activeProperties: string[] }) {
  return (
    <SectionCard title="Propiedades" description="Solo se muestran las propiedades activas que devuelve SAP.">
      {activeProperties.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {activeProperties.map(property => (
            <span key={property} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800">
              {property.replace('Properties', 'Propiedad ')}
            </span>
          ))}
        </div>
      ) : (
        <EmptyPanel>Este artículo no tiene propiedades activas reportadas por SAP.</EmptyPanel>
      )}
    </SectionCard>
  )
}

function CommentsTab({ item }: { item: SapItem }) {
  const hasComment = COMMENT_FIELDS.some(field => hasSapValue(item[field.key]))

  return (
    <SectionCard title="Comentarios" description="Observaciones disponibles en los datos maestros de SAP.">
      {hasComment ? <FieldGrid item={item} fields={COMMENT_FIELDS} /> : <EmptyPanel>SAP no reporta comentarios ni observaciones para este artículo.</EmptyPanel>}
    </SectionCard>
  )
}

function AttachmentsTab({ item }: { item: SapItem }) {
  const hasAttachment = hasSapValue(item.AttachmentEntry)

  return (
    <SectionCard title="Anexos" description="Vínculo de anexo registrado en SAP para el artículo consultado.">
      {hasAttachment ? (
        <FieldGrid item={item} fields={[{ label: 'ID de anexo SAP', key: 'AttachmentEntry' }]} />
      ) : (
        <EmptyPanel>Este artículo no tiene un anexo asociado en SAP.</EmptyPanel>
      )}
    </SectionCard>
  )
}

function ItemTabContent({
  activeTab,
  item,
  customFields,
  customFieldsVisible,
  onToggleCustomFields,
  priceRows,
  activeProperties,
}: {
  activeTab: SapTabId
  item: SapItem
  customFields: FieldDefinition[]
  customFieldsVisible: boolean
  onToggleCustomFields: () => void
  priceRows: PriceRow[]
  activeProperties: string[]
}) {
  switch (activeTab) {
    case 'general':
      return (
        <GeneralTab
          item={item}
          customFields={customFields}
          customFieldsVisible={customFieldsVisible}
          onToggleCustomFields={onToggleCustomFields}
        />
      )
    case 'purchases':
      return (
        <div className="space-y-4">
          <SectionCard title="Compras" description="Unidades, proveedor y empaque configurados en SAP.">
            <FieldGrid item={item} fields={PURCHASE_FIELDS} />
          </SectionCard>
          <SectionCard title="Medidas de compra">
            <FieldGrid item={item} fields={PURCHASE_DIMENSION_FIELDS} />
          </SectionCard>
        </div>
      )
    case 'sales':
      return (
        <div className="space-y-4">
          <SectionCard title="Ventas" description="Unidades, impuestos y condiciones comerciales configuradas en SAP.">
            <FieldGrid item={item} fields={SALES_FIELDS} />
          </SectionCard>
          <SectionCard title="Listas de precios" description="Se muestran las listas con precio o moneda informada por SAP.">
            <PriceListTable rows={priceRows} />
          </SectionCard>
        </div>
      )
    case 'inventory':
      return (
        <div className="space-y-4">
          <SectionCard title="Inventario" description="Existencias y parámetros de inventario de la consulta actual.">
            <FieldGrid item={item} fields={INVENTORY_FIELDS} />
          </SectionCard>
          <SectionCard title="Existencias por bodega" description="Saldo actual distribuido por bodega. Disponible = existencia menos comprometido.">
            <WarehouseInventoryTable item={item} />
          </SectionCard>
          <SectionCard title="Costos">
            <FieldGrid item={item} fields={INVENTORY_COST_FIELDS} />
          </SectionCard>
        </div>
      )
    case 'planning':
      return (
        <SectionCard title="Planificación" description="Parámetros MRP y de aprovisionamiento leídos de SAP.">
          <FieldGrid item={item} fields={PLANNING_FIELDS} />
        </SectionCard>
      )
    case 'production':
      return (
        <SectionCard title="Producción" description="Configuración productiva del artículo y su lista de materiales.">
          <FieldGrid item={item} fields={PRODUCTION_FIELDS} />
        </SectionCard>
      )
    case 'properties':
      return <PropertiesTab activeProperties={activeProperties} />
    case 'comments':
      return <CommentsTab item={item} />
    case 'attachments':
      return <AttachmentsTab item={item} />
  }
}

function MasterDataPanel({
  item,
  activeCode,
  activeTab,
  onSelectTab,
  customFields,
  customFieldsVisible,
  onToggleCustomFields,
  priceRows,
  activeProperties,
}: {
  item: SapItem | null
  activeCode: string
  activeTab: SapTabId
  onSelectTab: (tab: SapTabId) => void
  customFields: FieldDefinition[]
  customFieldsVisible: boolean
  onToggleCustomFields: () => void
  priceRows: PriceRow[]
  activeProperties: string[]
}) {
  const itemName = itemValue(item, 'ItemName')
  const inventoryUom = itemValue(item, 'InventoryUOM')

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Datos maestros de artículo</p>
            <h1 className="mt-1 break-words text-lg font-bold tracking-tight text-slate-900">{activeCode || 'Sin artículo consultado'}</h1>
            {itemName ? <p className="mt-1 max-w-4xl break-words text-sm text-slate-600">{itemName}</p> : null}
          </div>
          {item ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Datos leídos de SAP{inventoryUom ? ' · ' + inventoryUom : ''}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Esperando una consulta</span>
          )}
        </div>
      </div>

      {item ? (
        <>
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
            <div role="tablist" aria-label="Secciones de datos maestros" className="flex gap-1 overflow-x-auto">
              {SAP_TABS.map(tab => {
                const isActive = tab.id === activeTab
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={'sap-tab-' + tab.id}
                    aria-controls={'sap-panel-' + tab.id}
                    aria-selected={isActive}
                    onClick={() => onSelectTab(tab.id)}
                    className={[
                      'shrink-0 rounded-md px-3 py-2 text-sm font-medium transition',
                      isActive
                        ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900',
                    ].join(' ')}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div
            id={'sap-panel-' + activeTab}
            role="tabpanel"
            aria-labelledby={'sap-tab-' + activeTab}
            tabIndex={0}
            className="bg-slate-50 p-4 sm:p-6"
          >
            <ItemTabContent
              activeTab={activeTab}
              item={item}
              customFields={customFields}
              customFieldsVisible={customFieldsVisible}
              onToggleCustomFields={onToggleCustomFields}
              priceRows={priceRows}
              activeProperties={activeProperties}
            />
          </div>
        </>
      ) : (
        <div className="p-6">
          <EmptyPanel>Ingresa un número de artículo y selecciona Consultar para visualizar sus datos maestros.</EmptyPanel>
        </div>
      )}
    </section>
  )
}

function BomRowView({
  node,
  path,
  depth = 0,
  costsReady,
  onLoadChildren,
  onNodeUpdated,
}: {
  node: BomNode
  path: number[]
  depth?: number
  costsReady: boolean
  onLoadChildren: (itemCode: string) => Promise<FastBomNode[] | null>
  onNodeUpdated: (path: number[], updated: BomNode) => void
}) {
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(depth === 0)
  const canExpand = !node.loaded || node.lines.length > 0

  async function handleToggle() {
    if (!node.loaded && !loading) {
      setLoading(true)
      setLocalError(null)
      try {
        const children = await onLoadChildren(node.itemCode)
        if (children === null) {
          setLocalError('No se pudo consultar la sub-LdM.')
          return
        }

        onNodeUpdated(path, {
          ...node,
          lines: children.map(createPendingCostBomNode),
          loaded: true,
        })
        if (children.length === 0) {
          setLocalError('Sin sub-LdM.')
          return
        }

        setExpanded(true)
      } finally {
        setLoading(false)
      }
      return
    }

    setExpanded(previous => !previous)
  }

  const rowColumns = costsReady
    ? 'grid min-w-[1390px] grid-cols-[minmax(220px,1fr)_minmax(300px,2fr)_82px_64px_110px_130px_130px_130px_130px]'
    : 'grid min-w-[680px] grid-cols-[minmax(175px,0.9fr)_minmax(260px,2fr)_96px_72px]'

  return (
    <div>
      <div className={[
        rowColumns,
        'items-center border-b border-slate-100 text-sm',
        depth === 0 ? 'bg-indigo-50 font-semibold' : 'bg-white hover:bg-slate-50',
      ].join(' ')}>
        <div className="flex min-w-0 items-center gap-1.5 py-2" style={{ paddingLeft: 16 + depth * 18 }}>
          <span className="flex size-5 shrink-0 items-center justify-center">
            {loading ? (
              <Loader2 className="size-4 animate-spin text-slate-400" />
            ) : canExpand ? (
              <button
                type="button"
                onClick={() => void handleToggle()}
                aria-label={expanded ? 'Contraer ' + node.itemCode : 'Expandir ' + node.itemCode}
                className="flex size-5 items-center justify-center rounded text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
              >
                {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            ) : null}
          </span>
          <span title={node.itemCode} className="shrink-0 whitespace-nowrap font-mono text-xs text-slate-800">{node.itemCode}</span>
        </div>
        <div title={node.itemName} className="min-w-0 break-words px-3 py-2 leading-5 text-slate-600">
          {node.itemName || 'Sin descripción en SAP'}
          {localError ? <span className="ml-2 text-xs font-medium text-amber-700">({localError})</span> : null}
        </div>
        <div className="px-3 py-2 text-right tabular-nums text-slate-800">{formatSapQuantity(node.quantity)}</div>
          <div className="px-3 py-2 text-center text-slate-600">{node.inventoryUom || '—'}</div>
          {costsReady ? <>
          <div className="px-3 py-2 text-center text-xs font-medium text-slate-600">{node.costCategory === 'mo' ? 'MO' : node.costCategory.toUpperCase()}</div>
          <div className={['px-3 py-2 text-right tabular-nums', node.isPartial ? 'text-amber-700' : 'text-slate-900'].join(' ')}>{formatCost(node.structuralUnitCost, node.isPartial, node.knownStructuralUnitCost, depth === 0 ? 2 : 6)}</div>
          <div className="px-3 py-2 text-right tabular-nums text-slate-700">{node.level === 1 || node.lines.length > 0 ? '—' : node.costCategory === 'material' || node.costCategory === 'packaging' ? formatNumber(node.knownLineSubtotalCost, 2) : '—'}</div>
          <div className="px-3 py-2 text-right tabular-nums text-slate-700">{node.level === 1 || node.lines.length > 0 || node.costCategory !== 'mo' ? '—' : formatNumber(node.knownLineSubtotalCost, 2)}</div>
          <div className="px-3 py-2 text-right tabular-nums text-slate-700">{node.level === 1 || node.lines.length > 0 || node.costCategory !== 'cif' ? '—' : formatNumber(node.knownLineSubtotalCost, 2)}</div>
        </> : null}
      </div>
      {expanded && node.lines.length > 0 ? (
        <div>
          {node.lines.map((child, index) => {
            const childPath = [...path, index]
            return <BomRowView
              key={childPath.join('-')}
              node={child}
              path={childPath}
              depth={depth + 1}
              costsReady={costsReady}
              onLoadChildren={onLoadChildren}
              onNodeUpdated={onNodeUpdated}
            />
          })}
        </div>
      ) : null}
    </div>
  )
}

function BomPanel({
  activeCode,
  bomTree,
  bomLoading,
  bomError,
  structureDurationMs,
  costDurationMs,
  costsAsOf,
  costCacheTtlSeconds,
  costLoading,
  costsReady,
  exportLoading,
  copyFeedback,
  onDownload,
  onCopy,
  onRefreshCosts,
  onLoadChildren,
  onNodeUpdated,
  exportRows,
  pricingFormulaConfig,
}: {
  activeCode: string
  bomTree: BomNode | null
  bomLoading: boolean
  bomError: string | null
  structureDurationMs: number | null
  costDurationMs: number | null
  costsAsOf: string | null
  costCacheTtlSeconds: number | null
  costLoading: boolean
  costsReady: boolean
  exportLoading: boolean
  copyFeedback: string | null
  onDownload: (mcPct: number, discountPct: number) => void
  onCopy: () => void
  onRefreshCosts: () => void
  onLoadChildren: (itemCode: string) => Promise<FastBomNode[] | null>
  onNodeUpdated: (path: number[], updated: BomNode) => void
  exportRows: CostedBomExportRow[]
  pricingFormulaConfig: SalesPricingFormulaConfig
}) {
  const [mcPct, setMcPct] = useState(40)
  const [discountPct, setDiscountPct] = useState(0)
  const componentWarehouses = bomTree
    ? [...new Set(bomTree.lines.flatMap(line => line.componentWarehouse ? [line.componentWarehouse] : []))]
    : []
  const structureDuration = formatDuration(structureDurationMs)
  const costDuration = formatDuration(costDurationMs)
  const costSnapshotDate = formatCostSnapshotDate(costsAsOf)
  const costCacheTtl = formatCacheTtl(costCacheTtlSeconds)
  const categoryTotals = useMemo(() => ({
    mp: exportRows.reduce((total, row) => total + (row.subtotalMP ?? 0), 0),
    mo: exportRows.reduce((total, row) => total + (row.subtotalMO ?? 0), 0),
    cif: exportRows.reduce((total, row) => total + (row.subtotalCIF ?? 0), 0),
  }), [exportRows])
  const pricing = mcPct > 0 && mcPct < 100 && discountPct >= 0 && discountPct < 100
    ? evaluateSalesPricing(pricingFormulaConfig, { materialCost: categoryTotals.mp, expandedCost: categoryTotals.mp + categoryTotals.mo + categoryTotals.cif, mcPct: mcPct / 100, discountPct: discountPct / 100 })
    : null

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lista de materiales</p>
          <h1 className="mt-1 text-lg font-bold tracking-tight text-slate-900">{activeCode}</h1>
        </div>
        {bomTree ? <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{String(countBomComponents(bomTree)) + ' componentes cargados'}</span>
          {costsReady ? <>
            <button type="button" onClick={onCopy} disabled={exportLoading} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"><Copy className="size-3.5" /> Copiar para Excel</button>
            <button type="button" onClick={() => onDownload(mcPct, discountPct)} disabled={exportLoading || pricing === null} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">{exportLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Descargar Excel</button>
          </> : null}
          <button type="button" onClick={onRefreshCosts} disabled={costLoading || bomLoading || exportLoading} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">{costLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{costsReady ? 'Actualizar costos' : 'Encontrar costos'}</button>
        </div> : null}
      </div>

      {bomLoading && !bomTree ? (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
          <Loader2 className="size-5 animate-spin" />
          Consultando lista de materiales…
        </div>
      ) : null}

      {!bomLoading && bomError ? (
        <div className="flex items-start gap-2 p-6 text-sm text-amber-800">
          <X className="mt-0.5 size-4 shrink-0" />
          <span>{bomError}</span>
        </div>
      ) : null}

      {bomTree ? <>
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:px-6">
          {costLoading ? <><Loader2 className="mr-2 inline size-4 animate-spin text-indigo-600" /><span className="font-semibold text-slate-900">Calculando costos con MP-01 en segundo plano...</span><span className="ml-2 text-xs text-slate-500">Puedes desplegar y revisar la LdM mientras tanto.</span></> : costsReady ? <>
            <span className="font-semibold text-slate-900">Costo {bomTree.isPartial ? 'parcial' : 'total'} por unidad final: </span>
            <span className={bomTree.isPartial ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>{formatCost(bomTree.structuralUnitCost, bomTree.isPartial, bomTree.knownStructuralUnitCost, 2)}</span>
            {bomTree.isPartial ? <span className="ml-2 text-xs text-amber-700">({bomTree.pendingCostCount} costos pendientes)</span> : null}
          </> : <span className="font-semibold text-slate-900">Costos pendientes de calcular.</span>}
          {structureDuration ? <span className="ml-3 text-xs text-slate-500">LdM: {structureDuration}</span> : null}
          {costDuration ? <span className="ml-3 text-xs text-slate-500">Costos: {costDuration}</span> : null}
          {copyFeedback ? <span role="status" className="ml-3 text-xs font-medium text-emerald-700">{copyFeedback}</span> : null}
        </div>
        {costsReady ? <div className="grid gap-3 border-b border-slate-200 bg-white p-4 sm:grid-cols-4 sm:px-6">
          {[['Total general', categoryTotals.mp + categoryTotals.mo + categoryTotals.cif], ['MP', categoryTotals.mp], ['MO', categoryTotals.mo], ['CIF', categoryTotals.cif]].map(([label, total]) => <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatNumber(Number(total), 2)}</p></div>)}
        </div> : null}
        {costsReady ? <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-[auto_auto_1fr] sm:items-end sm:px-6">
          <label className="grid gap-1 font-semibold text-slate-700">MC %<input type="number" min="0.01" max="99.99" step="0.01" value={mcPct} onChange={event => setMcPct(Number(event.target.value))} className="h-9 w-28 rounded border border-slate-300 bg-white px-2 font-normal" /></label>
          <label className="grid gap-1 font-semibold text-slate-700">Descuento %<input type="number" min="0" max="99.99" step="0.01" value={discountPct} onChange={event => setDiscountPct(Number(event.target.value))} className="h-9 w-28 rounded border border-slate-300 bg-white px-2 font-normal" /></label>
          <div className="text-slate-700">{pricing ? <><span className="font-semibold">Pricing:</span> mínimo {formatNumber(pricing.minimumPrice, 2)} · máximo {formatNumber(pricing.maximumPrice, 2)} · PVP {formatNumber(pricing.pvp, 2)}</> : <span className="text-amber-700">MC debe ser mayor que 0 y ambos porcentajes menores que 100.</span>}</div>
        </div> : null}
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600 sm:px-6">
          {costsReady ? <>
            <span><span className="font-semibold text-slate-800">Componentes descargan de:</span> {componentWarehouses.length > 0 ? componentWarehouses.join(', ') : 'Sin bodega configurada en SAP'}</span>
            <span><span className="font-semibold text-slate-800">Unidad final se registra en:</span> {bomTree.outputWarehouse ?? 'Sin bodega configurada en SAP'}</span>
            <span className="text-slate-500">{costSnapshotDate
            ? <>Costos temporales: promedio MP-01 consultado el {costSnapshotDate}{costCacheTtl ? `; caché máximo ${costCacheTtl}.` : '.'}</>
            : 'Costos temporales: promedio vigente de MP-01.'}</span>
          </> : <span>La estructura está disponible de inmediato. El costeo, bodegas operativas y Excel aparecen al terminar el análisis.</span>}
        </div>
        <div className="overflow-x-auto">
          <div className={[
            'grid border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500',
            costsReady
              ? 'min-w-[1390px] grid-cols-[minmax(220px,1fr)_minmax(300px,2fr)_82px_64px_110px_130px_130px_130px_130px]'
              : 'min-w-[680px] grid-cols-[minmax(175px,0.9fr)_minmax(260px,2fr)_96px_72px]',
          ].join(' ')}>
            <span className="px-4 py-2.5">Código</span>
            <span className="px-3 py-2.5">Descripción</span>
            <span className="px-3 py-2.5 text-right">CANT.</span>
            <span className="px-3 py-2.5 text-center">UN</span>
            {costsReady ? <>
               <span className="px-3 py-2.5 text-center">Categoría</span>
               <span className="px-3 py-2.5 text-right">Costo und.</span>
               <span className="px-3 py-2.5 text-right">Sub MP</span>
               <span className="px-3 py-2.5 text-right">Sub MO</span>
               <span className="px-3 py-2.5 text-right">Sub CIF</span>
            </> : null}
          </div>
          <BomRowView node={bomTree} path={[]} costsReady={costsReady} onLoadChildren={onLoadChildren} onNodeUpdated={onNodeUpdated} />
        </div>
      </> : null}
    </section>
  )
}

function SearchResultsPanel({
  results,
  hasMore,
  loading,
  onSelect,
  onLoadMore,
}: {
  results: SearchResult[]
  hasMore: boolean
  loading: boolean
  onSelect: (result: SearchResult) => void
  onLoadMore: () => void
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resultados SAP</p>
          <p className="mt-1 text-sm text-slate-600">Selecciona un artículo para consultar sus datos maestros.</p>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
          {results.length} resultado{results.length === 1 ? '' : 's'} cargado{results.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading && results.length === 0 ? (
        <div role="status" aria-live="polite" className="flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-600">
          <Loader2 className="size-7 animate-spin text-indigo-600" />
          <div>
            <p className="font-semibold text-slate-800">Buscando resultado en SAP...</p>
            <p className="mt-1 text-xs text-slate-500">La consulta puede tardar unos segundos según los criterios ingresados.</p>
          </div>
        </div>
      ) : results.length === 0 ? (
        <div className="p-6 text-sm text-slate-500">SAP no devolvió artículos que coincidan con la búsqueda.</div>
      ) : (
        <div role="listbox" aria-label="Artículos encontrados en SAP" className="divide-y divide-slate-100">
          {results.map(result => (
            <button
              key={result.itemCode}
              type="button"
              role="option"
              aria-selected={false}
              aria-label={result.itemCode + ' ' + result.itemName}
              onClick={() => onSelect(result)}
              disabled={loading}
              className="grid w-full gap-1 px-4 py-3 text-left transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 sm:grid-cols-[minmax(220px,0.8fr)_minmax(0,2fr)] sm:gap-4 sm:px-6"
            >
              <span className="truncate font-mono text-sm font-semibold text-slate-900">{result.itemCode}</span>
              <span className="truncate text-sm text-slate-600">{result.itemName || 'Sin descripción en SAP'}</span>
            </button>
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-center border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Cargar 20 resultados más
          </button>
        </div>
      ) : null}
    </section>
  )
}

export function ConsultaSapClient({ initialCode, initialItem, initialError }: ConsultaSapClientProps) {
  const initialResult = initialItem
    ? {
        itemCode: itemValue(initialItem, 'ItemCode') || initialCode,
        itemName: itemValue(initialItem, 'ItemName'),
      }
    : null
  const [code, setCode] = useState(initialCode)
  const [description, setDescription] = useState(itemValue(initialItem, 'ItemName'))
  const [colorCode, setColorCode] = useState('')
  const [colorOptions, setColorOptions] = useState<ColorOption[]>([])
  const [colorError, setColorError] = useState<string | null>(null)
  const [lastSearchCriteria, setLastSearchCriteria] = useState<SearchCriteria>({
    code: '',
    description: '',
    color: '',
  })
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchHasMore, setSearchHasMore] = useState(false)
  const [searchSkip, setSearchSkip] = useState(0)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(initialResult)
  const [item, setItem] = useState<SapItem | null>(initialItem)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [bomTree, setBomTree] = useState<BomNode | null>(null)
  const [bomLoading, setBomLoading] = useState(false)
  const [bomCostLoading, setBomCostLoading] = useState(false)
  const [bomCostsReady, setBomCostsReady] = useState(false)
  const [bomError, setBomError] = useState<string | null>(null)
  const [bomStructureDurationMs, setBomStructureDurationMs] = useState<number | null>(null)
  const [bomCostDurationMs, setBomCostDurationMs] = useState<number | null>(null)
  const [bomCostsAsOf, setBomCostsAsOf] = useState<string | null>(null)
  const [bomCostCacheTtlSeconds, setBomCostCacheTtlSeconds] = useState<number | null>(null)
  const [bomExportRows, setBomExportRows] = useState<CostedBomExportRow[]>([])
  const [bomPricingFormulaConfig, setBomPricingFormulaConfig] = useState<SalesPricingFormulaConfig>(DEFAULT_SALES_PRICING_FORMULAS)
  const [bomExportLoading, setBomExportLoading] = useState(false)
  const [bomCopyFeedback, setBomCopyFeedback] = useState<string | null>(null)
  const [showBom, setShowBom] = useState(false)
  const [activeTab, setActiveTab] = useState<SapTabId>('general')
  const [customFieldsVisible, setCustomFieldsVisible] = useState(false)
  const [consultaMode, setConsultaMode] = useState<ConsultaMode>('items')
  const bomRequestSequenceRef = useRef(0)
  const costRequestSequenceRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    async function loadColorOptions() {
      try {
        const response = await fetch('/api/sap/items/colors', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        })
        const payload = await response.json() as SapApiColorsResponse

        if (!response.ok || !payload.success) {
          if (!cancelled) setColorError(payload.success ? 'No se pudo cargar el catálogo de colores.' : payload.error)
          return
        }

        if (!cancelled) setColorOptions(payload.colors)
      } catch (fetchError: unknown) {
        if (!cancelled) {
          setColorError(fetchError instanceof Error ? fetchError.message : 'No se pudo cargar el catálogo de colores.')
        }
      }
    }

    void loadColorOptions()
    return () => {
      cancelled = true
    }
  }, [])

  const activeCode = itemValue(item, 'ItemCode') || selectedResult?.itemCode || ''
  const isViewingItem = Boolean(selectedResult)
  const searchControlsLocked = isViewingItem || loading || searchLoading
  const customFields = useMemo(
    () => USER_FIELDS.filter(field => hasSapValue(item?.[field.key])),
    [item]
  )
  const priceRows = useMemo(() => getPriceRows(item), [item])
  const activeProperties = useMemo(
    () => PROPERTY_KEYS.filter(property => sapBoolean(item?.[property])),
    [item]
  )

  function resetBom() {
    bomRequestSequenceRef.current += 1
    costRequestSequenceRef.current += 1
    setShowBom(false)
    setBomTree(null)
    setBomCostLoading(false)
    setBomCostsReady(false)
    setBomError(null)
    setBomStructureDurationMs(null)
    setBomCostDurationMs(null)
    setBomCostsAsOf(null)
    setBomCostCacheTtlSeconds(null)
    setBomExportRows([])
    setBomPricingFormulaConfig(DEFAULT_SALES_PRICING_FORMULAS)
    setBomCopyFeedback(null)
  }

  async function loadItem(result: SearchResult, preserveSelection: boolean) {
    const nextCode = result.itemCode
    const normalizedCode = nextCode.trim()
    if (!normalizedCode) {
      setItem(null)
      setError('Ingresa un número de artículo para consultar SAP.')
      return
    }

    setLoading(true)
    setError(null)
    if (!preserveSelection) {
      setItem(null)
      setSelectedResult(null)
    }
    setCode(normalizedCode)
    setActiveTab('general')
    setCustomFieldsVisible(false)
    resetBom()

    try {
      const response = await fetch('/api/sap/items/' + encodeURIComponent(normalizedCode) + '?includeWarehouseNames=true', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      const payload = await response.json() as SapApiItemResponse

      if (!response.ok || !payload.success) {
        setError(payload.success ? 'No se pudo consultar SAP.' : payload.error)
        return
      }

      const resolvedResult = {
        itemCode: itemValue(payload.item, 'ItemCode') || normalizedCode,
        itemName: itemValue(payload.item, 'ItemName') || result.itemName,
      }
      setItem(payload.item)
      setSelectedResult(resolvedResult)
      setCode(resolvedResult.itemCode)
      setDescription(resolvedResult.itemName)
    } catch (fetchError: unknown) {
      setError(fetchError instanceof Error ? fetchError.message : 'No se pudo consultar SAP.')
      if (!preserveSelection) {
        setItem(null)
        setSelectedResult(null)
      }
    } finally {
      setLoading(false)
    }
  }

  async function searchItems(append: boolean) {
    const normalizedCode = code.trim()
    const normalizedDescription = description.trim()
    const normalizedColor = colorCode.trim().toUpperCase()
    if (!normalizedCode && !normalizedDescription && !normalizedColor) {
      setSearchError('Ingresa un número, una descripción, un color o combina varios criterios para buscar en SAP.')
      return
    }

    if (!append) {
      setLastSearchCriteria({
        code: normalizedCode,
        description: normalizedDescription,
        color: normalizedColor,
      })
    }

    const nextSkip = append ? searchSkip : 0
    setSearchLoading(true)
    setSearchError(null)
    setError(null)
    setHasSearched(true)

    if (!append) {
      setSearchResults([])
      setSearchHasMore(false)
      setSearchSkip(0)
      setItem(null)
      setSelectedResult(null)
      resetBom()
    }

    try {
      const params = new URLSearchParams({
        code: normalizedCode,
        description: normalizedDescription,
        color: normalizedColor,
        skip: String(nextSkip),
      })
      const response = await fetch('/api/sap/items/search?' + params.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      const payload = await response.json() as SapApiSearchResponse

      if (!response.ok || !payload.success) {
        setSearchError(payload.success ? 'No se pudo buscar en SAP.' : payload.error)
        return
      }

      setSearchResults(previous => append ? [...previous, ...payload.items] : payload.items)
      setSearchHasMore(payload.hasMore)
      setSearchSkip(payload.nextSkip ?? nextSkip + payload.items.length)
    } catch (fetchError: unknown) {
      setSearchError(fetchError instanceof Error ? fetchError.message : 'No se pudo buscar en SAP.')
    } finally {
      setSearchLoading(false)
    }
  }

  async function fetchBomCosts(codeToFetch: string, bomRequestId: number, refreshCosts: boolean) {
    const costRequestId = costRequestSequenceRef.current + 1
    costRequestSequenceRef.current = costRequestId
    const costStartedAt = performance.now()
    setBomCostLoading(true)
    setBomError(null)
    setBomCostDurationMs(null)

    if (!refreshCosts) {
      setBomCostsReady(false)
      setBomCostsAsOf(null)
      setBomCostCacheTtlSeconds(null)
      setBomExportRows([])
    }

    try {
      const costResponse = await fetch('/api/sap/items/' + encodeURIComponent(codeToFetch) + '/bom-costed', {
        method: refreshCosts ? 'POST' : 'GET',
        headers: { Accept: 'application/json' },
      })
      const costPayload = await costResponse.json() as BomApiResponse
      if (!costResponse.ok || !costPayload.success || !costPayload.hasBom) {
        if (bomRequestSequenceRef.current === bomRequestId && costRequestSequenceRef.current === costRequestId) {
          setBomError(costPayload.success ? 'La LdM se cargó, pero no fue posible calcular sus costos.' : costPayload.error)
        }
        return
      }

      if (bomRequestSequenceRef.current !== bomRequestId || costRequestSequenceRef.current !== costRequestId) return

      setBomTree(createCostedBomNode(costPayload.tree))
      setBomExportRows(costPayload.rows)
      setBomPricingFormulaConfig(costPayload.pricingFormulaConfig)
      setBomCostsAsOf(costPayload.costsAsOf)
      setBomCostCacheTtlSeconds(costPayload.costCacheTtlSeconds)
      setBomCostDurationMs(Math.round(performance.now() - costStartedAt))
      setBomCostsReady(true)
    } catch (costError: unknown) {
      if (bomRequestSequenceRef.current === bomRequestId && costRequestSequenceRef.current === costRequestId) {
        setBomError(costError instanceof Error ? 'La LdM se cargó, pero no fue posible calcular sus costos: ' + costError.message : 'La LdM se cargó, pero no fue posible calcular sus costos.')
      }
    } finally {
      if (bomRequestSequenceRef.current === bomRequestId && costRequestSequenceRef.current === costRequestId) {
        setBomCostLoading(false)
      }
    }
  }

  async function fetchBom() {
    const codeToFetch = activeCode
    if (!codeToFetch) return

    const bomRequestId = bomRequestSequenceRef.current + 1
    bomRequestSequenceRef.current = bomRequestId
    costRequestSequenceRef.current += 1
    const structureStartedAt = performance.now()
    setBomLoading(true)
    setBomCostLoading(false)
    setBomCostsReady(false)
    setBomError(null)
    setBomStructureDurationMs(null)
    setBomCostDurationMs(null)
    setBomCostsAsOf(null)
    setBomCostCacheTtlSeconds(null)
    setBomExportRows([])
    setBomPricingFormulaConfig(DEFAULT_SALES_PRICING_FORMULAS)

    try {
      const response = await fetch('/api/sap/items/' + encodeURIComponent(codeToFetch) + '/bom', {
        headers: { Accept: 'application/json' },
      })
      const payload = await response.json() as FastBomApiResponse

      if (bomRequestSequenceRef.current !== bomRequestId) return

      if (!response.ok || !payload.success) {
        setBomTree(null)
        setBomError(payload.success ? 'No se pudo consultar la lista de materiales.' : payload.error)
        return
      }

      if (!payload.hasBom) {
        setBomTree(null)
        setBomError('Este artículo no tiene lista de materiales en SAP.')
        return
      }

      setBomTree(createPendingCostBomNode(payload.tree))
      setBomStructureDurationMs(Math.round(performance.now() - structureStartedAt))
      window.setTimeout(() => {
        if (bomRequestSequenceRef.current === bomRequestId) {
          void fetchBomCosts(codeToFetch, bomRequestId, false)
        }
      }, 0)
    } catch (fetchError: unknown) {
      if (bomRequestSequenceRef.current === bomRequestId) {
        setBomTree(null)
        setBomError(fetchError instanceof Error ? fetchError.message : 'No se pudo consultar la lista de materiales.')
      }
    } finally {
      if (bomRequestSequenceRef.current === bomRequestId) setBomLoading(false)
    }
  }

  async function loadBomChildren(itemCode: string): Promise<FastBomNode[] | null> {
    try {
      const response = await fetch('/api/sap/items/' + encodeURIComponent(itemCode) + '/bom?children=true', {
        headers: { Accept: 'application/json' },
      })
      const payload = await response.json() as BomChildrenResponse
      if (!response.ok || !payload.success) return null
      return payload.lines
    } catch {
      return null
    }
  }

  function handleBomNodeUpdated(path: number[], updated: BomNode) {
    setBomTree(current => current ? replaceBomNodeAtPath(current, path, updated) : current)
  }

  function handleRefreshBomCosts() {
    if (!activeCode || !bomTree) return
    void fetchBomCosts(activeCode, bomRequestSequenceRef.current, true)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void searchItems(false)
  }

  function handleBackToList() {
    setItem(null)
    setSelectedResult(null)
    setCode(lastSearchCriteria.code)
    setDescription(lastSearchCriteria.description)
    setColorCode(lastSearchCriteria.color)
    setError(null)
    setSearchError(null)
    setActiveTab('general')
    setCustomFieldsVisible(false)
    resetBom()
  }

  function handleBomToggle() {
    if (showBom) {
      setShowBom(false)
      setBomError(null)
      return
    }

    if (bomTree && bomTree.itemCode === activeCode) {
      setShowBom(true)
      return
    }

    setShowBom(true)
    void fetchBom()
  }

  async function handleDownloadBom(mcPct: number, discountPct: number) {
    if (!activeCode) return
    setBomExportLoading(true)
    setBomCopyFeedback(null)
    try {
      const params = new URLSearchParams({ mcPct: String(mcPct), discountPct: String(discountPct) })
      const response = await fetch('/api/sap/items/' + encodeURIComponent(activeCode) + '/bom-costed/export-estimation?' + params.toString())
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error ?? 'No se pudo generar el Excel de la LdM.')
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `LdM_Costeo_${activeCode}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      setBomCopyFeedback('Excel descargado.')
    } catch (downloadError: unknown) {
      setBomCopyFeedback(downloadError instanceof Error ? downloadError.message : 'No se pudo descargar el Excel.')
    } finally {
      setBomExportLoading(false)
    }
  }

  async function handleCopyBom() {
    if (bomExportRows.length === 0) return
    const rows: EstimationBomExportRow[] = bomExportRows.map((row, index) => ({
      id: String(index),
      parentId: null,
      level: row.level,
      itemCode: row.itemCode,
      itemName: row.itemName,
      costCategory: row.level === 1 ? '' : row.costCategory === 'mo' ? 'Mano de obra' : row.costCategory === 'cif' ? 'CIF' : row.costCategory === 'packaging' ? 'Empaque' : 'Material',
      quantity: row.quantity,
      uom: row.inventoryUom ?? '',
      unitCost: row.unitCost,
      subtotalMP: row.subtotalMP,
      subtotalMO: row.subtotalMO,
      subtotalCIF: row.subtotalCIF,
      isContainer: false,
    }))
    const text = buildEstimationBomClipboardText(rows)
    try {
      await navigator.clipboard.writeText(text)
      setBomCopyFeedback('LdM copiada. Pégala directamente en Excel.')
    } catch {
      setBomCopyFeedback('El navegador no permitió copiar automáticamente. Usa Descargar Excel.')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <div role="tablist" aria-label="Dominio de consulta SAP" className="flex overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {CONSULTA_MODES.map(mode => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={consultaMode === mode.id}
              onClick={() => setConsultaMode(mode.id)}
              className={[
                'shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold transition',
                consultaMode === mode.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              ].join(' ')}
            >
              {mode.label}
            </button>
          ))}
        </div>
        {consultaMode === 'items' ? <>
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.2fr)_minmax(180px,0.8fr)_auto] lg:items-end">
            <label className="grid min-w-0 flex-1 gap-1.5">
              <span className="text-sm font-semibold text-slate-800">Número de artículo</span>
              <input
                value={code}
                onChange={event => setCode(event.target.value.toUpperCase())}
                disabled={searchControlsLocked}
                className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="VBAN12-0012-000-0458"
                aria-label="Número de artículo SAP"
              />
            </label>
            <label className="grid min-w-0 gap-1.5">
              <span className="text-sm font-semibold text-slate-800">Descripción del artículo</span>
              <input
                value={description}
                onChange={event => setDescription(event.target.value)}
                disabled={searchControlsLocked}
                className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="MUEBLE MACAO CLASS 63X48"
                aria-label="Descripción del artículo SAP"
              />
            </label>
            <label className="grid min-w-0 gap-1.5">
              <span className="text-sm font-semibold text-slate-800">Color</span>
              <select
                value={colorCode}
                onChange={event => setColorCode(event.target.value)}
                disabled={searchControlsLocked}
                aria-label="Color SAP"
                className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">Todos los colores</option>
                {colorOptions.map(color => (
                  <option key={color.code} value={color.code}>
                    {color.code}{color.name ? ' - ' + color.name : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={searchControlsLocked}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {searchLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Consultar
              </button>
              <button
                type="button"
                disabled={!selectedResult || loading || searchLoading}
                onClick={() => selectedResult ? void loadItem(selectedResult, true) : undefined}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className="size-4" />
                Actualizar
              </button>
              {selectedResult ? (
                <button
                  type="button"
                  disabled={loading || bomLoading}
                  onClick={handleBackToList}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ArrowLeft className="size-4" />
                  Volver a la lista
                </button>
              ) : null}
              <button
                type="button"
                disabled={!item || bomLoading || loading}
                onClick={handleBomToggle}
                className={[
                  'inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                  showBom
                    ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                {bomLoading ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />}
                {showBom ? 'Ocultar LDM' : 'Ver LDM'}
              </button>
            </div>
            <p className="text-xs font-medium text-slate-500">
              {loading ? 'Consultando SAP…' : searchLoading ? 'Buscando coincidencias…' : item ? 'Artículo seleccionado' : hasSearched ? 'Selecciona un resultado' : 'Listo para buscar'}
            </p>
          </div>
        </form>

        <p className="text-xs text-slate-500">Puedes buscar por número, descripción, color o combinar varios criterios. La descripción busca todas las palabras, sin importar el orden.</p>
        {colorError ? <p className="text-xs font-medium text-amber-700">{colorError}</p> : null}

        {searchError ? (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <X className="mt-0.5 size-4 shrink-0" />
            <span>{searchError}</span>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <X className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {hasSearched && !selectedResult ? (
          <SearchResultsPanel
            results={searchResults}
            hasMore={searchHasMore}
            loading={searchLoading}
            onSelect={result => void loadItem(result, false)}
            onLoadMore={() => void searchItems(true)}
          />
        ) : null}

        {showBom ? (
          <BomPanel
            activeCode={activeCode}
            bomTree={bomTree}
            bomLoading={bomLoading}
            bomError={bomError}
            structureDurationMs={bomStructureDurationMs}
            costDurationMs={bomCostDurationMs}
            costsAsOf={bomCostsAsOf}
            costCacheTtlSeconds={bomCostCacheTtlSeconds}
            costLoading={bomCostLoading}
            costsReady={bomCostsReady}
            exportLoading={bomExportLoading}
            copyFeedback={bomCopyFeedback}
            onDownload={(mcPct, discountPct) => void handleDownloadBom(mcPct, discountPct)}
            onCopy={() => void handleCopyBom()}
            onRefreshCosts={handleRefreshBomCosts}
            onLoadChildren={loadBomChildren}
            onNodeUpdated={handleBomNodeUpdated}
            exportRows={bomExportRows}
            pricingFormulaConfig={bomPricingFormulaConfig}
          />
        ) : (
          <MasterDataPanel
            item={item}
            activeCode={activeCode}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            customFields={customFields}
            customFieldsVisible={customFieldsVisible}
            onToggleCustomFields={() => setCustomFieldsVisible(previous => !previous)}
            priceRows={priceRows}
            activeProperties={activeProperties}
          />
        )}
        </> : null}
        <div className={consultaMode === 'production-orders' ? '' : 'hidden'}>
          <OrderConsultaPanel
            mode="production-orders"
            onOpenItem={itemCode => {
              setConsultaMode('items')
              void loadItem({ itemCode, itemName: '' }, false)
            }}
          />
        </div>
        <div className={consultaMode === 'sales-orders' ? '' : 'hidden'}>
          <OrderConsultaPanel
            mode="sales-orders"
            onOpenItem={itemCode => {
              setConsultaMode('items')
              void loadItem({ itemCode, itemName: '' }, false)
            }}
          />
        </div>
      </div>
    </main>
  )
}
