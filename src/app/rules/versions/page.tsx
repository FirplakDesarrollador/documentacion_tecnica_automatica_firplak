import { dbQuery } from '@/lib/supabase'
import VersionsClient from './VersionsClient'

export const dynamic = 'force-dynamic'

export default async function VersionsPage() {
    const versions = await dbQuery(`SELECT version_code, version_description, automatic_version_rules, product_types, status, created_at, updated_at FROM public.global_version_rules ORDER BY version_code ASC`) || []
    
    return (
        <div className="container mx-auto py-10">
            <VersionsClient initialData={versions} />
        </div>
    )
}
