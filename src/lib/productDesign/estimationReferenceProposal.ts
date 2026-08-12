export const ESTIMATION_REFERENCE_SEQUENCE_WIDTH = 4
export const DEFAULT_ESTIMATION_REFERENCE_MAX_SEQUENCE = 9_999

export type EstimationReferenceProposalErrorCode =
  | 'invalid_u_prefix'
  | 'invalid_sales_item_prefix'
  | 'inconsistent_sales_item_prefix'
  | 'invalid_family_code'
  | 'invalid_max_sequence'
  | 'reference_sequence_overflow'

export class EstimationReferenceProposalError extends Error {
  readonly code: EstimationReferenceProposalErrorCode

  constructor(code: EstimationReferenceProposalErrorCode, message: string) {
    super(message)
    this.name = 'EstimationReferenceProposalError'
    this.code = code
  }
}

export type EstimationReferenceProposalInput = {
  /** Exact SAP U_Prefijo read from the selected homologue. */
  sapPrefix: string
  /** Exact first segment of the selected sales homologue ItemCode (for example VROP03). */
  salesItemPrefix: string
  /** SAP item codes already observed for the same sales ItemCode prefix. */
  existingCodes: readonly string[]
  /**
   * The approved consecutive range for this family. It defaults to the
   * four-position reference range and must be raised deliberately if SAP
   * permits a longer reference code.
   */
  maxSequence?: number
}

export type EstimationReferenceProposal = {
  /** Preserved SAP U_Prefijo; it may omit the leading V used by sales items. */
  sapPrefix: string
  /** Prefix actually scanned in SAP (for example VROP03). */
  salesItemPrefix: string
  /** Family code for the internal catalog, derived only by removing a leading V. */
  familyCode: string
  /** Numeric reference segment, padded to at least four positions. */
  referenceCode: string
  /** Human-readable internal reference key. */
  referenceKey: string
  sequence: number
  isReserved: false
}

const U_PREFIX_FORMAT = /^[A-Z][A-Z0-9]*$/u
const SALES_ITEM_PREFIX_FORMAT = /^V[A-Z0-9]+$/u

function normalizeUPrefix(value: string): string {
  const normalized = value.trim().toUpperCase()
  if (!U_PREFIX_FORMAT.test(normalized)) {
    throw new EstimationReferenceProposalError(
      'invalid_u_prefix',
      'U_Prefijo debe contener letras y números SAP sin guiones ni espacios.',
    )
  }
  return normalized
}

function validateMaxSequence(value: number | undefined): number {
  const maxSequence = value ?? DEFAULT_ESTIMATION_REFERENCE_MAX_SEQUENCE
  if (!Number.isSafeInteger(maxSequence) || maxSequence < 1) {
    throw new EstimationReferenceProposalError(
      'invalid_max_sequence',
      'El máximo consecutivo debe ser un entero seguro mayor que cero.',
    )
  }
  return maxSequence
}

/**
 * A sales prefix removes only the leading V. Other SAP classes such as C and
 * P are intentional family characters and remain part of the family code.
 */
export function deriveEstimationFamilyCode(uPrefix: string): string {
  const normalizedUPrefix = normalizeUPrefix(uPrefix)
  const familyCode = normalizedUPrefix.startsWith('V')
    ? normalizedUPrefix.slice(1)
    : normalizedUPrefix

  if (!U_PREFIX_FORMAT.test(familyCode)) {
    throw new EstimationReferenceProposalError(
      'invalid_family_code',
      'U_Prefijo no deja un código de familia SAP válido.',
    )
  }

  return familyCode
}

export function deriveEstimationSalesItemPrefix(itemCode: string, sapPrefix: string): string {
  const normalizedItemCode = itemCode.trim().toUpperCase()
  const salesItemPrefix = normalizedItemCode.split('-')[0] ?? ''
  if (!SALES_ITEM_PREFIX_FORMAT.test(salesItemPrefix)) {
    throw new EstimationReferenceProposalError(
      'invalid_sales_item_prefix',
      `El homólogo ${normalizedItemCode || '(vacío)'} no tiene un prefijo comercial SAP válido iniciado en V.`,
    )
  }

  const familyCode = deriveEstimationFamilyCode(sapPrefix)
  const salesFamilyCode = salesItemPrefix.slice(1)
  if (salesFamilyCode !== familyCode) {
    throw new EstimationReferenceProposalError(
      'inconsistent_sales_item_prefix',
      `El prefijo comercial ${salesItemPrefix} no corresponde al U_Prefijo ${normalizeUPrefix(sapPrefix)}.`,
    )
  }

  return salesItemPrefix
}

function referenceSequenceFromCode(itemCode: string, salesItemPrefix: string, maxSequence: number): number | null {
  const normalizedCode = itemCode.trim().toUpperCase()
  const match = normalizedCode.match(new RegExp(`^${salesItemPrefix}-(\\d+)(?:-|$)`, 'u'))
  if (!match) return null

  const sequence = BigInt(match[1])
  if (sequence > BigInt(maxSequence)) {
    throw new EstimationReferenceProposalError(
      'reference_sequence_overflow',
      `El consecutivo ${match[1]} excede el máximo permitido (${maxSequence}).`,
    )
  }

  return Number(sequence)
}

/**
 * Proposes the next internal family/reference pair from SAP evidence. It is
 * intentionally pure: the returned code is a suggestion and never a SAP or
 * database reservation.
 */
export function proposeEstimationReference(
  input: EstimationReferenceProposalInput,
): EstimationReferenceProposal {
  const sapPrefix = normalizeUPrefix(input.sapPrefix)
  const familyCode = deriveEstimationFamilyCode(sapPrefix)
  const salesItemPrefix = normalizeUPrefix(input.salesItemPrefix)
  if (!SALES_ITEM_PREFIX_FORMAT.test(salesItemPrefix) || salesItemPrefix.slice(1) !== familyCode) {
    throw new EstimationReferenceProposalError(
      'inconsistent_sales_item_prefix',
      `El prefijo comercial ${salesItemPrefix} no corresponde al U_Prefijo ${sapPrefix}.`,
    )
  }
  const maxSequence = validateMaxSequence(input.maxSequence)

  const highestSequence = input.existingCodes.reduce((currentHighest, itemCode) => {
    const sequence = referenceSequenceFromCode(itemCode, salesItemPrefix, maxSequence)
    return sequence === null ? currentHighest : Math.max(currentHighest, sequence)
  }, 0)

  if (highestSequence >= maxSequence) {
    throw new EstimationReferenceProposalError(
      'reference_sequence_overflow',
      `No hay consecutivos disponibles para ${salesItemPrefix}; el máximo permitido es ${maxSequence}.`,
    )
  }

  const sequence = highestSequence + 1
  const referenceCode = String(sequence).padStart(ESTIMATION_REFERENCE_SEQUENCE_WIDTH, '0')

  return {
    sapPrefix,
    salesItemPrefix,
    familyCode,
    referenceCode,
    referenceKey: `${familyCode}-${referenceCode}`,
    sequence,
    isReserved: false,
  }
}
