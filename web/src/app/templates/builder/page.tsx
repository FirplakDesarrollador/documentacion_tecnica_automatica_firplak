import { dbQuery } from '@/lib/supabase'
import { BuilderCanvas } from '@/components/templates/TemplateCanvas'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'

export default async function TemplateBuilderPage({
    searchParams
}: {
    searchParams: Promise<{ id?: string }>
}) {
    const resolvedParams = await searchParams;

    if (!resolvedParams.id) {
        redirect('/templates')
    }

    const rowsResult = await dbQuery(`SELECT * FROM public.plantillas_doc_tec WHERE id='${resolvedParams.id}' LIMIT 1`)
    const rows = Array.isArray(rowsResult) ? rowsResult : (rowsResult?.rows || [])
    const template = rows?.[0]

    if (!template) {
        redirect('/templates')
    }

    const assetsResult = await dbQuery(`SELECT * FROM public.assets ORDER BY name ASC`)
    const assets = (Array.isArray(assetsResult) ? assetsResult : (assetsResult?.rows || [])) || []

    return (
        <div className="flex flex-col gap-6 h-[calc(100vh-80px)]">
            <div className="flex items-center gap-4 shrink-0">
                <Link href="/templates" className="p-2 hover:bg-muted rounded-full transition-colors">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Constructor - {template.name}</h1>
                    <p className="text-muted-foreground">
                        {template.width_mm}mm x {template.height_mm}mm ({template.orientation})
                    </p>
                </div>
            </div>

            <BuilderCanvas template={template} assets={assets} />
        </div>
    )
}
