import { redirect } from 'next/navigation'

import { requirePagePermission } from '@/utils/auth/access'

export default async function TechnicalDocumentationAssetsRedirect() {
  await requirePagePermission('module:assets')
  redirect('/assets')
}
