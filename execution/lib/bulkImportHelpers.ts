import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

/**
 * Shared helpers for bulk import CLI scripts (isometrics and product resources).
 * Extracted from execution/bulk_associate_isometrics.ts to be reused by
 * execution/bulk_associate_resources.ts without changing behavior.
 */

export type ParsedDescriptor = {
    designation: string
    product_name: string
    commercial_measure: string
    accessory_text: string
    line: string
    special_label: string
    raw_parts: string[]
}

export type ReferenceRow = {
    id: string
    family_code: string | null
    reference_code: string | null
    designation: string | null
    line: string | null
    special_label: string | null
    product_name: string | null
    commercial_measure: string | null
    accessory_text: string | null
    isometric_asset_id: string | null
    isometric_path: string | null
}

export type VersionRow = {
    id: string
    reference_id: string
    version_code: string
    accessory_text: string | null
    isometric_asset_id: string | null
    isometric_path: string | null
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export function parseArgs(argv: string[]) {
    const flags = new Set<string>()
    const values = new Map<string, string>()

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (!a.startsWith('--')) continue
        const eq = a.indexOf('=')
        if (eq !== -1) {
            const k = a.slice(2, eq)
            const v = a.slice(eq + 1)
            values.set(k, v)
            continue
        }
        const k = a.slice(2)
        const next = argv[i + 1]
        if (next && !next.startsWith('--')) {
            values.set(k, next)
            i++
        } else {
            flags.add(k)
        }
    }

    const getValue = (k: string) => values.get(k)
    const hasFlag = (k: string) => flags.has(k) || values.has(k)

    return { getValue, hasFlag }
}

export function shouldIgnoreFile(baseName: string, ignoreCsv: string | undefined) {
    if (!ignoreCsv) return false
    const n = normalize(baseName)
    const parts = ignoreCsv
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => normalize(s))
    return parts.some(p => p !== '' && p !== 'NA' && n.includes(p))
}

