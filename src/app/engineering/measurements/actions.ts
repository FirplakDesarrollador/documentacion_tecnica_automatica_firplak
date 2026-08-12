'use server'

import { revalidatePath } from 'next/cache'

import {
  missingFieldsForValidEngineeringMeasurement,
  parseEngineeringMeasurementDraft,
  parseEngineeringMeasurementId,
  parseEngineeringMeasurementListOptions,
  parseEngineeringMeasurementRecord,
  parseEngineeringMeasurementStatus,
  type EngineeringMeasurement,
  type EngineeringMeasurementDraft,
  type EngineeringMeasurementDraftInput,
  type EngineeringMeasurementListInput,
  type EngineeringMeasurementStatus,
} from '@/lib/productDesign/engineeringMeasurements'
import { dbQuery } from '@/lib/supabase'
import { assertPermission, type AccessContext } from '@/utils/auth/access'

export type EngineeringMeasurementActionResult = {
  measurement: EngineeringMeasurement | null
  error: string | null
}

export type EngineeringMeasurementsListResult = {
  measurements: EngineeringMeasurement[]
  error: string | null
}

export type UpdateEngineeringMeasurementInput = {
  id: string
  draft: EngineeringMeasurementDraftInput
}

export type ChangeEngineeringMeasurementStatusInput = {
  id: string
  measurementStatus: EngineeringMeasurementStatus
}

const MEASUREMENT_COLUMNS = `
  id,
  schema_version,
  calibration_group,
  measurement_status,
  sample_label,
  sap_prefix,
  family_code,
  product_reference_id,
  product_version_id,
  product_sku_id,
  sap_item_code,
  legacy_product_name,
  color_code,
  cad_volume_mm3,
  paint_area_mm2,
  mixture_kg,
  gelcoat_kg,
  measured_at,
  production_lot,
  source_type,
  source_file,
  source_sheet,
  source_row,
  source_evidence_json,
  notes,
  recorded_by,
  verified_by,
  verified_at,
  created_at,
  updated_at
`

type CatalogScope = {
  familyCode: string | null
  referenceId: string | null
  referenceFamilyCode: string | null
  versionId: string | null
  versionReferenceId: string | null
  versionFamilyCode: string | null
  skuId: string | null
  skuVersionId: string | null
  skuReferenceId: string | null
  skuFamilyCode: string | null
}

type EngineeringAccess = AccessContext & {
  user: NonNullable<AccessContext['user']>
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function actionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación de mediciones.'
}

function mutationValues(draft: EngineeringMeasurementDraft): Array<string | number | null> {
  return [
    draft.calibrationGroup,
    draft.sampleLabel,
    draft.sapPrefix,
    draft.familyCode,
    draft.productReferenceId,
    draft.productVersionId,
    draft.productSkuId,
    draft.sapItemCode,
    draft.legacyProductName,
    draft.colorCode,
    draft.cadVolumeMm3,
    draft.paintAreaMm2,
    draft.mixtureKg,
    draft.gelcoatKg,
    draft.measuredAt,
    draft.productionLot,
    draft.sourceType,
    draft.sourceFile,
    draft.sourceSheet,
    draft.sourceRow,
    JSON.stringify(draft.sourceEvidenceJson),
    draft.notes,
  ]
}

async function readMeasurementById(id: string): Promise<EngineeringMeasurement | null> {
  const rows = await dbQuery(
    `SELECT ${MEASUREMENT_COLUMNS}
     FROM public.product_engineering_measurements
     WHERE id = $1
     LIMIT 1`,
    [id],
  )
  const row = rows[0]
  return row ? parseEngineeringMeasurementRecord(row) : null
}

