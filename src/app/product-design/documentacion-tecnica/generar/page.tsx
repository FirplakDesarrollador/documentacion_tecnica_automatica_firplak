import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { decodeGenerateLastUrl, GENERATE_LAST_URL_COOKIE } from '@/lib/navigation/generateLastUrl'
import { requirePagePermission } from '@/utils/auth/access'

export default async function TechnicalDocumentationGenerateRedirect() {
  await requirePagePermission('module:generate')

  const cookieStore = await cookies()
  const generateHref = decodeGenerateLastUrl(
    cookieStore.get(GENERATE_LAST_URL_COOKIE)?.value
  ) ?? '/generate'

  redirect(generateHref)
}
