import 'server-only'

import { dbQuery } from '@/lib/supabase'
import { supabaseTable } from '@/lib/supabaseDynamic'

export const SAP_TRANSFER_REQUEST_CREATE_OPERATION_TYPE = 'inventory_transfer_request_create' as const
export const SAP_TRANSFER_REQUEST_UPDATE_OPERATION_TYPE = 'inventory_transfer_request_update' as const
export const SAP_TRANSFER_REQUEST_SUBJECT_TYPE = 'inventory_transfer_request' as const
export const SAP_OPERATION_TYPES = [
  SAP_TRANSFER_REQUEST_CREATE_OPERATION_TYPE,
  SAP_TRANSFER_REQUEST_UPDATE_OPERATION_TYPE,
] as const

export type SapOperationType = (typeof SAP_OPERATION_TYPES)[number]

export const SAP_OPERATION_STATUSES = [
  'pending',
  'verified',
  'failed',
  'ambiguous',
] as const

export type SapOperationStatus = (typeof SAP_OPERATION_STATUSES)[number]

export type SapOperationActor = {
  id: string | null
  email: string | null
  role: string | null
}

export type SapOperationLog = {
  id: string
  operationType: string
  itemCode: string | null
  requestedStatus: string | null
  dryRun: boolean
  confirmationText: string | null
  sapPayload: Record<string, unknown>
  sapResponse: Record<string, unknown> | null
  success: boolean
  errorMessage: string | null
  createdBy: string | null
  createdAt: string | null
  idempotencyKey: string | null
  subjectType: string | null
  subjectKey: string | null
  operationStatus: SapOperationStatus
  sapDocEntry: number | null
  sapDocNum: number | null
  operationItems: Array<Record<string, unknown>>
  operationContext: Record<string, unknown>
  businessComment: string | null
  actorEmail: string | null
  actorRole: string | null
  sourceWarehouse: string | null
  destinationWarehouse: string | null
}

export type StartSapOperationInput = {
  operationType: SapOperationType
  idempotencyKey: string
  subjectType: string
  subjectKey?: string | null
  itemCode?: string | null
  requestedStatus?: string | null
  confirmationText?: string | null
  sapPayload?: Record<string, unknown>
  operationItems?: Array<Record<string, unknown>>
  operationContext?: Record<string, unknown>
  businessComment?: string | null
  actor: SapOperationActor
  sourceWarehouse?: string | null
  destinationWarehouse?: string | null
}

export type SapOperationStartResult = {
  created: boolean
  operation: SapOperationLog
}

export type UpdateSapOperationInput = {
  operationId: string
  idempotencyKey: string
  sapPayload: Record<string, unknown>
  operationItems: Array<Record<string, unknown>>
  operationContext: Record<string, unknown>
  businessComment: string | null
  sourceWarehouse: string | null
  destinationWarehouse: string | null
}

type CompleteSapOperationInput = {
  operationId: string
  sapResponse?: Record<string, unknown> | null
  sapDocEntry?: number | null
  sapDocNum?: number | null
  subjectKey?: string | null
  operationContext?: Record<string, unknown>
}

export type FailSapOperationInput = {
  operationId: string
  errorMessage: string
  sapResponse?: Record<string, unknown> | null
  sapDocEntry?: number | null
  sapDocNum?: number | null
  subjectKey?: string | null
  operationContext?: Record<string, unknown>
}

export class SapOperationAuditSchemaError extends Error {
  readonly code = 'SAP_OPERATION_AUDIT_SCHEMA_NOT_APPLIED'

  constructor(message = 'La migraci\u00f3n de auditor\u00eda de Operaciones SAP no est\u00e1 aplicada en Supabase.') {
    super(message)
    this.name = 'SapOperationAuditSchemaError'
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    : []
}

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  return value
}

function isSapOperationStatus(value: unknown): value is SapOperationStatus {
  return typeof value === 'string' && SAP_OPERATION_STATUSES.includes(value as SapOperationStatus)
}

function legacyOperationStatus(row: Record<string, unknown>): SapOperationStatus {
  return readBoolean(row.success) ? 'verified' : 'failed'
}

