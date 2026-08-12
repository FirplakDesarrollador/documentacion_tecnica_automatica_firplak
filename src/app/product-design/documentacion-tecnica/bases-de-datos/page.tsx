import { redirect } from 'next/navigation'

import { requirePagePermission } from '@/utils/auth/access'

export default async function TechnicalDocumentationDatasetsRedirect() {
  await requirePagePermission('module:datasets')
  redirect('/datasets')
}