async function assertCatalogScope(draft: EngineeringMeasurementDraft): Promise<void> {
  const scope: CatalogScope = {
    familyCode: null,
    referenceId: null,
    referenceFamilyCode: null,
    versionId: null,
    versionReferenceId: null,
    versionFamilyCode: null,
    skuId: null,
    skuVersionId: null,
    skuReferenceId: null,
    skuFamilyCode: null,
  }

  if (draft.familyCode) {
    const rows = await dbQuery(
      `SELECT family_code FROM public.families WHERE family_code = $1 LIMIT 1`,
      [draft.familyCode],
    )
    scope.familyCode = readString(rows[0]?.family_code)
    if (!scope.familyCode) throw new Error(`La familia ${draft.familyCode} no existe.`)
  }

  if (draft.productReferenceId) {
    const rows = await dbQuery(
      `SELECT id, family_code FROM public.product_references WHERE id = $1 LIMIT 1`,
      [draft.productReferenceId],
    )
    const row = asRecord(rows[0])
    scope.referenceId = readString(row.id)
    scope.referenceFamilyCode = readString(row.family_code)
    if (!scope.referenceId) throw new Error('La referencia de producto no existe.')
  }

  if (draft.productVersionId) {
    const rows = await dbQuery(
      `SELECT v.id, v.reference_id, r.family_code
       FROM public.product_versions v
       LEFT JOIN public.product_references r ON r.id = v.reference_id
       WHERE v.id = $1
       LIMIT 1`,
      [draft.productVersionId],
    )
    const row = asRecord(rows[0])
    scope.versionId = readString(row.id)
    scope.versionReferenceId = readString(row.reference_id)
    scope.versionFamilyCode = readString(row.family_code)
    if (!scope.versionId) throw new Error('La versión de producto no existe.')
  }

  if (draft.productSkuId) {
    const rows = await dbQuery(
      `SELECT s.id, s.version_id, v.reference_id, r.family_code
       FROM public.product_skus s
       LEFT JOIN public.product_versions v ON v.id = s.version_id
       LEFT JOIN public.product_references r ON r.id = v.reference_id
       WHERE s.id = $1
       LIMIT 1`,
      [draft.productSkuId],
    )
    const row = asRecord(rows[0])
    scope.skuId = readString(row.id)
    scope.skuVersionId = readString(row.version_id)
    scope.skuReferenceId = readString(row.reference_id)
    scope.skuFamilyCode = readString(row.family_code)
    if (!scope.skuId) throw new Error('El SKU de producto no existe.')
  }

  const referenceIds = new Set(
    [draft.productReferenceId, scope.versionReferenceId, scope.skuReferenceId].filter((value): value is string => Boolean(value)),
  )
  if (referenceIds.size > 1) {
    throw new Error('La referencia, versión y SKU seleccionados no pertenecen a la misma referencia.')
  }

  const versionIds = new Set(
    [draft.productVersionId, scope.skuVersionId].filter((value): value is string => Boolean(value)),
  )
  if (versionIds.size > 1) {
    throw new Error('La versión y el SKU seleccionados no pertenecen a la misma versión.')
  }

  const familyCodes = new Set(
    [draft.familyCode, scope.referenceFamilyCode, scope.versionFamilyCode, scope.skuFamilyCode]
      .filter((value): value is string => Boolean(value)),
  )
  if (familyCodes.size > 1) {
    throw new Error('La familia no coincide con la referencia, versión o SKU seleccionado.')
  }
}

function revalidateMeasurements(): void {
  revalidatePath('/engineering')
  revalidatePath('/engineering/measurements')
}

function requireServiceRoleConfiguration(): void {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) {
    throw new Error('Las mediciones requieren credenciales server-side de Supabase; el cliente autenticado no accede directamente a esta tabla.')
  }
}

async function requireEngineeringAccess(): Promise<EngineeringAccess> {
  const access = await assertPermission('module:engineering')
  requireServiceRoleConfiguration()
  if (!access.user) throw new Error('No se pudo identificar al usuario de Ingeniería.')
  return { ...access, user: access.user }
}

function actorIdFromAccess(access: EngineeringAccess): string {
  return access.user.id
}

export async function listEngineeringMeasurementsAction(
  input?: EngineeringMeasurementListInput,
): Promise<EngineeringMeasurementsListResult> {
  await requireEngineeringAccess()

  try {
    const options = parseEngineeringMeasurementListOptions(input)
    const rows = await dbQuery(
      `SELECT ${MEASUREMENT_COLUMNS}
       FROM public.product_engineering_measurements
       WHERE calibration_group = COALESCE($1::text, calibration_group)
       ORDER BY measured_at DESC NULLS LAST, updated_at DESC, id DESC
       LIMIT $2`,
      [options.calibrationGroup, options.limit],
    )
    return { measurements: rows.map(parseEngineeringMeasurementRecord), error: null }
  } catch (error) {
    return { measurements: [], error: actionErrorMessage(error) }
  }
}

