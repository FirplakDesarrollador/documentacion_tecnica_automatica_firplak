import { redirect } from 'next/navigation'

import { requirePagePermission } from '@/utils/auth/access'

export default async function ProductivePrintRedirect() {
  await requirePagePermission('module:productive-modules')
  await requirePagePermission('module:print')
  redirect('/print')
}
