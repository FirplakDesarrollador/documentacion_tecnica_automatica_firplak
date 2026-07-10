import type { ReferenceProductApplicationScope } from './referenceImportScopes'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonRecord = { [key: string]: JsonValue }

export type ReferenceImportContext = {
  referenceId: string
  familyCode: string | null
  referenceCode: string
  productName: string
  manufacturingProcess: string | null
  productType: string | null
}

export type ReferenceImportSku = {
  skuComplete: string
  colorCode: string | null
  sapDescriptionOriginal: string | null
}

export type ReferenceImportCandidate = ReferenceImportContext & {
  activeSkuCount: number
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
  warehouse: string | null
  issueMethod: string | null
  inventoryUom: string | null
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
  base_item_code: string
  product_application_scope: ReferenceProductApplicationScope
  qty: number
  input_warehouse_code: string | null
  issue_method_override: string | null
}

export type ReferenceBomStructure = {
  schema_version: 1
  structure_type: 'production' | 'sales_kit'
  input_warehouse_code: string | null
  output_warehouse_code: string | null
  lines: ReferenceBomLine[]
}

export type ColorConfiguration = {
  code4dig: string
  applicationColors: Record<string, string>
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
}

export type ReferenceImportWorkspace = {
  run: ReferenceImportRunSummary
  findings: ReferenceImportFinding[]
  snapshots: ReferenceImportSnapshotSummary[]
  proposalItemNames: Record<string, string>
}
