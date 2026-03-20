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
            
            // 1. Si es un UUID o marcador que está en el mapa
            if (assetMap[finalSrc]) {
                finalSrc = assetMap[finalSrc]
            } 
            // 2. Si es el marcador especial de logo y no se resolvió arriba (fallback)
            else if (finalSrc === 'logo_empresa' && assetMap['logo_empresa']) {
                finalSrc = assetMap['logo_empresa']
            }
            // 3. Si es el placeholder del isométrico
            else if (finalSrc === 'isometrico_placeholder') {
                finalSrc = product.isometric_path || ''
            }
            // 4. Si es un dataField (como isometric_path directamente)
            else if (el.dataField === 'isometric_path') {
                finalSrc = product.isometric_path || ''
            }

            return { ...el, resolvedSrc: ensureAbsolute(finalSrc) }
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
            // Asegurar que la URL sea absoluta si viene de storage local (esto depende de la config de Supabase)
            return `<div class="el" style="${style}"><img src="${src}" style="width:100%;height:100%;object-fit:contain;" /></div>`
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
    </style>
</head>
<body>
    <div class="canvas">
        ${htmlElements}
    </div>
</body>
</html>`
}
