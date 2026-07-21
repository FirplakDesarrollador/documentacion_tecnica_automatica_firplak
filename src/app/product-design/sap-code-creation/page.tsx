import { requirePagePermission } from '@/utils/auth/access'
import SapCodeCreationClient from './SapCodeCreationClient'
import { SAP_CODE_MANAGEMENT_PERMISSION } from '@/types/auth'

export default async function SapCodeCreationPage() {
  const access = await requirePagePermission('module:product-design')
  return <SapCodeCreationClient canManageSapCodes={access.permissions.includes(SAP_CODE_MANAGEMENT_PERMISSION)} />
}
