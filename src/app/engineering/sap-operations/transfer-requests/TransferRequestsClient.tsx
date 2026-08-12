'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
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
  availability: {
    warehouseCode: string
    inventoryQuantity: number
    committedQuantity: number
    orderedQuantity: number
    availableQuantity: number
  }
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
  error?: string
  issues?: ValidationIssue[]
  operation?: OperationSummary
}

class RequestApiError extends Error {
  readonly status: number
  readonly payload: ApiErrorPayload

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.error || 'No fue posible completar la operación.')
    this.name = 'RequestApiError'
    this.status = status
    this.payload = payload
  }
}

const SELECT_CLASS_NAME = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-firplak-green focus:ring-2 focus:ring-firplak-green/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createDraftLine(): DraftLine {
  return {
    id: createClientId(),
    item: null,
    quantity: '',
    transferType: '',
    availability: null,
    availabilityLoading: false,
    availabilityError: null,
    packagePattern: null,
    packagePatternLoading: false,
    packagePatternError: null,
    batchQuantities: {},
    selectedSerials: [],
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
  if (!line.transferType) return 'Seleccione Físico o Virtual.'
  if (line.availabilityLoading) return 'Consultando disponibilidad SAP.'
  if (line.availabilityError) return line.availabilityError
  if (!line.availability) return 'Consulte la disponibilidad del artículo.'
  if (quantity > line.availability.availability.availableQuantity) {
    return `Disponible: ${formatNumber(line.availability.availability.availableQuantity)}.`
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
    })),
  }
}

