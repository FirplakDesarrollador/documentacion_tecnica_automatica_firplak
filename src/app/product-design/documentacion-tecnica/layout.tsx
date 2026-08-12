import { requirePagePermission } from '@/utils/auth/access'

export default async function TechnicalDocumentationLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await requirePagePermission('module:product-design')

  return children
}
