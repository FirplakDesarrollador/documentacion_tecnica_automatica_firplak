import 'server-only'

import { dbQuery } from '@/lib/supabase'
import {
  createSapInventoryTransferRequest,
  getSapActiveWarehouses,
  getSapWarehouses,
  getSapBatchNumberDetails,
  getSapInventoryTransferRequest,
  getSapItem,
  getSapStockTransferHistoryFromWarehouse,
  getSapSerialNumberDetails,
  SapServiceLayerError,
  searchSapItems,
  updateSapInventoryTransferRequest,
  type SapEntityPayload,
} from './serviceLayer'

export const SAP_TRANSFER_REQUEST_DEFAULTS_SETTING_KEY = 'sap_transfer_request_defaults'
export const SAP_TRANSFER_REQUEST_AUTOMATIC_COMMENT = 'Solicitud de traslado - AC890927404-01'
export const SAP_TRANSFER_REQUEST_TRANSFER_TYPES = ['Físico', 'Virtual'] as const

export type SapTransferRequestTransferType = (typeof SAP_TRANSFER_REQUEST_TRANSFER_TYPES)[number]

export type SapTransferRequestDefaults = {
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

const FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS: Readonly<SapTransferRequestDefaults> = {
  cardCode: 'AC890927404-01',
  cardName: 'FIRPLAK S A',
  contactPerson: 10484,
  contactLabel: 'daniel.jimenez@firplak.com',
  shipToCode: 'FIRPLAK S A',
  shipToAddress: 'CLL 29 RO 41 15\nITAGUI\nCOLOMBIA',
  series: 49,
  seriesLabel: 'Producción',
  priceList: -1,
  priceListLabel: 'Último precio de compra',
  preferredWarehouseCodes: ['MP-09', 'MP-06'],
  automaticComment: SAP_TRANSFER_REQUEST_AUTOMATIC_COMMENT,
}

type SapRecord = Record<string, unknown>

function isRecord(value: unknown): value is SapRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readStringField(record: SapRecord, field: string): string | null {
  return readText(record[field])
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readNumberField(record: SapRecord, field: string): number | null {
  return readNumber(record[field])
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = readNumber(value)
  return parsed !== null && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function hasSapTransferRequestQuantityPrecision(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 0.0000001
}

function readRecordArray(value: unknown): SapRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function readSapYes(value: unknown): boolean {
  if (value === true) return true
  const normalized = readText(value)?.toLowerCase()
  return normalized === 'tyes' || normalized === 'yes' || normalized === 'y' || normalized === 'true' || normalized === '1'
}

function normalizeWarehouseCode(value: unknown): string | null {
  return readText(value)?.toUpperCase() ?? null
}

function normalizeItemCode(value: unknown): string | null {
  return readText(value)?.toUpperCase() ?? null
}

function countCharacters(value: string): number {
  return Array.from(value).length
}

function currentColombiaDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function currentColombiaTimestamp(): string {
  return new Date().toISOString()
}

function parseSettingsRecord(value: unknown): SapRecord | null {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readConfiguredText(settings: SapRecord | null, key: string, fallback: string): string {
  return settings ? readStringField(settings, key) ?? fallback : fallback
}

function readConfiguredInteger(settings: SapRecord | null, key: string, fallback: number): number {
  const value = settings ? readPositiveInteger(settings[key]) : null
  return value ?? fallback
}

function readConfiguredNumber(settings: SapRecord | null, key: string, fallback: number): number {
  const value = settings ? readNumber(settings[key]) : null
  return value ?? fallback
}

function readConfiguredWarehouseCodes(settings: SapRecord | null): string[] {
  const candidate = settings?.preferredWarehouseCodes
    ?? settings?.preferredWarehouses
    ?? settings?.priorityWarehouseCodes
  if (!Array.isArray(candidate)) return [...FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS.preferredWarehouseCodes]

  const codes = candidate
    .map(normalizeWarehouseCode)
    .filter((code): code is string => Boolean(code))

  return codes.length > 0
    ? [...new Set(codes)]
    : [...FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS.preferredWarehouseCodes]
}

/**
 * Reads the fixed partner defaults from app settings. The fallback keeps the
 * requested flow safe while the corresponding setting is being migrated.
 * This function intentionally never queries SAP partner master data.
 */
export async function getSapTransferRequestDefaults(): Promise<SapTransferRequestDefaults> {
  const rows = await dbQuery(
    `SELECT value
     FROM public.app_settings
     WHERE key = $1
     LIMIT 1`,
    [SAP_TRANSFER_REQUEST_DEFAULTS_SETTING_KEY],
  )
  const row = Array.isArray(rows) && isRecord(rows[0]) ? rows[0] : null
  const settings = parseSettingsRecord(row?.value)

  return {
    cardCode: readConfiguredText(settings, 'cardCode', FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS.cardCode),
    cardName: readConfiguredText(settings, 'cardName', FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS.cardName),
    contactPerson: readConfiguredInteger(settings, 'contactPerson', FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS.contactPerson),
    contactLabel: readConfiguredText(
      settings,
      'contactLabel',
      readConfiguredText(settings, 'contactPersonLabel', FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS.contactLabel),
    ),
    shipToCode: readConfiguredText(settings, 'shipToCode', FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS.shipToCode),
    shipToAddress: readConfiguredText(settings, 'shipToAddress', FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS.shipToAddress),
    series: readConfiguredInteger(settings, 'series', FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS.series),
    seriesLabel: readConfiguredText(settings, 'seriesLabel', FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS.seriesLabel),
    priceList: readConfiguredNumber(settings, 'priceList', FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS.priceList),
    priceListLabel: readConfiguredText(settings, 'priceListLabel', FALLBACK_SAP_TRANSFER_REQUEST_DEFAULTS.priceListLabel),
    preferredWarehouseCodes: readConfiguredWarehouseCodes(settings),
    automaticComment: SAP_TRANSFER_REQUEST_AUTOMATIC_COMMENT,
  }
}

export type SapTransferRequestWarehouse = {
  warehouseCode: string
  warehouseName: string
  binsEnabled: boolean
  inactive: boolean
}

/** Lists every SAP warehouse, with MP-09 and MP-06 first by default. */
export async function listSapTransferRequestWarehouses(): Promise<SapTransferRequestWarehouse[]> {
  const [defaults, rawWarehouses] = await Promise.all([
    getSapTransferRequestDefaults(),
    getSapWarehouses(),
  ])
  const priority = new Map(defaults.preferredWarehouseCodes.map((code, index) => [code.toUpperCase(), index]))
  const byCode = new Map<string, SapTransferRequestWarehouse>()

  for (const rawWarehouse of rawWarehouses) {
    const warehouseCode = normalizeWarehouseCode(rawWarehouse.WarehouseCode)
    if (!warehouseCode) continue
    byCode.set(warehouseCode, {
      warehouseCode,
      warehouseName: readStringField(rawWarehouse, 'WarehouseName') ?? warehouseCode,
      binsEnabled: readSapYes(rawWarehouse.EnableBinLocations),
      inactive: readSapYes(rawWarehouse.Inactive),
    })
  }

  return [...byCode.values()].sort((left, right) => {
    const leftPriority = priority.get(left.warehouseCode) ?? Number.MAX_SAFE_INTEGER
    const rightPriority = priority.get(right.warehouseCode) ?? Number.MAX_SAFE_INTEGER
    if (leftPriority !== rightPriority) return leftPriority - rightPriority
    return left.warehouseCode.localeCompare(right.warehouseCode, 'es')
  })
}

export type SapTransferRequestItemSearchRow = {
  itemCode: string
  itemName: string
}

export type SapTransferRequestItemSearchResult = {
  items: SapTransferRequestItemSearchRow[]
  hasMore: boolean
}

/**
 * Searches both SAP code prefixes and every description token so a term such
 * as "Tornillo" is not constrained by V/C/P item-code prefixes.
 */
export async function searchSapTransferRequestItems(
  query: string,
  options: { limit?: number; timeoutMs?: number } = {},
): Promise<SapTransferRequestItemSearchResult> {
  const normalizedQuery = readText(query)
  if (!normalizedQuery) {
    throw new SapServiceLayerError('La búsqueda de artículo es obligatoria.', {
      statusCode: 400,
      sapCode: 'SAP_SEARCH_QUERY_REQUIRED',
    })
  }
  const requestedLimit = Number.isSafeInteger(options.limit) && (options.limit ?? 0) > 0
    ? options.limit ?? 20
    : 20
  const limit = Math.min(requestedLimit, 20)
  const [codeResult, descriptionResult] = await Promise.all([
    searchSapItems({ code: normalizedQuery }, { limit, timeoutMs: options.timeoutMs }),
    searchSapItems({ description: normalizedQuery }, { limit, timeoutMs: options.timeoutMs }),
  ])
  const itemsByCode = new Map<string, SapTransferRequestItemSearchRow>()

  for (const rawItem of [...codeResult.items, ...descriptionResult.items]) {
    const itemCode = normalizeItemCode(rawItem.ItemCode)
    if (!itemCode) continue
    itemsByCode.set(itemCode, {
      itemCode,
      itemName: readStringField(rawItem, 'ItemName') ?? itemCode,
    })
  }

  const items = [...itemsByCode.values()]
    .sort((left, right) => left.itemCode.localeCompare(right.itemCode, 'es'))
    .slice(0, limit)

  return {
    items,
    hasMore: codeResult.hasMore || descriptionResult.hasMore || itemsByCode.size > items.length,
  }
}

export type SapTransferRequestItemManagement = 'none' | 'batch' | 'serial'

export type SapTransferRequestWarehouseAvailability = {
  warehouseCode: string
  inventoryQuantity: number
  committedQuantity: number
  orderedQuantity: number
  availableQuantity: number
}

export type SapTransferRequestBatchOption = {
  batchNumber: string
  warehouseCode: string | null
  status: string | null
}

export type SapTransferRequestSerialOption = {
  systemSerialNumber: number
  serialNumber: string
  manufacturerSerialNumber: string | null
  warehouseCode: string | null
  status: string | null
}

export type SapTransferRequestAllocationState = {
  requiresAllocation: boolean
  management: SapTransferRequestItemManagement
  sourceWarehouseCode: string | null
  sourceWarehouseVerified: boolean | null
  status: 'not-required' | 'source-warehouse-required' | 'available' | 'empty' | 'unavailable'
  message: string | null
  batchOptions: SapTransferRequestBatchOption[]
  serialOptions: SapTransferRequestSerialOption[]
}

export type SapTransferRequestItem = {
  itemCode: string
  itemName: string
  inventoryUom: string | null
  management: SapTransferRequestItemManagement
  warehouseAvailability: SapTransferRequestWarehouseAvailability[]
  allocation: SapTransferRequestAllocationState
}

function resolveItemManagement(item: SapRecord): SapTransferRequestItemManagement {
  const managesSerials = readSapYes(item.ManageSerialNumbers)
  const managesBatches = readSapYes(item.ManageBatchNumbers)
  if (managesSerials && managesBatches) {
    throw new SapServiceLayerError('El artículo está configurado simultáneamente por lotes y seriales.', {
      statusCode: 409,
      sapCode: 'SAP_TRANSFER_ITEM_MANAGEMENT_CONFLICT',
    })
  }
  if (managesSerials) return 'serial'
  if (managesBatches) return 'batch'
  return 'none'
}

function normalizeWarehouseAvailability(value: unknown): SapTransferRequestWarehouseAvailability[] {
  const byWarehouse = new Map<string, SapTransferRequestWarehouseAvailability>()
  for (const rawWarehouse of readRecordArray(value)) {
    const warehouseCode = normalizeWarehouseCode(rawWarehouse.WarehouseCode)
    if (!warehouseCode) continue
    const inventoryQuantity = readNumberField(rawWarehouse, 'InStock') ?? 0
    const committedQuantity = readNumberField(rawWarehouse, 'Committed') ?? 0
    const orderedQuantity = readNumberField(rawWarehouse, 'Ordered') ?? 0
    byWarehouse.set(warehouseCode, {
      warehouseCode,
      inventoryQuantity,
      committedQuantity,
      orderedQuantity,
      availableQuantity: Math.max(0, inventoryQuantity - committedQuantity),
    })
  }

  return [...byWarehouse.values()].sort((left, right) => left.warehouseCode.localeCompare(right.warehouseCode, 'es'))
}

function readAllocationWarehouseCode(value: SapRecord): string | null {
  return normalizeWarehouseCode(value.WarehouseCode)
    ?? normalizeWarehouseCode(value.Warehouse)
    ?? normalizeWarehouseCode(value.WhsCode)
}

function batchNumberFromRecord(value: SapRecord): string | null {
  return readStringField(value, 'BatchNumber')
    ?? readStringField(value, 'DistNumber')
    ?? readStringField(value, 'Batch')
}

function serialSystemNumberFromRecord(value: SapRecord): number | null {
  return readPositiveInteger(value.SystemNumber)
    ?? readPositiveInteger(value.SystemSerialNumber)
}

function unavailableAllocationState(
  management: Exclude<SapTransferRequestItemManagement, 'none'>,
  sourceWarehouseCode: string,
): SapTransferRequestAllocationState {
  return {
    requiresAllocation: true,
    management,
    sourceWarehouseCode,
    sourceWarehouseVerified: null,
    status: 'unavailable',
    message: 'SAP no permitió consultar las opciones de lote o serial para este artículo. No se puede crear la solicitud hasta recuperar esas opciones.',
    batchOptions: [],
    serialOptions: [],
  }
}

function sourceWarehouseAllocationRecords(records: SapRecord[], sourceWarehouseCode: string): {
  records: SapRecord[]
  sourceWarehouseVerified: boolean
} {
  const recordsWithWarehouse = records.filter(record => readAllocationWarehouseCode(record) !== null)
  if (recordsWithWarehouse.length === 0) {
    return { records, sourceWarehouseVerified: false }
  }

  return {
    records: recordsWithWarehouse.filter(record => readAllocationWarehouseCode(record) === sourceWarehouseCode),
    sourceWarehouseVerified: true,
  }
}

async function resolveBatchAllocationState(sourceWarehouseCode: string, itemCode: string): Promise<SapTransferRequestAllocationState> {
  try {
    const rawRecords = await getSapBatchNumberDetails(itemCode)
    const scoped = sourceWarehouseAllocationRecords(rawRecords, sourceWarehouseCode)
    const optionsByBatch = new Map<string, SapTransferRequestBatchOption>()
    for (const record of scoped.records) {
      const batchNumber = batchNumberFromRecord(record)
      if (!batchNumber) continue
      optionsByBatch.set(batchNumber, {
        batchNumber,
        warehouseCode: readAllocationWarehouseCode(record),
        status: readStringField(record, 'Status'),
      })
    }
    const batchOptions = [...optionsByBatch.values()].sort((left, right) => left.batchNumber.localeCompare(right.batchNumber, 'es'))
    const hasOptions = batchOptions.length > 0

    return {
      requiresAllocation: true,
      management: 'batch',
      sourceWarehouseCode,
      sourceWarehouseVerified: scoped.sourceWarehouseVerified,
      status: hasOptions ? 'available' : 'empty',
      message: scoped.sourceWarehouseVerified
        ? (hasOptions ? null : 'SAP no devolvió lotes disponibles para la bodega de origen.')
        : (hasOptions
            ? 'SAP devolvió los lotes del artículo, pero no su bodega. SAP volverá a validar la asignación al crear.'
            : 'SAP no devolvió lotes seleccionables para el artículo.'),
      batchOptions,
      serialOptions: [],
    }
  } catch {
    return unavailableAllocationState('batch', sourceWarehouseCode)
  }
}

async function resolveSerialAllocationState(sourceWarehouseCode: string, itemCode: string): Promise<SapTransferRequestAllocationState> {
  try {
    const rawRecords = await getSapSerialNumberDetails(itemCode)
    const scoped = sourceWarehouseAllocationRecords(rawRecords, sourceWarehouseCode)
    const optionsBySystemNumber = new Map<number, SapTransferRequestSerialOption>()
    for (const record of scoped.records) {
      const systemSerialNumber = serialSystemNumberFromRecord(record)
      if (systemSerialNumber === null) continue
      const serialNumber = readStringField(record, 'SerialNumber')
        ?? readStringField(record, 'InternalSerialNumber')
        ?? String(systemSerialNumber)
      optionsBySystemNumber.set(systemSerialNumber, {
        systemSerialNumber,
        serialNumber,
        manufacturerSerialNumber: readStringField(record, 'MfrSerialNo')
          ?? readStringField(record, 'ManufacturerSerialNumber'),
        warehouseCode: readAllocationWarehouseCode(record),
        status: readStringField(record, 'Status'),
      })
    }
    const serialOptions = [...optionsBySystemNumber.values()].sort((left, right) => left.serialNumber.localeCompare(right.serialNumber, 'es'))
    const hasOptions = serialOptions.length > 0

    return {
      requiresAllocation: true,
      management: 'serial',
      sourceWarehouseCode,
      sourceWarehouseVerified: scoped.sourceWarehouseVerified,
      status: hasOptions ? 'available' : 'empty',
      message: scoped.sourceWarehouseVerified
        ? (hasOptions ? null : 'SAP no devolvió seriales disponibles para la bodega de origen.')
        : (hasOptions
            ? 'SAP devolvió los seriales del artículo, pero no su bodega. SAP volverá a validar la asignación al crear.'
            : 'SAP no devolvió seriales seleccionables para el artículo.'),
      batchOptions: [],
      serialOptions,
    }
  } catch {
    return unavailableAllocationState('serial', sourceWarehouseCode)
  }
}

async function resolveAllocationState(
  management: SapTransferRequestItemManagement,
  sourceWarehouseCode: string | null,
  itemCode: string,
): Promise<SapTransferRequestAllocationState> {
  if (management === 'none') {
    return {
      requiresAllocation: false,
      management,
      sourceWarehouseCode,
      sourceWarehouseVerified: null,
      status: 'not-required',
      message: null,
      batchOptions: [],
      serialOptions: [],
    }
  }
  if (!sourceWarehouseCode) {
    return {
      requiresAllocation: true,
      management,
      sourceWarehouseCode: null,
      sourceWarehouseVerified: null,
      status: 'source-warehouse-required',
      message: 'Seleccione la bodega de origen antes de consultar lotes o seriales.',
      batchOptions: [],
      serialOptions: [],
    }
  }

  return management === 'batch'
    ? resolveBatchAllocationState(sourceWarehouseCode, itemCode)
    : resolveSerialAllocationState(sourceWarehouseCode, itemCode)
}

/**
 * Retrieves current stock, committed quantity, management mode, and the
 * selectable SAP batch/serial identifiers for one item.
 */
export async function getSapTransferRequestItem(
  itemCode: string,
  options: { sourceWarehouseCode?: string | null } = {},
): Promise<SapTransferRequestItem> {
  const normalizedItemCode = normalizeItemCode(itemCode)
  if (!normalizedItemCode) {
    throw new SapServiceLayerError('El código de artículo es obligatorio.', {
      statusCode: 400,
      sapCode: 'SAP_VALIDATION_ERROR',
    })
  }
  const sourceWarehouseCode = normalizeWarehouseCode(options.sourceWarehouseCode)
  const rawItem = await getSapItem(normalizedItemCode)
  const warehouseCollection = rawItem.ItemWarehouseInfoCollection
  if (!Array.isArray(warehouseCollection)) {
    throw new SapServiceLayerError('SAP no devolvió disponibilidad por bodega para el artículo.', {
      statusCode: 502,
      sapCode: 'SAP_ITEM_WAREHOUSE_DATA_UNAVAILABLE',
    })
  }
  const management = resolveItemManagement(rawItem)
  const allocation = await resolveAllocationState(management, sourceWarehouseCode, normalizedItemCode)

  return {
    itemCode: normalizeItemCode(rawItem.ItemCode) ?? normalizedItemCode,
    itemName: readStringField(rawItem, 'ItemName') ?? normalizedItemCode,
    inventoryUom: readStringField(rawItem, 'InventoryUOM'),
    management,
    warehouseAvailability: normalizeWarehouseAvailability(warehouseCollection),
    allocation,
  }
}

export type SapTransferRequestAvailabilityResult = {
  item: SapTransferRequestItem
  sourceAvailability: SapTransferRequestWarehouseAvailability
}

export type SapTransferRequestPackagePattern = {
  sourceWarehouseCode: 'MP-01'
  status: 'observed' | 'not_available'
  packageQuantity: number | null
  sampleSize: number
  matchingTransfers: number
  message: string
}

type PackageHistorySnapshot = {
  expiresAt: number
  history: Awaited<ReturnType<typeof getSapStockTransferHistoryFromWarehouse>>
}

let packageHistorySnapshot: PackageHistorySnapshot | null = null
let packageHistoryPromise: Promise<PackageHistorySnapshot> | null = null

function greatestCommonDivisor(left: number, right: number): number {
  let dividend = Math.abs(left)
  let divisor = Math.abs(right)
  while (divisor !== 0) {
    const remainder = dividend % divisor
    dividend = divisor
    divisor = remainder
  }
  return dividend
}

function toPatternUnits(quantity: number): number | null {
  const scaled = Math.round(quantity * 1_000)
  return Math.abs(quantity * 1_000 - scaled) < 0.000001 && scaled > 0 ? scaled : null
}

async function getPackageHistorySnapshot(): Promise<PackageHistorySnapshot> {
  if (packageHistorySnapshot && packageHistorySnapshot.expiresAt > Date.now()) return packageHistorySnapshot
  if (packageHistoryPromise) return packageHistoryPromise

  packageHistoryPromise = getSapStockTransferHistoryFromWarehouse('MP-01', { limit: 100 })
    .then(history => {
      const snapshot = { history, expiresAt: Date.now() + 15 * 60 * 1000 }
      packageHistorySnapshot = snapshot
      return snapshot
    })
    .finally(() => {
      packageHistoryPromise = null
    })

  return packageHistoryPromise
}

/**
 * Gives non-blocking guidance from effective historical transfers. It never
 * changes the requested quantity and returns NA when SAP history has no
 * repeatable package signal.
 */
export async function getSapTransferRequestPackagePattern(itemCode: string): Promise<SapTransferRequestPackagePattern> {
  const normalizedItemCode = normalizeItemCode(itemCode)
  if (!normalizedItemCode) {
    throw new SapServiceLayerError('El cÃ³digo de artÃ­culo es obligatorio.', {
      statusCode: 400,
      sapCode: 'SAP_VALIDATION_ERROR',
    })
  }

  const snapshot = await getPackageHistorySnapshot()
  const quantities = snapshot.history
    .filter(line => line.itemCode === normalizedItemCode)
    .map(line => line.quantity)
  const sampleSize = quantities.length
  const units = quantities.map(toPatternUnits)
  const numericUnits = units.filter((quantity): quantity is number => quantity !== null)

  if (sampleSize < 2 || numericUnits.length !== units.length) {
    return {
      sourceWarehouseCode: 'MP-01',
      status: 'not_available',
      packageQuantity: null,
      sampleSize,
      matchingTransfers: 0,
      message: 'NA - sin un patrÃ³n de paquete suficiente en los traslados recientes desde MP-01.',
    }
  }

  const commonUnits = numericUnits.reduce((current, quantity) => greatestCommonDivisor(current, quantity))
  const packageQuantity = commonUnits / 1_000
  if (packageQuantity <= 1) {
    return {
      sourceWarehouseCode: 'MP-01',
      status: 'not_available',
      packageQuantity: null,
      sampleSize,
      matchingTransfers: 0,
      message: 'NA - las cantidades observadas no muestran un paquete repetible; solicite la cantidad necesaria.',
    }
  }

  return {
    sourceWarehouseCode: 'MP-01',
    status: 'observed',
    packageQuantity,
    sampleSize,
    matchingTransfers: numericUnits.filter(quantity => quantity % commonUnits === 0).length,
    message: `PatrÃ³n observado en ${sampleSize} traslados recientes desde MP-01.`,
  }
}

/** Returns the transfer-safe availability: inventory minus committed stock. */
export async function getSapTransferRequestAvailability(
  itemCode: string,
  sourceWarehouseCode: string,
): Promise<SapTransferRequestAvailabilityResult> {
  const normalizedSourceWarehouse = normalizeWarehouseCode(sourceWarehouseCode)
  if (!normalizedSourceWarehouse) {
    throw new SapServiceLayerError('La bodega de origen es obligatoria.', {
      statusCode: 400,
      sapCode: 'SAP_VALIDATION_ERROR',
    })
  }
  const item = await getSapTransferRequestItem(itemCode, { sourceWarehouseCode: normalizedSourceWarehouse })
  const sourceAvailability = item.warehouseAvailability.find(availability => availability.warehouseCode === normalizedSourceWarehouse)
    ?? {
      warehouseCode: normalizedSourceWarehouse,
      inventoryQuantity: 0,
      committedQuantity: 0,
      orderedQuantity: 0,
      availableQuantity: 0,
    }

  return { item, sourceAvailability }
}

export type SapTransferRequestBatchAllocation = {
  batchNumber: string
  quantity: number
}

export type SapTransferRequestSerialAllocation = {
  systemSerialNumber: number
}

export type SapTransferRequestDraftLine = {
  itemCode: string
  quantity: number
  transferType: SapTransferRequestTransferType
  batchNumbers?: SapTransferRequestBatchAllocation[]
  serialNumbers?: SapTransferRequestSerialAllocation[]
}

export type SapTransferRequestDraft = {
  sourceWarehouseCode: string
  destinationWarehouseCode: string
  businessComment: string
  lines: SapTransferRequestDraftLine[]
}

export type SapTransferRequestValidationIssueCode =
  | 'INVALID_REQUEST'
  | 'SOURCE_WAREHOUSE_REQUIRED'
  | 'DESTINATION_WAREHOUSE_REQUIRED'
  | 'SOURCE_WAREHOUSE_INACTIVE'
  | 'DESTINATION_WAREHOUSE_INACTIVE'
  | 'WAREHOUSES_MUST_DIFFER'
  | 'BUSINESS_COMMENT_REQUIRED'
  | 'BUSINESS_COMMENT_TOO_LONG'
  | 'LINES_REQUIRED'
  | 'ITEM_CODE_REQUIRED'
  | 'QUANTITY_INVALID'
  | 'QUANTITY_PRECISION_INVALID'
  | 'TRANSFER_TYPE_REQUIRED'
  | 'BATCH_ALLOCATIONS_INVALID'
  | 'SERIAL_ALLOCATIONS_INVALID'
  | 'ALLOCATION_NOT_ALLOWED'
  | 'BATCH_ALLOCATION_REQUIRED'
  | 'SERIAL_ALLOCATION_REQUIRED'
  | 'BATCH_ALLOCATION_QUANTITY_MISMATCH'
  | 'SERIAL_ALLOCATION_QUANTITY_MISMATCH'
  | 'DUPLICATE_BATCH_ALLOCATION'
  | 'DUPLICATE_SERIAL_ALLOCATION'
  | 'ALLOCATION_OPTIONS_UNAVAILABLE'
  | 'ALLOCATION_OPTIONS_EMPTY'
  | 'BATCH_NOT_AVAILABLE_IN_SAP'
  | 'SERIAL_NOT_AVAILABLE_IN_SAP'
  | 'INSUFFICIENT_STOCK'

export type SapTransferRequestValidationIssue = {
  code: SapTransferRequestValidationIssueCode
  message: string
  lineIndex?: number
  availableQuantity?: number
  requestedQuantity?: number
}

type NormalizedSapTransferRequestDraftLine = Required<SapTransferRequestDraftLine>

type NormalizedSapTransferRequestDraft = {
  sourceWarehouseCode: string
  destinationWarehouseCode: string
  businessComment: string
  lines: NormalizedSapTransferRequestDraftLine[]
}

function isTransferType(value: string | null): value is SapTransferRequestTransferType {
  return value === 'Físico' || value === 'Virtual'
}

function addIssue(
  issues: SapTransferRequestValidationIssue[],
  code: SapTransferRequestValidationIssueCode,
  message: string,
  options: Omit<SapTransferRequestValidationIssue, 'code' | 'message'> = {},
): void {
  issues.push({ code, message, ...options })
}

function parseBatchAllocations(
  value: unknown,
  lineIndex: number,
  issues: SapTransferRequestValidationIssue[],
): SapTransferRequestBatchAllocation[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    addIssue(issues, 'BATCH_ALLOCATIONS_INVALID', 'Los lotes deben enviarse como una lista.', { lineIndex })
    return []
  }

  const allocations: SapTransferRequestBatchAllocation[] = []
  for (const allocation of value) {
    if (!isRecord(allocation)) {
      addIssue(issues, 'BATCH_ALLOCATIONS_INVALID', 'Cada lote debe incluir número y cantidad.', { lineIndex })
      continue
    }
    const batchNumber = readStringField(allocation, 'batchNumber')
    const quantity = readNumberField(allocation, 'quantity')
    if (!batchNumber || quantity === null || quantity <= 0) {
      addIssue(issues, 'BATCH_ALLOCATIONS_INVALID', 'Cada lote debe incluir un número y una cantidad mayor que cero.', { lineIndex })
      continue
    }
    if (!hasSapTransferRequestQuantityPrecision(quantity)) {
      addIssue(issues, 'BATCH_ALLOCATIONS_INVALID', 'Las cantidades por lote admiten máximo dos decimales y deben usar punto.', { lineIndex })
      continue
    }
    allocations.push({ batchNumber, quantity })
  }

  return allocations
}

function parseSerialAllocations(
  value: unknown,
  lineIndex: number,
  issues: SapTransferRequestValidationIssue[],
): SapTransferRequestSerialAllocation[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    addIssue(issues, 'SERIAL_ALLOCATIONS_INVALID', 'Los seriales deben enviarse como una lista.', { lineIndex })
    return []
  }

  const allocations: SapTransferRequestSerialAllocation[] = []
  for (const allocation of value) {
    if (!isRecord(allocation)) {
      addIssue(issues, 'SERIAL_ALLOCATIONS_INVALID', 'Cada serial debe incluir su número interno de SAP.', { lineIndex })
      continue
    }
    const systemSerialNumber = readPositiveInteger(allocation.systemSerialNumber)
    if (systemSerialNumber === null) {
      addIssue(issues, 'SERIAL_ALLOCATIONS_INVALID', 'Cada serial debe incluir un número interno válido de SAP.', { lineIndex })
      continue
    }
    allocations.push({ systemSerialNumber })
  }

  return allocations
}

function normalizeTransferRequestDraft(value: unknown): {
  draft: NormalizedSapTransferRequestDraft | null
  issues: SapTransferRequestValidationIssue[]
} {
  const issues: SapTransferRequestValidationIssue[] = []
  if (!isRecord(value)) {
    addIssue(issues, 'INVALID_REQUEST', 'La solicitud de traslado no tiene un formato válido.')
    return { draft: null, issues }
  }

  const sourceWarehouseCode = normalizeWarehouseCode(value.sourceWarehouseCode)
  const destinationWarehouseCode = normalizeWarehouseCode(value.destinationWarehouseCode)
  const businessComment = readText(value.businessComment)
  if (!sourceWarehouseCode) {
    addIssue(issues, 'SOURCE_WAREHOUSE_REQUIRED', 'Seleccione la bodega de origen.')
  }
  if (!destinationWarehouseCode) {
    addIssue(issues, 'DESTINATION_WAREHOUSE_REQUIRED', 'Seleccione la bodega de destino.')
  }
  if (sourceWarehouseCode && destinationWarehouseCode && sourceWarehouseCode === destinationWarehouseCode) {
    addIssue(issues, 'WAREHOUSES_MUST_DIFFER', 'La bodega de origen y la de destino deben ser diferentes.')
  }
  if (!businessComment) {
    addIssue(issues, 'BUSINESS_COMMENT_REQUIRED', 'El comentario contextual es obligatorio.')
  } else if (countCharacters(businessComment) > 50) {
    addIssue(issues, 'BUSINESS_COMMENT_TOO_LONG', 'El comentario contextual no puede superar 50 caracteres.')
  }

  if (!Array.isArray(value.lines) || value.lines.length === 0) {
    addIssue(issues, 'LINES_REQUIRED', 'Agregue al menos un artículo a la solicitud.')
    return { draft: null, issues }
  }

  const lines: NormalizedSapTransferRequestDraftLine[] = []
  for (const [lineIndex, rawLine] of value.lines.entries()) {
    if (!isRecord(rawLine)) {
      addIssue(issues, 'INVALID_REQUEST', 'Una línea de solicitud no tiene un formato válido.', { lineIndex })
      continue
    }
    const itemCode = normalizeItemCode(rawLine.itemCode)
    const quantity = readNumber(rawLine.quantity)
    const transferType = readText(rawLine.transferType)?.normalize('NFC') ?? null
    if (!itemCode) {
      addIssue(issues, 'ITEM_CODE_REQUIRED', 'Seleccione un artículo para la línea.', { lineIndex })
    }
    if (quantity === null || quantity <= 0) {
      addIssue(issues, 'QUANTITY_INVALID', 'La cantidad debe ser mayor que cero.', { lineIndex })
    }
    if (quantity !== null && quantity > 0 && !hasSapTransferRequestQuantityPrecision(quantity)) {
      addIssue(issues, 'QUANTITY_PRECISION_INVALID', 'La cantidad admite máximo dos decimales y debe usar punto, por ejemplo 1.25.', { lineIndex })
    }
    if (!isTransferType(transferType)) {
      addIssue(issues, 'TRANSFER_TYPE_REQUIRED', 'Seleccione Físico o Virtual para la línea.', { lineIndex })
    }
    const batchNumbers = parseBatchAllocations(rawLine.batchNumbers, lineIndex, issues)
    const serialNumbers = parseSerialAllocations(rawLine.serialNumbers, lineIndex, issues)
    if (!itemCode || quantity === null || quantity <= 0 || !hasSapTransferRequestQuantityPrecision(quantity) || !isTransferType(transferType)) continue
    lines.push({
      itemCode,
      quantity,
      transferType,
      batchNumbers,
      serialNumbers,
    })
  }

  if (issues.length > 0 || !sourceWarehouseCode || !destinationWarehouseCode || !businessComment) {
    return { draft: null, issues }
  }

  return {
    draft: {
      sourceWarehouseCode,
      destinationWarehouseCode,
      businessComment,
      lines,
    },
    issues,
  }
}

export type SapTransferRequestValidatedLine = {
  lineIndex: number
  itemCode: string
  itemName: string
  inventoryUom: string | null
  quantity: number
  transferType: SapTransferRequestTransferType
  sourceWarehouseCode: string
  destinationWarehouseCode: string
  availability: SapTransferRequestWarehouseAvailability
  management: SapTransferRequestItemManagement
  allocation: SapTransferRequestAllocationState
  batchNumbers: SapTransferRequestBatchAllocation[]
  serialNumbers: SapTransferRequestSerialAllocation[]
}

export type SapTransferRequestValidationSuccess = {
  valid: true
  checkedAt: string
  defaults: SapTransferRequestDefaults
  sourceWarehouseCode: string
  destinationWarehouseCode: string
  businessComment: string
  lines: SapTransferRequestValidatedLine[]
  issues: []
}

export type SapTransferRequestValidationFailure = {
  valid: false
  checkedAt: string
  defaults: SapTransferRequestDefaults
  lines: SapTransferRequestValidatedLine[]
  issues: SapTransferRequestValidationIssue[]
}

export type SapTransferRequestValidationResult = SapTransferRequestValidationSuccess | SapTransferRequestValidationFailure

export type SapTransferRequestPreparedDraft = {
  defaults: SapTransferRequestDefaults
  sourceWarehouseCode: string
  destinationWarehouseCode: string
  businessComment: string
  lines: NormalizedSapTransferRequestDraftLine[]
}

function emptyAvailability(warehouseCode: string): SapTransferRequestWarehouseAvailability {
  return {
    warehouseCode,
    inventoryQuantity: 0,
    committedQuantity: 0,
    orderedQuantity: 0,
    availableQuantity: 0,
  }
}

function addAllocationValidationIssues(
  line: SapTransferRequestValidatedLine,
  issues: SapTransferRequestValidationIssue[],
): void {
  if (line.management === 'none') {
    if (line.batchNumbers.length > 0 || line.serialNumbers.length > 0) {
      addIssue(issues, 'ALLOCATION_NOT_ALLOWED', 'El artículo no se administra por lotes ni seriales.', { lineIndex: line.lineIndex })
    }
    return
  }
  if (line.allocation.status === 'unavailable') {
    addIssue(issues, 'ALLOCATION_OPTIONS_UNAVAILABLE', line.allocation.message ?? 'No fue posible consultar las asignaciones SAP.', {
      lineIndex: line.lineIndex,
    })
    return
  }
  if (line.allocation.status === 'empty' || line.allocation.status === 'source-warehouse-required') {
    addIssue(issues, 'ALLOCATION_OPTIONS_EMPTY', line.allocation.message ?? 'SAP no devolvió asignaciones seleccionables.', {
      lineIndex: line.lineIndex,
    })
    return
  }

  if (line.management === 'batch') {
    if (line.serialNumbers.length > 0) {
      addIssue(issues, 'ALLOCATION_NOT_ALLOWED', 'El artículo se administra por lotes, no por seriales.', { lineIndex: line.lineIndex })
    }
    if (line.batchNumbers.length === 0) {
      addIssue(issues, 'BATCH_ALLOCATION_REQUIRED', 'Seleccione uno o más lotes para la línea.', { lineIndex: line.lineIndex })
      return
    }
    const batchNumbers = new Set<string>()
    for (const allocation of line.batchNumbers) {
      if (batchNumbers.has(allocation.batchNumber)) {
        addIssue(issues, 'DUPLICATE_BATCH_ALLOCATION', 'Un lote solo puede aparecer una vez por línea.', { lineIndex: line.lineIndex })
      }
      batchNumbers.add(allocation.batchNumber)
    }
    const allocatedQuantity = line.batchNumbers.reduce((sum, allocation) => sum + allocation.quantity, 0)
    if (Math.abs(allocatedQuantity - line.quantity) > 0.000001) {
      addIssue(issues, 'BATCH_ALLOCATION_QUANTITY_MISMATCH', 'La suma de los lotes debe coincidir con la cantidad solicitada.', {
        lineIndex: line.lineIndex,
        requestedQuantity: line.quantity,
      })
    }
    const selectableBatches = new Set(line.allocation.batchOptions.map(option => option.batchNumber))
    for (const allocation of line.batchNumbers) {
      if (!selectableBatches.has(allocation.batchNumber)) {
        addIssue(issues, 'BATCH_NOT_AVAILABLE_IN_SAP', `El lote ${allocation.batchNumber} no está entre las opciones actuales de SAP.`, {
          lineIndex: line.lineIndex,
        })
      }
    }
    return
  }

  if (line.batchNumbers.length > 0) {
    addIssue(issues, 'ALLOCATION_NOT_ALLOWED', 'El artículo se administra por seriales, no por lotes.', { lineIndex: line.lineIndex })
  }
  if (line.serialNumbers.length === 0) {
    addIssue(issues, 'SERIAL_ALLOCATION_REQUIRED', 'Seleccione los seriales para la línea.', { lineIndex: line.lineIndex })
    return
  }
  if (!Number.isSafeInteger(line.quantity) || line.serialNumbers.length !== line.quantity) {
    addIssue(issues, 'SERIAL_ALLOCATION_QUANTITY_MISMATCH', 'La cantidad de seriales debe coincidir exactamente con la cantidad solicitada.', {
      lineIndex: line.lineIndex,
      requestedQuantity: line.quantity,
    })
  }
  const serialNumbers = new Set<number>()
  for (const allocation of line.serialNumbers) {
    if (serialNumbers.has(allocation.systemSerialNumber)) {
      addIssue(issues, 'DUPLICATE_SERIAL_ALLOCATION', 'Un serial solo puede aparecer una vez por línea.', { lineIndex: line.lineIndex })
    }
    serialNumbers.add(allocation.systemSerialNumber)
  }
  const selectableSerials = new Set(line.allocation.serialOptions.map(option => option.systemSerialNumber))
  for (const allocation of line.serialNumbers) {
    if (!selectableSerials.has(allocation.systemSerialNumber)) {
      addIssue(issues, 'SERIAL_NOT_AVAILABLE_IN_SAP', `El serial ${allocation.systemSerialNumber} no está entre las opciones actuales de SAP.`, {
        lineIndex: line.lineIndex,
      })
    }
  }
}

/**
 * Re-reads SAP without writing. It validates all line rules and aggregates
 * repeated items so their combined request cannot exceed current availability.
 */
export async function validateSapTransferRequest(input: unknown): Promise<SapTransferRequestValidationResult> {
  const [defaults, normalized] = await Promise.all([
    getSapTransferRequestDefaults(),
    Promise.resolve(normalizeTransferRequestDraft(input)),
  ])
  const checkedAt = currentColombiaTimestamp()
  if (!normalized.draft) {
    return {
      valid: false,
      checkedAt,
      defaults,
      lines: [],
      issues: normalized.issues,
    }
  }

  const draft = normalized.draft
  const itemCodes = [...new Set(draft.lines.map(line => line.itemCode))]
  const [itemEntries, rawWarehouses] = await Promise.all([
    Promise.all(itemCodes.map(async itemCode => ({
      itemCode,
      item: await getSapTransferRequestItem(itemCode, { sourceWarehouseCode: draft.sourceWarehouseCode }),
    }))),
    getSapActiveWarehouses(),
  ])
  const activeWarehouseCodes = new Set(rawWarehouses
    .filter(warehouse => !readSapYes(warehouse.Inactive))
    .map(warehouse => normalizeWarehouseCode(warehouse.WarehouseCode))
    .filter((warehouseCode): warehouseCode is string => Boolean(warehouseCode)))
  const itemsByCode = new Map(itemEntries.map(entry => [entry.itemCode, entry.item]))
  const lines = draft.lines.map((line, lineIndex): SapTransferRequestValidatedLine => {
    const item = itemsByCode.get(line.itemCode)
    if (!item) {
      throw new SapServiceLayerError('SAP no devolvió el artículo validado.', {
        statusCode: 502,
        sapCode: 'SAP_INVALID_ITEM_PAYLOAD',
      })
    }
    const availability = item.warehouseAvailability.find(candidate => candidate.warehouseCode === draft.sourceWarehouseCode)
      ?? emptyAvailability(draft.sourceWarehouseCode)

    return {
      lineIndex,
      itemCode: line.itemCode,
      itemName: item.itemName,
      inventoryUom: item.inventoryUom,
      quantity: line.quantity,
      transferType: line.transferType,
      sourceWarehouseCode: draft.sourceWarehouseCode,
      destinationWarehouseCode: draft.destinationWarehouseCode,
      availability,
      management: item.management,
      allocation: item.allocation,
      batchNumbers: line.batchNumbers,
      serialNumbers: line.serialNumbers,
    }
  })
  const issues = [...normalized.issues]
  if (!activeWarehouseCodes.has(draft.sourceWarehouseCode)) {
    addIssue(issues, 'SOURCE_WAREHOUSE_INACTIVE', 'La bodega de origen no está activa en SAP.')
  }
  if (!activeWarehouseCodes.has(draft.destinationWarehouseCode)) {
    addIssue(issues, 'DESTINATION_WAREHOUSE_INACTIVE', 'La bodega de destino no está activa en SAP.')
  }
  for (const line of lines) addAllocationValidationIssues(line, issues)

  const requestedByItem = new Map<string, number>()
  for (const line of lines) {
    requestedByItem.set(line.itemCode, (requestedByItem.get(line.itemCode) ?? 0) + line.quantity)
  }
  for (const [itemCode, requestedQuantity] of requestedByItem) {
    const matchingLines = lines.filter(line => line.itemCode === itemCode)
    const availableQuantity = matchingLines[0]?.availability.availableQuantity ?? 0
    if (requestedQuantity <= availableQuantity + 0.000001) continue
    for (const line of matchingLines) {
      addIssue(issues, 'INSUFFICIENT_STOCK', `La cantidad solicitada excede la disponibilidad actual (${availableQuantity}) en ${line.sourceWarehouseCode}.`, {
        lineIndex: line.lineIndex,
        availableQuantity,
        requestedQuantity,
      })
    }
  }

  if (issues.length > 0) {
    return {
      valid: false,
      checkedAt,
      defaults,
      lines,
      issues,
    }
  }

  return {
    valid: true,
    checkedAt,
    defaults,
    sourceWarehouseCode: draft.sourceWarehouseCode,
    destinationWarehouseCode: draft.destinationWarehouseCode,
    businessComment: draft.businessComment,
    lines,
    issues: [],
  }
}

export type SapTransferRequestPayloadBatchNumber = SapEntityPayload & {
  BatchNumber: string
  Quantity: number
  BaseLineNumber: number
}

export type SapTransferRequestPayloadSerialNumber = SapEntityPayload & {
  SystemSerialNumber: number
  Quantity: 1
  BaseLineNumber: number
}

export type SapTransferRequestPayloadLine = SapEntityPayload & {
  ItemCode: string
  Quantity: number
  FromWarehouseCode: string
  WarehouseCode: string
  U_TipoTraslado: SapTransferRequestTransferType
  BatchNumbers?: SapTransferRequestPayloadBatchNumber[]
  SerialNumbers?: SapTransferRequestPayloadSerialNumber[]
}

export type SapTransferRequestPayload = SapEntityPayload & {
  CardCode: string
  ContactPerson: number
  ShipToCode: string
  Address: string
  Series: number
  PriceList: number
  FromWarehouse: string
  ToWarehouse: string
  DocDate: string
  DueDate: string
  TaxDate: string
  Comments: string
  U_Comentarios: string
  StockTransferLines: SapTransferRequestPayloadLine[]
}

/**
 * Checks only the request shape and SAP-fixed defaults. Availability, lots and
 * serials have already been read while each line was added in the UI, so this
 * path deliberately performs no additional item or warehouse read.
 */
export async function prepareSapTransferRequestWithoutRefresh(input: unknown): Promise<SapTransferRequestPreparedDraft> {
  const [defaults, normalized] = await Promise.all([
    getSapTransferRequestDefaults(),
    Promise.resolve(normalizeTransferRequestDraft(input)),
  ])
  if (!normalized.draft) {
    throw new SapTransferRequestValidationError({
      valid: false,
      checkedAt: currentColombiaTimestamp(),
      defaults,
      lines: [],
      issues: normalized.issues,
    })
  }

  return {
    defaults,
    sourceWarehouseCode: normalized.draft.sourceWarehouseCode,
    destinationWarehouseCode: normalized.draft.destinationWarehouseCode,
    businessComment: normalized.draft.businessComment,
    lines: normalized.draft.lines,
  }
}

export type SapTransferRequestUpdatePayload = SapEntityPayload & {
  FromWarehouse: string
  ToWarehouse: string
  U_Comentarios: string
  StockTransferLines: SapTransferRequestPayloadLine[]
}

/** Converts a successful no-write validation into the exact SAP POST body. */
export function buildSapTransferRequestPayload(validation: SapTransferRequestValidationSuccess): SapTransferRequestPayload {
  return buildSapTransferRequestPayloadFromPreparedDraft(validation)
}

export function buildSapTransferRequestPayloadFromPreparedDraft(
  prepared: SapTransferRequestPreparedDraft,
): SapTransferRequestPayload {
  const documentDate = currentColombiaDate()
  const stockTransferLines = prepared.lines.map((line, lineIndex): SapTransferRequestPayloadLine => {
    const payload: SapTransferRequestPayloadLine = {
      ItemCode: line.itemCode,
      Quantity: line.quantity,
      FromWarehouseCode: prepared.sourceWarehouseCode,
      WarehouseCode: prepared.destinationWarehouseCode,
      U_TipoTraslado: line.transferType,
    }
    if (line.batchNumbers.length > 0) {
      payload.BatchNumbers = line.batchNumbers.map(allocation => ({
        BatchNumber: allocation.batchNumber,
        Quantity: allocation.quantity,
        BaseLineNumber: lineIndex,
      }))
    }
    if (line.serialNumbers.length > 0) {
      payload.SerialNumbers = line.serialNumbers.map(allocation => ({
        SystemSerialNumber: allocation.systemSerialNumber,
        Quantity: 1,
        BaseLineNumber: lineIndex,
      }))
    }
    return payload
  })

  return {
    CardCode: prepared.defaults.cardCode,
    ContactPerson: prepared.defaults.contactPerson,
    ShipToCode: prepared.defaults.shipToCode,
    Address: prepared.defaults.shipToAddress,
    Series: prepared.defaults.series,
    PriceList: prepared.defaults.priceList,
    FromWarehouse: prepared.sourceWarehouseCode,
    ToWarehouse: prepared.destinationWarehouseCode,
    DocDate: documentDate,
    DueDate: documentDate,
    TaxDate: documentDate,
    Comments: SAP_TRANSFER_REQUEST_AUTOMATIC_COMMENT,
    U_Comentarios: prepared.businessComment,
    StockTransferLines: stockTransferLines,
  }
}

/** Builds the mutable subset of a request without changing its original dates or fixed partner data. */
export function buildSapTransferRequestUpdatePayload(
  validation: SapTransferRequestValidationSuccess,
): SapTransferRequestUpdatePayload {
  const createdPayload = buildSapTransferRequestPayload(validation)
  return {
    FromWarehouse: createdPayload.FromWarehouse,
    ToWarehouse: createdPayload.ToWarehouse,
    U_Comentarios: createdPayload.U_Comentarios,
    StockTransferLines: createdPayload.StockTransferLines,
  }
}

export type SapTransferRequestDocumentLine = {
  lineNumber: number | null
  itemCode: string
  itemDescription: string | null
  unitOfMeasure: string | null
  quantity: number
  fromWarehouseCode: string | null
  warehouseCode: string | null
  transferType: SapTransferRequestTransferType | null
  batchNumbers: SapTransferRequestBatchAllocation[]
  serialNumbers: SapTransferRequestSerialAllocation[]
}

export type SapTransferRequestDocument = {
  docEntry: number
  docNum: number | null
  documentStatus: string | null
  cardCode: string | null
  contactPerson: number | null
  shipToCode: string | null
  address: string | null
  series: number | null
  priceList: number | null
  docDate: string | null
  dueDate: string | null
  taxDate: string | null
  fromWarehouse: string | null
  toWarehouse: string | null
  comments: string | null
  businessComment: string | null
  lines: SapTransferRequestDocumentLine[]
}

function normalizeDocumentBatchNumbers(value: unknown): SapTransferRequestBatchAllocation[] {
  const batches: SapTransferRequestBatchAllocation[] = []
  for (const rawBatch of readRecordArray(value)) {
    const batchNumber = batchNumberFromRecord(rawBatch)
    const quantity = readNumberField(rawBatch, 'Quantity')
    if (batchNumber && quantity !== null) batches.push({ batchNumber, quantity })
  }
  return batches
}

function normalizeDocumentSerialNumbers(value: unknown): SapTransferRequestSerialAllocation[] {
  const serials: SapTransferRequestSerialAllocation[] = []
  for (const rawSerial of readRecordArray(value)) {
    const systemSerialNumber = serialSystemNumberFromRecord(rawSerial)
    if (systemSerialNumber !== null) serials.push({ systemSerialNumber })
  }
  return serials
}

function normalizeSapTransferRequestDocument(value: SapEntityPayload): SapTransferRequestDocument {
  const docEntry = readPositiveInteger(value.DocEntry)
  if (docEntry === null) {
    throw new SapServiceLayerError('SAP no devolvió DocEntry para la solicitud de traslado.', {
      statusCode: 502,
      sapCode: 'SAP_INVALID_TRANSFER_REQUEST_PAYLOAD',
    })
  }
  const lines = readRecordArray(value.StockTransferLines).map((rawLine): SapTransferRequestDocumentLine => {
    const transferType = readStringField(rawLine, 'U_TipoTraslado')?.normalize('NFC') ?? null
    return {
      lineNumber: readNumberField(rawLine, 'LineNum'),
      itemCode: normalizeItemCode(rawLine.ItemCode) ?? '',
      itemDescription: readStringField(rawLine, 'ItemDescription'),
      unitOfMeasure: readStringField(rawLine, 'InventoryUOM')
        ?? readStringField(rawLine, 'MeasureUnit')
        ?? readStringField(rawLine, 'UoMCode'),
      quantity: readNumberField(rawLine, 'Quantity') ?? 0,
      fromWarehouseCode: normalizeWarehouseCode(rawLine.FromWarehouseCode),
      warehouseCode: normalizeWarehouseCode(rawLine.WarehouseCode),
      transferType: isTransferType(transferType) ? transferType : null,
      batchNumbers: normalizeDocumentBatchNumbers(rawLine.BatchNumbers),
      serialNumbers: normalizeDocumentSerialNumbers(rawLine.SerialNumbers),
    }
  })

  return {
    docEntry,
    docNum: readNumberField(value, 'DocNum'),
    documentStatus: readStringField(value, 'DocumentStatus'),
    cardCode: readStringField(value, 'CardCode'),
    contactPerson: readNumberField(value, 'ContactPerson'),
    shipToCode: readStringField(value, 'ShipToCode'),
    address: readStringField(value, 'Address'),
    series: readNumberField(value, 'Series'),
    priceList: readNumberField(value, 'PriceList'),
    docDate: readStringField(value, 'DocDate'),
    dueDate: readStringField(value, 'DueDate'),
    taxDate: readStringField(value, 'TaxDate'),
    fromWarehouse: normalizeWarehouseCode(value.FromWarehouse),
    toWarehouse: normalizeWarehouseCode(value.ToWarehouse),
    comments: readStringField(value, 'Comments'),
    businessComment: readStringField(value, 'U_Comentarios'),
    lines,
  }
}

export async function getSapTransferRequestByDocEntry(docEntry: number): Promise<SapTransferRequestDocument> {
  const rawDocument = await getSapInventoryTransferRequest(docEntry)
  return normalizeSapTransferRequestDocument(rawDocument)
}

export function isSapTransferRequestEditable(document: SapTransferRequestDocument): boolean {
  const status = document.documentStatus?.trim().toLowerCase() ?? ''
  return status === 'bost_open' || status === 'open'
}

export class SapTransferRequestNotEditableError extends SapServiceLayerError {
  constructor(documentStatus: string | null) {
    super('La solicitud ya no está abierta en SAP y no se puede modificar.', {
      statusCode: 409,
      sapCode: 'SAP_TRANSFER_REQUEST_NOT_EDITABLE',
    })
    this.name = 'SapTransferRequestNotEditableError'
    this.documentStatus = documentStatus
  }

  readonly documentStatus: string | null
}

export class SapTransferRequestValidationError extends SapServiceLayerError {
  readonly issues: SapTransferRequestValidationIssue[]

  constructor(result: SapTransferRequestValidationFailure) {
    super('La solicitud de traslado no pasó la validación.', {
      statusCode: 422,
      sapCode: 'SAP_TRANSFER_REQUEST_VALIDATION_FAILED',
    })
    this.name = 'SapTransferRequestValidationError'
    this.issues = result.issues
  }
}

export class SapTransferRequestCreationAmbiguousError extends SapServiceLayerError {
  readonly docEntry: number | null

  constructor(message: string, docEntry: number | null) {
    super(message, {
      statusCode: 502,
      sapCode: 'SAP_TRANSFER_REQUEST_CREATION_AMBIGUOUS',
    })
    this.name = 'SapTransferRequestCreationAmbiguousError'
    this.docEntry = docEntry
  }
}

export class SapTransferRequestUpdateAmbiguousError extends SapServiceLayerError {
  readonly docEntry: number

  constructor(message: string, docEntry: number) {
    super(message, {
      statusCode: 502,
      sapCode: 'SAP_TRANSFER_REQUEST_UPDATE_AMBIGUOUS',
    })
    this.name = 'SapTransferRequestUpdateAmbiguousError'
    this.docEntry = docEntry
  }
}

function isPotentiallyAmbiguousSapWriteError(error: unknown): boolean {
  return !(error instanceof SapServiceLayerError) || error.statusCode >= 500
}

export type SapTransferRequestCreateResult = {
  validation: SapTransferRequestValidationSuccess
  payload: SapTransferRequestPayload
  document: SapTransferRequestDocument
}

export type SapTransferRequestDirectCreateResult = {
  prepared: SapTransferRequestPreparedDraft
  payload: SapTransferRequestPayload
  document: SapTransferRequestDocument
}

export type SapTransferRequestBeforeCreateHook = (context: {
  validation: SapTransferRequestValidationSuccess
  payload: SapTransferRequestPayload
}) => Promise<void>

export type SapTransferRequestBeforeDirectCreateHook = (context: {
  prepared: SapTransferRequestPreparedDraft
  payload: SapTransferRequestPayload
}) => Promise<void>

/**
 * Posts the draft using availability and allocation data already consulted when
 * the user added each line. It intentionally avoids re-reading every item.
 */
export async function createAndVerifySapTransferRequestWithoutRefresh(
  input: unknown,
  options: { beforeCreate?: SapTransferRequestBeforeDirectCreateHook } = {},
): Promise<SapTransferRequestDirectCreateResult> {
  const prepared = await prepareSapTransferRequestWithoutRefresh(input)
  const payload = buildSapTransferRequestPayloadFromPreparedDraft(prepared)
  await options.beforeCreate?.({ prepared, payload })
  let createResponse: SapEntityPayload
  try {
    createResponse = await createSapInventoryTransferRequest(payload)
  } catch (error) {
    if (isPotentiallyAmbiguousSapWriteError(error)) {
      throw new SapTransferRequestCreationAmbiguousError(
        'SAP no confirmó si la solicitud de traslado fue creada. Consulte el historial antes de reintentar.',
        null,
      )
    }
    throw error
  }

  const docEntry = readPositiveInteger(createResponse.DocEntry)
  if (docEntry === null) {
    throw new SapTransferRequestCreationAmbiguousError(
      'SAP respondió a la creación sin DocEntry. Consulte el historial antes de reintentar.',
      null,
    )
  }

  try {
    const document = await getSapTransferRequestByDocEntry(docEntry)
    return { prepared, payload, document }
  } catch {
    throw new SapTransferRequestCreationAmbiguousError(
      'SAP recibió la creación, pero no fue posible releer la solicitud. Consulte el historial antes de reintentar.',
      docEntry,
    )
  }
}

/**
 * Revalidates immediately before the only SAP write, posts exclusively to
 * InventoryTransferRequests, then re-reads the exact DocEntry for verification.
 */
export async function createAndVerifySapTransferRequest(
  input: unknown,
  options: { beforeCreate?: SapTransferRequestBeforeCreateHook } = {},
): Promise<SapTransferRequestCreateResult> {
  const validation = await validateSapTransferRequest(input)
  if (!validation.valid) throw new SapTransferRequestValidationError(validation)
  const payload = buildSapTransferRequestPayload(validation)
  await options.beforeCreate?.({ validation, payload })
  let createResponse: SapEntityPayload
  try {
    createResponse = await createSapInventoryTransferRequest(payload)
  } catch (error) {
    if (isPotentiallyAmbiguousSapWriteError(error)) {
      throw new SapTransferRequestCreationAmbiguousError(
        'SAP no confirmó si la solicitud de traslado fue creada. Consulte el historial antes de reintentar.',
        null,
      )
    }
    throw error
  }

  const docEntry = readPositiveInteger(createResponse.DocEntry)
  if (docEntry === null) {
    throw new SapTransferRequestCreationAmbiguousError(
      'SAP respondió a la creación sin DocEntry. Consulte el historial antes de reintentar.',
      null,
    )
  }

  try {
    const document = await getSapTransferRequestByDocEntry(docEntry)
    return { validation, payload, document }
  } catch {
    throw new SapTransferRequestCreationAmbiguousError(
      'SAP recibió la creación, pero no fue posible releer la solicitud. Consulte el historial antes de reintentar.',
      docEntry,
    )
  }
}

export type SapTransferRequestUpdateResult = {
  validation: SapTransferRequestValidationSuccess
  payload: SapTransferRequestUpdatePayload
  previousDocument: SapTransferRequestDocument
  document: SapTransferRequestDocument
}

export type SapTransferRequestBeforeUpdateHook = (context: {
  validation: SapTransferRequestValidationSuccess
  payload: SapTransferRequestUpdatePayload
  previousDocument: SapTransferRequestDocument
}) => Promise<void>

/**
 * Revalidates stock and rereads the exact request immediately before PATCH.
 * Only documents that SAP still reports as open can be changed.
 */
export async function updateAndVerifySapTransferRequest(
  docEntry: number,
  input: unknown,
  options: { beforeUpdate?: SapTransferRequestBeforeUpdateHook } = {},
): Promise<SapTransferRequestUpdateResult> {
  const validation = await validateSapTransferRequest(input)
  if (!validation.valid) throw new SapTransferRequestValidationError(validation)

  const previousDocument = await getSapTransferRequestByDocEntry(docEntry)
  if (!isSapTransferRequestEditable(previousDocument)) {
    throw new SapTransferRequestNotEditableError(previousDocument.documentStatus)
  }

  const payload = buildSapTransferRequestUpdatePayload(validation)
  await options.beforeUpdate?.({ validation, payload, previousDocument })
  try {
    await updateSapInventoryTransferRequest(docEntry, payload)
  } catch (error) {
    if (isPotentiallyAmbiguousSapWriteError(error)) {
      throw new SapTransferRequestUpdateAmbiguousError(
        'SAP no confirmó si la solicitud fue modificada. Consulte el detalle antes de reintentar.',
        docEntry,
      )
    }
    throw error
  }

  try {
    const document = await getSapTransferRequestByDocEntry(docEntry)
    return { validation, payload, previousDocument, document }
  } catch {
    throw new SapTransferRequestUpdateAmbiguousError(
      'SAP recibió la modificación, pero no fue posible releer la solicitud. Consulte el detalle antes de reintentar.',
      docEntry,
    )
  }
}
