import { redirect } from 'next/navigation'

import { requirePagePermission } from '@/utils/auth/access'

export default async function TechnicalDocumentationPendingRedirect() {
  await requirePagePermission('module:pending')
  redirect('/pending')
}
