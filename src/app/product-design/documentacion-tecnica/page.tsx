import { cookies } from 'next/headers'

import { ModuleHub } from '@/components/navigation/ModuleHub'
import {
  TECHNICAL_DOCUMENTATION_NAVIGATION,
} from '@/lib/navigation/moduleHierarchy'
import { decodeGenerateLastUrl, GENERATE_LAST_URL_COOKIE } from '@/lib/navigation/generateLastUrl'
import { requirePagePermission } from '@/utils/auth/access'

export default async function TechnicalDocumentationPage() {
  const access = await requirePagePermission('module:product-design')
  const cookieStore = await cookies()
  const generateHref = decodeGenerateLastUrl(
    cookieStore.get(GENERATE_LAST_URL_COOKIE)?.value
  ) ?? '/generate'

  return (
    <ModuleHub
      node={TECHNICAL_DOCUMENTATION_NAVIGATION}
      permissions={access.permissions}
      isAdmin={access.isAdmin}
      backHref="/product-design"
      backLabel="Volver a Diseño de producto"
      generateHref={generateHref}
    />
  )
}
