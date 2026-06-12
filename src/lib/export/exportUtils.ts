import { dbQuery } from '@/lib/supabase'
import { buildBarcode, resolveBarcodeFormat } from './barcodeUtils'
import { applyTemplateTextTransform } from '@/lib/templates/textTransforms'

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

interface HydratableTemplateElement extends Record<string, unknown> {
    type?: string
    content?: string
    dataField?: string
    caption?: string
    textTransform?: string
    width?: number | string
    height?: number | string
    barcodeFormat?: string | null
    barcodeXDimensionMm?: number | string
    barcodeBarHeightMm?: number | string
    barcodeQuietZoneX?: number | string
    resolvedSrc?: string | null
    barcodeFormatResolved?: string
    barcodeValue?: string
    barcodeSvg?: string | null
    barcodeError?: string | null
}

const normalizeString = (str: string) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

const PLACEHOLDERS = ['NA', 'N/A', 'NULL', 'VACÍO', 'UNDEFINED']

const getString = (context: Record<string, unknown>, key: string): string | undefined => {
    const v = context[key]
    return v !== undefined && v !== null ? String(v) : undefined
}

export const getVariableValue = (context: Record<string, unknown>, field: string) => {
    if (!context || !field) return ''
    
    // 1. Try exact match
    const exact = getString(context, field)
    if (exact !== undefined) {
        return PLACEHOLDERS.includes(exact.toUpperCase().trim()) ? '' : exact
    }

    // 2. Special technical mappings
    const fieldUpper = field.toUpperCase().trim()
    if (['COLOR', 'COLOR_NAME', 'NAME_COLOR_SAP', 'DESC_COLOR', 'COLOR_DESC'].includes(fieldUpper)) {
        return getString(context, 'color_name') || getString(context, 'name_color_sap') || ''
    }
    if (fieldUpper === 'COLOR_CODE' || fieldUpper === 'CODIGO_COLOR') {
        return getString(context, 'color_code') || ''
    }
    if (fieldUpper === 'SKU' || fieldUpper === 'CODE' || fieldUpper === 'CÓDIGO') {
        return getString(context, 'code') || ''
    }
    if (fieldUpper === 'NOMBRE' || fieldUpper === 'DESCRIPTION' || fieldUpper === 'DESCRIPCION') {
        return getString(context, 'final_name_es') || getString(context, 'sap_description') || ''
    }

    // 3. Normalized search (case-insensitive, tilde-insensitive)
    const normalizedTarget = normalizeString(field)
    
    const matchingKey = Object.keys(context).find(key => normalizeString(key) === normalizedTarget)
    
    if (matchingKey) {
        const val = getString(context, matchingKey)
        if (val === undefined) return ''
        return PLACEHOLDERS.includes(val.toUpperCase().trim()) ? '' : val
    }

    return ''
}

export const hydrateText = (text: string, context: Record<string, unknown>) => {
    if (!text) return ''
    const hydrated = text.replace(/{([^}]+)}/g, (_: string, field: string) => {
        return getVariableValue(context, field)
    })
    // Eliminar "NA" literales y colapsar espacios múltiples (R10)
    // También elimina guiones huérfanos que puedan quedar al final de un nombre
    return hydrated
        .replace(/\s\s+/g, ' ')
        .replace(/\sNA\s/gi, ' ')
        .trim()
        .replace(/-\s*$/, '') // Elimina guión al final si quedó huérfano
        .trim()
}

/**
 * Función maestra de hidratación (R6).
 * Resuelve variables {field}, activos (UUIDs) e iconos dinámicos en una sola pasada.
 * Se usa tanto en Preview (React) como en Export (HTML).
 */
