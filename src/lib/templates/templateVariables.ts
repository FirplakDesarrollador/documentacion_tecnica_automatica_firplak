export type TemplateElementLike = {
    type?: string
    dataField?: string | null
    content?: string | null
    required?: boolean | null
}

function uniqueStrings(values: string[]) {
    const out: string[] = []
    const seen = new Set<string>()
    for (const v of values) {
        const s = String(v || '').trim()
        if (!s) continue
        if (seen.has(s)) continue
        seen.add(s)
        out.push(s)
    }
    return out
}

function stripHtml(value: string): string {
    return value.replace(/<[^>]*>/g, '').trim()
}

export function extractTemplateVariablesFromElements(elements: unknown): string[] {
    if (!Array.isArray(elements)) return []

    const vars: string[] = []

    for (const raw of elements as TemplateElementLike[]) {
        const el = (raw || {}) as TemplateElementLike
        const t = String(el.type || '').trim()

        if ((t === 'dynamic_text' || t === 'barcode' || t === 'dynamic_image') && el.dataField) {
            const clean = stripHtml(String(el.dataField))
            if (clean) vars.push(clean)
        }

        // {placeholder} patterns inside text content (strip any accidental HTML)
        if (t === 'text' && typeof el.content === 'string' && el.content.includes('{')) {
            const matches = el.content.match(/\{([^}]+)\}/g) || []
            for (const m of matches) {
                const inner = stripHtml(m.slice(1, -1))
                if (inner) vars.push(inner)
            }
        }
    }

    return uniqueStrings(vars)
}

export function extractTemplateVariables(elementsJson: string | null | undefined): string[] {
    if (!elementsJson) return []
    try {
        const parsed = JSON.parse(elementsJson)
        return extractTemplateVariablesFromElements(parsed)
    } catch {
        return []
    }
}