function normalizeRequiredText(value: string, label: string, maxLength = 160): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} es obligatorio.`)
  if (normalized.length > maxLength) throw new Error(`${label} no puede superar ${maxLength} caracteres.`)
  return normalized
}

function isMissingAuditSchemaError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : readText(readRecord(error).message) ?? ''
  const normalized = message.toLowerCase()
  return normalized.includes('sap_operation_logs') && (
    normalized.includes('schema cache')
    || normalized.includes('idempotency_key')
    || normalized.includes('operation_status')
  ) || (
    normalized.includes('column')
    && (
      normalized.includes('sap_doc_entry')
      || normalized.includes('sap_doc_num')
      || normalized.includes('operation_items')
      || normalized.includes('operation_context')
    )
  )
}

function isIdempotencyConflict(error: unknown): boolean {
  const record = readRecord(error)
  const code = readText(record.code)
  const message = error instanceof Error
    ? error.message
    : readText(record.message) ?? ''
  return code === '23505' || message.toLowerCase().includes('duplicate key')
}

function rethrowAuditError(error: unknown, operation: string): never {
  if (isMissingAuditSchemaError(error)) throw new SapOperationAuditSchemaError()
  const message = error instanceof Error
    ? error.message
    : readText(readRecord(error).message) ?? 'Error desconocido de Supabase.'
  throw new Error(`No se pudo ${operation} en la auditor\u00eda SAP: ${message}`)
}

export function parseSapOperationLog(row: unknown): SapOperationLog {
  const raw = readRecord(row)
  const operationStatus = isSapOperationStatus(raw.operation_status)
    ? raw.operation_status
    : legacyOperationStatus(raw)

  return {
    id: readText(raw.id) ?? '',
    operationType: readText(raw.operation_type) ?? '',
    itemCode: readText(raw.item_code),
    requestedStatus: readText(raw.requested_status),
    dryRun: readBoolean(raw.dry_run, true),
    confirmationText: readText(raw.confirmation_text),
    sapPayload: readRecord(raw.sap_payload),
    sapResponse: raw.sap_response === null || raw.sap_response === undefined ? null : readRecord(raw.sap_response),
    success: readBoolean(raw.success),
    errorMessage: readText(raw.error_message),
    createdBy: readText(raw.created_by),
    createdAt: readText(raw.created_at),
    idempotencyKey: readText(raw.idempotency_key),
    subjectType: readText(raw.subject_type),
    subjectKey: readText(raw.subject_key),
    operationStatus,
    sapDocEntry: readInteger(raw.sap_doc_entry),
    sapDocNum: readInteger(raw.sap_doc_num),
    operationItems: readRecords(raw.operation_items),
    operationContext: readRecord(raw.operation_context),
    businessComment: readText(raw.business_comment),
    actorEmail: readText(raw.actor_email),
    actorRole: readText(raw.actor_role),
    sourceWarehouse: readText(raw.source_warehouse),
    destinationWarehouse: readText(raw.destination_warehouse),
  }
}

export async function getSapOperationByIdempotencyKey(idempotencyKey: string): Promise<SapOperationLog | null> {
  const normalizedKey = normalizeRequiredText(idempotencyKey, 'La clave de idempotencia')
  try {
    const { data, error } = await supabaseTable('sap_operation_logs')
      .select<Record<string, unknown>>('*')
      .eq('idempotency_key', normalizedKey)
      .maybeSingle()
    if (error) throw error
    return data ? parseSapOperationLog(data) : null
  } catch (error) {
    rethrowAuditError(error, 'consultar la clave de idempotencia')
  }
}

function normalizeHistoryLimit(limit: number | undefined): number | null {
  if (limit === undefined) return null
  if (!Number.isInteger(limit) || limit < 1 || limit > 5_000) {
    throw new Error('El l\u00edmite de historial debe ser un entero entre 1 y 5000.')
  }
  return limit
}

function normalizeSapDocEntry(docEntry: number): number {
  if (!Number.isInteger(docEntry) || docEntry < 1) {
    throw new Error('DocEntry debe ser un entero positivo.')
  }
  return docEntry
}

export async function listSapTransferRequestOperations(limit?: number): Promise<SapOperationLog[]> {
  const normalizedLimit = normalizeHistoryLimit(limit)
  const query = normalizedLimit === null
    ? `SELECT *
         FROM public.sap_operation_logs
        WHERE operation_type IN ($1, $2)
        ORDER BY created_at DESC, id DESC`
    : `SELECT *
         FROM public.sap_operation_logs
        WHERE operation_type IN ($1, $2)
        ORDER BY created_at DESC, id DESC
        LIMIT $3`
  const values = normalizedLimit === null
    ? [SAP_TRANSFER_REQUEST_CREATE_OPERATION_TYPE, SAP_TRANSFER_REQUEST_UPDATE_OPERATION_TYPE]
    : [SAP_TRANSFER_REQUEST_CREATE_OPERATION_TYPE, SAP_TRANSFER_REQUEST_UPDATE_OPERATION_TYPE, normalizedLimit]

  try {
    const rows = await dbQuery(query, values)
    return readRecords(rows).map(parseSapOperationLog)
  } catch (error) {
    rethrowAuditError(error, 'consultar el historial de solicitudes de traslado')
  }
}

export async function getSapTransferRequestOperationByDocEntry(docEntry: number): Promise<SapOperationLog | null> {
  const normalizedDocEntry = normalizeSapDocEntry(docEntry)
  try {
    const rows = await dbQuery(
      `SELECT *
        FROM public.sap_operation_logs
        WHERE operation_type IN ($1, $2)
          AND sap_doc_entry = $3
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [SAP_TRANSFER_REQUEST_CREATE_OPERATION_TYPE, SAP_TRANSFER_REQUEST_UPDATE_OPERATION_TYPE, normalizedDocEntry],
    )
    const row = readRecords(rows)[0]
    return row ? parseSapOperationLog(row) : null
  } catch (error) {
    rethrowAuditError(error, 'consultar la solicitud de traslado por DocEntry')
  }
}

