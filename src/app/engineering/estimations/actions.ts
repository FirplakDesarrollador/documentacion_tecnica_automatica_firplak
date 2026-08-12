'use server'

import { revalidatePath } from 'next/cache'

import { dbQuery } from '@/lib/supabase'
import { assertPermission, type AccessContext } from '@/utils/auth/access'

const ESTIMATION_STATUSES = ['draft', 'active', 'closed', 'archived'] as const
const TECHNICAL_REVIEW_STATUSES = ['not_requested', 'pending', 'reviewed', 'observed'] as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

type RawRow = Record<string, unknown>
type EngineeringAccess = AccessContext & {
  user: NonNullable<AccessContext['user']>
}

export type EngineeringEstimationReviewStatus = (typeof TECHNICAL_REVIEW_STATUSES)[number]
export type EngineeringEstimationLifecycleStatus = (typeof ESTIMATION_STATUSES)[number]

export type EngineeringEstimationReview = {
  id: string
  provisionalName: string
  manufacturingProcess: string
  sapPrefix: string
  familyCode: string | null
  proposedReferenceCode: string | null
  homologueSapItemCode: string | null
  widthMm: number | null
  depthMm: number | null
  heightMm: number | null
  colorCode: string | null
  estimationStatus: EngineeringEstimationLifecycleStatus
  technicalReviewStatus: EngineeringEstimationReviewStatus
  technicalReviewNote: string | null
  technicalReviewedBy: string | null
  technicalReviewedAt: string | null
  sharedWithSales: boolean
  commercialOutcome: string
  createdAt: string
  updatedAt: string
}

export type SaveEngineeringEstimationTechnicalReviewInput = {
  id: string
  technicalReviewStatus: EngineeringEstimationReviewStatus
  technicalReviewNote?: string | null
}

const ESTIMATION_REVIEW_COLUMNS = `
  id,
  provisional_name,
  manufacturing_process,
  sap_prefix,
  family_code,
  proposed_reference_code,
  homologue_sap_item_code,
  width_mm,
  depth_mm,
  height_mm,
  color_code,
  status,
  technical_review_status,
  technical_review_note,
  technical_reviewed_by,
  technical_reviewed_at,
  shared_with_sales,
  commercial_outcome,
  created_at,
  updated_at
`

function requireServiceRoleConfiguration(): void {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) {
    throw new Error('La revisión técnica requiere credenciales server-side de Supabase.')
  }
}

