import { dbQuery } from '@/lib/supabase'
import { PIXELS_PER_MM } from '@/lib/constants'

/**
 * Resolves the English translation for a zone_home value from the Supabase glossary.
 * This is the single point of truth: if a zone exists in the glossary with category='ZONE',
 * it will be used. Otherwise returns null so productUtils can apply its built-in fallback.
 * The result is cached per-request to avoid repeated DB queries during bulk exports.
 */
const _zoneCache: Record<string, string> = {}
async function resolveZoneHomeEn(zoneEs: string | null | undefined): Promise<string | null> {
    if (!zoneEs) return null
    const key = zoneEs.trim().toUpperCase()
    if (_zoneCache[key] !== undefined) return _zoneCache[key] || null
    
    try {
        const rows = await dbQuery(
            `SELECT term_en FROM public.glossary 
             WHERE term_es = '${key.replace(/'/g, "\'\'")}' 
               AND active = true 
             LIMIT 1`
        )
        const result = (rows && rows.length > 0) ? rows[0].term_en as string : null
        _zoneCache[key] = result || ''
        return result
    } catch {
        return null
    }
}

export interface ExportOptions {
    html: string
    format: 'pdf' | 'jpg' | 'png'
    width: number
    height: number
}

const normalizeString = (str: string) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

export const getVariableValue = (context: any, field: string) => {
    if (!context || !field) return ''
    
    // 1. Try exact match
    if (context[field] !== undefined && context[field] !== null) {
        return String(context[field])
    }

    // 2. Special technical mappings
    if (field === 'color' || field === 'color_name' || field === 'name_color_sap') {
        return context.color_name || context.name_color_sap || ''
    }
    if (field === 'color_code') return context.color_code || ''

    // 3. Normalized search (case-insensitive, tilde-insensitive)
    const normalizedTarget = normalizeString(field)
    
    // Cache normalized keys for performance if this is called frequently, 
    // but for a single product context, a simple find is fine.
    const matchingKey = Object.keys(context).find(key => normalizeString(key) === normalizedTarget)
    
    if (matchingKey) {
        const val = context[matchingKey]
        return (val === null || val === undefined) ? '' : String(val)
    }

    return ''
}

export const hydrateText = (text: string, context: any) => {
    if (!text) return ''
    return text.replace(/{([^}]+)}/g, (_: string, field: string) => {
        return getVariableValue(context, field)
    })
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

    // Resolver la traducción de la zona desde el Glosario ANTES de enriquecer.
    // Esto garantiza que technical_description_en siempre use el valor real del glosario
    // y no un fallback estático. Todos los pipelines (export, preview, bulk) pasan por aquí.
    const zoneEnFromGlossary = await resolveZoneHomeEn(product.zone_home)
    const productWithZone = zoneEnFromGlossary
        ? { ...product, zone_home_en: zoneEnFromGlossary }
        : product

    const enrichedProduct = enrichProductDataWithIcons(productWithZone, assetMap)

    const ensureAbsolute = (path: string) => {
        if (!path || path === 'undefined' || path === 'null') return ''
        if (path.startsWith('http')) return path
        if (path.startsWith('data:')) return path
        
        // Limpiar el path si ya trae el prefijo de bucket
        const cleanPath = path.startsWith('assets/') ? path.slice(7) : path
        if (cleanPath.startsWith('/')) return `${baseUrl}${cleanPath}`
        
        return `${baseUrl}/storage/v1/object/public/assets/${cleanPath}`
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
            // 2. Mapeo de assets de sistema y lógica de Marca Propia
            else if (content === 'logo_empresa' || content === 'Logo Empresa Pordefecto') {
                // Si es Marca Propia y hay un logo específico, lo priorizamos
                if (product.private_label_flag && product.private_label_logo_id && assetMap[product.private_label_logo_id]) {
                    src = assetMap[product.private_label_logo_id]
                } else {
                    src = assetMap['Logo Empresa Pordefecto'] || assetMap['logo_empresa'] || ''
                }
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