export async function hydrateTemplateElements(
    elements: Record<string, unknown>[], 
    product: Record<string, unknown>, 
    assetMap: Record<string, string>
): Promise<Record<string, unknown>[]> {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    
    // 1. Enriquecer producto con iconos dinámicos (R1, R2)
    const { enrichProductDataWithIcons } = await import('@/lib/engine/productUtils')

    // Resolver la traducción de la zona desde el Glosario ANTES de enriquecer.
    // Esto garantiza que technical_description_en siempre use el valor real del glosario
    // y no un fallback estático. Todos los pipelines (export, preview, bulk) pasan por aquí.
    const zoneEnFromGlossary = await resolveZoneHomeEn(product.zone_home as string | null | undefined)
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

    return elements.map((el): Record<string, unknown> => {
        const cloned: HydratableTemplateElement = { ...el }

        // Resolución de activos de imagen (R8)
        if (cloned.type === 'image') {
            const content: string = String(cloned.content || '')
            let src = ''

            // 1. Mapeo por asset id (UUID)
            if (assetMap[content]) {
                src = assetMap[content]
            } 
            // 2. Mapeo de assets de sistema y lógica de Marca Propia
            else if (content === 'logo_empresa' || content === 'Logo Empresa Pordefecto') {
                // Si es Marca Propia y hay un logo específico, lo priorizamos
                const privLabelLogoId = String(product.private_label_logo_id || '')
                if (product.private_label_client_name && privLabelLogoId && assetMap[privLabelLogoId]) {
                    src = assetMap[privLabelLogoId]
                } else {
                    src = assetMap['Logo Empresa Pordefecto'] || assetMap['logo_empresa'] || ''
                }
            }
            // 3. Mapeo de isométrico (R8)
            else if (['isometrico_placeholder', 'Isométrico', 'Isométrico (Placeholder)', 'isometric_path', 'image'].includes(content) || cloned.dataField === 'isometric_path') {
                src = String(product.isometric_path || '')
            }
            else {
                src = content
            }
            
            cloned.resolvedSrc = ensureAbsolute(src)
        }

        // Resolución de íconos dinámicos / RH / Canto (R1, R3)
        if (cloned.type === 'dynamic_image') {
            const df = typeof cloned.dataField === 'string' ? cloned.dataField : ''
            const iconUrl = df ? (enrichedProduct[`${df}_url`] || null) : null
            cloned.resolvedSrc = iconUrl ? ensureAbsolute(String(iconUrl)) : null
            
            // Hidratar el caption si existe (ej: {caption_es})
            if (typeof cloned.caption === 'string' && cloned.caption) {
                // El contexto para el caption suele ser campos específicos inyectados por el motor de iconos
                // como icon_canto_caption_es que se mapean a {caption_es} en el builder
                const captionContext = {
                    ...enrichedProduct,
                    caption_es: df ? enrichedProduct[`${df}_caption_es`] || '' : '',
                    caption_en: df ? enrichedProduct[`${df}_caption_en`] || '' : ''
                }
                cloned.caption = hydrateText(cloned.caption, captionContext)
            }
        }

        // Hidratación de contenido de texto y dynamic_text (R4, R5)
        if (cloned.type === 'text' || cloned.type === 'dynamic_text') {
            let rawContent = String(cloned.content || '')
            if (cloned.type === 'dynamic_text' && cloned.dataField) {
                rawContent = `{${String(cloned.dataField)}}`
            }
            let hydrated = hydrateText(rawContent, enrichedProduct)
            // Limpieza de artefactos visuales inyectados por el Template Builder en variables técnicas (punteados, cursores)
            hydrated = hydrated.replace(/text-decoration:\s*underline\s*dotted[^;"]+;?/gi, '')
            hydrated = hydrated.replace(/cursor:\s*text;?/gi, '')
            hydrated = applyTemplateTextTransform(hydrated, String(cloned.textTransform || 'none'), enrichedProduct)
            cloned.content = hydrated
        }

        if (cloned.type === 'barcode') {
            const format = resolveBarcodeFormat(cloned)
            const rawBarcodeValue = cloned.dataField ? getVariableValue(enrichedProduct, cloned.dataField) : ''
            const barcode = buildBarcode(rawBarcodeValue, format, {
                width: Number(cloned.width) || undefined,
                height: Number(cloned.height) || undefined,
                xDimensionMm: Number(cloned.barcodeXDimensionMm) || undefined,
                barHeightMm: Number(cloned.barcodeBarHeightMm) || undefined,
                quietZoneX: Number(cloned.barcodeQuietZoneX) || undefined,
            })

            cloned.barcodeFormatResolved = format
            cloned.barcodeValue = barcode.normalizedValue
            cloned.barcodeSvg = barcode.svgMarkup
            cloned.barcodeError = barcode.errorMessage
        }

        return cloned
    })
}

/**
 * @deprecated Use hydrateTemplateElements instead for a unified logic.
 * Mantener temporalmente para evitar rupturas mientras migramos el resto de archivos.
 */
export async function resolveTemplateAssets(elements: Record<string, unknown>[], product: Record<string, unknown>, assetMap: Record<string, string>): Promise<Record<string, unknown>[]> {
    return hydrateTemplateElements(elements, product, assetMap)
}