export async function createEngineeringMeasurementAction(
  input: EngineeringMeasurementDraftInput,
): Promise<EngineeringMeasurementActionResult> {
  const access = await requireEngineeringAccess()

  try {
    const actorId = actorIdFromAccess(access)
    const draft = parseEngineeringMeasurementDraft(input)
    await assertCatalogScope(draft)
    const rows = await dbQuery(
      `INSERT INTO public.product_engineering_measurements (
        calibration_group,
        measurement_status,
        sample_label,
        sap_prefix,
        family_code,
        product_reference_id,
        product_version_id,
        product_sku_id,
        sap_item_code,
        legacy_product_name,
        color_code,
        cad_volume_mm3,
        paint_area_mm2,
        mixture_kg,
        gelcoat_kg,
        measured_at,
        production_lot,
        source_type,
        source_file,
        source_sheet,
        source_row,
        source_evidence_json,
        notes,
        recorded_by
      ) VALUES (
        $1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb, $22, $23
      )
      RETURNING id`,
      [...mutationValues(draft), actorId],
    )
    const id = readString(rows[0]?.id)
    if (!id) throw new Error('La medición se guardó sin identificador de lectura.')
    const measurement = await readMeasurementById(id)
    if (!measurement) throw new Error('No se pudo releer la medición creada.')
    revalidateMeasurements()
    return { measurement, error: null }
  } catch (error) {
    return { measurement: null, error: actionErrorMessage(error) }
  }
}

export async function updateEngineeringMeasurementAction(
  input: UpdateEngineeringMeasurementInput,
): Promise<EngineeringMeasurementActionResult> {
  await requireEngineeringAccess()

  try {
    const id = parseEngineeringMeasurementId(input.id)
    const draft = parseEngineeringMeasurementDraft(input.draft)
    await assertCatalogScope(draft)
    const rows = await dbQuery(
      `UPDATE public.product_engineering_measurements
       SET
         calibration_group = $1,
         sample_label = $2,
         sap_prefix = $3,
         family_code = $4,
         product_reference_id = $5,
         product_version_id = $6,
         product_sku_id = $7,
         sap_item_code = $8,
         legacy_product_name = $9,
         color_code = $10,
         cad_volume_mm3 = $11,
         paint_area_mm2 = $12,
         mixture_kg = $13,
         gelcoat_kg = $14,
         measured_at = $15,
         production_lot = $16,
         source_type = $17,
         source_file = $18,
         source_sheet = $19,
         source_row = $20,
         source_evidence_json = $21::jsonb,
         notes = $22
       WHERE id = $23
       RETURNING id`,
      [...mutationValues(draft), id],
    )
    if (!readString(rows[0]?.id)) throw new Error('La medición no existe.')
    const measurement = await readMeasurementById(id)
    if (!measurement) throw new Error('No se pudo releer la medición actualizada.')
    revalidateMeasurements()
    return { measurement, error: null }
  } catch (error) {
    return { measurement: null, error: actionErrorMessage(error) }
  }
}

export async function changeEngineeringMeasurementStatusAction(
  input: ChangeEngineeringMeasurementStatusInput,
): Promise<EngineeringMeasurementActionResult> {
  const access = await requireEngineeringAccess()

  try {
    const actorId = actorIdFromAccess(access)
    const id = parseEngineeringMeasurementId(input.id)
    const measurementStatus = parseEngineeringMeasurementStatus(input.measurementStatus)

    const rows = measurementStatus === 'valid'
      ? await dbQuery(
        `UPDATE public.product_engineering_measurements
         SET measurement_status = $1, verified_by = $2, verified_at = now()
         WHERE id = $3
           AND cad_volume_mm3 IS NOT NULL
           AND paint_area_mm2 IS NOT NULL
           AND mixture_kg IS NOT NULL
           AND gelcoat_kg IS NOT NULL
         RETURNING id`,
        [measurementStatus, actorId, id],
      )
      : await dbQuery(
        `UPDATE public.product_engineering_measurements
         SET measurement_status = $1
         WHERE id = $2
         RETURNING id`,
        [measurementStatus, id],
      )

    if (!readString(rows[0]?.id)) {
      const existing = await readMeasurementById(id)
      if (!existing) throw new Error('La medición no existe.')
      const missingFields = missingFieldsForValidEngineeringMeasurement(existing)
      if (measurementStatus === 'valid' && missingFields.length > 0) {
        throw new Error(`No se puede marcar como válida: faltan ${missingFields.join(', ')}.`)
      }
      throw new Error('No se pudo actualizar el estado de la medición.')
    }

    const measurement = await readMeasurementById(id)
    if (!measurement) throw new Error('No se pudo releer la medición tras cambiar su estado.')
    if (measurementStatus === 'valid' && (measurement.verifiedBy !== actorId || !measurement.verifiedAt)) {
      throw new Error('La medición válida no conservó el revisor y la fecha de verificación.')
    }
    revalidateMeasurements()
    return { measurement, error: null }
  } catch (error) {
    return { measurement: null, error: actionErrorMessage(error) }
  }
}
