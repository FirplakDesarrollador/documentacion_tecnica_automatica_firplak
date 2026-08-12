import { SAP_CODE_MANAGEMENT_PERMISSION } from '@/types/auth'
import { requirePagePermission } from '@/utils/auth/access'
import SapCodeCreationClient from './SapCodeCreationClient'

export default async function SapCodeCreationPage() {
  const access = await requirePagePermission('module:engineering:sap-code-creation')
  return <SapCodeCreationClient canManageSapCodes={access.permissions.includes(SAP_CODE_MANAGEMENT_PERMISSION)} />
}
