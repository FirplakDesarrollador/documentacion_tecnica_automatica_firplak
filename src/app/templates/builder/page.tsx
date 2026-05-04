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

    // Si la plantilla tiene un dataset externo, cargar su schema para exponer las variables dinámicas
    let datasetSchema: { key: string; label: string; original: string; is_identifier: boolean }[] = []
    const isExternalSource = template.data_source && template.data_source !== 'core_firplak'
    if (isExternalSource) {
        const dsResult = await dbQuery(`SELECT schema_json FROM public.custom_datasets WHERE id='${template.data_source}' LIMIT 1`)
        const dsRow = (Array.isArray(dsResult) ? dsResult : (dsResult?.rows || []))?.[0]
        if (dsRow?.schema_json) {
            const raw = typeof dsRow.schema_json === 'string' ? JSON.parse(dsRow.schema_json) : dsRow.schema_json
            
            if (Array.isArray(raw)) {
                datasetSchema = raw
            } else if (raw && typeof raw === 'object') {
                // Nuevo formato: { fieldMap: Record<string, string>, selectedColumns: string[] }
                const selectedCols = raw.selectedColumns || []
                datasetSchema = selectedCols.map((col: string) => ({
                    key: col,
                    label: col.replace(/_/g, ' '),
                    original: col,
                    is_identifier: col === raw.fieldMap?.code
                }))
            }
        }
    }

    return (
        <div className="flex flex-col gap-6 h-full overflow-hidden">
            <div className="flex items-center gap-4 shrink-0">
                <Link href="/templates" className="p-2 hover:bg-muted rounded-full transition-colors">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Constructor - {template.name}</h1>
                    <p className="text-muted-foreground">
                        {template.width_mm}mm x {template.height_mm}mm ({template.orientation})
                        {isExternalSource && <span className="ml-2 text-indigo-600 font-semibold text-xs bg-indigo-50 px-2 py-0.5 rounded-full ring-1 ring-indigo-200">Dataset Externo</span>}
                    </p>
                </div>
            </div>

            <BuilderCanvas template={template} assets={assets} datasetSchema={datasetSchema} />
        </div>
    )
}

