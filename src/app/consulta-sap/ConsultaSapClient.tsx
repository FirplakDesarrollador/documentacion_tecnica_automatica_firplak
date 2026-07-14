'use client'

import { type FormEvent, type ReactNode, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Layers, Loader2, RefreshCw, Search, X } from 'lucide-react'

type SapItem = Record<string, unknown>

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

type BomNode = {
  itemCode: string
  itemName: string
  quantity: number
  level: number
  lines: BomNode[]
  loaded: boolean
}

type BomApiResponse =
  | { success: true; hasBom: true; tree: BomNode }
  | { success: true; hasBom: false }
  | { success: false; error: string }

type BomChildrenResponse =
  | { success: true; lines: BomNode[] }
  | { success: false; error: string }

type PriceRow = {
  priceList: string
  price: number | null
  currency: string
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

function countBomComponents(node: BomNode): number {
  return node.lines.reduce((total, child) => total + 1 + countBomComponents(child), 0)
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
  onLoadChildren,
  onNodeUpdated,
}: {
  node: BomNode
  path: number[]
  depth?: number
  onLoadChildren: (itemCode: string) => Promise<BomNode[] | null>
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
          setLocalError('No se pudo consultar la sub-LDM')
          return
        }

        onNodeUpdated(path, {
          ...node,
          lines: children,
          loaded: true,
        })

        if (children.length === 0) {
          setLocalError('Sin sub-LDM')
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

  return (
    <div>
      <div className={[
        'grid min-w-[600px] grid-cols-[minmax(175px,0.9fr)_minmax(220px,2fr)_96px] items-center border-b border-slate-100 text-sm',
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
          <span title={node.itemCode} className="min-w-0 truncate font-mono text-xs text-slate-800">{node.itemCode}</span>
        </div>
        <div title={node.itemName} className="min-w-0 truncate px-3 py-2 text-slate-600">
          {node.itemName || 'Sin descripción en SAP'}
          {localError ? <span className="ml-2 text-xs font-medium text-amber-700">({localError})</span> : null}
        </div>
        <div className="px-3 py-2 text-right tabular-nums text-slate-800">{formatSapQuantity(node.quantity)}</div>
      </div>
      {expanded && node.loaded && node.lines.length > 0 ? (
        <div>
          {node.lines.map((child, index) => {
            const childPath = [...path, index]
            return (
              <BomRowView
                key={childPath.join('-')}
                node={child}
                path={childPath}
                depth={depth + 1}
                onLoadChildren={onLoadChildren}
                onNodeUpdated={onNodeUpdated}
              />
            )
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
  onLoadChildren,
  onNodeUpdated,
}: {
  activeCode: string
  bomTree: BomNode | null
  bomLoading: boolean
  bomError: string | null
  onLoadChildren: (itemCode: string) => Promise<BomNode[] | null>
  onNodeUpdated: (path: number[], updated: BomNode) => void
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lista de materiales</p>
          <h1 className="mt-1 text-lg font-bold tracking-tight text-slate-900">{activeCode}</h1>
        </div>
        {bomTree ? (
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            {String(countBomComponents(bomTree)) + ' componentes cargados'}
          </span>
        ) : null}
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

      {bomTree ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[600px] grid-cols-[minmax(175px,0.9fr)_minmax(220px,2fr)_96px] border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span className="px-4 py-2.5">Código</span>
            <span className="px-3 py-2.5">Descripción</span>
            <span className="px-3 py-2.5 text-right">Cantidad SAP</span>
          </div>
          <BomRowView
            node={bomTree}
            path={[]}
            onLoadChildren={onLoadChildren}
            onNodeUpdated={onNodeUpdated}
          />
        </div>
      ) : null}
    </section>
  )
}

export function ConsultaSapClient({ initialCode, initialItem, initialError }: ConsultaSapClientProps) {
  const [code, setCode] = useState(initialCode)
  const [item, setItem] = useState<SapItem | null>(initialItem)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [bomTree, setBomTree] = useState<BomNode | null>(null)
  const [bomLoading, setBomLoading] = useState(false)
  const [bomError, setBomError] = useState<string | null>(null)
  const [showBom, setShowBom] = useState(false)
  const [activeTab, setActiveTab] = useState<SapTabId>('general')
  const [customFieldsVisible, setCustomFieldsVisible] = useState(false)

  const activeCode = itemValue(item, 'ItemCode') || code.trim()
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
    setShowBom(false)
    setBomTree(null)
    setBomError(null)
  }

  async function fetchItem(nextCode: string) {
    const normalizedCode = nextCode.trim()
    if (!normalizedCode) {
      setItem(null)
      setError('Ingresa un número de artículo para consultar SAP.')
      return
    }

    setLoading(true)
    setError(null)
    setItem(null)
    setCode(normalizedCode)
    setActiveTab('general')
    setCustomFieldsVisible(false)
    resetBom()

    try {
      const response = await fetch('/api/sap/items/' + encodeURIComponent(normalizedCode), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      const payload = await response.json() as SapApiItemResponse

      if (!response.ok || !payload.success) {
        setError(payload.success ? 'No se pudo consultar SAP.' : payload.error)
        return
      }

      setItem(payload.item)
    } catch (fetchError: unknown) {
      setError(fetchError instanceof Error ? fetchError.message : 'No se pudo consultar SAP.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchBom() {
    const codeToFetch = activeCode
    if (!codeToFetch) return

    setBomLoading(true)
    setBomError(null)

    try {
      const response = await fetch('/api/sap/items/' + encodeURIComponent(codeToFetch) + '/bom', {
        headers: { Accept: 'application/json' },
      })
      const payload = await response.json() as BomApiResponse

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

      setBomTree(payload.tree)
    } catch (fetchError: unknown) {
      setBomTree(null)
      setBomError(fetchError instanceof Error ? fetchError.message : 'No se pudo consultar la lista de materiales.')
    } finally {
      setBomLoading(false)
    }
  }

  async function loadBomChildren(itemCode: string): Promise<BomNode[] | null> {
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

  function updateBomNode(path: number[], updated: BomNode) {
    setBomTree(previous => previous ? replaceBomNodeAtPath(previous, path, updated) : previous)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void fetchItem(code)
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

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="grid min-w-0 flex-1 gap-1.5">
              <span className="text-sm font-semibold text-slate-800">Número de artículo</span>
              <input
                value={code}
                onChange={event => setCode(event.target.value.toUpperCase())}
                className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="VBAN12-0012-000-0458"
                aria-label="Número de artículo SAP"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Consultar
              </button>
              <button
                type="button"
                disabled={loading || !code.trim()}
                onClick={() => void fetchItem(code)}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className="size-4" />
                Actualizar
              </button>
              <button
                type="button"
                disabled={!item || bomLoading}
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
              {loading ? 'Consultando SAP…' : item ? 'Consulta cargada' : 'Sin resultado'}
            </p>
          </div>
        </form>

        {error ? (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <X className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {showBom ? (
          <BomPanel
            activeCode={activeCode}
            bomTree={bomTree}
            bomLoading={bomLoading}
            bomError={bomError}
            onLoadChildren={loadBomChildren}
            onNodeUpdated={updateBomNode}
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
      </div>
    </main>
  )
}