async function requireEngineeringAccess(): Promise<EngineeringAccess> {
  const access = await assertPermission('module:engineering:estimations')
  requireServiceRoleConfiguration()
  if (!access.user) throw new Error('No se pudo identificar al usuario de Ingeniería.')
  return { ...access, user: access.user }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requiredString(value: unknown, label: string): string {
  const normalized = readString(value)
  if (!normalized) throw new Error(`${label} es obligatorio.`)
  return normalized
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function parseEstimationId(value: unknown): string {
  const id = requiredString(value, 'Cotización')
  if (!UUID_PATTERN.test(id)) throw new Error('La cotización no tiene un identificador válido.')
  return id
}

function parseTechnicalReviewStatus(value: unknown): EngineeringEstimationReviewStatus {
  const status = requiredString(value, 'Estado de revisión técnica')
  if (!(TECHNICAL_REVIEW_STATUSES as readonly string[]).includes(status)) {
    throw new Error('El estado de revisión técnica no es válido.')
  }
  return status as EngineeringEstimationReviewStatus
}

function parseTechnicalReviewNote(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new Error('La observación técnica debe ser texto.')
  const note = value.trim()
  if (!note) return null
  if (note.length > 4_000) throw new Error('La observación técnica no puede superar 4.000 caracteres.')
  return note
}

function parseEstimationStatus(value: unknown): EngineeringEstimationLifecycleStatus {
  const status = requiredString(value, 'Estado de cotización')
  if (!(ESTIMATION_STATUSES as readonly string[]).includes(status)) {
    throw new Error('La cotización tiene un estado no reconocido.')
  }
  return status as EngineeringEstimationLifecycleStatus
}

function mapEstimationReview(row: RawRow): EngineeringEstimationReview {
  const technicalReviewStatus = requiredString(row.technical_review_status, 'Estado de revisión técnica')
  if (!(TECHNICAL_REVIEW_STATUSES as readonly string[]).includes(technicalReviewStatus)) {
    throw new Error('La cotización tiene una revisión técnica no reconocida.')
  }

  return {
    id: requiredString(row.id, 'Identificador de cotización'),
    provisionalName: requiredString(row.provisional_name, 'Nombre provisional'),
    manufacturingProcess: requiredString(row.manufacturing_process, 'Proceso de fabricación'),
    sapPrefix: requiredString(row.sap_prefix, 'Prefijo SAP'),
    familyCode: readString(row.family_code),
    proposedReferenceCode: readString(row.proposed_reference_code),
    homologueSapItemCode: readString(row.homologue_sap_item_code),
    widthMm: readNumber(row.width_mm),
    depthMm: readNumber(row.depth_mm),
    heightMm: readNumber(row.height_mm),
    colorCode: readString(row.color_code),
    estimationStatus: parseEstimationStatus(row.status),
    technicalReviewStatus: technicalReviewStatus as EngineeringEstimationReviewStatus,
    technicalReviewNote: readString(row.technical_review_note),
    technicalReviewedBy: readString(row.technical_reviewed_by),
    technicalReviewedAt: readString(row.technical_reviewed_at),
    sharedWithSales: readBoolean(row.shared_with_sales),
    commercialOutcome: requiredString(row.commercial_outcome, 'Resultado comercial'),
    createdAt: requiredString(row.created_at, 'Fecha de creación'),
    updatedAt: requiredString(row.updated_at, 'Fecha de actualización'),
  }
}

async function queryRows(sql: string, values?: Array<string | number | boolean | null>): Promise<RawRow[]> {
  const result = await dbQuery(sql, values)
  if (!Array.isArray(result)) {
    throw new Error('Supabase no devolvió filas consultables para la revisión técnica.')
  }
  return result as RawRow[]
}

async function readEstimationReview(id: string): Promise<EngineeringEstimationReview | null> {
  const rows = await queryRows(
    `SELECT ${ESTIMATION_REVIEW_COLUMNS}
       FROM public.product_design_estimations
      WHERE id = $1::uuid
      LIMIT 1`,
    [id],
  )
  const row = rows[0]
  return row ? mapEstimationReview(row) : null
}

function revalidateEstimationReviewPaths(id: string): void {
  revalidatePath('/engineering/estimations')
  revalidatePath('/product-design/estimations')
  revalidatePath(`/product-design/estimations/${id}`)
  revalidatePath('/sales/estimations')
}

export async function listEngineeringEstimationReviewsAction(): Promise<EngineeringEstimationReview[]> {
  await requireEngineeringAccess()
  const rows = await queryRows(
    `SELECT ${ESTIMATION_REVIEW_COLUMNS}
       FROM public.product_design_estimations
      ORDER BY updated_at DESC, id DESC`,
  )
  return rows.map(mapEstimationReview)
}

export async function getEngineeringEstimationReviewAction(id: string): Promise<EngineeringEstimationReview | null> {
  await requireEngineeringAccess()
  return readEstimationReview(parseEstimationId(id))
}

export async function saveEngineeringEstimationTechnicalReviewAction(
  input: SaveEngineeringEstimationTechnicalReviewInput,
): Promise<EngineeringEstimationReview> {
  const access = await requireEngineeringAccess()
  const id = parseEstimationId(input.id)
  const technicalReviewStatus = parseTechnicalReviewStatus(input.technicalReviewStatus)
  const technicalReviewNote = parseTechnicalReviewNote(input.technicalReviewNote)

  // La revisión sólo documenta criterio de Ingeniería: no modifica el estado de Diseño.
  const rows = await queryRows(
    `UPDATE public.product_design_estimations
        SET technical_review_status = $1,
            technical_review_note = $2,
            technical_reviewed_by = $3::uuid,
            technical_reviewed_at = now(),
            updated_by = $3::uuid
      WHERE id = $4::uuid
      RETURNING id`,
    [technicalReviewStatus, technicalReviewNote, access.user.id, id],
  )
  if (!readString(rows[0]?.id)) throw new Error('La cotización ya no existe o no pudo actualizarse.')

  const saved = await readEstimationReview(id)
  if (!saved) throw new Error('No se pudo releer la revisión técnica guardada.')
  if (
    saved.technicalReviewStatus !== technicalReviewStatus
    || saved.technicalReviewedBy !== access.user.id
    || !saved.technicalReviewedAt
  ) {
    throw new Error('La revisión técnica no conservó estado, responsable y fecha tras guardarse.')
  }

  revalidateEstimationReviewPaths(id)
  return saved
}
