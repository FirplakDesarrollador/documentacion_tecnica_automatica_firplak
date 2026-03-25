import { dbQuery } from '@/lib/supabase'
import VersionsClient from './VersionsClient'

export const dynamic = 'force-dynamic'

export default async function VersionsPage() {
    const versions = await dbQuery(`SELECT * FROM public.versions ORDER BY code ASC`) || []
    
    return (
        <div className="container mx-auto py-10">
            <VersionsClient initialData={versions} />
        </div>
    )
}
