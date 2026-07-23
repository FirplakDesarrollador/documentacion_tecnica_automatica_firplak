import type { ReferenceProductApplicationScope } from './referenceImportScopes'
import type {
  BomConsumption,
  BomMaterialAlternative,
  BomColorOverride,
  BoardProfileConditionalRule,
  ComponentTechnicalMetadata,
  HybridColorCase,
} from './types'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonRecord = { [key: string]: JsonValue }

export type ReferenceImportContext = {
  referenceId: string
  familyCode: string | null
  referenceCode: string
  productName: string
  productDescription?: string | null
  manufacturingProcess: string | null
  productType: string | null
  skuColorOverrides?: Map<string, BomColorOverride[]>
}

export type ReferenceImportSku = {
  skuComplete: string
  colorCode: string | null
  sapDescriptionOriginal: string | null
}

export type ReferenceImportCandidate = ReferenceImportContext & {
  activeSkuCount: number
  productDescription: string | null
  hasBom: boolean
  lastRunStatus: string | null
  lastRunCreatedAt: string | null
}

export type NormalizedSapBomLine = {
  itemCode: string
  itemName: string
  baseItemCode: string
  variantCode4: string
  isSalesSku: boolean
  occurrence: number
  lineIdentity: string
  sourceOrder: number
  sapChildNum: number | null
  qty: number
  /** Count of identical SAP board rows consolidated into this line. */
  sourceLineCount?: number
  warehouse: string | null
  issueMethod: string | null
  inventoryUom: string | null
  technicalMetadata: ComponentTechnicalMetadata | null
}

export type DirectBomSnapshot = {
  skuComplete: string
  skuColorCode: string | null
  sapItemName: string | null
  treeCode: string | null
  treeType: string | null
  lineCount: number
  status: 'captured' | 'failed'
  errorMessage: string | null
  directBomJson: JsonRecord
  normalizedLines: NormalizedSapBomLine[]
}

export type ReferenceBomLine = {
  line_id: string
  sort_order: number
  line_kind: 'fixed' | 'material_group'
  base_item_code: string | null
  product_application_scope: ReferenceProductApplicationScope
  qty: number | null
  uom?: string | null
  input_warehouse_code: string | null
  issue_method_override: string | null
  alternatives: BomMaterialAlternative[]
  consumptions: BomConsumption[]
}

export type ReferenceBomStructure = {
  schema_version: 2
  structure_type: 'production' | 'sales_kit'
  input_warehouse_code: string | null
  output_warehouse_code: string | null
  lines: ReferenceBomLine[]
}

export type ColorConfiguration = {
  code4dig: string
  colorMode: 'full' | 'dual' | 'balance' | 'equivalent'
  applicationColors: Record<string, string>
  hybridColorCases?: HybridColorCase[]
  boardProfileConditions?: BoardProfileConditionalRule[]
  boardMatrixResolution?: BoardMatrixResolution
  applicationMaterialProfiles: Record<string, string>
  allowedProductTypes: string[]
  allowedManufacturingProcesses: string[]
}

export type ReferenceImportFindingDraft = {
  findingKey: string
  findingType: string
  severity: 'blocker' | 'warning' | 'info'
  status: 'open' | 'accepted' | 'rejected' | 'resolved'
  lineIdentity: string | null
  baseItemCode: string | null
  occurrence: number | null
  proposedScope: ReferenceProductApplicationScope | null
  proposedColorCode: string | null
  detailsJson: JsonRecord
}

export type ReferenceImportAnalysis = {
  proposedBomStructure: ReferenceBomStructure
  findings: ReferenceImportFindingDraft[]
  summaryJson: JsonRecord
}

export type ComponentBomLine = {
  itemCode: string
  itemName: string
  baseItemCode: string
  variantCode4: string
  isSalesSku: boolean
  sourceOrder: number
  sapChildNum: number | null
  qty: number
  warehouse: string | null
  issueMethod: string | null
  inventoryUom: string | null
  technicalMetadata: ComponentTechnicalMetadata | null
}