export function normalize(value: unknown): string {
    const s = String(value ?? '').trim()
    if (s === '') return 'NA'
    const upper = s.toUpperCase()
    if (upper === 'NA' || upper === 'N/A' || upper === 'NONE' || upper === 'NULL') return 'NA'
    return upper
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

export function normalizeAccessory(value: unknown): string {
    const raw = String(value ?? '').trim()
    if (raw === '') return 'NA'
    const n = normalize(raw)
    if (n === 'NA') return 'NA'
    // Unify common synonyms coming from filenames.
    // Important: prioritize specific accessories before generic "con/sin manija(s)".
    if (n.includes('MANIJA NEGRA 128')) return 'MANIJA NEGRA 128'
    if (n.includes('MANIJA NEGRA 520')) return 'MANIJA NEGRA 520'
    if (n.includes('SIN MANIJA')) return 'NA'
    if (n.includes('CON MANIJA')) return 'CON MANIJAS'
    if (n.includes('SIN MANIJAS')) return 'NA'
    if (n.includes('CON MANIJAS')) return 'CON MANIJAS'
    return n
}

export function isSpecificAccessory(accNorm: string) {
    // Treat non-NA accessories (especially those with numbers) as "specific".
    if (!accNorm || accNorm === 'NA') return false
    if (/\d/.test(accNorm)) return true
    // Keep these as specific too (they are meaningful variants in DB).
    if (accNorm.includes('RFE')) return true
    if (accNorm.includes('MANIJA')) return true
    return false
}

export function normalizeVersionCode(value: unknown) {
    return normalize(value)
}

export function normalizeProductName(value: unknown): string {
    // Primary goal: tolerate DB values like "DAVINCI" vs filenames "DA VINCI" (or "VANGOGH" vs "VAN GOGH").
    // We remove spaces after normalization to increase match rate for multi-word names.
    return normalize(value).replace(/\s+/g, '')
}

export function normalizeLine(value: unknown): string {
    const raw = String(value ?? '').trim()
    if (raw === '') return 'NA'
    const n = normalize(raw)
    if (n === 'NA') return 'NA'
    if (n.includes('CLASS')) return 'CLASS'
    if (n.includes('LIFE')) return 'LIFE'
    if (n.includes('ESSENTIAL')) return 'ESSENTIAL'
    if (n.includes('PRO')) return 'PRO'
    return n
}

export function normalizeSpecialLabel(value: unknown): string {
    const raw = String(value ?? '').trim()
    if (raw === '') return 'NA'
    const n = normalize(raw)
    if (n === 'NA') return 'NA'
    if (n.includes('PUERTA SHAKER')) return 'PUERTA SHAKER'
    return n
}

export function normalizeCommercialMeasure(value: unknown): string {
    const raw = String(value ?? '').trim()
    if (raw === '') return 'NA'
    const upper = raw.toUpperCase()
    if (upper === 'NA' || upper === 'N/A' || upper === 'NONE' || upper === 'NULL') return 'NA'

    // Canonicalize common patterns like "44.5X43.5CM", "44,5 x 43,5 cm", "63X48"
    const compact = upper
        .replace(/,/g, '.')
        .replace(/\s+/g, '')
        .replace(/CM/g, '')

    const m = compact.match(/^(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)(?:X(\d+(?:\.\d+)?))?$/)
    if (m) {
        const a = m[1]
        const b = m[2]
        const c = m[3]
        return c ? `${a}X${b}X${c}` : `${a}X${b}`
    }

    // Fallback to generic normalization
    return normalize(raw)
}

export function buildExtendedKey(d: {
    designation: unknown
    product_name: unknown
    commercial_measure: unknown
    line: unknown
    special_label: unknown
    accessory_text: unknown
}) {
    return [
        normalize(d.designation),
        normalizeProductName(d.product_name),
        normalizeCommercialMeasure(d.commercial_measure),
        normalizeLine(d.line),
        normalizeSpecialLabel(d.special_label),
        normalizeAccessory(d.accessory_text),
    ].join('|||')
}

export function buildExtendedBaseKey(d: {
    designation: unknown
    product_name: unknown
    commercial_measure: unknown
    line: unknown
    special_label: unknown
}) {
    return [
        normalize(d.designation),
        normalizeProductName(d.product_name),
        normalizeCommercialMeasure(d.commercial_measure),
        normalizeLine(d.line),
        normalizeSpecialLabel(d.special_label),
    ].join('|||')
}

export function buildSpecialLabelBaseKey(d: {
    designation: unknown
    product_name: unknown
    commercial_measure: unknown
    special_label: unknown
}) {
    return [
        normalize(d.designation),
        normalizeProductName(d.product_name),
        normalizeCommercialMeasure(d.commercial_measure),
        normalizeSpecialLabel(d.special_label),
    ].join('|||')
}

export function buildLooseBaseKey(d: { designation: unknown; product_name: unknown; commercial_measure: unknown }) {
    return [
        normalize(d.designation),
        normalizeProductName(d.product_name),
        normalizeCommercialMeasure(d.commercial_measure),
    ].join('|||')
}

export function looksLikeMeasure(part: string) {
    const p = part.trim()
    if (p === '') return false
    // Typical: 63X48, 60 x 47, 90X47 CM
    return /\d+\s*[Xx]\s*\d+/.test(p) || /\bCM\b/i.test(p)
}

export function splitPartsAuto(baseName: string, forcedDelimiter?: string): string[] {
    const cleaned = baseName
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const delim = (forcedDelimiter || '').trim()
    if (delim === '|') return cleaned.split('|').map(s => s.trim()).filter(Boolean)
    if (delim === '-') return cleaned.split(/\s-\s/).map(s => s.trim()).filter(Boolean)

    if (cleaned.includes('|')) return cleaned.split('|').map(s => s.trim()).filter(Boolean)
    if (cleaned.includes(' - ')) return cleaned.split(' - ').map(s => s.trim()).filter(Boolean)

    // Fallback: try multiple spaces as separator (rare but helpful)
    const multiSpace = cleaned.split(/\s{2,}/).map(s => s.trim()).filter(Boolean)
    if (multiSpace.length >= 3) return multiSpace

    return [cleaned]
}

export function parseDescriptorFromBaseName(baseName: string, forcedDelimiter?: string): ParsedDescriptor | null {
    const parts = splitPartsAuto(baseName, forcedDelimiter)
    if (parts.length < 3) {
        // Fallback: free-text names like "Mueble a piso Básico LVM 40X30 con manijas"
        // Extract measure and accessory around it, and treat the remainder as product_name (+ optional designation token).
        const raw = baseName.trim()
        const measureRe = /(\d+(?:[.,]\d+)?)\s*[Xx]\s*(\d+(?:[.,]\d+)?)(?:\s*CM)?/gi
        const all = Array.from(raw.matchAll(measureRe))
        const measureMatch = all.length > 0 ? all[all.length - 1] : null
        if (!measureMatch) return null

        const measureRaw = `${measureMatch[1]}X${measureMatch[2]}`
        const idx = measureMatch.index ?? 0
        const before = raw.slice(0, idx).trim()
        const after = raw.slice(idx + measureMatch[0].length).trim()

        // Parse designation from common Spanish naming patterns.
        const beforeNorm = normalize(before)
        let designationGuess = 'NA'
        if (beforeNorm.includes(' A PISO')) {
            designationGuess = 'A PISO'
        } else if (beforeNorm.includes(' ELEVADO')) {
            designationGuess = 'ELEVADO'
        } else if (beforeNorm.includes(' SOPORTE Y ESTRUCTURA ')) {
            designationGuess = 'SOPORTE Y ESTRUCTURA'
        } else if (beforeNorm.includes(' SOPORTE ')) {
            designationGuess = 'SOPORTE'
        }

        // Parse line (CLASS/LIFE/ESSENTIAL/PRO) from filename.
        let lineGuess = 'NA'
        if (beforeNorm.includes(' CLASS ')) lineGuess = 'CLASS'
        else if (beforeNorm.includes(' LIFE ')) lineGuess = 'LIFE'
        else if (beforeNorm.includes(' ESSENTIAL ')) lineGuess = 'ESSENTIAL'
        else if (beforeNorm.includes(' PRO ')) lineGuess = 'PRO'

        // Product name guess: remove generic tokens and keep the most "brand-like" word.
        // Examples:
        // - "Mueble a piso Básico LVM" => "BASICO"
        // - "Mueble a piso Vega LVM" => "VEGA"
        // - "Mueble elevado Calder LVM" => "CALDER"
        // - "Mueble elevado Macao class LVM" => "MACAO"
        const stop = new Set(['MUEBLE', 'KIT', 'ELEVADO', 'A', 'PISO', 'LVM', 'ECO', 'LIFE', 'CLASS'])
        const rawTokens = before
            .replace(/_/g, ' ')
            .split(/\s+/)
            .map(t => t.trim())
            .filter(Boolean)
        const candidateTokens = rawTokens
            .map(t => t.replace(/[^\p{L}\p{N}]+/gu, ''))
            .filter(Boolean)
            .filter(t => !stop.has(normalize(t)))
            .filter(t => !looksLikeMeasure(t))
            .filter(t => !/^\d+(?:\.\d+)?$/.test(t))
        let productNameGuess = candidateTokens.length > 0 ? candidateTokens[candidateTokens.length - 1] : before
        // Multi-word product names that must stay together
        if (beforeNorm.includes('DA VINCI')) productNameGuess = 'DA VINCI'
        if (beforeNorm.includes('VAN GOGH')) productNameGuess = 'VAN GOGH'

        // Accessory mapping: make filename terms align with DB `accessory_text`.
        const afterNorm = normalize(after)
        let specialLabelGuess = 'NA'
        if (afterNorm.includes('PUERTA SHAKER')) specialLabelGuess = 'PUERTA SHAKER'

        let accessoryRaw = after || 'NA'
        // Prioritize specific accessories before generic "con/sin manija(s)".
        if (afterNorm.includes('MANIJA NEGRA 128')) accessoryRaw = 'MANIJA NEGRA 128'
        else if (afterNorm.includes('MANIJA NEGRA 520')) accessoryRaw = 'MANIJA NEGRA 520'
        else if (afterNorm.includes('SIN MANIJA')) accessoryRaw = 'NA'
        else if (afterNorm.includes('CON MANIJA')) accessoryRaw = 'CON MANIJAS'
        else if (afterNorm.includes('RFE CIERRE LENTO')) accessoryRaw = 'RFE CIERRE LENTO'
        else if (afterNorm === '' || afterNorm === 'NA') accessoryRaw = 'NA'
        // If after is purely a special label phrase, keep accessory as NA.
        if (specialLabelGuess !== 'NA' && normalizeSpecialLabel(after) === normalizeSpecialLabel(specialLabelGuess)) {
            accessoryRaw = 'NA'
        }

        return {
            designation: designationGuess,
            product_name: productNameGuess,
            commercial_measure: measureRaw,
            accessory_text: accessoryRaw,
            line: lineGuess,
            special_label: specialLabelGuess,
            raw_parts: [before, measureRaw, after],
        }
    }

    // Preferred order (user-stated): designation + name + measure + accessory
    // But we try to locate the measure part by heuristic to increase tolerance.
    let designation = parts[0] ?? ''
    let product_name = parts[1] ?? ''
    let commercial_measure = parts[2] ?? ''
    let accessory_text = parts[3] ?? 'NA'
    let line = parts[4] ?? 'NA'
    let special_label = parts[5] ?? 'NA'

    const measureIdx = parts.findIndex(p => looksLikeMeasure(p))
    if (measureIdx !== -1) {
        commercial_measure = parts[measureIdx]
        const remaining = parts.filter((_, idx) => idx !== measureIdx)
        designation = remaining[0] ?? designation
        product_name = remaining[1] ?? product_name
        accessory_text = remaining[2] ?? accessory_text
        line = remaining[3] ?? line
        special_label = remaining[4] ?? special_label
    }

    return {
        designation: designation.trim(),
        product_name: product_name.trim(),
        commercial_measure: commercial_measure.trim(),
        accessory_text: accessory_text.trim(),
        line: line.trim(),
        special_label: special_label.trim(),
        raw_parts: parts,
    }
}

export function listFiles(dir: string, recursive: boolean): string[] {
    const out: string[] = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) {
            if (recursive) out.push(...listFiles(full, recursive))
            continue
        }
        if (e.isFile()) out.push(full)
    }
    return out
}

export function sha256Hex(buf: Buffer) {
    return crypto.createHash('sha256').update(buf).digest('hex')
}

export function csvEscape(value: unknown) {
    const s = String(value ?? '')
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`
    }
    return s
}

export function guessContentType(extLower: string) {
    if (extLower === '.pdf') return 'application/pdf'
    if (extLower === '.svg') return 'image/svg+xml'
    if (extLower === '.png') return 'image/png'
    if (extLower === '.jpg' || extLower === '.jpeg') return 'image/jpeg'
    return 'application/octet-stream'
}