export default function TransferRequestsClient() {
  const [configuration, setConfiguration] = useState<FormConfiguration | null>(null)
  const [configurationError, setConfigurationError] = useState<string | null>(null)
  const [newRequestOpen, setNewRequestOpen] = useState(false)
  const [editingDocEntry, setEditingDocEntry] = useState<number | null>(null)
  const [sourceWarehouseCode, setSourceWarehouseCode] = useState('')
  const [destinationWarehouseCode, setDestinationWarehouseCode] = useState('')
  const [businessComment, setBusinessComment] = useState('')
  const [responsibleMode, setResponsibleMode] = useState<'creator' | 'other'>('creator')
  const [responsibleUserId, setResponsibleUserId] = useState('')
  const [responsibleConfirmed, setResponsibleConfirmed] = useState(false)
  const [lines, setLines] = useState<DraftLine[]>(() => [createDraftLine()])
  const [selectedTargetLineId, setSelectedTargetLineId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<SearchItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
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

  const clientLineErrors = useMemo(() => lines.map(getLineClientError), [lines])
  const warehousesReady = Boolean(sourceWarehouseCode && destinationWarehouseCode && sourceWarehouseCode !== destinationWarehouseCode)
  const hasReadyTransferLine = useMemo(() => lines.some(line => getLineClientError(line) === null), [lines])
  const hasBusinessComment = businessComment.trim().length > 0
  const hasSelectedResponsible = responsibleConfirmed && (responsibleMode !== 'other' || Boolean(responsibleUserId))
  const clientFormError = useMemo(() => {
    if (!sourceWarehouseCode || !destinationWarehouseCode) return 'Seleccione ambas bodegas.'
    if (sourceWarehouseCode === destinationWarehouseCode) return 'La bodega de origen y la bodega destino deben ser diferentes.'
    const commentLength = Array.from(businessComment.trim()).length
    if (commentLength < 1 || commentLength > 50) return 'El comentario contextual debe tener entre 1 y 50 caracteres.'
    if (!responsibleConfirmed) return 'Marque la persona responsable de la solicitud.'
    if (responsibleMode === 'other' && !responsibleUserId) return 'Seleccione la persona responsable.'
    if (lines.length === 0) return 'Agregue al menos una línea.'
    return clientLineErrors.find(Boolean) ?? null
  }, [businessComment, clientLineErrors, destinationWarehouseCode, lines.length, responsibleConfirmed, responsibleMode, responsibleUserId, sourceWarehouseCode])

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
      for (const line of lines) {
        if (line.item) void requestAvailability(line.id, line.item.itemCode, warehouseCode)
      }
    } else {
      setDestinationWarehouseCode(warehouseCode)
    }
    invalidateValidation()
  }, [invalidateValidation, lines, requestAvailability])

  const searchItems = useCallback(async () => {
    const query = searchTerm.trim()
    if (!query) {
      setSearchError('Escriba código o una palabra de la descripción.')
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      const result = await apiRequest<{ items: SearchItem[] }>('/api/engineering/sap-operations/transfer-requests/items?query=' + encodeURIComponent(query))
      setSearchResults(result.items)
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'No fue posible buscar artículos.')
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [searchTerm])

  const chooseItem = useCallback((lineId: string, item: SearchItem) => {
    updateLine(lineId, {
      item,
      availability: null,
      availabilityError: null,
      packagePattern: null,
      packagePatternError: null,
      batchQuantities: {},
      selectedSerials: [],
    })
    setSearchResults([])
    setSearchTerm('')
    void requestAvailability(lineId, item.itemCode, sourceWarehouseCode)
    void requestPackagePattern(lineId, item.itemCode)
  }, [requestAvailability, requestPackagePattern, sourceWarehouseCode, updateLine])

  const validateRequest = useCallback(async () => {
    if (clientFormError) {
      setFormError(clientFormError)
      return
    }
    setValidating(true)
    setFormError(null)
    try {
      const result = await apiRequest<{ validation: ValidationResult }>('/api/engineering/sap-operations/transfer-requests/validate', {
        method: 'POST',
        body: JSON.stringify(serializeDraft(sourceWarehouseCode, destinationWarehouseCode, businessComment.trim(), lines)),
      })
      setValidation(result.validation)
      setConfirmed(false)
      if (!result.validation.valid) {
        setFormError('SAP encontró validaciones pendientes. Corrija las líneas señaladas.')
      }
    } catch (error) {
      const requestError = error instanceof RequestApiError ? error : null
      setValidation(requestError?.payload.issues ? {
        valid: false,
        checkedAt: new Date().toISOString(),
        issues: requestError.payload.issues,
        lines: [],
      } : null)
      setFormError(error instanceof Error ? error.message : 'No fue posible validar en SAP.')
    } finally {
      setValidating(false)
    }
  }, [businessComment, clientFormError, destinationWarehouseCode, lines, sourceWarehouseCode])

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
      setLines([createDraftLine()])
      setSelectedTargetLineId(null)
      setSourceWarehouseCode('')
      setDestinationWarehouseCode('')
      setBusinessComment('')
      setEditingDocEntry(null)
      setResponsibleConfirmed(false)
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

  const activeTargetLineId = lines.some(line => line.id === selectedTargetLineId)
    ? selectedTargetLineId ?? ''
    : lines[0]?.id ?? ''

  const addLine = useCallback(() => {
    const line = createDraftLine()
    setLines(current => [...current, line])
    setSelectedTargetLineId(line.id)
    invalidateValidation()
  }, [invalidateValidation])

  const removeLine = useCallback((lineId: string) => {
    const remaining = lines.filter(line => line.id !== lineId)
    const nextLines = remaining.length > 0 ? remaining : [createDraftLine()]
    setLines(nextLines)
    if (selectedTargetLineId === lineId) setSelectedTargetLineId(nextLines[0].id)
    invalidateValidation()
  }, [invalidateValidation, lines, selectedTargetLineId])

  const openNewRequest = useCallback(() => {
    setNewRequestOpen(true)
    setEditingDocEntry(null)
    setSourceWarehouseCode('')
    setDestinationWarehouseCode('')
    setBusinessComment('')
    setResponsibleMode('creator')
    setResponsibleUserId('')
    setResponsibleConfirmed(false)
    setLines([createDraftLine()])
    setSelectedTargetLineId(null)
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
    const draftLines = nextLines.length > 0 ? nextLines : [createDraftLine()]

    setNewRequestOpen(true)
    setEditingDocEntry(selectedDetail.request.docEntry)
    setSourceWarehouseCode(sourceWarehouseCode)
    setDestinationWarehouseCode(destinationWarehouseCode)
    setBusinessComment(selectedDetail.request.businessComment || '')
    setResponsibleMode('creator')
    setResponsibleUserId('')
    setResponsibleConfirmed(false)
    setLines(draftLines)
    setSelectedTargetLineId(draftLines[0]?.id ?? null)
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
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="grid gap-1.5"><Label>Socio de negocios</Label><Input readOnly value={`${configuration.defaults.cardCode} - ${configuration.defaults.cardName}`} /></div>
                <div className="grid gap-1.5"><Label>Persona de contacto</Label><Input readOnly value={configuration.defaults.contactLabel} /></div>
                <div className="grid gap-1.5"><Label>Destino</Label><Input readOnly value={configuration.defaults.shipToCode} /></div>
                <div className="grid gap-1.5"><Label>Serie SAP</Label><Input readOnly value={`${configuration.defaults.series} - ${configuration.defaults.seriesLabel}`} /></div>
                <div className="grid gap-1.5"><Label>Lista de precios</Label><Input readOnly value={configuration.defaults.priceListLabel} /></div>
                <div className="grid gap-1.5"><Label>Comentarios SAP</Label><Input readOnly value={configuration.defaults.automaticComment} /></div>
              </section>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                <span className="font-bold text-slate-700">Dirección configurada:</span><br />
                {configuration.defaults.shipToAddress.split(/\r?\n/).map(line => <span key={line} className="block">{line}</span>)}
              </div>

              <section className="grid gap-4 rounded-xl border border-slate-200 bg-firplak-ivory/35 p-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="source-warehouse">De almacén</Label>
                  <select id="source-warehouse" value={sourceWarehouseCode} onChange={event => handleWarehouseChange('source', event.target.value)} className={SELECT_CLASS_NAME}>
                    <option value="">Seleccione bodega de origen</option>
                    {configuration.warehouses.map(warehouse => <option key={warehouse.warehouseCode} value={warehouse.warehouseCode}>{warehouse.warehouseCode} - {warehouse.warehouseName}</option>)}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="destination-warehouse">Almacén destino</Label>
                  <select id="destination-warehouse" value={destinationWarehouseCode} onChange={event => handleWarehouseChange('destination', event.target.value)} className={SELECT_CLASS_NAME}>
                    <option value="">Seleccione bodega destino</option>
                    {configuration.warehouses.map(warehouse => <option key={warehouse.warehouseCode} value={warehouse.warehouseCode}>{warehouse.warehouseCode} - {warehouse.warehouseName}</option>)}
                  </select>
                </div>
                {sourceWarehouseCode && sourceWarehouseCode === destinationWarehouseCode ? (
                  <div className="md:col-span-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"><AlertCircle className="h-4 w-4" /> La bodega de origen debe ser distinta a la bodega destino.</div>
                ) : null}
              </section>

              {warehousesReady ? <>
              <section className="space-y-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="grid flex-1 gap-1.5">
                    <Label htmlFor="item-search">Buscar artículo por código o descripción</Label>
                    <div className="flex gap-2">
                      <Input id="item-search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void searchItems() } }} placeholder="Ej: Tornillo" />
                      <Button type="button" variant="outline" onClick={() => void searchItems()} disabled={searching} className="shrink-0 border-slate-200">
                        {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        <span className="ml-2">Buscar</span>
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-1.5 lg:w-72">
                    <Label htmlFor="target-line">Agregar resultado en</Label>
                    <select id="target-line" value={activeTargetLineId} onChange={event => setSelectedTargetLineId(event.target.value)} className={SELECT_CLASS_NAME}>
                      {lines.map((line, lineIndex) => <option key={line.id} value={line.id}>Linea {lineIndex + 1}{line.item ? ` - ${line.item.itemCode}` : ' - por completar'}</option>)}
                    </select>
                  </div>
                  <Button type="button" variant="outline" onClick={addLine} className="border-firplak-green/30 text-firplak-green hover:bg-firplak-green/5">
                    <Plus className="mr-2 h-4 w-4" /> Agregar línea
                  </Button>
                </div>
                {searchError ? <p className="text-sm text-red-700">{searchError}</p> : null}
                {searchResults.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <Table className="min-w-[760px]">
                      <TableHeader className="bg-slate-50"><TableRow><TableHead className="w-56">Código</TableHead><TableHead>Descripción completa</TableHead><TableHead className="w-44 text-right">Acción</TableHead></TableRow></TableHeader>
                      <TableBody>{searchResults.map(item => (
                        <TableRow key={item.itemCode}>
                          <TableCell className="font-semibold text-slate-800">{item.itemCode}</TableCell>
                          <TableCell className="whitespace-normal break-words font-medium text-slate-700">{item.itemName}</TableCell>
                          <TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => chooseItem(activeTargetLineId, item)} className="border-firplak-green/30 text-firplak-green">Agregar a línea {lines.findIndex(line => line.id === activeTargetLineId) + 1}</Button></TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                  </div>
                ) : null}
              </section>

              <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <Table className="min-w-[1040px]">
                  <TableHeader className="bg-slate-50"><TableRow><TableHead className="w-10">#</TableHead><TableHead className="min-w-72">Artículo / descripción</TableHead><TableHead className="w-24">PATRÓN</TableHead><TableHead className="w-16">STOCK</TableHead><TableHead className="w-14">COM</TableHead><TableHead className="w-14">ATP</TableHead><TableHead className="w-14">UND</TableHead><TableHead className="w-28">CANT.</TableHead><TableHead className="w-32">Tipo traslado</TableHead><TableHead className="w-10"><span className="sr-only">Eliminar</span></TableHead></TableRow></TableHeader>
                  <TableBody>{lines.flatMap((line, lineIndex) => {
                    const lineError = clientLineErrors[lineIndex]
                    const allocation = line.availability?.allocation
                    const stock = line.availability?.availability
                    const pattern = line.packagePattern
                    return [
                      <TableRow key={line.id} className={line.id === activeTargetLineId ? 'bg-firplak-green/5' : undefined}>
                        <TableCell className="font-bold text-slate-700">{lineIndex + 1}</TableCell>
                        <TableCell className="whitespace-normal break-words"><p className="font-semibold text-slate-800">{line.item?.itemCode ?? 'Por completar'}</p><p className="mt-1 max-h-10 overflow-hidden text-sm leading-5 text-slate-600">{line.item?.itemName ?? 'Busque el artículo y agréguelo a esta línea.'}</p></TableCell>
                        <TableCell className="whitespace-normal text-xs leading-4 text-slate-600">{line.packagePatternLoading ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analizando</span> : pattern?.status === 'observed' ? <><strong className="block text-sm text-firplak-green">Paquete: {formatNumber(pattern.packageQuantity ?? 0)}</strong><span>{pattern.matchingTransfers} traslados MP-01</span></> : pattern || line.packagePatternError ? <strong className="text-sm text-slate-700">NA</strong> : '—'}</TableCell>
                        <TableCell>{stock ? formatNumber(stock.inventoryQuantity) : '—'}</TableCell><TableCell>{stock ? formatNumber(stock.committedQuantity) : '—'}</TableCell><TableCell className="font-semibold text-firplak-green">{stock ? formatNumber(stock.availableQuantity) : '—'}</TableCell><TableCell>{line.availability?.inventoryUom || '—'}</TableCell>
                        <TableCell><Input id={`quantity-${line.id}`} aria-label={`Cantidad línea ${lineIndex + 1}`} type="number" min="0.0001" step="any" value={line.quantity} onChange={event => updateLine(line.id, { quantity: event.target.value })} /></TableCell>
                        <TableCell><select id={`transfer-type-${line.id}`} aria-label={`Tipo traslado línea ${lineIndex + 1}`} value={line.transferType} onChange={event => updateLine(line.id, { transferType: event.target.value as DraftLine['transferType'] })} className={SELECT_CLASS_NAME}><option value="">Seleccione tipo</option><option value="Físico">Físico</option><option value="Virtual">Virtual</option></select></TableCell>
                        <TableCell><Button type="button" size="icon-sm" variant="ghost" onClick={() => removeLine(line.id)} aria-label={`Eliminar línea ${lineIndex + 1}`}><Trash2 className="h-4 w-4 text-red-600" /></Button></TableCell>
                      </TableRow>,
                      allocation?.requiresAllocation ? <TableRow key={`${line.id}-allocation`}><TableCell colSpan={10} className="bg-amber-50/50 p-3"><div className="rounded-lg border border-amber-200 bg-white p-3"><div className="flex items-start gap-2"><PackageSearch className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><p className="text-sm font-semibold text-amber-900">Selección SAP por {allocation.management === 'batch' ? 'lotes' : 'seriales'}</p>{allocation.message ? <p className="mt-1 text-xs leading-5 text-amber-800">{allocation.message}</p> : null}</div></div>{allocation.management === 'batch' && allocation.status === 'available' ? <div className="mt-3 grid gap-2 md:grid-cols-2">{allocation.batchOptions.map(option => <label key={option.batchNumber} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2 rounded-md border border-amber-200 bg-white p-2 text-sm"><span className="truncate font-medium text-slate-700">{option.batchNumber}</span><Input type="number" min="0" step="any" value={line.batchQuantities[option.batchNumber] ?? ''} onChange={event => updateLine(line.id, { batchQuantities: { ...line.batchQuantities, [option.batchNumber]: event.target.value } })} placeholder="Cantidad" /></label>)}</div> : null}{allocation.management === 'serial' && allocation.status === 'available' ? <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto md:grid-cols-2">{allocation.serialOptions.map(option => { const checked = line.selectedSerials.includes(option.systemSerialNumber); return <label key={option.systemSerialNumber} className="flex items-center gap-2 rounded-md border border-amber-200 bg-white p-2 text-sm text-slate-700"><input type="checkbox" checked={checked} onChange={event => updateLine(line.id, { selectedSerials: event.target.checked ? [...line.selectedSerials, option.systemSerialNumber] : line.selectedSerials.filter(number => number !== option.systemSerialNumber) })} className="h-4 w-4 rounded border-slate-300 accent-firplak-green" /><span className="min-w-0 truncate"><strong>{option.serialNumber}</strong>{option.manufacturerSerialNumber ? ` - ${option.manufacturerSerialNumber}` : ''}</span></label> })}</div> : null}</div></TableCell></TableRow> : null,
                      <TableRow key={`${line.id}-status`}><TableCell colSpan={10} className={lineError ? 'bg-red-50 text-red-700' : 'bg-firplak-green/5 text-firplak-green'}><div className="flex items-center gap-2 text-sm font-medium">{lineError ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{lineError ?? 'Línea lista para validar.'}</div></TableCell></TableRow>,
                    ]
                  })}</TableBody>
                </Table>
              </section>
              </> : null}

              {hasReadyTransferLine ? <section className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-4"><Label htmlFor="business-comment">Comentarios</Label><span className="text-xs font-medium text-slate-500">{Array.from(businessComment).length}/50</span></div>
                  <Textarea id="business-comment" value={businessComment} onChange={event => { setBusinessComment(event.target.value); invalidateValidation() }} maxLength={50} placeholder="Indique a quién se relaciona y por qué se solicita el traslado." className="min-h-24" />
                  <p className="text-xs text-slate-500">Se guarda en U_Comentarios de cabecera.</p>
                </div>
              </section> : null}

              {hasBusinessComment ? <section className="grid gap-4 md:grid-cols-2">
                <div className="grid content-start gap-2">
                  <Label>Responsable de solicitud</Label>
                  <p className="text-xs text-slate-500">Marque quién responderá por esta solicitud.</p>
                  <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="responsible-mode" checked={responsibleMode === 'creator'} onChange={() => { setResponsibleMode('creator'); setResponsibleConfirmed(true); invalidateValidation() }} className="h-4 w-4 accent-firplak-green" />La persona que {editingRequest ? 'modifica' : 'crea'} la solicitud</label>
                  <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="responsible-mode" checked={responsibleMode === 'other'} onChange={() => { setResponsibleMode('other'); setResponsibleConfirmed(true); invalidateValidation() }} className="h-4 w-4 accent-firplak-green" />El responsable es otro</label>
                  {responsibleMode === 'other' ? <select value={responsibleUserId} onChange={event => { setResponsibleUserId(event.target.value); invalidateValidation() }} className={SELECT_CLASS_NAME} aria-label="Seleccionar responsable"><option value="">Seleccione una persona</option>{configuration.responsibleUsers.map(user => <option key={user.id} value={user.id}>{user.email}{user.role ? ` - ${user.role}` : ''}</option>)}</select> : <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{configuration.creator.email || 'Usuario autenticado'}</p>}
                </div>
              </section> : null}

              {hasSelectedResponsible && formError ? <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{formError}</span></div> : null}
              {hasSelectedResponsible && validation ? (
                <div className={`rounded-lg border px-4 py-3 ${validation.valid ? 'border-firplak-green/30 bg-firplak-green/5' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">{validation.valid ? <CheckCircle2 className="h-4 w-4 text-firplak-green" /> : <AlertCircle className="h-4 w-4 text-red-700" />}{validation.valid ? `Validación SAP completada: ${formatDate(validation.checkedAt)}` : 'SAP encontró correcciones necesarias'}</div>
                  {validation.issues.length > 0 ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">{validation.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.lineIndex === null ? '' : `Línea ${issue.lineIndex + 1}: `}{issue.message}</li>)}</ul> : null}
                </div>
              ) : null}

              {hasSelectedResponsible ? <div className="grid gap-3 border-t border-slate-100 pt-5 lg:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3"><p className="mb-2 text-sm font-semibold text-slate-800">1. Validar en SAP</p><Button type="button" variant="outline" onClick={() => void validateRequest()} disabled={validating || creating || Boolean(clientFormError)} className="w-full border-slate-300"><FileSearch className="mr-2 h-4 w-4" />{validating ? 'Validando...' : 'Validar en SAP'}</Button></div>
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
              <div className="transfer-print-title-block">
                <h1>Solicitud de traslado</h1>
                <div className="transfer-print-document-data">
                  <div><span>Almacén de salida</span><strong>{selectedDetail.request.fromWarehouse || selectedDetail.operation.sourceWarehouse || '-'}</strong></div>
                  <div><span>Número de documento</span><strong>{selectedDetail.request.docNum ? `#${selectedDetail.request.docNum}` : '-'}</strong></div>
                  <div><span>Fecha de entrega</span><strong>{formatDate(selectedDetail.request.docDate)}</strong></div>
                </div>
              </div>
            </header>

            <div className="transfer-print-destination"><strong>Almacén de entrada:</strong> {selectedDetail.request.toWarehouse || selectedDetail.operation.destinationWarehouse || '-'}</div>
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
              <div className="transfer-print-total"><strong>Total:</strong> {formatNumber(detailTotalQuantity)}</div>
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
          .transfer-print-header { align-items: end; border-bottom: 1px solid #79b8df; display: grid; gap: 12mm; grid-template-columns: 1fr 1.65fr; padding-bottom: 4mm; }
          .transfer-print-brand { color: #294a5c; font-size: 24pt; font-weight: 500; letter-spacing: .06em; line-height: 1; }
          .transfer-print-company { font-size: 10pt; font-weight: 700; margin-top: 5mm; }
          .transfer-print-title-block h1 { border-left: 3mm solid #f4b000; color: #12202b; font-size: 16pt; line-height: 1.05; margin: 0 0 3mm; padding-left: 3mm; }
          .transfer-print-document-data { display: grid; gap: 3mm; grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .transfer-print-document-data span { color: #6f8290; display: block; font-size: 7.5pt; }
          .transfer-print-document-data strong { color: #14232e; display: block; font-size: 9pt; margin-top: 1mm; }
          .transfer-print-destination { border-bottom: 1px dotted #79b8df; color: #13222c; font-size: 10pt; margin-top: 5mm; padding-bottom: 4mm; }
          .transfer-print-meta { color: #526673; display: flex; flex-wrap: wrap; font-size: 7.5pt; gap: 2mm 7mm; margin: 3mm 0; }
          .transfer-print-meta strong { color: #263b48; }
          .transfer-print-table { border-collapse: collapse; table-layout: fixed; width: 100%; }
          .transfer-print-table th { background: #f4f7f8; border-bottom: 1px solid #3e9dd5; color: #314957; font-size: 7.5pt; font-weight: 700; padding: 2mm 1.5mm; text-align: left; }
          .transfer-print-table td { border-bottom: 1px dotted #79b8df; padding: 2mm 1.5mm; vertical-align: top; word-break: break-word; }
          .transfer-print-table th:nth-child(1), .transfer-print-table td:nth-child(1) { text-align: center; width: 5%; }
          .transfer-print-table th:nth-child(2), .transfer-print-table td:nth-child(2) { width: 63%; }
          .transfer-print-table th:nth-child(3), .transfer-print-table td:nth-child(3) { width: 9%; }
          .transfer-print-table th:nth-child(4), .transfer-print-table td:nth-child(4) { text-align: right; width: 11%; }
          .transfer-print-table th:nth-child(5), .transfer-print-table td:nth-child(5) { width: 12%; }
          .transfer-print-table td:nth-child(2) strong { display: block; font-size: 8.5pt; }
          .transfer-print-table td:nth-child(2) span { color: #526673; display: block; font-size: 7.5pt; margin-top: .5mm; }
          .transfer-print-footer { margin-top: 3mm; }
          .transfer-print-total { border-bottom: 1px solid #3e9dd5; font-size: 10pt; padding: 2mm 1.5mm; text-align: right; }
          .transfer-print-total strong { margin-right: 8mm; }
          .transfer-print-comment { margin-top: 3mm; }
          .transfer-print-comment strong { display: block; font-size: 8pt; margin-bottom: 1mm; }
          .transfer-print-comment span { display: block; min-height: 6mm; white-space: pre-wrap; }
        }`}</style> : null}
    </div>
  )
}