export async function getSapTransferRequestCreationOperationByDocEntry(docEntry: number): Promise<SapOperationLog | null> {
  const normalizedDocEntry = normalizeSapDocEntry(docEntry)
  try {
    const rows = await dbQuery(
      `SELECT *
         FROM public.sap_operation_logs
        WHERE operation_type = $1
          AND sap_doc_entry = $2
        ORDER BY created_at ASC, id ASC
        LIMIT 1`,
      [SAP_TRANSFER_REQUEST_CREATE_OPERATION_TYPE, normalizedDocEntry],
    )
    const row = readRecords(rows)[0]
    return row ? parseSapOperationLog(row) : null
  } catch (error) {
    rethrowAuditError(error, 'consultar la creación de la solicitud de traslado')
  }
}

export async function startSapOperation(input: StartSapOperationInput): Promise<SapOperationStartResult> {
  const idempotencyKey = normalizeRequiredText(input.idempotencyKey, 'La clave de idempotencia')
  const subjectType = normalizeRequiredText(input.subjectType, 'El tipo de asunto')
  const existing = await getSapOperationByIdempotencyKey(idempotencyKey)
  if (existing) return { created: false, operation: existing }

  const payload = {
    operation_type: input.operationType,
    item_code: input.itemCode?.trim() || null,
    requested_status: input.requestedStatus?.trim() || null,
    dry_run: false,
    confirmation_text: input.confirmationText?.trim() || null,
    sap_payload: input.sapPayload ?? {},
    success: false,
    idempotency_key: idempotencyKey,
    subject_type: subjectType,
    subject_key: input.subjectKey?.trim() || null,
    operation_status: 'pending' as const,
    operation_items: input.operationItems ?? [],
    operation_context: input.operationContext ?? {},
    business_comment: input.businessComment?.trim() || null,
    actor_email: input.actor.email?.trim() || null,
    actor_role: input.actor.role?.trim() || null,
    source_warehouse: input.sourceWarehouse?.trim() || null,
    destination_warehouse: input.destinationWarehouse?.trim() || null,
    created_by: input.actor.id,
  }

  try {
    const { data, error } = await supabaseTable('sap_operation_logs')
      .insert(payload)
      .select('*')
      .single()
    if (error) throw error
    return { created: true, operation: parseSapOperationLog(data) }
  } catch (error) {
    if (isIdempotencyConflict(error)) {
      const concurrentOperation = await getSapOperationByIdempotencyKey(idempotencyKey)
      if (concurrentOperation) return { created: false, operation: concurrentOperation }
    }
    rethrowAuditError(error, 'crear la operaci\u00f3n pendiente')
  }
}

