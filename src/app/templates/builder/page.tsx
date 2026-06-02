import { dbQuery } from '@/lib/supabase'
import { BuilderCanvas } from '@/components/templates/TemplateCanvas'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function TemplateBuilderPage({
    searchParams
}: {
    searchParams: Promise<{ id?: string }>
}) {
    const resolvedParams = await searchParams

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

    const dataSource = String(template.data_source || 'core_firplak')
    const isSpecificDataset = UUID_RE.test(dataSource)
    const isGenericDatasets = dataSource === 'custom_datasets'

    const parseSchemaColumns = (raw: unknown, codeField?: string | null) => {
        if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).columns)) {
            const columns = (raw as Record<string, unknown>).columns as Record<string, unknown>[]
            return columns
                .map((c: Record<string, unknown>) => ({
                    key: String(c?.key ?? c?.original ?? ''),
                    label: String(c?.label ?? c?.key ?? c?.original ?? '').replace(/_/g, ' '),
                    original: String(c?.original ?? c?.key ?? ''),
                    is_identifier:
                        Boolean(c?.is_identifier) ||
                        (codeField ? String(c?.original ?? '') === codeField : false)
                }))
                .filter((c) => c.key && c.original)
        }
        if (Array.isArray(raw)) {
            return (raw as Record<string, unknown>[])
                .map((c) => ({
                    key: String(c?.key ?? c?.original ?? ''),
                    label: String(c?.label ?? c?.key ?? c?.original ?? '').replace(/_/g, ' '),
                    original: String(c?.original ?? c?.key ?? ''),
                    is_identifier: Boolean(c?.is_identifier),
                }))
                .filter((c) => c.key && c.original)
        }
        return []
    }

    // Si la plantilla apunta a un dataset específico (legacy), cargar su schema para exponer variables dinámicas.
    let datasetSchema: { key: string; label: string; original: string; is_identifier: boolean }[] = []
    if (isSpecificDataset) {
        const dsResult = await dbQuery(`SELECT schema_json FROM public.custom_datasets WHERE id='${dataSource}' LIMIT 1`)
        const dsRow = (Array.isArray(dsResult) ? dsResult : (dsResult?.rows || []))?.[0]
        if (dsRow?.schema_json) {
            const raw = typeof dsRow.schema_json === 'string' ? JSON.parse(dsRow.schema_json) : dsRow.schema_json
            datasetSchema = parseSchemaColumns(raw)
        }
    } else if (isGenericDatasets && template?.id) {
        // Cargar schemas de TODOS los datasets asociados y mostrar sus variables disponibles.
        const linked = await dbQuery(`
            SELECT d.schema_json
            FROM public.template_dataset_links l
            JOIN public.custom_datasets d ON d.id = l.dataset_id
            WHERE l.template_id = '${String(template.id).replace(/'/g, "''")}'
        `) || []
        const seen = new Set<string>()
        for (const row of linked) {
            if (!row?.schema_json) continue
            const raw = typeof row.schema_json === 'string' ? JSON.parse(row.schema_json) : row.schema_json
            const cols = parseSchemaColumns(raw)
            for (const c of cols) {
                if (!seen.has(c.key)) {
                    seen.add(c.key)
                    datasetSchema.push(c)
                }
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
                        {isGenericDatasets && (
                            <span className="ml-2 text-indigo-600 font-semibold text-xs bg-indigo-50 px-2 py-0.5 rounded-full ring-1 ring-indigo-200">
                                Bases de Datos (Genérico)
                            </span>
                        )}
                        {isSpecificDataset && (
                            <span className="ml-2 text-indigo-600 font-semibold text-xs bg-indigo-50 px-2 py-0.5 rounded-full ring-1 ring-indigo-200">
                                Dataset Específico (Legacy)
                            </span>
                        )}
                    </p>
                </div>
            </div>

            <BuilderCanvas template={template} assets={assets} datasetSchema={datasetSchema} />
        </div>
    )
}
