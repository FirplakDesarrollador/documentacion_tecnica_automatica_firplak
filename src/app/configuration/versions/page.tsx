import { dbQuery } from '@/lib/supabase'
import VersionsClient from '@/app/rules/versions/VersionsClient'

export const dynamic = 'force-dynamic'

export default async function VersionsPage() {
  const [versions, productTypeRows] = await Promise.all([
    dbQuery(`SELECT version_code, version_description, automatic_version_rules, product_types, status, created_at, updated_at FROM public.global_version_rules ORDER BY version_code ASC`),
    dbQuery(`SELECT DISTINCT product_type FROM public.families WHERE product_type IS NOT NULL AND product_type != '' ORDER BY product_type ASC`)
  ])
  const productTypes = (productTypeRows || []).map((r: { product_type: string }) => r.product_type)

  return (
    <div className="container mx-auto py-10">
      <VersionsClient initialData={versions || []} productTypes={productTypes} />
    </div>
  )
}
