'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileSearch,
  Loader2,
  PackageSearch,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  Truck,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

type TransferRequestDefaults = {
  cardCode: string
  cardName: string
  contactPerson: number
  contactLabel: string
  shipToCode: string
  shipToAddress: string
  series: number
  seriesLabel: string
  priceList: number
  priceListLabel: string
  preferredWarehouseCodes: string[]
  automaticComment: string
}

type Warehouse = {
  warehouseCode: string
  warehouseName: string
  binsEnabled: boolean
  inactive: boolean
}

type FormConfiguration = {
  defaults: TransferRequestDefaults
  warehouses: Warehouse[]
  hasActiveBinLocations: boolean
  creator: { id: string; email: string | null }
  responsibleUsers: Array<{ id: string; email: string; role: string | null }>
}

type SearchItem = {
  itemCode: string
  itemName: string
  sources?: Array<'SAP' | 'Catálogo'>
  missingInSap?: boolean
  missingInCatalog?: boolean
}

type BatchOption = {
  batchNumber: string
  warehouseCode: string | null
  status: string | null
}

type SerialOption = {
  systemSerialNumber: number
  serialNumber: string
  manufacturerSerialNumber: string | null
  warehouseCode: string | null
  status: string | null
}

type ItemAvailability = {
  itemCode: string
  itemName: string
  inventoryUom: string | null
  management: 'none' | 'batch' | 'serial'
  hasBom?: boolean
  availability: {
    warehouseCode: string
    inventoryQuantity: number
    committedQuantity: number
    orderedQuantity: number
    availableQuantity: number
  }
  warehouseAvailability: Array<{
    warehouseCode: string
    inventoryQuantity: number
    committedQuantity: number
    orderedQuantity: number
    availableQuantity: number
  }>
  allocation: {
    requiresAllocation: boolean
    management: 'none' | 'batch' | 'serial'
    sourceWarehouseCode: string | null
    sourceWarehouseVerified: boolean | null
    status: 'not-required' | 'source-warehouse-required' | 'available' | 'empty' | 'unavailable'
    message: string | null
    batchOptions: BatchOption[]
    serialOptions: SerialOption[]
  }
}

type PackagePattern = {
  sourceWarehouseCode: 'MP-01'
  status: 'observed' | 'not_available'
  packageQuantity: number | null
  sampleSize: number
  matchingTransfers: number
  message: string
}

type DraftLine = {
  id: string
  item: SearchItem | null
  quantity: string
  transferType: '' | 'Físico' | 'Virtual'
  availability: ItemAvailability | null
  availabilityLoading: boolean
  availabilityError: string | null
  packagePattern: PackagePattern | null
  packagePatternLoading: boolean
  packagePatternError: string | null
  batchQuantities: Record<string, string>
  selectedSerials: number[]
  suggestedSourceWarehouseCode: string | null
  allowZeroAvailable: boolean
  explodedFrom?: {
    parentItemCode: string
    parentQuantity: number
    calculatedQuantity: number
    rounded: boolean
    path: string[]
  }
}

type BomPreview = {
  lineId: string
  parentItemCode: string
  parentQuantity: number
  lines: Array<{
    itemCode: string
    itemName: string
    quantity: number
    inventoryUom: string | null
    hasBom: boolean
    availability: ItemAvailability['availability']
    explodedFrom: string
    explodedFromQuantity: number
    explodedFromPath: string[]
    rounded: boolean
  }>
}

type CatalogReviewItem = {
  itemCode: string
  itemName: string
  status: 'pending' | 'approved' | 'rejected'
  firstSeenAt: string | null
  reviewedAt: string | null
  reviewedBy: string | null
}

type ValidationIssue = {
  code: string
  message: string
  lineIndex: number | null
  availableQuantity?: number
  requestedQuantity?: number
}

type ValidationResult = {
  valid: boolean
  checkedAt: string
  issues: ValidationIssue[]
  lines: Array<{
    lineIndex: number
    availability: ItemAvailability['availability']
  }>
}

type OperationSummary = {
  id: string
  operationType: 'inventory_transfer_request_create' | 'inventory_transfer_request_update'
  operationStatus: 'pending' | 'verified' | 'failed' | 'ambiguous'
  sapDocEntry: number | null
  sapDocNum: number | null
  createdAt: string | null
  actorEmail: string | null
  actorRole: string | null
  sourceWarehouse: string | null
  destinationWarehouse: string | null
  businessComment: string | null
  operationItems: Array<Record<string, unknown>>
  operationContext: Record<string, unknown>
  errorMessage: string | null
}

type ResponsibleSnapshot = {
  email: string
  role: string | null
}

type RequestDetail = {
  operation: OperationSummary
  request: {
    docEntry: number
    docNum: number | null
    documentStatus: string | null
    docDate: string | null
    dueDate: string | null
    taxDate: string | null
    cardCode: string | null
    contactPerson: number | null
    shipToCode: string | null
    address: string | null
    fromWarehouse: string | null
    toWarehouse: string | null
    comments: string | null
    businessComment: string | null
    lines: Array<{
      lineNumber: number | null
      itemCode: string
      itemDescription: string | null
      unitOfMeasure: string | null
      quantity: number
      fromWarehouseCode: string | null
      warehouseCode: string | null
      transferType: string | null
      batchNumbers: Array<{ batchNumber: string; quantity: number }>
      serialNumbers: Array<{ systemSerialNumber: number }>
    }>
  }
}

type ApiErrorPayload = {
  success?: boolean
  error?: unknown
  sapCode?: string | number | null
  issues?: ValidationIssue[]
  operation?: OperationSummary
}

function readApiErrorMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const message = readApiErrorMessage(record.message)
    ?? readApiErrorMessage(record.value)
    ?? readApiErrorMessage(record.error)
    ?? readApiErrorMessage(record.detail)
  const code = typeof record.code === 'string' || typeof record.code === 'number'
    ? String(record.code)
    : null

  if (message && code) return `SAP ${code}: ${message}`
  if (message) return message
  return code ? `SAP indicó el código ${code}.` : null
}

function apiErrorMessage(payload: ApiErrorPayload): string {
  const message = readApiErrorMessage(payload.error)
  if (!message) return 'No fue posible completar la operación.'
  if (!payload.sapCode || message.startsWith('SAP ')) return message
  return `SAP ${payload.sapCode}: ${message}`
}

class RequestApiError extends Error {
  readonly status: number
  readonly payload: ApiErrorPayload

  constructor(status: number, payload: ApiErrorPayload) {
    super(apiErrorMessage(payload))
    this.name = 'RequestApiError'
    this.status = status
    this.payload = payload
  }
}

const SELECT_CLASS_NAME = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-firplak-green focus:ring-2 focus:ring-firplak-green/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'

const SAP_QUANTITY_PATTERN = /^\d+(?:\.\d{0,2})?$/

function hasSapQuantityPrecision(value: string): boolean {
  return SAP_QUANTITY_PATTERN.test(value)
}

function adjustSapQuantity(value: string, amount: 1 | -1): string {
  const parsed = Number(value)
  const next = Math.round(((Number.isFinite(parsed) ? parsed : 0) + amount) * 100) / 100
  return next > 0 ? String(next) : ''
}

type SapQuantityInputProps = {
  id: string
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
}

function SapQuantityInput({ id, value, onChange, ariaLabel, className }: SapQuantityInputProps) {
  const updateValue = (nextValue: string) => {
    if (!nextValue || hasSapQuantityPrecision(nextValue)) onChange(nextValue)
  }

  return (
    <div className={`flex min-w-0 ${className ?? ''}`}>
      <Input id={id} aria-label={ariaLabel} type="text" inputMode="decimal" value={value} onChange={event => updateValue(event.target.value)} onKeyDown={event => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          onChange(adjustSapQuantity(value, event.key === 'ArrowUp' ? 1 : -1))
        }
      }} placeholder="0" className="min-w-0 rounded-r-none text-left tabular-nums" />
      <div className="flex w-6 shrink-0 flex-col overflow-hidden rounded-r-lg border border-l-0 border-slate-200 bg-slate-50">
        <button type="button" aria-label={`Aumentar ${ariaLabel}`} onClick={() => onChange(adjustSapQuantity(value, 1))} className="flex flex-1 items-center justify-center border-b border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><ChevronUp className="h-3.5 w-3.5" /></button>
        <button type="button" aria-label={`Disminuir ${ariaLabel}`} onClick={() => onChange(adjustSapQuantity(value, -1))} className="flex flex-1 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800"><ChevronDown className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}

type InlineItemSearchRowsProps = {
  mode: 'append' | 'edit'
  lineNumber: number
  inputRef: RefObject<HTMLInputElement | null>
  searchTerm: string
  searching: boolean
  searchError: string | null
  searchResults: SearchItem[]
  onSearchTermChange: (value: string) => void
  onSearch: () => void
  onSelectItem: (item: SearchItem) => void
  onCancelEdit: () => void
  isAdmin: boolean
}

