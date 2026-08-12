import type { InventoryEntryPurpose } from './estimationCosts'

export type InventoryEntryPurposeEvidence = {
  quantity: number | null
  baseType: number | null
  comments?: string | null
  journalMemo?: string | null
  reference2?: string | null
}

export type InventoryEntryPurposeClassification = {
  purpose: InventoryEntryPurpose
  reasons: string[]
}

function normalizeEvidenceText(...values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
}

/**
 * InventoryGenEntries are generic warehouse movements, not purchase receipts.
 * This conservative classifier only removes purposes that SAP metadata or the
 * document evidence makes detectable. A remaining positive entry is usable as
 * a temporary, explicitly labelled candidate, never as a verified receipt.
 */
export function classifyInventoryEntryPurpose(
  evidence: InventoryEntryPurposeEvidence,
): InventoryEntryPurposeClassification {
  if (evidence.baseType === 202) {
    return { purpose: 'production', reasons: ['BaseType 202: entrada basada en orden de producción.'] }
  }

  const text = normalizeEvidenceText(evidence.comments, evidence.journalMemo, evidence.reference2)
  if (/\bMUESTRA(?:S)?\b/.test(text)) {
    return { purpose: 'sample', reasons: ['La evidencia textual identifica una muestra.'] }
  }
  if (/\bCOMPENS(?:ACION|ACION|AR|ADO)?\b|\bCRUZA\b/.test(text)) {
    return { purpose: 'compensation', reasons: ['La evidencia textual identifica una compensación o cruce.'] }
  }
  if (/CAMBIO\s+DE\s+REFERENCIA|RECLASIF|BASAD[OA]\s+EN\s+SALIDA|SALIDA\s+DE\s+MERCANCIA/.test(text)) {
    return { purpose: 'reclassification', reasons: ['La evidencia textual identifica una reclasificación o cambio de referencia.'] }
  }
  if (typeof evidence.quantity !== 'number' || !Number.isFinite(evidence.quantity) || evidence.quantity <= 0) {
    return { purpose: 'unknown', reasons: ['La cantidad de entrada no es positiva o no está disponible.'] }
  }

  return {
    purpose: 'purchase_like',
    reasons: ['Entrada positiva sin evidencia detectable de producción, muestra, reclasificación o compensación.'],
  }
}