/**
 * Reuses the original request log for a modification. The immutable creator
 * snapshot remains intact while the contextual modification history records
 * the latest SAP write without introducing another top-level operation row.
 */
export async function prepareSapOperationUpdate(input: UpdateSapOperationInput): Promise<SapOperationLog> {
  const operationId = normalizeRequiredText(input.operationId, 'El identificador de operación')
  const idempotencyKey = normalizeRequiredText(input.idempotencyKey, 'La clave de idempotencia')
  const update = {
    idempotency_key: idempotencyKey,
    sap_payload: input.sapPayload,
    operation_items: input.operationItems,
    operation_context: input.operationContext,
    business_comment: input.businessComment?.trim() || null,
    source_warehouse: input.sourceWarehouse?.trim() || null,
    destination_warehouse: input.destinationWarehouse?.trim() || null,
    operation_status: 'pending' as const,
    success: false,
    error_message: null,
  }

  try {
    const { data, error } = await supabaseTable('sap_operation_logs')
      .update(update)
      .eq('id', operationId)
      .select('*')
      .single()
    if (error) throw error
    return parseSapOperationLog(data)
  } catch (error) {
    rethrowAuditError(error, 'preparar la modificación de la operación')
  }
}

async function completeSapOperation(
  input: CompleteSapOperationInput & { status: 'verified' | 'failed' | 'ambiguous'; errorMessage: string | null },
): Promise<SapOperationLog> {
  const operationId = normalizeRequiredText(input.operationId, 'El identificador de operaci\u00f3n')
  const update: Record<string, unknown> = {
    operation_status: input.status,
    success: input.status === 'verified',
    error_message: input.errorMessage,
  }

  if (input.sapResponse !== undefined) update.sap_response = input.sapResponse
  if (input.sapDocEntry !== undefined) update.sap_doc_entry = input.sapDocEntry
  if (input.sapDocNum !== undefined) update.sap_doc_num = input.sapDocNum
  if (input.subjectKey !== undefined) update.subject_key = input.subjectKey
  if (input.operationContext !== undefined) update.operation_context = input.operationContext

  try {
    const { data, error } = await supabaseTable('sap_operation_logs')
      .update(update)
      .eq('id', operationId)
      .select('*')
      .single()
    if (error) throw error
    return parseSapOperationLog(data)
  } catch (error) {
    rethrowAuditError(error, 'actualizar el resultado de la operaci\u00f3n')
  }
}

export async function markSapOperationVerified(input: CompleteSapOperationInput): Promise<SapOperationLog> {
  if (input.sapDocEntry === null || input.sapDocEntry === undefined) {
    throw new Error('La operaci\u00f3n verificada requiere DocEntry de SAP.')
  }
  if (input.sapDocNum === null || input.sapDocNum === undefined) {
    throw new Error('La operaci\u00f3n verificada requiere DocNum de SAP.')
  }
  return completeSapOperation({ ...input, status: 'verified', errorMessage: null })
}

export async function markSapOperationFailed(input: FailSapOperationInput): Promise<SapOperationLog> {
  return completeSapOperation({
    ...input,
    status: 'failed',
    errorMessage: normalizeRequiredText(input.errorMessage, 'El mensaje de error', 2_000),
  })
}

export async function markSapOperationAmbiguous(input: FailSapOperationInput): Promise<SapOperationLog> {
  return completeSapOperation({
    ...input,
    status: 'ambiguous',
    errorMessage: normalizeRequiredText(input.errorMessage, 'El mensaje de resultado ambiguo', 2_000),
  })
}
