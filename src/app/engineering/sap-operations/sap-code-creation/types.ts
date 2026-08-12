import type { SapItemLifecycleState, SapItemTargetStatus } from '@/lib/sap/itemLifecycle'
import type { SapEntityPayload } from '@/lib/sap/serviceLayer'

export type SapStatusUpdateInput = {
  itemCode: string
  targetStatus: SapItemTargetStatus
  dryRun: boolean
  confirmed: boolean
}

export type SapStatusUpdateResult = {
  success: boolean
  dryRun: boolean
  confirmationRequired: boolean
  message: string
  payload: SapEntityPayload
  before: SapItemLifecycleState | null
  after: SapItemLifecycleState | null
  supabaseMirror: { found: boolean; status: string | null }
}
