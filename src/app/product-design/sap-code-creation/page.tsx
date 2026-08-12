import { redirect } from 'next/navigation'

import { requirePagePermission } from '@/utils/auth/access'

export default async function SapCodeCreationPage() {
  await requirePagePermission('module:engineering:sap-code-creation')
  redirect('/engineering/sap-operations/sap-code-creation')
}