function InlineItemSearchRows({
  mode,
  lineNumber,
  inputRef,
  searchTerm,
  searching,
  searchError,
  searchResults,
  onSearchTermChange,
  onSearch,
  onSelectItem,
  onCancelEdit,
  isAdmin,
}: InlineItemSearchRowsProps) {
  const isEditing = mode === 'edit'
  const inputId = isEditing ? `item-search-edit-${lineNumber}` : 'item-search-new'
  const inputLabel = isEditing
    ? `Editar artículo de línea ${lineNumber}`
    : `Añadir artículo en línea ${lineNumber}`
  const actionLabel = isEditing ? `Guardar en línea ${lineNumber}` : `Añadir línea ${lineNumber}`

  return (
    <TableRow className="bg-firplak-green/[0.04]">
      <TableCell className="font-bold text-slate-700">{lineNumber}</TableCell>
      <TableCell colSpan={9} className="py-3">
        <div className="space-y-3">
          <Label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wide text-slate-600">{inputLabel}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input ref={inputRef} id={inputId} value={searchTerm} onChange={event => onSearchTermChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onSearch() } }} placeholder="Busque por código o descripción" className="min-w-0 flex-1" />
            <Button type="button" variant="outline" onClick={onSearch} disabled={searching} className="shrink-0 border-slate-300">
              {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              {searching ? 'Buscando...' : 'Buscar'}
            </Button>
            {isEditing ? <Button type="button" variant="ghost" onClick={onCancelEdit} className="shrink-0 text-slate-600">Cancelar</Button> : <span className="self-center px-2 text-xs text-slate-400">Nueva</span>}
          </div>
          {searchError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{searchError}</p> : null}
            {searchResults.length > 0 ? <div className="space-y-2">{searchResults.map(item => <div key={item.itemCode} className="grid gap-2 rounded-md border border-slate-200 bg-white p-2.5 md:grid-cols-[minmax(180px,0.32fr)_minmax(0,1fr)_auto] md:items-center"><span className="font-semibold text-slate-800">{item.itemCode}</span><span className="min-w-0 whitespace-normal break-words text-sm text-slate-700">{item.itemName}{isAdmin ? <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">{item.sources?.map(source => <Badge key={source} variant="outline" className="text-[10px]">{source}</Badge>)}{item.missingInSap ? <Badge variant="destructive" className="text-[10px]">Faltante en SAP</Badge> : null}{item.missingInCatalog ? <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-800">Nuevo en catálogo</Badge> : null}</span> : null}</span><Button type="button" size="sm" variant="outline" onClick={() => onSelectItem(item)} disabled={item.missingInSap} className="border-firplak-green/30 text-firplak-green">{item.missingInSap ? 'No disponible en SAP' : actionLabel}</Button></div>)}</div> : null}
        </div>
      </TableCell>
    </TableRow>
  )
}

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createDraftLine(): DraftLine {
  return {
    id: createClientId(),
    item: null,
    quantity: '',
    transferType: 'Físico',
    availability: null,
    availabilityLoading: false,
    availabilityError: null,
    packagePattern: null,
    packagePatternLoading: false,
    packagePatternError: null,
    batchQuantities: {},
    selectedSerials: [],
    suggestedSourceWarehouseCode: null,
    allowZeroAvailable: false,
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const body: unknown = await response.json().catch(() => ({}))
  const payload: ApiErrorPayload & T = body && typeof body === 'object' && !Array.isArray(body)
    ? body as ApiErrorPayload & T
    : {} as ApiErrorPayload & T
  if (!response.ok || payload.success === false) {
    throw new RequestApiError(response.status, payload)
  }
  return payload as T
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 }).format(value)
}

function formatDate(value: string | null): string {
  if (!value) return 'Sin fecha'
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(parsed)
}

function statusLabel(status: OperationSummary['operationStatus']): string {
  return {
    pending: 'Pendiente',
    verified: 'Verificada',
    failed: 'Fallida',
    ambiguous: 'Resultado ambiguo',
  }[status]
}

function statusVariant(status: OperationSummary['operationStatus']): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'verified') return 'secondary'
  if (status === 'failed' || status === 'ambiguous') return 'destructive'
  return 'outline'
}

function filterWarehouses(warehouses: Warehouse[], query: string): Warehouse[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('es')
  if (!normalizedQuery) return warehouses
  return warehouses.filter(warehouse => (
    warehouse.warehouseCode.toLocaleLowerCase('es').includes(normalizedQuery)
    || warehouse.warehouseName.toLocaleLowerCase('es').includes(normalizedQuery)
    || warehouseOptionValue(warehouse).toLocaleLowerCase('es').includes(normalizedQuery)
  ))
}

function warehouseOptionValue(warehouse: Warehouse): string {
  return `${warehouse.warehouseCode} — ${warehouse.warehouseName}${warehouse.inactive ? ' (Inactiva SAP)' : ''}`
}

function resolveWarehouseOption(warehouses: Warehouse[], value: string): Warehouse | null {
  const normalizedValue = value.trim().toLocaleLowerCase('es')
  if (!normalizedValue) return null
  return warehouses.find(warehouse => (
    warehouse.warehouseCode.toLocaleLowerCase('es') === normalizedValue
    || warehouseOptionValue(warehouse).toLocaleLowerCase('es') === normalizedValue
  )) ?? null
}

function operationTypeLabel(operation: OperationSummary): string {
  const modificationCount = Array.isArray(operation.operationContext.modificationHistory)
    ? operation.operationContext.modificationHistory.length
    : 0
  if (modificationCount > 0) {
    return modificationCount === 1 ? 'Solicitud modificada' : `${modificationCount} modificaciones`
  }
  return operation.operationType === 'inventory_transfer_request_update' ? 'Modificación' : 'Creación'
}

function isEditableDocumentStatus(status: string | null): boolean {
  const normalized = status?.trim().toLowerCase() ?? ''
  return normalized === 'bost_open' || normalized === 'open'
}

function transferTypeFromDocument(value: string | null): DraftLine['transferType'] {
  return value === 'Físico' || value === 'Virtual' ? value : ''
}

function responsibleFromOperation(operation: OperationSummary): ResponsibleSnapshot | null {
  const candidate = operation.operationContext.responsible
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
  const responsible = candidate as Record<string, unknown>
  const email = typeof responsible.email === 'string' ? responsible.email.trim() : ''
  if (!email) return null
  return { email, role: typeof responsible.role === 'string' ? responsible.role : null }
}

function getLineClientError(line: DraftLine): string | null {
  if (!line.item) return 'Seleccione un artículo.'
  const quantity = Number(line.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return 'Ingrese una cantidad mayor que cero.'
  if (!hasSapQuantityPrecision(line.quantity)) return 'Use máximo dos decimales y punto, por ejemplo 1.25.'
  if (!line.transferType) return 'Seleccione Físico o Virtual.'
  if (line.availabilityLoading) return 'Consultando disponibilidad SAP.'
  if (line.availabilityError) return line.availabilityError
  if (!line.availability) return 'Consulte la disponibilidad del artículo.'
  const stock = line.availability.availability
  if (quantity > stock.availableQuantity && (stock.inventoryQuantity <= 0 || !line.allowZeroAvailable)) {
    return stock.inventoryQuantity <= 0
      ? 'No hay inventario físico disponible en la bodega de origen.'
      : `ATP disponible: ${formatNumber(stock.availableQuantity)}. Marque el override para continuar con inventario físico.`
  }

  const allocation = line.availability.allocation
  if (!allocation.requiresAllocation) return null
  if (allocation.status !== 'available') return allocation.message || 'No hay asignaciones SAP disponibles.'
  if (allocation.management === 'batch') {
    const selectedTotal = Object.values(line.batchQuantities)
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value > 0)
      .reduce((total, value) => total + value, 0)
    return Math.abs(selectedTotal - quantity) < 0.000001
      ? null
      : 'La suma de lotes debe coincidir con la cantidad.'
  }
  return line.selectedSerials.length === quantity
    ? null
    : 'La cantidad de seriales debe coincidir con la cantidad.'
}

function serializeDraft(sourceWarehouseCode: string, destinationWarehouseCode: string, businessComment: string, lines: DraftLine[]) {
  return {
    sourceWarehouseCode,
    destinationWarehouseCode,
    businessComment,
    lines: lines.map(line => ({
      itemCode: line.item?.itemCode ?? '',
      quantity: Number(line.quantity),
      transferType: line.transferType,
      batchNumbers: line.availability?.allocation.management === 'batch'
        ? Object.entries(line.batchQuantities)
          .map(([batchNumber, quantity]) => ({ batchNumber, quantity: Number(quantity) }))
          .filter(allocation => Number.isFinite(allocation.quantity) && allocation.quantity > 0)
        : [],
      serialNumbers: line.availability?.allocation.management === 'serial'
        ? line.selectedSerials.map(systemSerialNumber => ({ systemSerialNumber }))
        : [],
      allowZeroAvailable: line.allowZeroAvailable,
      explodedFrom: line.explodedFrom,
    })),
  }
}