export type ComponentTreeSnapshot = {
  itemCode: string
  treeType: string | null
  inputWarehouseCode: string | null
  lines: ComponentBomLine[]
  readError: string | null
}

export type ReferenceImportRunSummary = {
  id: string
  referenceId: string
  analyzedVersionCode: string
  status: 'draft' | 'needs_review' | 'published' | 'failed'
  sourceSkuCount: number
  summaryJson: JsonRecord
  proposedBomStructure: ReferenceBomStructure
  publishedBomStructure: ReferenceBomStructure | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  publishedAt: string | null
}

export type ReferenceImportFinding = ReferenceImportFindingDraft & {
  id: string
  runId: string
  decisionJson: JsonRecord
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ReferenceImportSnapshotSummary = {
  id: string
  runId: string
  skuComplete: string
  skuColorCode: string | null
  sapItemName: string | null
  treeType: string | null
  lineCount: number
  status: 'captured' | 'failed'
  errorMessage: string | null
  capturedAt: string
  /**
   * Only accompanies the transient browser workspace. It lets a retry reuse
   * a BOM already read from SAP without creating an import-history record.
   */
  transientData?: {
    treeCode: string | null
    directBomJson: JsonRecord
  }
}

/** Persisted confirmation that a mixed board color has all its chosen rules. */
export type BoardMatrixResolution = {
  status: 'configured'
  confirmedAt: string
  sapActiveSkuCount: number
  checkedSkuCount: number
  dualCandidateCount: number
}

export type ReferenceImportActiveOverride = {
  level: 'reference' | 'global_version' | 'version' | 'sku'
  skuComplete: string | null
  colorCode: string
  productApplicationScope: ReferenceProductApplicationScope
  baseItemCode: string | null
  targetColorCode: string | null
  materialProfile: string | null
  reason: string
  createdAt: string | null
}

export type BoardMatrixRole = ReferenceProductApplicationScope | 'role_pending'
export type BoardMatrixRoleSource = 'published_bom' | 'sku_override' | 'evidence' | 'pending'
export type BoardMatrixStatus =
  | 'matches'
  | 'unicolor_candidate'
  | 'color_override_candidate'
  | 'profile_override_candidate'
  | 'dual_candidate'
  | 'variation_by_design'
  | 'role_pending'
  | 'profile_pending'
  | 'conflict_real'
  | 'sap_invalid'
  | 'sap_bom_missing'

export type BoardMatrixEvidence = {
  skuComplete: string
  skuItemName: string | null
  lineIdentity: string
  baseItemCode: string
  itemCode: string
  itemName?: string | null
  boardColorCode: string
  materialProfile: string | null
  /** Profile selected by the SKU reference before a color strategy applies. */
  referenceMaterialProfile?: string | null
  formatKey: string | null
  qty: number
  /** Number of identical SAP rows represented by this observation. */
  sourceLineCount?: number
  role: BoardMatrixRole
  roleSource: BoardMatrixRoleSource
}

export type BoardMatrixRow = {
  key: string
  sourceColorCode: string
  role: BoardMatrixRole
  roleSource: BoardMatrixRoleSource
  observedColorCodes: string[]
  proposedColorCode: string | null
  observedMaterialProfiles: string[]
  proposedMaterialProfile: string | null
  referenceMaterialProfile: string | null
  referenceMaterialProfiles: string[]
  recommendedColorCode: string | null
  recommendedMaterialProfile: string | null
  normalizedConsumptionQty: number | null
  isProductColorMatch: boolean
  profileIsReferenceException: boolean
  /** A board profile strategy exists in the persisted color configuration. */
  hasConditionalBoardRule: boolean
  /** The full board decision was closed and stored after a scoped SAP review. */
  hasPersistedBoardResolution: boolean
  baseItemCodes: string[]
  formatKeys: string[]
  evidence: BoardMatrixEvidence[]
  status: BoardMatrixStatus
  statusMessage: string
}

export type BoardMatrixCatalogIssueReason =
  | 'sap_invalid'
  | 'sap_missing'
  | 'bom_missing'
  | 'sap_only'
  | 'supabase_inactive'
  | 'supabase_kit'

export type BoardMatrixCatalogIssue = {
  skuComplete: string
  skuItemName: string | null
  reason: BoardMatrixCatalogIssueReason
  /** True only when its existing active reference/version can receive this
   * missing SAP color without creating any other catalog record. */
  canCreateColorVariation?: boolean
}

/**
 * A color-level rule may be stored only after every eligible active SAP SKU
 * agrees on the same full-product board and material profile.
 */
export type BoardMatrixFullProductRuleCandidate = {
  boardColorCode: string
  materialProfile: string
  evidenceSkuCount: number
}

export type BoardMatrixConditionalRule = {
  sourceMaterialProfile: string
  targetBoardColorCode: string
  targetMaterialProfile: string
  evidenceSkuCount: number
}

/** One complete, evidence-derived way to resolve a unicolor board behavior. */
export type BoardMatrixConditionalStrategy = {
  strategyId: string
  kind: 'keep_product_color' | 'use_internal_default'
  defaultBoardColorCode: string
  defaultMaterialProfile: string | null
  conditions: BoardMatrixConditionalRule[]
  evidenceSkuCount: number
}

export type BoardMatrixDualCandidate = {
  structureColorCode: string
  structureMaterialProfile: string
  frontColorCode: string
  frontMaterialProfile: string
  evidenceSkuCount: number
  cases: Array<{
    skuComplete: string
    skuItemName: string | null
    structureQty: number
    frontQty: number
    boardLines: Array<{
      itemCode: string
      itemName: string | null
      colorCode: string
      materialProfile: string | null
      qty: number
    }>
  }>
}

/**
 * A board-only Dual override already stored on the exact SKU set. It remains
 * separate from a color-level Dual case so an exception never becomes global.
 */
export type BoardMatrixDualConfiguration = {
  structureColorCode: string
  structureMaterialProfile: string
  frontColorCode: string
  frontMaterialProfile: string
}

export type BoardMatrixPersistedDualSkuOverride = {
  structureColorCode: string
  structureMaterialProfile: string
  frontColorCode: string
  frontMaterialProfile: string
  skuCompletes: string[]
  isSapDeviation: boolean
}

export type BoardMatrixCoveredSapSku = {
  skuComplete: string
  skuItemName: string | null
  bomRead: boolean
}

export type BoardMatrixCatalogResult = {
  sourceColorCode: string
  sapDiscoveredSkuCount: number
  sapActiveSkuCount: number
  sapActiveSkus: BoardMatrixCoveredSapSku[]
  supabaseSkuCount: number
  supabaseActiveSkuCount: number
  excludedInactiveSapSkuCount: number
  excludedKitSkuCount: number
  checkedSkuCount: number
  sapReadErrors: Array<{ skuComplete: string; message: string }>
  invalidSkus: BoardMatrixCatalogIssue[]
  rows: BoardMatrixRow[]
  dualGlobalCandidate: boolean
  dualCandidateMessage: string | null
  fullProductRuleCandidate: BoardMatrixFullProductRuleCandidate | null
  fullProductRuleBlockers: string[]
  boardProfileConditions: BoardProfileConditionalRule[]
  /** Color-level board mapping used when the BOM has structure and front roles. */
  boardDualConfiguration: BoardMatrixDualConfiguration | null
  /** Board-only Dual overrides already stored on SKU, grouped by their mapping. */
  boardDualSkuOverrides: BoardMatrixPersistedDualSkuOverride[]
  conditionalRuleStrategies: BoardMatrixConditionalStrategy[]
  dualCandidates: BoardMatrixDualCandidate[]
}

export type ReferenceImportWorkspace = {
  run: ReferenceImportRunSummary
  findings: ReferenceImportFinding[]
  snapshots: ReferenceImportSnapshotSummary[]
  proposalItemNames: Record<string, string>
  activeOverrides: ReferenceImportActiveOverride[]
  /** V02 keeps transient SAP evidence only; it is rebuilt on every analysis. */
  boardMatrix?: BoardMatrixRow[]
}
