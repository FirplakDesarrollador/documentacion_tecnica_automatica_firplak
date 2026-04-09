import { dbQuery } from '@/lib/supabase'
import { PIXELS_PER_MM } from '@/lib/constants'

export interface ExportOptions {
    html: string
    format: 'pdf' | 'jpg' | 'png'
    width: number
    height: number
}

/**
 * Función maestra de hidratación (R6).
 * Resuelve variables {field}, activos (UUIDs) e iconos dinámicos en una sola pasada.
 * Se usa tanto en Preview (React) como en Export (HTML).
 */
export async function hydrateTemplateElements(
    elements: any[], 
    product: any, 
    assetMap: Record<string, string>
): Promise<any[]> {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    
    // 1. Enriquecer producto con iconos dinámicos (R1, R2)
    const { enrichProductDataWithIcons } = await import('@/lib/engine/productUtils')
    const enrichedProduct = enrichProductDataWithIcons(product, assetMap)

    const ensureAbsolute = (path: string) => {
        if (!path || path === 'undefined' || path === 'null') return ''
        if (path.startsWith('http')) return path
        if (path.startsWith('data:')) return path
        
        // Limpiar el path si ya trae el prefijo de bucket
        const cleanPath = path.startsWith('assets/') ? path.slice(7) : path
        if (cleanPath.startsWith('/')) return `${baseUrl}${cleanPath}`
        
        return `${baseUrl}/storage/v1/object/public/assets/${cleanPath}`
    }

    const hydrateText = (text: string, context: any) => {
        if (!text) return ''
        return text.replace(/{([^}]+)}/g, (_: string, field: string) => {
            if (field === 'color' || field === 'color_name' || field === 'name_color_sap') {
                return context.color_name || context.name_color_sap || ''
            }
            if (field === 'color_code') return context.color_code || ''
            const val = context[field]
            return (val === null || val === undefined) ? '' : String(val)
        })
    }

    return elements.map(el => {
        const cloned = { ...el }

        // Resolución de activos de imagen (R8)
        if (cloned.type === 'image') {
            let content = cloned.content || ''
            let src = ''

            // 1. Mapeo por asset id (UUID)
            if (assetMap[content]) {
                src = assetMap[content]
            } 
            // 2. Mapeo de assets de sistema
            else if (content === 'logo_empresa' || content === 'Logo Empresa Pordefecto') {
                src = assetMap['Logo Empresa Pordefecto'] || assetMap['logo_empresa'] || ''
            }
            // 3. Mapeo de isométrico (R8)
            else if (['isometrico_placeholder', 'Isométrico', 'Isométrico (Placeholder)', 'isometric_path', 'image'].includes(content) || cloned.dataField === 'isometric_path') {
                src = product.isometric_path || ''
            }
            else {
                src = content
            }
            
            cloned.resolvedSrc = ensureAbsolute(src)
        }

        // Resolución de íconos dinámicos / RH / Canto (R1, R3)
        if (cloned.type === 'dynamic_image') {
            const iconUrl = cloned.dataField ? (enrichedProduct[`${cloned.dataField}_url`] || null) : null
            cloned.resolvedSrc = iconUrl ? ensureAbsolute(iconUrl) : null
            
            // Hidratar el caption si existe (ej: {caption_es})
            if (cloned.caption) {
                // El contexto para el caption suele ser campos específicos inyectados por el motor de iconos
                // como icon_canto_caption_es que se mapean a {caption_es} en el builder
                const captionContext = {
                    ...enrichedProduct,
                    caption_es: enrichedProduct[`${cloned.dataField}_caption_es`] || '',
                    caption_en: enrichedProduct[`${cloned.dataField}_caption_en`] || ''
                }
                cloned.caption = hydrateText(cloned.caption, captionContext)
            }
        }

        // Hidratación de contenido de texto y dynamic_text (R4, R5)
        if (cloned.type === 'text' || cloned.type === 'dynamic_text') {
            let rawContent = cloned.content || ''
            if (cloned.type === 'dynamic_text' && cloned.dataField) {
                rawContent = `{${cloned.dataField}}`
            }
            let hydrated = hydrateText(rawContent, enrichedProduct)
            // Limpieza de artefactos visuales inyectados por el Template Builder en variables técnicas (punteados, cursores)
            hydrated = hydrated.replace(/text-decoration:\s*underline\s*dotted[^;"]+;?/gi, '')
            hydrated = hydrated.replace(/cursor:\s*text;?/gi, '')
            cloned.content = hydrated
        }

        return cloned
    })
}

/**
 * @deprecated Use hydrateTemplateElements instead for a unified logic.
 * Mantener temporalmente para evitar rupturas mientras migramos el resto de archivos.
 */
export async function resolveTemplateAssets(elements: any[], product: any, assetMap: Record<string, string>): Promise<any[]> {
    return hydrateTemplateElements(elements, product, assetMap)
}



