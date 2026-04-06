import { dbQuery } from '@/lib/supabase'

export interface ExportOptions {
    html: string
    format: 'pdf' | 'jpg' | 'png'
    width: number
    height: number
}

/**
 * Resuelve todos los assets (UUIDs) y placeholders en los elementos de la plantilla
 * a sus URLs/Rutas reales desde la base de datos.
 */
export async function resolveTemplateAssets(elements: any[], product: any, assetMap: Record<string, string>): Promise<any[]> {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

    const ensureAbsolute = (path: string) => {
        if (!path) return ''
        if (path.startsWith('http')) return path
        if (path.startsWith('/')) return `${baseUrl}${path}`
        return `${baseUrl}/storage/v1/object/public/${path}`
    }

    return elements.map(el => {
        if (el.type === 'image') {
            let finalSrc = el.content || ''
            
            // 1. Check if it's a UUID or a direct Name in the assetMap
            if (assetMap[finalSrc]) {
                finalSrc = assetMap[finalSrc]
            } 
            // 2. Fallbacks for system defaults
            else if (finalSrc === 'logo_empresa' && assetMap['Logo Empresa Pordefecto']) {
                finalSrc = assetMap['Logo Empresa Pordefecto']
            }
            else if (finalSrc === 'isometrico_placeholder' || finalSrc === 'Isométrico' || finalSrc === 'Isométrico (Placeholder)') {
                finalSrc = product.isometric_path || ''
            }
            // 3. Fallback for dataField if specified
            else if (el.dataField === 'isometric_path') {
                finalSrc = product.isometric_path || ''
            }

            return { ...el, resolvedSrc: ensureAbsolute(finalSrc) }
        }

        // dynamic_image: resolve icon URL from enriched product data (e.g. icon_rh_url)
        if (el.type === 'dynamic_image') {
            const iconUrl = el.dataField ? (product[`${el.dataField}_url`] || null) : null
            return { ...el, resolvedSrc: iconUrl ? ensureAbsolute(iconUrl) : null }
        }

        return el
    })
}

/**
 * Genera el HTML completo para enviar a Puppeteer, incluyendo inyección de fuentes.
 */
export function generateExportHtml(
    elements: any[], 
    product: any, 
    width: number, 
    height: number
): string {
    // Detectar fuentes únicas
    const fontFamilies = Array.from(new Set(elements.map(el => el.fontFamily || 'Montserrat')))
    const googleFontsImport = fontFamilies
        .map(f => `@import url('https://fonts.googleapis.com/css2?family=${f.replace(/\s+/g, '+')}:wght@400;500;600;700&display=swap');`)
        .join('\n')

    const htmlElements = elements.map((el: any) => {
        const style = [
            `left:${el.x}px`,
            `top:${el.y}px`,
            `width:${el.width}px`,
            `height:${el.height}px`,
            `font-size:${el.fontSize || 14}px`,
            `font-weight:${el.fontWeight || 'normal'}`,
            `font-style:${el.fontStyle || 'normal'}`,
            `text-align:${el.textAlign || 'left'}`,
            `font-family:'${el.fontFamily || 'Montserrat'}', sans-serif`,
            `color:${el.color || '#000'}`,
            `background-color:${el.backgroundColor || 'transparent'}`,
            `line-height:1.2`,
            `display:flex`,
            `align-items:center`,
            `justify-content:${el.textAlign === 'right' ? 'flex-end' : el.textAlign === 'center' ? 'center' : 'flex-start'}`,
            `overflow:hidden`
        ].join(';')

        if (el.type === 'barcode') {
            return `<div class="el" style="${style};background:#000;color:#fff;font-family:monospace;font-size:10px;">|||| ${product.code} ||||</div>`
        }

        if (el.type === 'dashed_line') {
            const borderStyle = el.borderStyle || 'solid'
            const borderWidth = el.borderWidth || 2
            const borderColor = el.color || '#334155'
            return `<div class="el" style="${style};border-bottom:${borderWidth}px ${borderStyle} ${borderColor};height:0;"></div>`
        }

        if (el.type === 'image') {
            const src = el.resolvedSrc || ''
            if (!src) return `<div class="el" style="${style};border:1px dashed #ccc;color:#ccc;font-size:10px;">[Imagen no disponible]</div>`
            return `<div class="el" style="${style}"><img src="${src}" style="width:100%;height:100%;object-fit:contain;" /></div>`
        }

        // dynamic_image: conditional icon with optional caption
        // If icon doesn't apply for this product (resolvedSrc is null), render nothing (no gap)
        if (el.type === 'dynamic_image') {
            const src = el.resolvedSrc || null
            if (!src) return '' // Icon doesn't apply — render empty string (no element in PDF)
            const rawCaption = el.caption || ''
            // Support both HTML captions (from CaptionEditor) and plain text with \n (legacy)
            const captionHtml = rawCaption.includes('<')
                ? rawCaption
                : rawCaption.replace(/\n/g, '<br/>')
            // All typography (size, weight, line-height, alignment) is embedded in the HTML
            const captionBlock = captionHtml.trim()
                ? `<div style="width:100%;">${captionHtml}</div>`
                : ''
            return `<div class="el" style="${style};flex-direction:column;align-items:center;justify-content:flex-end;padding:1px;">` +
                `<img src="${src}" style="flex:1;max-width:100%;object-fit:contain;" />` +
                `${captionBlock}` +
                `</div>`
        }

        // Para texto y dynamic_text
        let content = el.content || ''
        return `<div class="el" style="${style}"><div style="width:100%;">${content}</div></div>`
    }).join('')

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        ${googleFontsImport}
        body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; }
        .canvas { 
            position: relative; 
            width: ${width}px; 
            height: ${height}px; 
            overflow: hidden; 
            background: white;
        }
        .el { position: absolute; box-sizing: border-box; }
        /* Strip all editor-only decorations for clean export */
        .technical-variable { text-decoration: none !important; outline: none !important; border: none !important; background: none !important; }
        img { outline: none !important; border: none !important; }
    </style>
</head>
<body>
    <div class="canvas">
        ${htmlElements}
    </div>
</body>
</html>`
}
