import { redirect } from 'next/navigation'

import { requirePagePermission } from '@/utils/auth/access'

export default async function TechnicalDocumentationTemplatesRedirect() {
  await requirePagePermission('module:templates')
  redirect('/templates')
}