export default function TransferRequestsClient() {
  const [configuration, setConfiguration] = useState<FormConfiguration | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [configurationError, setConfigurationError] = useState<string | null>(null)
  const [newRequestOpen, setNewRequestOpen] = useState(false)
  const [editingDocEntry, setEditingDocEntry] = useState<number | null>(null)
  const [sourceWarehouseCode, setSourceWarehouseCode] = useState('')
  const [destinationWarehouseCode, setDestinationWarehouseCode] = useState('')
  const [sourceWarehouseSearch, setSourceWarehouseSearch] = useState('')
  const [destinationWarehouseSearch, setDestinationWarehouseSearch] = useState('')
  const [businessComment, setBusinessComment] = useState('')
  const [responsibleMode, setResponsibleMode] = useState<'' | 'creator' | 'other'>('')
  const [responsibleUserId, setResponsibleUserId] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<SearchItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const itemSearchInputRef = useRef<HTMLInputElement>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(createClientId)
  const [operations, setOperations] = useState<OperationSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<RequestDetail | null>(null)
  const [detailLoadingEntry, setDetailLoadingEntry] = useState<number | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [bomPreview, setBomPreview] = useState<BomPreview | null>(null)
  const [bomPreviewLoading, setBomPreviewLoading] = useState(false)
  const [bomPreviewError, setBomPreviewError] = useState<string | null>(null)
  const [bomConfirmed, setBomConfirmed] = useState(false)
  const [catalogReviewItems, setCatalogReviewItems] = useState<CatalogReviewItem[] | null>(null)
  const [catalogReviewLoading, setCatalogReviewLoading] = useState(false)
  const [catalogReviewError, setCatalogReviewError] = useState<string | null>(null)
  const [catalogReviewAction, setCatalogReviewAction] = useState<string | null>(null)
  const [catalogReviewConfirmed, setCatalogReviewConfirmed] = useState<Record<string, boolean>>({})

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const result = await apiRequest<{ operations: OperationSummary[] }>('/api/engineering/sap-operations/transfer-requests/history')
      setOperations(result.operations)
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'No fue posible cargar el historial.')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const loadConfiguration = useCallback(async () => {
    setConfigurationError(null)
    try {
      const result = await apiRequest<{ configuration: FormConfiguration }>('/api/engineering/sap-operations/transfer-requests/configuration')
      setConfiguration(result.configuration)
      return result.configuration
    } catch (error) {
      setConfigurationError(error instanceof Error ? error.message : 'No fue posible cargar la configuración SAP.')
      return null
    }
  }, [])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const loadCatalogReview = useCallback(async () => {
    setCatalogReviewLoading(true)
    setCatalogReviewError(null)
    try {
      const result = await apiRequest<{ items: CatalogReviewItem[] }>('/api/engineering/sap-operations/transfer-requests/items/catalog-review')
      setCatalogReviewItems(result.items)
    } catch (error) {
      if (error instanceof RequestApiError && error.status === 403) {
        setCatalogReviewItems(null)
        return
      }
      setCatalogReviewError(error instanceof Error ? error.message : 'No fue posible cargar los pendientes de catálogo.')
    } finally {
      setCatalogReviewLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCatalogReview()
  }, [loadCatalogReview])

  const reviewCatalogItem = useCallback(async (itemCode: string, status: 'approved' | 'rejected') => {
    setCatalogReviewAction(itemCode)
    setCatalogReviewError(null)
    try {
      await apiRequest<{ item: CatalogReviewItem }>('/api/engineering/sap-operations/transfer-requests/items/catalog-review', {
        method: 'POST',
        body: JSON.stringify({ itemCode, status, confirmed: true }),
      })
      await loadCatalogReview()
      setCatalogReviewConfirmed(current => ({ ...current, [itemCode]: false }))
    } catch (error) {
      setCatalogReviewError(error instanceof Error ? error.message : 'No fue posible guardar la revisión.')
    } finally {
      setCatalogReviewAction(null)
    }
  }, [loadCatalogReview])

  const clientLineErrors = useMemo(() => lines.map(getLineClientError), [lines])
  const warehousesReady = Boolean(sourceWarehouseCode && destinationWarehouseCode && sourceWarehouseCode !== destinationWarehouseCode)
  const hasReadyTransferLine = useMemo(() => lines.some(line => getLineClientError(line) === null), [lines])
  const hasBusinessComment = businessComment.trim().length > 0
  const hasSelectedResponsible = responsibleMode === 'creator' || (responsibleMode === 'other' && Boolean(responsibleUserId))
  const activeWarehousesByCode = useMemo(
    () => new Map((configuration?.warehouses ?? []).map(warehouse => [warehouse.warehouseCode, warehouse])),
    [configuration?.warehouses],
  )
  const filteredSourceWarehouses = useMemo(
    () => filterWarehouses(configuration?.warehouses ?? [], sourceWarehouseSearch),
    [configuration?.warehouses, sourceWarehouseSearch],
  )
  const filteredDestinationWarehouses = useMemo(
    () => filterWarehouses(configuration?.warehouses ?? [], destinationWarehouseSearch),
    [configuration?.warehouses, destinationWarehouseSearch],
  )
  const clientFormError = useMemo(() => {
    if (!sourceWarehouseCode || !destinationWarehouseCode) return 'Seleccione ambas bodegas.'
    if (sourceWarehouseCode === destinationWarehouseCode) return 'La bodega de origen y la bodega destino deben ser diferentes.'
    const commentLength = Array.from(businessComment.trim()).length
    if (commentLength < 1 || commentLength > 50) return 'El comentario contextual debe tener entre 1 y 50 caracteres.'
    if (!responsibleMode) return 'Seleccione la persona responsable de la solicitud.'
    if (responsibleMode === 'other' && !responsibleUserId) return 'Seleccione la persona responsable.'
    if (lines.length === 0) return 'Agregue al menos una línea.'
    return clientLineErrors.find(Boolean) ?? null
  }, [businessComment, clientLineErrors, destinationWarehouseCode, lines.length, responsibleMode, responsibleUserId, sourceWarehouseCode])

  const invalidateValidation = useCallback(() => {
    setValidation(null)
    setConfirmed(false)
    setFormError(null)
  }, [])

  const updateLine = useCallback((lineId: string, update: Partial<DraftLine>) => {
    setLines(current => current.map(line => line.id === lineId ? { ...line, ...update } : line))
    invalidateValidation()
  }, [invalidateValidation])

  const requestAvailability = useCallback(async (
    lineId: string,
    itemCode: string,
    warehouseCode: string,
    preserveAllocations = false,
  ) => {
    if (!warehouseCode) {
      updateLine(lineId, { availability: null, availabilityError: 'Seleccione la bodega de origen.', availabilityLoading: false })
      return
    }
    updateLine(lineId, {
      availability: null,
      availabilityError: null,
      availabilityLoading: true,
      suggestedSourceWarehouseCode: null,
      ...(preserveAllocations ? {} : { batchQuantities: {}, selectedSerials: [] }),
    })
    try {
      const result = await apiRequest<{ availability: ItemAvailability }>('/api/engineering/sap-operations/transfer-requests/availability', {
        method: 'POST',
        body: JSON.stringify({ itemCode, sourceWarehouseCode: warehouseCode }),
      })
      setLines(current => current.map(line => (
        line.id === lineId && line.item?.itemCode === itemCode
          ? { ...line, availability: result.availability, availabilityLoading: false, availabilityError: null }
          : line
      )))
    } catch (error) {
      setLines(current => current.map(line => (
        line.id === lineId && line.item?.itemCode === itemCode
          ? { ...line, availability: null, availabilityLoading: false, availabilityError: error instanceof Error ? error.message : 'No fue posible consultar SAP.' }
          : line
      )))
    }
  }, [updateLine])

  const requestPackagePattern = useCallback(async (lineId: string, itemCode: string) => {
    updateLine(lineId, { packagePattern: null, packagePatternError: null, packagePatternLoading: true })
    try {
      const result = await apiRequest<{ packagePattern: PackagePattern }>(`/api/engineering/sap-operations/transfer-requests/package-pattern?itemCode=${encodeURIComponent(itemCode)}`)
      setLines(current => current.map(line => (
        line.id === lineId && line.item?.itemCode === itemCode
          ? { ...line, packagePattern: result.packagePattern, packagePatternLoading: false, packagePatternError: null }
          : line
      )))
    } catch (error) {
      setLines(current => current.map(line => (
        line.id === lineId && line.item?.itemCode === itemCode
          ? {
              ...line,
              packagePattern: null,
              packagePatternLoading: false,
              packagePatternError: error instanceof Error ? error.message : 'No fue posible analizar el patrÃ³n de traslado.',
            }
          : line
      )))
    }
  }, [updateLine])

  const handleWarehouseChange = useCallback((kind: 'source' | 'destination', warehouseCode: string) => {
    if (kind === 'source') {
      setSourceWarehouseCode(warehouseCode)
      setLines(current => current.map(line => ({ ...line, suggestedSourceWarehouseCode: null })))
      for (const line of lines) {
        if (line.item) void requestAvailability(line.id, line.item.itemCode, warehouseCode)
      }
    } else {
      setDestinationWarehouseCode(warehouseCode)
    }
    invalidateValidation()
  }, [invalidateValidation, lines, requestAvailability])

  const chooseSuggestedSourceWarehouse = useCallback((lineId: string, warehouseCode: string) => {
    const selectedLine = lines.find(line => line.id === lineId)
    if (selectedLine?.suggestedSourceWarehouseCode === warehouseCode) {
      const warehouse = activeWarehousesByCode.get(warehouseCode)
      setSourceWarehouseSearch(warehouse ? warehouseOptionValue(warehouse) : warehouseCode)
      handleWarehouseChange('source', warehouseCode)
      return
    }
    updateLine(lineId, { suggestedSourceWarehouseCode: warehouseCode })
  }, [activeWarehousesByCode, handleWarehouseChange, lines, updateLine])

  const handleWarehousePickerChange = useCallback((kind: 'source' | 'destination', value: string) => {
    if (kind === 'source') setSourceWarehouseSearch(value)
    else setDestinationWarehouseSearch(value)

    const warehouse = resolveWarehouseOption(configuration?.warehouses ?? [], value)
    handleWarehouseChange(kind, warehouse?.warehouseCode ?? '')
  }, [configuration?.warehouses, handleWarehouseChange])

  const searchItems = useCallback(async () => {
    const query = searchTerm.trim()
    if (!query) {
      setSearchError('Escriba código o una palabra de la descripción.')
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
       const result = await apiRequest<{ items: SearchItem[]; isAdmin: boolean }>('/api/engineering/sap-operations/transfer-requests/items/unified?query=' + encodeURIComponent(query))
       setSearchResults(result.items)
       setIsAdmin(result.isAdmin)
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'No fue posible buscar artículos.')
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [searchTerm])

  const loadBomPreview = useCallback(async (lineId: string, itemCode: string, quantity: number, visitedItemCodes: string[] = [], previewIndex: number | null = null) => {
    setBomPreviewLoading(true)
    setBomPreviewError(null)
    setBomConfirmed(false)
    try {
      const result = await apiRequest<Omit<BomPreview, 'lineId'>>('/api/engineering/sap-operations/transfer-requests/bom/explode', {
        method: 'POST',
        body: JSON.stringify({ itemCode, quantity, sourceWarehouseCode, visitedItemCodes }),
      })
      setBomPreview(current => current && current.lineId === lineId && previewIndex !== null
        ? { ...current, lines: current.lines.flatMap((child, index) => index === previewIndex ? result.lines : [child]) }
        : { ...result, lineId })
    } catch (error) {
      setBomPreviewError(error instanceof Error ? error.message : 'No fue posible leer la BOM SAP.')
    } finally {
      setBomPreviewLoading(false)
    }
  }, [sourceWarehouseCode])

  const confirmBomExplosion = useCallback(() => {
    if (!bomPreview || !bomConfirmed) return
    const parentLine = lines.find(line => line.id === bomPreview.lineId)
    if (!parentLine) return
    const replacement = bomPreview.lines.map(child => ({
      ...createDraftLine(),
      item: { itemCode: child.itemCode, itemName: child.itemName, sources: ['SAP'] as Array<'SAP' | 'Catálogo'> },
      quantity: String(child.quantity),
      transferType: parentLine.transferType,
      explodedFrom: {
        parentItemCode: child.explodedFrom,
        parentQuantity: child.explodedFromQuantity,
        calculatedQuantity: child.quantity,
        rounded: child.rounded,
        path: child.explodedFromPath,
      },
    }))
    setLines(current => {
      const lineIndex = current.findIndex(line => line.id === bomPreview.lineId)
      if (lineIndex < 0) return current
      return [...current.slice(0, lineIndex), ...replacement, ...current.slice(lineIndex + 1)]
    })
    setBomPreview(null)
    setBomConfirmed(false)
    for (const child of replacement) {
      if (!child.item) continue
      void requestAvailability(child.id, child.item.itemCode, sourceWarehouseCode)
      void requestPackagePattern(child.id, child.item.itemCode)
    }
  }, [bomConfirmed, bomPreview, lines, requestAvailability, requestPackagePattern, sourceWarehouseCode])

  const chooseItem = useCallback((item: SearchItem) => {
    const itemUpdate: Partial<DraftLine> = {
      item,
      availability: null,
      availabilityError: null,
      packagePattern: null,
      packagePatternError: null,
      batchQuantities: {},
      selectedSerials: [],
    }
    const lineId = editingLineId ?? createClientId()
    if (editingLineId) {
      updateLine(editingLineId, itemUpdate)
    } else {
      setLines(current => [...current, { ...createDraftLine(), ...itemUpdate, id: lineId }])
      invalidateValidation()
    }
    setSearchResults([])
    setSearchTerm('')
    setSearchError(null)
    setEditingLineId(null)
    void requestAvailability(lineId, item.itemCode, sourceWarehouseCode)
    void requestPackagePattern(lineId, item.itemCode)
  }, [editingLineId, invalidateValidation, requestAvailability, requestPackagePattern, sourceWarehouseCode, updateLine])

  const validateRequest = useCallback(async () => {
    if (clientFormError) {
      setFormError(clientFormError)
      return
    }
    setValidating(true)
    setFormError(null)
    setValidation({
      valid: true,
      checkedAt: new Date().toISOString(),
      issues: [],
      lines: lines.flatMap((line, lineIndex) => line.availability ? [{
        lineIndex,
        availability: line.availability.availability,
      }] : []),
    })
    setConfirmed(false)
    setValidating(false)
  }, [clientFormError, lines])

  const createRequest = useCallback(async () => {
    if (!validation?.valid) {
      setFormError('Valide la solicitud contra SAP antes de crearla.')
      return
    }
    if (!confirmed) {
      setFormError('Confirme la casilla antes de crear la solicitud en SAP.')
      return
    }
    setCreating(true)
    setFormError(null)
    try {
      const isEditing = editingDocEntry !== null
      const endpoint = isEditing
        ? `/api/engineering/sap-operations/transfer-requests/${editingDocEntry}/update`
        : '/api/engineering/sap-operations/transfer-requests/create'
      const result = await apiRequest<{ operation: OperationSummary; request: RequestDetail['request']; idempotent: boolean }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          ...serializeDraft(sourceWarehouseCode, destinationWarehouseCode, businessComment.trim(), lines),
          idempotencyKey,
          responsibleUserId: responsibleMode === 'creator' ? configuration?.creator.id ?? '' : responsibleUserId,
          confirmed: true,
        }),
      })
      setSelectedDetail({ operation: result.operation, request: result.request })
      setOperations(current => [result.operation, ...current.filter(operation => operation.id !== result.operation.id)])
      setNewRequestOpen(false)
      setLines([])
      setEditingLineId(null)
      setSourceWarehouseCode('')
      setDestinationWarehouseCode('')
      setSourceWarehouseSearch('')
      setDestinationWarehouseSearch('')
      setBusinessComment('')
      setEditingDocEntry(null)
      setValidation(null)
      setConfirmed(false)
      setIdempotencyKey(createClientId())
      if (result.idempotent) {
        setFormError(isEditing
          ? 'Se recuperó la modificación ya registrada con la misma clave de idempotencia.'
          : 'Se recuperó la solicitud ya creada con la misma clave de idempotencia.')
      }
      await loadHistory()
    } catch (error) {
      const requestError = error instanceof RequestApiError ? error : null
      if (requestError?.payload.operation) {
        setOperations(current => [requestError.payload.operation!, ...current.filter(operation => operation.id !== requestError.payload.operation!.id)])
      }
      if (requestError?.payload.operation?.operationStatus === 'failed') {
        setIdempotencyKey(createClientId())
      }
      setFormError(error instanceof Error ? error.message : 'No fue posible crear la solicitud.')
      await loadHistory()
    } finally {
      setCreating(false)
    }
  }, [businessComment, configuration?.creator.id, confirmed, destinationWarehouseCode, editingDocEntry, idempotencyKey, lines, loadHistory, responsibleMode, responsibleUserId, sourceWarehouseCode, validation?.valid])

  const loadDetail = useCallback(async (docEntry: number) => {
    setDetailLoadingEntry(docEntry)
    setDetailError(null)
    try {
      const result = await apiRequest<RequestDetail>(`/api/engineering/sap-operations/transfer-requests/${docEntry}`)
      setSelectedDetail(result)
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'No fue posible releer el documento SAP.')
    } finally {
      setDetailLoadingEntry(null)
    }
  }, [])

  const removeLine = useCallback((lineId: string) => {
    setLines(current => current.filter(line => line.id !== lineId))
    setEditingLineId(current => current === lineId ? null : current)
    invalidateValidation()
  }, [invalidateValidation])

  const startEditingLine = useCallback((lineId: string) => {
    setEditingLineId(lineId)
    setSearchTerm('')
    setSearchResults([])
    setSearchError(null)
    window.requestAnimationFrame(() => itemSearchInputRef.current?.focus())
  }, [])

  const cancelEditingLine = useCallback(() => {
    setEditingLineId(null)
    setSearchResults([])
    setSearchError(null)
    window.requestAnimationFrame(() => itemSearchInputRef.current?.focus())
  }, [])

  const openNewRequest = useCallback(() => {
    setNewRequestOpen(true)
    setEditingDocEntry(null)
    setSourceWarehouseCode('')
    setDestinationWarehouseCode('')
    setSourceWarehouseSearch('')
    setDestinationWarehouseSearch('')
    setBusinessComment('')
    setResponsibleMode('')
    setResponsibleUserId('')
    setLines([])
    setEditingLineId(null)
    setValidation(null)
    setConfirmed(false)
    setFormError(null)
    setIdempotencyKey(createClientId())
    if (!configuration) void loadConfiguration()
  }, [configuration, loadConfiguration])

  const startEditingRequest = useCallback(async () => {
    if (!selectedDetail) return
    if (!isEditableDocumentStatus(selectedDetail.request.documentStatus)) {
      setDetailError('La solicitud ya no está abierta en SAP y no se puede modificar.')
      return
    }
    const activeConfiguration = configuration ?? await loadConfiguration()
    if (!activeConfiguration) return

    const sourceWarehouseCode = selectedDetail.request.fromWarehouse
      ?? selectedDetail.request.lines[0]?.fromWarehouseCode
      ?? ''
    const destinationWarehouseCode = selectedDetail.request.toWarehouse
      ?? selectedDetail.request.lines[0]?.warehouseCode
      ?? ''
    const nextLines = selectedDetail.request.lines.map(line => ({
      ...createDraftLine(),
      item: { itemCode: line.itemCode, itemName: line.itemDescription || line.itemCode },
      quantity: String(line.quantity),
      transferType: transferTypeFromDocument(line.transferType),
      batchQuantities: Object.fromEntries(line.batchNumbers.map(batch => [batch.batchNumber, String(batch.quantity)])),
      selectedSerials: line.serialNumbers.map(serial => serial.systemSerialNumber),
    }))
    const draftLines = nextLines

    setNewRequestOpen(true)
    setEditingDocEntry(selectedDetail.request.docEntry)
    setSourceWarehouseCode(sourceWarehouseCode)
    setDestinationWarehouseCode(destinationWarehouseCode)
    setBusinessComment(selectedDetail.request.businessComment || '')
    setResponsibleMode('')
    setResponsibleUserId('')
    setLines(draftLines)
    setEditingLineId(null)
    setValidation(null)
    setConfirmed(false)
    setFormError(null)
    setIdempotencyKey(createClientId())
    for (const line of draftLines) {
      if (!line.item) continue
      void requestAvailability(line.id, line.item.itemCode, sourceWarehouseCode, true)
      void requestPackagePattern(line.id, line.item.itemCode)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [configuration, loadConfiguration, requestAvailability, requestPackagePattern, selectedDetail])

  const editingRequest = editingDocEntry !== null
  const detailResponsible = selectedDetail ? responsibleFromOperation(selectedDetail.operation) : null
  const detailTotalQuantity = selectedDetail
    ? selectedDetail.request.lines.reduce((total, line) => total + line.quantity, 0)
    : 0

  const printTransferRequest = useCallback(() => {
    window.print()
  }, [])

  return (
    <div className="space-y-8 pb-8">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-firplak-green"><Truck className="h-4 w-4" /> Ingeniería / Operaciones SAP</div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Solicitudes de traslado</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Crea únicamente solicitudes de traslado en SAP. El movimiento efectivo se realizará en un módulo posterior.
          </p>
        </div>
        <Button type="button" onClick={openNewRequest} className="bg-firplak-green text-white hover:bg-firplak-green/90"><Plus className="mr-2 h-4 w-4" />Crear solicitud de traslado nueva</Button>
      </header>

      {newRequestOpen ? <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-firplak-green" /> {editingRequest ? `Modificar solicitud #${editingDocEntry}` : 'Nueva solicitud'}</CardTitle>
          <CardDescription>{editingRequest ? 'Solo se puede modificar mientras SAP mantenga el documento abierto. Se volverá a validar antes de guardar.' : 'Los datos del socio, contacto, destino, serie y lista de precios están fijados para evitar errores operativos.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-7 pt-5">
           {configuration ? (
            <>
              <section className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2 xl:grid-cols-3">
                <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Socio de negocios</span><span className="mt-1 block font-medium text-slate-800">{configuration.defaults.cardCode} - {configuration.defaults.cardName}</span></div>
                <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Persona de contacto</span><span className="mt-1 block font-medium text-slate-800">{configuration.defaults.contactLabel}</span></div>
                <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Destino</span><span className="mt-1 block font-medium text-slate-800">{configuration.defaults.shipToCode}</span></div>
                <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Serie SAP</span><span className="mt-1 block font-medium text-slate-800">{configuration.defaults.series} - {configuration.defaults.seriesLabel}</span></div>
                <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Lista de precios</span><span className="mt-1 block font-medium text-slate-800">{configuration.defaults.priceListLabel}</span></div>
                <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Comentarios SAP</span><span className="mt-1 block font-medium text-slate-800">{configuration.defaults.automaticComment}</span></div>
                <div className="border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600 md:col-span-2 xl:col-span-3">
                  <span className="font-bold text-slate-700">Dirección configurada:</span>
                  {configuration.defaults.shipToAddress.split(/\r?\n/).map(line => <span key={line} className="block">{line}</span>)}
                </div>
              </section>

              <section className="grid gap-4 rounded-xl border border-slate-200 bg-firplak-ivory/35 p-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="source-warehouse">De almacén</Label>
                  <Input id="source-warehouse" type="search" list="source-warehouse-options" value={sourceWarehouseSearch} onChange={event => handleWarehousePickerChange('source', event.target.value)} placeholder="Busque y seleccione por código o nombre" autoComplete="off" aria-describedby="source-warehouse-help" />
                  <datalist id="source-warehouse-options">
                    {filteredSourceWarehouses.map(warehouse => <option key={warehouse.warehouseCode} value={warehouseOptionValue(warehouse)} />)}
                  </datalist>
                  <p id="source-warehouse-help" className="text-xs text-slate-500">Escriba para filtrar y elija una bodega de la lista.</p>
                  {filteredSourceWarehouses.length === 0 ? <p className="text-xs text-amber-700">No hay bodegas que coincidan con la búsqueda.</p> : null}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="destination-warehouse">Almacén destino</Label>
                  <Input id="destination-warehouse" type="search" list="destination-warehouse-options" value={destinationWarehouseSearch} onChange={event => handleWarehousePickerChange('destination', event.target.value)} placeholder="Busque y seleccione por código o nombre" autoComplete="off" aria-describedby="destination-warehouse-help" />
                  <datalist id="destination-warehouse-options">
                    {filteredDestinationWarehouses.map(warehouse => <option key={warehouse.warehouseCode} value={warehouseOptionValue(warehouse)} />)}
                  </datalist>
                  <p id="destination-warehouse-help" className="text-xs text-slate-500">Escriba para filtrar y elija una bodega de la lista.</p>
                  {filteredDestinationWarehouses.length === 0 ? <p className="text-xs text-amber-700">No hay bodegas que coincidan con la búsqueda.</p> : null}
                </div>
                {sourceWarehouseCode && sourceWarehouseCode === destinationWarehouseCode ? (
                  <div className="md:col-span-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"><AlertCircle className="h-4 w-4" /> La bodega de origen debe ser distinta a la bodega destino.</div>
                ) : null}
              </section>

              {warehousesReady ? <>
              <section className="space-y-3">
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <Table className="min-w-[1040px]">
                  <TableHeader className="bg-slate-50"><TableRow><TableHead className="w-10">#</TableHead><TableHead className="min-w-72">Artículo / descripción</TableHead><TableHead className="w-24">PATRÓN</TableHead><TableHead className="w-16">STOCK</TableHead><TableHead className="w-14">COM</TableHead><TableHead className="w-14">ATP</TableHead><TableHead className="w-14">UND</TableHead><TableHead className="w-28">CANT.</TableHead><TableHead className="w-32">Tipo traslado</TableHead><TableHead className="w-10"><span className="sr-only">Eliminar</span></TableHead></TableRow></TableHeader>
                  <TableBody>{lines.flatMap((line, lineIndex) => {
                    if (editingLineId === line.id) {
                      return [
                         <InlineItemSearchRows key={`${line.id}-item-editor`} mode="edit" lineNumber={lineIndex + 1} inputRef={itemSearchInputRef} searchTerm={searchTerm} searching={searching} searchError={searchError} searchResults={searchResults} onSearchTermChange={setSearchTerm} onSearch={() => void searchItems()} onSelectItem={chooseItem} onCancelEdit={cancelEditingLine} isAdmin={isAdmin} />,
                      ]
                    }
                    const lineError = clientLineErrors[lineIndex]
                    const allocation = line.availability?.allocation
                    const stock = line.availability?.availability
                    const pattern = line.packagePattern
                    const alternativeWarehouses = stock?.availableQuantity === 0
                      ? (line.availability?.warehouseAvailability ?? []).flatMap(availability => {
                          const warehouse = activeWarehousesByCode.get(availability.warehouseCode)
                          if (!warehouse || availability.warehouseCode === sourceWarehouseCode || availability.warehouseCode === destinationWarehouseCode || availability.availableQuantity <= 0) return []
                          return [{ ...availability, warehouseName: warehouse.warehouseName }]
                        })
                      : []
                    return [
                      <TableRow key={line.id} className={line.id === editingLineId ? 'bg-firplak-green/5' : undefined}>
                        <TableCell className="font-bold text-slate-700">{lineIndex + 1}</TableCell>
                         <TableCell className="whitespace-normal break-words"><p className="font-semibold text-slate-800">{line.item?.itemCode ?? 'Por completar'}</p><p className="mt-1 max-h-10 overflow-hidden text-sm leading-5 text-slate-600">{line.item?.itemName ?? 'Busque el artículo y agréguelo a esta línea.'}</p><Button type="button" size="sm" variant="ghost" onClick={() => startEditingLine(line.id)} className="mt-1 h-7 px-1.5 text-xs text-firplak-green hover:bg-firplak-green/5"><Pencil className="mr-1 h-3.5 w-3.5" />Editar artículo</Button>{line.item && line.availability?.hasBom ? <Button type="button" size="sm" variant="ghost" onClick={() => void loadBomPreview(line.id, line.item?.itemCode ?? '', Number(line.quantity))} disabled={bomPreviewLoading} className="mt-1 h-7 px-1.5 text-xs text-sky-700 hover:bg-sky-50"><PackageSearch className="mr-1 h-3.5 w-3.5" />Estallar BOM</Button> : null}</TableCell>
                        <TableCell className="whitespace-normal text-xs leading-4 text-slate-600">{line.packagePatternLoading ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analizando</span> : pattern?.status === 'observed' ? <><strong className="block text-sm text-firplak-green">Paquete: {formatNumber(pattern.packageQuantity ?? 0)}</strong><span>{pattern.matchingTransfers} traslados MP-01</span></> : pattern || line.packagePatternError ? <strong className="text-sm text-slate-700">NA</strong> : '—'}</TableCell>
                        <TableCell>{stock ? formatNumber(stock.inventoryQuantity) : '—'}</TableCell><TableCell>{stock ? formatNumber(stock.committedQuantity) : '—'}</TableCell><TableCell className="font-semibold text-firplak-green">{stock ? formatNumber(stock.availableQuantity) : '—'}</TableCell><TableCell>{line.availability?.inventoryUom || '—'}</TableCell>
                         <TableCell><SapQuantityInput id={`quantity-${line.id}`} ariaLabel={`Cantidad línea ${lineIndex + 1}`} value={line.quantity} onChange={quantity => updateLine(line.id, { quantity })} />{stock && Number(line.quantity) > stock.availableQuantity && stock.inventoryQuantity > 0 ? <label className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-amber-800"><input type="checkbox" checked={line.allowZeroAvailable} onChange={event => updateLine(line.id, { allowZeroAvailable: event.target.checked })} className="mt-0.5 h-3.5 w-3.5 rounded accent-amber-700" />Hacer solicitud así no haya disponibles</label> : null}</TableCell>
                        <TableCell><select id={`transfer-type-${line.id}`} aria-label={`Tipo traslado línea ${lineIndex + 1}`} value={line.transferType} onChange={event => updateLine(line.id, { transferType: event.target.value as DraftLine['transferType'] })} className={SELECT_CLASS_NAME}><option value="">Seleccione tipo</option><option value="Físico">Físico</option><option value="Virtual">Virtual</option></select></TableCell>
                        <TableCell><Button type="button" size="icon-sm" variant="ghost" onClick={() => removeLine(line.id)} aria-label={`Eliminar línea ${lineIndex + 1}`}><Trash2 className="h-4 w-4 text-red-600" /></Button></TableCell>
                      </TableRow>,
                      allocation?.requiresAllocation ? <TableRow key={`${line.id}-allocation`}><TableCell colSpan={10} className="bg-amber-50/50 p-3"><div className="rounded-lg border border-amber-200 bg-white p-3"><div className="flex items-start gap-2"><PackageSearch className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><p className="text-sm font-semibold text-amber-900">Selección SAP por {allocation.management === 'batch' ? 'lotes' : 'seriales'}</p>{allocation.message ? <p className="mt-1 text-xs leading-5 text-amber-800">{allocation.message}</p> : null}</div></div>{allocation.management === 'batch' && allocation.status === 'available' ? <div className="mt-3 grid gap-2 md:grid-cols-2">{allocation.batchOptions.map(option => <label key={option.batchNumber} className="grid grid-cols-[minmax(0,1fr)_128px] items-center gap-2 rounded-md border border-amber-200 bg-white p-2 text-sm"><span className="truncate font-medium text-slate-700">{option.batchNumber}</span><SapQuantityInput id={`batch-${line.id}-${option.batchNumber}`} ariaLabel={`Cantidad lote ${option.batchNumber}`} value={line.batchQuantities[option.batchNumber] ?? ''} onChange={quantity => updateLine(line.id, { batchQuantities: { ...line.batchQuantities, [option.batchNumber]: quantity } })} /></label>)}</div> : null}{allocation.management === 'serial' && allocation.status === 'available' ? <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto md:grid-cols-2">{allocation.serialOptions.map(option => { const checked = line.selectedSerials.includes(option.systemSerialNumber); return <label key={option.systemSerialNumber} className="flex items-center gap-2 rounded-md border border-amber-200 bg-white p-2 text-sm text-slate-700"><input type="checkbox" checked={checked} onChange={event => updateLine(line.id, { selectedSerials: event.target.checked ? [...line.selectedSerials, option.systemSerialNumber] : line.selectedSerials.filter(number => number !== option.systemSerialNumber) })} className="h-4 w-4 rounded border-slate-300 accent-firplak-green" /><span className="min-w-0 truncate"><strong>{option.serialNumber}</strong>{option.manufacturerSerialNumber ? ` - ${option.manufacturerSerialNumber}` : ''}</span></label> })}</div> : null}</div></TableCell></TableRow> : null,
                      alternativeWarehouses.length > 0 ? <TableRow key={`${line.id}-alternative-warehouses`}><TableCell colSpan={10} className="bg-sky-50/70 p-3"><div className="rounded-lg border border-sky-200 bg-white p-3"><p className="text-sm font-semibold text-sky-950">Este artículo no tiene disponible en {sourceWarehouseCode}. Disponible en:</p><div className="mt-2 flex flex-wrap items-center gap-2">{alternativeWarehouses.map(warehouse => { const selected = line.suggestedSourceWarehouseCode === warehouse.warehouseCode; return <Button key={warehouse.warehouseCode} type="button" size="sm" variant="outline" onClick={() => chooseSuggestedSourceWarehouse(line.id, warehouse.warehouseCode)} className={selected ? 'h-auto border-firplak-green bg-firplak-green px-3 py-2 text-left text-white hover:bg-firplak-green/90' : 'h-auto border-sky-300 bg-sky-50 px-3 py-2 text-left text-sky-900 hover:bg-sky-100'}><span className="block font-semibold">{warehouse.warehouseCode} · {warehouse.warehouseName}</span><span className="block text-xs opacity-85">Disponible: {formatNumber(warehouse.availableQuantity)} {line.availability?.inventoryUom || ''}</span></Button> })}{line.suggestedSourceWarehouseCode ? <span className="text-xs font-medium text-firplak-green">Vuelve a dar clic para configurar esta bodega como origen.</span> : null}</div></div></TableCell></TableRow> : null,
                      <TableRow key={`${line.id}-status`}><TableCell colSpan={10} className={lineError ? 'bg-red-50 text-red-700' : 'bg-firplak-green/5 text-firplak-green'}><div className="flex items-center gap-2 text-sm font-medium">{line.availabilityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : lineError ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{lineError ?? 'Línea lista para validar.'}</div></TableCell></TableRow>,
                    ]
                   })}{editingLineId === null ? <InlineItemSearchRows mode="append" lineNumber={lines.length + 1} inputRef={itemSearchInputRef} searchTerm={searchTerm} searching={searching} searchError={searchError} searchResults={searchResults} onSearchTermChange={setSearchTerm} onSearch={() => void searchItems()} onSelectItem={chooseItem} onCancelEdit={cancelEditingLine} isAdmin={isAdmin} /> : null}</TableBody>
                </Table>
              </div>
              </section>
              </> : null}

              {hasReadyTransferLine ? <section className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-4"><Label htmlFor="business-comment">Comentarios</Label><span className="text-xs font-medium text-slate-500">{Array.from(businessComment).length}/50</span></div>
                  <Textarea id="business-comment" value={businessComment} onChange={event => { setBusinessComment(event.target.value); invalidateValidation() }} maxLength={50} placeholder="Indique a quién se relaciona y por qué se solicita el traslado." className="min-h-24" />
                  <p className="text-xs text-slate-500">Se guarda en U_Comentarios de cabecera.</p>
                </div>
                {hasBusinessComment ? <div className="grid content-start gap-2">
                  <Label>Responsable de solicitud</Label>
                  <p className="text-xs text-slate-500">Seleccione quién responderá por esta solicitud.</p>
                  <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="responsible-mode" checked={responsibleMode === 'creator'} onChange={() => { setResponsibleMode('creator'); setResponsibleUserId(''); invalidateValidation() }} className="h-4 w-4 accent-firplak-green" />La persona que {editingRequest ? 'modifica' : 'crea'} la solicitud</label>
                  <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="responsible-mode" checked={responsibleMode === 'other'} onChange={() => { setResponsibleMode('other'); invalidateValidation() }} className="h-4 w-4 accent-firplak-green" />El responsable es otro</label>
                  {responsibleMode === 'other' ? <select value={responsibleUserId} onChange={event => { setResponsibleUserId(event.target.value); invalidateValidation() }} className={SELECT_CLASS_NAME} aria-label="Seleccionar responsable"><option value="">Seleccione una persona</option>{configuration.responsibleUsers.map(user => <option key={user.id} value={user.id}>{user.email}{user.role ? ` - ${user.role}` : ''}</option>)}</select> : null}
                  {responsibleMode === 'creator' ? <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{configuration.creator.email || 'Usuario autenticado'}</p> : null}
                </div> : null}
              </section> : null}

              {hasSelectedResponsible && validating ? <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900"><Loader2 className="h-5 w-5 animate-spin" /><span>Verificando los datos ya consultados de la solicitud...</span></div> : null}
              {hasSelectedResponsible && formError ? <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{formError}</span></div> : null}
              {hasSelectedResponsible && validation ? (
                <div className={`rounded-lg border px-4 py-3 ${validation.valid ? 'border-firplak-green/30 bg-firplak-green/5' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">{validation.valid ? <CheckCircle2 className="h-4 w-4 text-firplak-green" /> : <AlertCircle className="h-4 w-4 text-red-700" />}{validation.valid ? `Validación SAP completada: ${formatDate(validation.checkedAt)}` : 'SAP encontró correcciones necesarias'}</div>
                  {validation.issues.length > 0 ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">{validation.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.lineIndex === null ? '' : `Línea ${issue.lineIndex + 1}: `}{issue.message}</li>)}</ul> : null}
                </div>
              ) : null}

              {hasSelectedResponsible ? <div className="grid gap-3 border-t border-slate-100 pt-5 lg:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3"><p className="mb-2 text-sm font-semibold text-slate-800">1. Validar solicitud</p><Button type="button" variant="outline" onClick={() => void validateRequest()} disabled={validating || creating || Boolean(clientFormError)} className="w-full border-slate-300">{validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}{validating ? 'Verificando...' : 'Validar solicitud'}</Button><p className="mt-2 text-xs text-slate-500">Usa la disponibilidad consultada al añadir cada línea.</p></div>
                <label className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700"><span className="mb-2 block font-semibold text-slate-800">2. Confirmar</span><span className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={!validation?.valid || creating} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-firplak-green disabled:opacity-50" /><span>{editingRequest ? 'Confirmo la modificación en SAP.' : 'Confirmo la creación en SAP.'}</span></span></label>
                <div className="rounded-lg border border-firplak-green/25 bg-firplak-green/5 p-3"><p className="mb-2 text-sm font-semibold text-slate-800">3. {editingRequest ? 'Guardar modificación' : 'Crear solicitud'}</p><Button type="button" onClick={() => void createRequest()} disabled={creating || !validation?.valid || !confirmed} className="w-full bg-firplak-green text-white hover:bg-firplak-green/90"><Truck className="mr-2 h-4 w-4" />{creating ? (editingRequest ? 'Modificando en SAP...' : 'Creando en SAP...') : (editingRequest ? 'Modificar solicitud' : 'Crear solicitud')}</Button></div>
              </div> : null}
             </>
           ) : configurationError ? (
             <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{configurationError}</span></div>
           ) : (
             <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración SAP...</div>
           )}
        </CardContent>
      </Card> : null}

      <Card>
        <CardHeader className="border-b border-slate-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Historial de Operaciones SAP</CardTitle><CardDescription>Incluye creaciones y modificaciones realizadas desde esta aplicación, con su auditoría y verificación.</CardDescription></div><Button type="button" variant="outline" onClick={() => void loadHistory()} disabled={historyLoading} className="border-slate-200"><RefreshCw className={`mr-2 h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />Actualizar</Button></div>
        </CardHeader>
        <CardContent className="pt-0">
          {historyError ? <div className="mt-5 flex items-center gap-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{historyError}</div> : null}
          {historyLoading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando historial...</div> : null}
          {!historyLoading && !historyError ? (
            <Table>
              <TableHeader><TableRow><TableHead>Documento SAP</TableHead><TableHead>Estado</TableHead><TableHead>Hecha por</TableHead><TableHead>Responsable</TableHead><TableHead>Bodegas</TableHead><TableHead>Comentario</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
              <TableBody>
                {operations.length === 0 ? <TableRow><TableCell colSpan={7} className="h-24 text-center text-slate-500">Aún no hay solicitudes creadas desde la aplicación.</TableCell></TableRow> : null}
                {operations.map(operation => { const responsible = responsibleFromOperation(operation); return <TableRow key={operation.id}><TableCell><div className="font-semibold text-slate-800">{operation.sapDocNum ? `#${operation.sapDocNum}` : 'Pendiente de número'}</div><div className="text-xs text-slate-400">{formatDate(operation.createdAt)}</div></TableCell><TableCell><Badge variant={statusVariant(operation.operationStatus)}>{statusLabel(operation.operationStatus)}</Badge><div className="mt-1 text-xs text-slate-500">{operationTypeLabel(operation)}</div>{operation.errorMessage ? <div className="mt-1 max-w-48 truncate text-xs text-red-600" title={operation.errorMessage}>{operation.errorMessage}</div> : null}</TableCell><TableCell><div className="text-sm text-slate-700">{operation.actorEmail || 'No disponible'}</div><div className="text-xs text-slate-400">{operation.actorRole || 'Sin rol'}</div></TableCell><TableCell><div className="text-sm text-slate-700">{responsible?.email || 'No registrado'}</div><div className="text-xs text-slate-400">{responsible?.role || 'Sin rol'}</div></TableCell><TableCell className="text-sm">{operation.sourceWarehouse || '-'} <span className="text-slate-400">→</span> {operation.destinationWarehouse || '-'}</TableCell><TableCell className="max-w-64 truncate" title={operation.businessComment || ''}>{operation.businessComment || '-'}</TableCell><TableCell className="text-right">{operation.sapDocEntry ? <Button type="button" size="sm" variant="outline" onClick={() => void loadDetail(operation.sapDocEntry!)} disabled={detailLoadingEntry === operation.sapDocEntry} className="border-slate-200">{detailLoadingEntry === operation.sapDocEntry ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileSearch className="mr-1.5 h-3.5 w-3.5" />}Ver detalle</Button> : <span className="text-xs text-slate-400">Sin DocEntry</span>}</TableCell></TableRow>})}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      {bomPreview || bomPreviewLoading || bomPreviewError ? <Card className="border-sky-200 bg-sky-50/40">
        <CardHeader className="border-b border-sky-100"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-sky-950">Preview de explosión BOM</CardTitle><CardDescription>El padre será reemplazado por sus hijos en la misma posición. La información se releerá antes de guardar en SAP.</CardDescription></div><Button type="button" variant="ghost" onClick={() => { setBomPreview(null); setBomPreviewError(null); setBomConfirmed(false) }} className="text-slate-600">Cerrar</Button></div></CardHeader>
        <CardContent className="space-y-4 pt-4">
          {bomPreviewLoading ? <div className="flex items-center gap-2 text-sm text-sky-900"><Loader2 className="h-4 w-4 animate-spin" />Consultando la LdM y disponibilidad de los hijos...</div> : null}
          {bomPreviewError ? <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"><AlertCircle className="h-4 w-4" />{bomPreviewError}</div> : null}
          {bomPreview ? <>
            <p className="text-sm font-semibold text-slate-800">{bomPreview.parentItemCode} · cantidad padre: {formatNumber(bomPreview.parentQuantity)}</p>
            <div className="overflow-x-auto rounded-lg border border-sky-200 bg-white"><Table><TableHeader><TableRow><TableHead>Hijo</TableHead><TableHead>Cantidad</TableHead><TableHead>Unidad</TableHead><TableHead>Stock</TableHead><TableHead>ATP</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader><TableBody>{bomPreview.lines.map((child, index) => { const noStock = child.availability.inventoryQuantity <= 0; const lowAtp = child.quantity > child.availability.availableQuantity; return <TableRow key={`${child.itemCode}-${index}`}><TableCell><div className="font-semibold">{child.itemCode}</div><div className="text-xs text-slate-500">{child.itemName}</div></TableCell><TableCell>{formatNumber(child.quantity)}{child.rounded ? <div className="text-[11px] font-medium text-amber-700">Redondeada a 2 decimales</div> : null}</TableCell><TableCell>{child.inventoryUom || '-'}</TableCell><TableCell>{formatNumber(child.availability.inventoryQuantity)}</TableCell><TableCell>{formatNumber(child.availability.availableQuantity)}</TableCell><TableCell><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!noStock} disabled className="h-3.5 w-3.5 rounded accent-firplak-green" />Con stock</label>{noStock ? <Badge variant="destructive">Línea bloqueada</Badge> : lowAtp ? <Badge variant="outline" className="border-amber-300 text-amber-800">Requiere override</Badge> : <Badge variant="secondary">Disponible</Badge>}</TableCell><TableCell>{child.hasBom ? <Button type="button" size="sm" variant="ghost" onClick={() => void loadBomPreview(bomPreview.lineId, child.itemCode, child.quantity, child.explodedFromPath.slice(0, -1), index)} disabled={bomPreviewLoading} className="text-sky-700">Estallar este componente</Button> : null}</TableCell></TableRow> })}</TableBody></Table></div>
            <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={bomConfirmed} onChange={event => setBomConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-firplak-green" /><span>Confirmo reemplazar el padre por estas líneas, conservando también los hijos sin stock como líneas bloqueadas.</span></label>
            <Button type="button" onClick={confirmBomExplosion} disabled={!bomConfirmed || bomPreviewLoading || bomPreview.lines.length === 0} className="bg-firplak-green text-white hover:bg-firplak-green/90">Confirmar explosión BOM</Button>
          </> : null}
        </CardContent>
      </Card> : null}
      {catalogReviewItems ? <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="border-b border-amber-100"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-amber-950">Nuevos artículos pendientes</CardTitle><CardDescription>Solo visible para administradores. La revisión no bloquea las solicitudes; SAP continúa siendo la fuente de verdad.</CardDescription></div><Button type="button" variant="outline" onClick={() => void loadCatalogReview()} disabled={catalogReviewLoading}>{catalogReviewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Actualizar</Button></div></CardHeader>
        <CardContent className="space-y-3 pt-4">{catalogReviewError ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{catalogReviewError}</p> : null}{catalogReviewItems.length === 0 ? <p className="text-sm text-slate-600">No hay artículos pendientes de revisión.</p> : catalogReviewItems.map(item => <div key={item.itemCode} className="grid gap-3 rounded-lg border border-amber-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_auto]"><div><p className="font-semibold text-slate-800">{item.itemCode}</p><p className="text-sm text-slate-600">{item.itemName}</p><label className="mt-2 flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={catalogReviewConfirmed[item.itemCode] === true} onChange={event => setCatalogReviewConfirmed(current => ({ ...current, [item.itemCode]: event.target.checked }))} className="mt-0.5 h-3.5 w-3.5 rounded accent-firplak-green" />Confirmo que revisé este registro contra SAP.</label></div><div className="flex flex-wrap items-center gap-2 md:justify-end"><Button type="button" size="sm" onClick={() => void reviewCatalogItem(item.itemCode, 'approved')} disabled={!catalogReviewConfirmed[item.itemCode] || catalogReviewAction === item.itemCode} className="bg-firplak-green text-white hover:bg-firplak-green/90">{catalogReviewAction === item.itemCode ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}Aprobar</Button><Button type="button" size="sm" variant="outline" onClick={() => void reviewCatalogItem(item.itemCode, 'rejected')} disabled={!catalogReviewConfirmed[item.itemCode] || catalogReviewAction === item.itemCode} className="border-red-200 text-red-700">Rechazar</Button></div></div>)}</CardContent>
      </Card> : null}
      {detailError ? <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle className="h-4 w-4" />{detailError}</div> : null}
      {selectedDetail ? (
        <Card className="border-firplak-green/20">
          <CardHeader className="border-b border-slate-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><CardTitle>Detalle verificado desde SAP {selectedDetail.request.docNum ? `#${selectedDetail.request.docNum}` : ''}</CardTitle><CardDescription>Leído nuevamente desde SAP antes de mostrarlo.</CardDescription></div>
              <div className="flex flex-wrap gap-2">
                {isEditableDocumentStatus(selectedDetail.request.documentStatus) ? <Button type="button" variant="outline" onClick={() => void startEditingRequest()} className="border-firplak-green text-firplak-green hover:bg-firplak-green/5"><Pencil className="mr-2 h-4 w-4" />Modificar solicitud</Button> : <span className="self-center text-xs text-slate-500">SAP ya no permite modificar esta solicitud.</span>}
                <Button type="button" onClick={printTransferRequest} className="bg-slate-900 text-white hover:bg-slate-800"><Printer className="mr-2 h-4 w-4" />Imprimir comprobante</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Estado SAP</span><span className="text-sm font-bold text-slate-800">{selectedDetail.request.documentStatus || 'No disponible'}</span></div>
              <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Documento SAP</span><span className="text-sm font-bold text-slate-800">{selectedDetail.request.docNum ? `#${selectedDetail.request.docNum}` : 'No disponible'}</span></div>
              <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha documento</span><span className="text-sm font-bold text-slate-800">{formatDate(selectedDetail.request.docDate)}</span></div>
              <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Vencimiento</span><span className="text-sm font-bold text-slate-800">{formatDate(selectedDetail.request.dueDate)}</span></div>
              <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Contabilización</span><span className="text-sm font-bold text-slate-800">{formatDate(selectedDetail.request.taxDate)}</span></div>
              <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Socio</span><span className="text-sm font-bold text-slate-800">{selectedDetail.request.cardCode || 'No disponible'}</span></div>
              <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Destino</span><span className="text-sm font-bold text-slate-800">{selectedDetail.request.shipToCode || 'No disponible'}</span></div>
              <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Contacto SAP</span><span className="text-sm font-bold text-slate-800">{selectedDetail.request.contactPerson ?? 'No disponible'}</span></div>
              <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Solicitó</span><span className="block break-all text-sm font-bold text-slate-800">{selectedDetail.operation.actorEmail || 'No registrado'}</span><span className="text-xs text-slate-500">{selectedDetail.operation.actorRole || 'Sin rol'}</span></div>
              <div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Responsable</span><span className="block break-all text-sm font-bold text-slate-800">{detailResponsible?.email || 'No registrado'}</span><span className="text-xs text-slate-500">{detailResponsible?.role || 'Sin rol'}</span></div>
            </div>
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2"><div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Bodega de salida</span><span className="font-bold text-slate-800">{selectedDetail.request.fromWarehouse || selectedDetail.operation.sourceWarehouse || 'No disponible'}</span></div><div><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Bodega de entrada</span><span className="font-bold text-slate-800">{selectedDetail.request.toWarehouse || selectedDetail.operation.destinationWarehouse || 'No disponible'}</span></div></div>
            <Table><TableHeader><TableRow><TableHead>Artículo</TableHead><TableHead>Unidad</TableHead><TableHead>Cantidad</TableHead><TableHead>De almacén</TableHead><TableHead>Destino</TableHead><TableHead>Tipo</TableHead></TableRow></TableHeader><TableBody>{selectedDetail.request.lines.map(line => <TableRow key={`${line.lineNumber}-${line.itemCode}`}><TableCell><div className="font-semibold">{line.itemCode}</div><div className="text-xs text-slate-500">{line.itemDescription || 'Sin descripción'}</div></TableCell><TableCell>{line.unitOfMeasure || '-'}</TableCell><TableCell>{formatNumber(line.quantity)}</TableCell><TableCell>{line.fromWarehouseCode || '-'}</TableCell><TableCell>{line.warehouseCode || '-'}</TableCell><TableCell>{line.transferType || '-'}</TableCell></TableRow>)}</TableBody></Table>
            <div className="flex justify-end border-t border-slate-200 pt-3 text-sm text-slate-700"><span className="mr-4 font-semibold">Total solicitado</span><span className="font-bold text-slate-900">{formatNumber(detailTotalQuantity)}</span></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><span className="font-semibold">Comentario contextual:</span> {selectedDetail.request.businessComment || selectedDetail.operation.businessComment || 'No disponible'}</div>
          </CardContent>
        </Card>
      ) : null}
      {selectedDetail ? (
        <section data-transfer-print-sheet className="hidden" aria-hidden="true">
          <div className="transfer-print-sheet">
            <header className="transfer-print-header">
              <div>
                <div className="transfer-print-brand">FIRPLAK</div>
                <div className="transfer-print-company">Firplak S.A.</div>
              </div>
              <div className="transfer-print-destination"><strong>Almacén de entrada:</strong> {selectedDetail.request.toWarehouse || selectedDetail.operation.destinationWarehouse || '-'}</div>
              <div className="transfer-print-title-block">
                <h1>Solicitud de traslado</h1>
                <div className="transfer-print-document-data">
                  <div><span>Almacén de salida</span><strong>{selectedDetail.request.fromWarehouse || selectedDetail.operation.sourceWarehouse || '-'}</strong></div>
                  <div><span>Número de documento</span><strong>{selectedDetail.request.docNum ? `#${selectedDetail.request.docNum}` : '-'}</strong></div>
                  <div><span>Fecha de entrega</span><strong>{formatDate(selectedDetail.request.docDate)}</strong></div>
                </div>
              </div>
            </header>

            <div className="transfer-print-meta">
              <span><strong>Solicitó:</strong> {selectedDetail.operation.actorEmail || 'No registrado'}</span>
              <span><strong>Responsable:</strong> {detailResponsible?.email || 'No registrado'}</span>
              <span><strong>Contacto SAP:</strong> {selectedDetail.request.contactPerson ?? '-'}</span>
            </div>

            <table className="transfer-print-table">
              <thead><tr><th>#</th><th>Artículo / descripción</th><th>UND</th><th>Cant.</th><th>Tipo</th></tr></thead>
              <tbody>{selectedDetail.request.lines.map((line, index) => <tr key={`print-${line.lineNumber}-${line.itemCode}`}><td>{index + 1}</td><td><strong>{line.itemCode}</strong>{line.itemDescription ? <span>{line.itemDescription}</span> : null}</td><td>{line.unitOfMeasure || '-'}</td><td>{formatNumber(line.quantity)}</td><td>{line.transferType || '-'}</td></tr>)}</tbody>
            </table>

            <footer className="transfer-print-footer">
              <div className="transfer-print-total"><strong>Total:</strong><span>{formatNumber(detailTotalQuantity)}</span></div>
              <div className="transfer-print-comment"><strong>Comentarios</strong><span>{selectedDetail.request.businessComment || selectedDetail.operation.businessComment || 'Sin comentario'}</span></div>
            </footer>
          </div>
        </section>
      ) : null}
      {selectedDetail ? <style>{`@page { size: letter portrait; margin: 12mm; }
        @media print {
          body * { visibility: hidden; }
          [data-transfer-print-sheet], [data-transfer-print-sheet] * { visibility: visible !important; }
          [data-transfer-print-sheet] { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
          .transfer-print-sheet { box-sizing: border-box; color: #1f3442; font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.22; max-width: 192mm; }
          .transfer-print-header { align-items: end; border-bottom: 1px solid #79b8df; display: grid; gap: 5mm; grid-template-columns: .82fr .62fr 1.65fr; padding-bottom: 3mm; }
          .transfer-print-brand { color: #294a5c; font-size: 24pt; font-weight: 500; letter-spacing: .06em; line-height: 1; }
          .transfer-print-company { font-size: 10pt; font-weight: 700; margin-top: 3mm; }
          .transfer-print-title-block h1 { border-left: 3mm solid #f4b000; color: #12202b; font-size: 16pt; line-height: 1.05; margin: 0 0 3mm; padding-left: 3mm; }
          .transfer-print-document-data { display: grid; gap: 2mm; grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .transfer-print-document-data span { color: #6f8290; display: block; font-size: 7.5pt; }
          .transfer-print-document-data strong { color: #14232e; display: block; font-size: 9pt; margin-top: 1mm; }
          .transfer-print-destination { align-self: end; color: #13222c; font-size: 9pt; line-height: 1.2; padding-bottom: 1mm; }
          .transfer-print-meta { color: #526673; display: flex; flex-wrap: wrap; font-size: 7.5pt; gap: 1mm 5mm; margin: 2mm 0; }
          .transfer-print-meta strong { color: #263b48; }
          .transfer-print-table { border-collapse: collapse; table-layout: fixed; width: 100%; }
          .transfer-print-table th { background: #f4f7f8; border-bottom: 1px solid #3e9dd5; color: #314957; font-size: 7.5pt; font-weight: 700; padding: 1.4mm 1.2mm; text-align: left; }
          .transfer-print-table td { border-bottom: 1px dotted #79b8df; padding: 1.25mm 1.2mm; vertical-align: top; word-break: break-word; }
          .transfer-print-table th:nth-child(1), .transfer-print-table td:nth-child(1) { text-align: center; width: 5%; }
          .transfer-print-table th:nth-child(2), .transfer-print-table td:nth-child(2) { width: 72%; }
          .transfer-print-table th:nth-child(3), .transfer-print-table td:nth-child(3) { width: 5%; }
          .transfer-print-table th:nth-child(4), .transfer-print-table td:nth-child(4) { text-align: right; width: 8%; }
          .transfer-print-table th:nth-child(5), .transfer-print-table td:nth-child(5) { width: 10%; }
          .transfer-print-table td:nth-child(2) strong { display: inline; font-size: 8.5pt; }
          .transfer-print-table td:nth-child(2) span { color: #526673; display: inline; font-size: 7.5pt; margin-left: 2mm; }
          .transfer-print-footer { display: grid; grid-template-columns: 5% 72% 5% 8% 10%; margin-top: 1.5mm; }
          .transfer-print-total { border-bottom: 1px solid #3e9dd5; font-size: 9pt; grid-column: 4; padding: 1.25mm 1.2mm; text-align: right; }
          .transfer-print-total strong { display: block; font-size: 7.5pt; }
          .transfer-print-total span { display: block; font-size: 10pt; font-weight: 700; margin-top: .5mm; }
          .transfer-print-comment { grid-column: 1 / -1; margin-top: 2mm; }
          .transfer-print-comment strong { display: block; font-size: 8pt; margin-bottom: 1mm; }
          .transfer-print-comment span { display: block; min-height: 4mm; white-space: pre-wrap; }
        }`}</style> : null}
    </div>
  )
}
