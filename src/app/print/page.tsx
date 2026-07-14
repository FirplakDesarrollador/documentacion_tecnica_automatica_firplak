import { dbQuery } from '@/lib/supabase'
import { loadAllRulesForNamingType } from '@/lib/engine/namingComponents'
import { PrintClient } from '@/components/print/PrintClient'
import { Printer } from 'lucide-react'
import { requirePagePermission } from '@/utils/auth/access'

export const dynamic = 'force-dynamic'

export default async function PrintPage() {
    await requirePagePermission('module:print')

    const templates = await dbQuery(
        `SELECT t.id, t.name, t.document_type, t.width_mm, t.height_mm, t.orientation, t.print_target, t.media_width_mm, t.media_length_mm, t.media_gap_mm, t.active, t.elements_json, t.export_formats, t.export_filename_format, t.data_source, to_jsonb(t)->>'catalog_scope' AS catalog_scope, t.template_font_family, t.brand_scope, t.private_label_client_name
         FROM public.plantillas_doc_tec t WHERE t.active = true ORDER BY t.created_at ASC`
    ) || []

    const rules = await loadAllRulesForNamingType('final_complete_name')

    return (
        <div className="flex flex-col gap-8 pb-10">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-1">
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                                <Printer className="w-5 h-5 text-indigo-600" />
                            </div>
                            Impresión de etiquetas
                        </h1>
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-inset ring-slate-200 uppercase tracking-tight">
                            300 DPI
                        </span>
                    </div>
                    <p className="text-slate-500">
                        Selecciona productos, elige una plantilla y envía a imprimir directamente a la impresora de etiquetas.
                    </p>
                </div>
            </div>

            <PrintClient
                templates={templates}
                rules={rules}
            />
        </div>
    )
}
