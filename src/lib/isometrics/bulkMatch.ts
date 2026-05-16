export type ParsedIsometricDescriptor = {
  designation: string
  product_name: string
  commercial_measure: string
  accessory_text: string
  line: string
  special_label: string
  raw_parts: string[]
}

export type BulkIsometricMatchOptions = {
  includeLineInMatch: boolean
  includeSpecialLabelInMatch: boolean
  forcedDelimiter?: '|' | '-'
  // Optional: data-driven lexicon built from Supabase for the selected family_code(s).
  lexicon?: {
    designations?: string[]
    productNames?: string[]
    specialLabels?: string[]
    lines?: string[]
    accessoryTexts?: string[]
    commercialMeasures?: string[]
  }
}

export function normalizeText(value: unknown): string {
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

export function normalizeProductName(value: unknown): string {
  // Tolerate DB values like "DAVINCI" vs filenames "DA VINCI"
  return normalizeText(value).replace(/\s+/g, '')
}

export function normalizeLine(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (raw === '') return 'NA'
  const n = normalizeText(raw)
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
  const n = normalizeText(raw)
  if (n === 'NA') return 'NA'
  if (n.includes('PUERTA SHAKER')) return 'PUERTA SHAKER'
  return n
}

export function normalizeCommercialMeasure(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (raw === '') return 'NA'
  const upper = raw.toUpperCase()
  if (upper === 'NA' || upper === 'N/A' || upper === 'NONE' || upper === 'NULL') return 'NA'

  const compact = upper.replace(/,/g, '.').replace(/\s+/g, '').replace(/CM/g, '')
  // Allow 1D measures used by kitchen families (e.g. "120CM" -> "120")
  if (/^\d+(?:\.\d+)?$/.test(compact)) return compact
  const m = compact.match(/^(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)(?:X(\d+(?:\.\d+)?))?$/)
  if (m) {
    const a = m[1]
    const b = m[2]
    const c = m[3]
    return c ? `${a}X${b}X${c}` : `${a}X${b}`
  }
  return normalizeText(raw)
}

export function extractWidthFromCommercialMeasure(value: unknown): string {
  const n = normalizeCommercialMeasure(value)
  if (!n || n === 'NA') return 'NA'
  const idx = n.indexOf('X')
  if (idx === -1) return n
  return n.slice(0, idx)
}

export function isOneDimensionalMeasure(value: unknown): boolean {
  const n = normalizeCommercialMeasure(value)
  if (!n || n === 'NA') return false
  return !n.includes('X') && /^\d+(?:\.\d+)?$/.test(n)
}

function pickMeasureFromLexicon(haystack: string, measures?: string[]): string | null {
  if (!measures || measures.length === 0) return null
  const hCompact = String(haystack || '').toUpperCase().replace(/\s+/g, '').replace(/CM/g, '')
  if (!hCompact) return null

  const normalized = Array.from(
    new Map(
      measures
        .map(m => String(m || '').trim())
        .filter(Boolean)
        .map(raw => [normalizeCommercialMeasure(raw), raw] as const)
        .filter(([norm]) => norm && norm !== 'NA')
    ).entries()
  )
    .map(([norm, raw]) => ({ norm, raw, len: norm.length }))
    .sort((a, b) => b.len - a.len)

  // Prefer measures that appear earlier in the filename when multiple are present.
  // This prevents the "2nd measure" (module size) from overriding the main product measure.
  const candidates: Array<{ norm: string; raw: string; len: number; idx: number }> = []
  for (const m of normalized) {
    const idx = hCompact.indexOf(m.norm)
    if (idx !== -1) candidates.push({ ...m, idx })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.idx - b.idx || b.len - a.len)
  return candidates[0]!.raw
  return null
}

function buildMeasureRegexFromNormalized(normalizedMeasure: string) {
  const m = normalizeCommercialMeasure(normalizedMeasure)
  if (!m || m === 'NA') return null
  // Turn "210X60" into a tolerant pattern that allows spaces and optional CM.
  const body = m
    .split('')
    .map(ch => {
      if (ch === 'X') return '\\s*[Xx]\\s*'
      if (ch === '.') return '[\\.,]'
      // digits only (commercial measures should be numeric + X/.)
      return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')

  // Try to ensure we don't match part of a larger number.
  return new RegExp(`(^|[^0-9])(${body})(?:\\s*CM)?($|[^0-9])`, 'i')
}

export function normalizeAccessory(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (raw === '') return 'NA'
  const n = normalizeText(raw)
  if (n === 'NA') return 'NA'
  if (n.includes('MANIJA NEGRA 128')) return 'MANIJA NEGRA 128'
  if (n.includes('MANIJA NEGRA 520')) return 'MANIJA NEGRA 520'
  // "SIN MANIJA(S)" usually means NA, but keep extra qualifiers like "ALFA".
  if (n.includes('SIN MANIJA')) {
    const keep = n.replace(/\bSIN MANIJAS?\b/g, '').trim()
    return keep && keep !== 'NA' ? `SIN MANIJA ${keep}`.trim() : 'NA'
  }
  if (n.includes('CON MANIJA')) return 'CON MANIJAS'
  if (n.includes('SIN MANIJAS')) {
    const keep = n.replace(/\bSIN MANIJAS\b/g, '').trim()
    return keep && keep !== 'NA' ? `SIN MANIJAS ${keep}`.trim() : 'NA'
  }
  if (n.includes('CON MANIJAS')) return 'CON MANIJAS'
  return n
}

export function isSpecificAccessory(accNorm: string) {
  if (!accNorm || accNorm === 'NA') return false
  if (/\d/.test(accNorm)) return true
  if (accNorm.includes('RFE')) return true
  if (accNorm.includes('MANIJA')) return true
  return false
}

export function normalizeVersionCode(value: unknown) {
  return normalizeText(value)
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
    normalizeText(d.designation),
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
    normalizeText(d.designation),
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
    normalizeText(d.designation),
    normalizeProductName(d.product_name),
    normalizeCommercialMeasure(d.commercial_measure),
    normalizeSpecialLabel(d.special_label),
  ].join('|||')
}

export function buildLooseBaseKey(d: { designation: unknown; product_name: unknown; commercial_measure: unknown }) {
  return [normalizeText(d.designation), normalizeProductName(d.product_name), normalizeCommercialMeasure(d.commercial_measure)].join(
    '|||'
  )
}

function looksLikeMeasure(part: string) {
  const p = part.trim()
  if (p === '') return false
  return /\d+\s*[Xx]\s*\d+/.test(p) || /\bCM\b/i.test(p)
}

function splitPartsAuto(baseName: string, forcedDelimiter?: '|' | '-') {
  const cleaned = baseName.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  if (forcedDelimiter === '|') return cleaned.split('|').map(s => s.trim()).filter(Boolean)
  if (forcedDelimiter === '-') return cleaned.split(/\s-\s/).map(s => s.trim()).filter(Boolean)
  if (cleaned.includes('|')) return cleaned.split('|').map(s => s.trim()).filter(Boolean)
  if (cleaned.includes(' - ')) return cleaned.split(' - ').map(s => s.trim()).filter(Boolean)
  const multiSpace = cleaned.split(/\s{2,}/).map(s => s.trim()).filter(Boolean)
  if (multiSpace.length >= 3) return multiSpace
  return [cleaned]
}

function pickFromLexicon(haystack: string, list: string[] | undefined) {
  if (!list || list.length === 0) return null
  const h = normalizeText(haystack)
  if (!h || h === 'NA') return null
  const phrases = Array.from(
    new Map(
      list
        .map(v => String(v || '').trim())
        .filter(Boolean)
        .flatMap(raw => {
          const out: Array<readonly [string, string]> = [[normalizeText(raw), raw] as const]
          // Plural/singular tolerance for MANIJA(S) in labels/accessories.
          const n = normalizeText(raw)
          if (n.includes('MANIJAS')) out.push([n.replace(/MANIJAS/g, 'MANIJA'), raw] as const)
          if (n.includes('MANIJA')) out.push([n.replace(/MANIJA/g, 'MANIJAS'), raw] as const)
          return out
        })
        .filter(([norm]) => norm && norm !== 'NA')
    ).entries()
  )
    .map(([norm, raw]) => ({ norm, raw, len: norm.length }))
    .sort((a, b) => b.len - a.len)
  for (const p of phrases) {
    if (h.includes(p.norm)) return p.raw
  }
  return null
}

export function parseDescriptorFromBaseName(baseName: string, opts: BulkIsometricMatchOptions): ParsedIsometricDescriptor | null {
  const parts = splitPartsAuto(baseName, opts.forcedDelimiter)
  if (parts.length < 3) {
    const raw = baseName.trim()
    const rawNorm = normalizeText(raw)
    const lexMeasure = pickMeasureFromLexicon(raw, opts.lexicon?.commercialMeasures)

    // 2D measure like "120x55CM"
    const measure2dRe = /(\d+(?:[.,]\d+)?)\s*[Xx]\s*(\d+(?:[.,]\d+)?)(?:\s*CM)?/gi
    const all2d = Array.from(raw.matchAll(measure2dRe))
    const measure2dMatch = all2d.length > 0 ? all2d[all2d.length - 1] : null

    // 1D measure like "120CM" (common in kitchen families)
    const measure1dRe = /\b(\d+(?:[.,]\d+)?)\s*CM\b/gi
    const all1d = Array.from(raw.matchAll(measure1dRe))
    const measure1dMatch = all1d.length > 0 ? all1d[all1d.length - 1] : null

    // When there are multiple measures in the filename (e.g. product size + module size),
    // prefer the lexicon-picked measure for slicing if present.
    const chosen = measure2dMatch || measure1dMatch
    if (!chosen && !lexMeasure) return null

    let measureRaw = lexMeasure || (measure2dMatch ? `${chosen![1]}X${chosen![2]}` : `${chosen![1]}`)
    let before = raw
    let after = ''

    if (chosen) {
      const idx = chosen.index ?? 0
      before = raw.slice(0, idx).trim()
      after = raw.slice(idx + chosen[0].length).trim()
    } else if (lexMeasure) {
      const re = buildMeasureRegexFromNormalized(lexMeasure)
      const mm = re ? raw.match(re) : null
      if (mm && typeof mm.index === 'number') {
        // mm[2] is the actual measure body match.
        const fullIdx = mm.index + mm[1].length
        const fullLen = mm[2].length + (raw.slice(fullIdx + mm[2].length).match(/^\s*CM/i)?.[0]?.length || 0)
        before = raw.slice(0, fullIdx).trim()
        after = raw.slice(fullIdx + fullLen).trim()
        measureRaw = mm[2]
      }
    }
    // If lexMeasure exists and differs from the regex-chosen measure, re-slice using lexMeasure to avoid picking the 2nd measure.
    if (lexMeasure && chosen) {
      const chosenNorm = measure2dMatch ? `${chosen[1]}X${chosen[2]}` : `${chosen[1]}`
      if (normalizeCommercialMeasure(chosenNorm) !== normalizeCommercialMeasure(lexMeasure)) {
        const re = buildMeasureRegexFromNormalized(lexMeasure)
        const mm = re ? raw.match(re) : null
        if (mm && typeof mm.index === 'number') {
          const fullIdx = mm.index + mm[1].length
          const fullLen = mm[2].length + (raw.slice(fullIdx + mm[2].length).match(/^\s*CM/i)?.[0]?.length || 0)
          before = raw.slice(0, fullIdx).trim()
          after = raw.slice(fullIdx + fullLen).trim()
          measureRaw = mm[2]
        }
      }
    }

    const beforeNorm = normalizeText(before)
    let designationGuess = 'NA'
    const designationFromLex = pickFromLexicon(beforeNorm, opts.lexicon?.designations)
    if (designationFromLex) designationGuess = designationFromLex
    else {
      // Minimal generic fallback (non-family-specific)
      if (beforeNorm.includes(' A PISO ') || beforeNorm.endsWith(' A PISO') || beforeNorm.includes(' A PISO')) designationGuess = 'A PISO'
      else if (beforeNorm.includes(' ELEVADO ') || beforeNorm.endsWith(' ELEVADO') || beforeNorm.includes(' ELEVADO')) designationGuess = 'ELEVADO'
      else if (beforeNorm.includes(' SOPORTE Y ESTRUCTURA ')) designationGuess = 'SOPORTE Y ESTRUCTURA'
      else if (beforeNorm.includes(' SOPORTE ')) designationGuess = 'SOPORTE'
    }

    let lineGuess = 'NA'
    const lineFromLex = pickFromLexicon(beforeNorm, opts.lexicon?.lines)
    if (lineFromLex) lineGuess = lineFromLex
    else {
      if (beforeNorm.includes(' CLASS ')) lineGuess = 'CLASS'
      else if (beforeNorm.includes(' LIFE ')) lineGuess = 'LIFE'
      else if (beforeNorm.includes(' ESSENTIAL ')) lineGuess = 'ESSENTIAL'
      else if (beforeNorm.includes(' PRO ')) lineGuess = 'PRO'
    }

    const stop = new Set(['MUEBLE', 'KIT', 'ELEVADO', 'A', 'PISO', 'LVM', 'ECO', 'LIFE', 'CLASS', 'ESSENTIAL', 'PRO'])
    const stopLoose = new Set(['PARA', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'EN', 'CON', 'SIN'])
    const rawTokens = before
      .replace(/_/g, ' ')
      .split(/\s+/)
      .map(t => t.trim())
      .filter(Boolean)
    const candidates = rawTokens.filter(t => !stop.has(normalizeText(t)))
    const productFromLexBefore = pickFromLexicon(beforeNorm, opts.lexicon?.productNames)
    const productFromLexAny = pickFromLexicon(rawNorm, opts.lexicon?.productNames)
    const productFromLex = productFromLexBefore || productFromLexAny
    const productNameGuess =
      productFromLex ||
      (() => {
        // Heuristic: pick the last meaningful token, avoiding family codes like "COC" and filler words.
        const meaningful = candidates.filter(t => {
          const n = normalizeText(t)
          if (!n || n === 'NA') return false
          if (stopLoose.has(n)) return false
          // Avoid short all-caps family markers in filenames (e.g. "COC", "VBAN").
          if (/^[A-Z]{2,6}\d*$/.test(n) && n.length <= 6) return false
          // Avoid generic "COCINA" tokens.
          if (n === 'COCINA') return false
          return true
        })
        if (meaningful.length > 0) return meaningful[meaningful.length - 1]
        return candidates.length > 0 ? candidates[candidates.length - 1] : before
      })()

    // Accessory & special label can appear in different places depending on family naming.
    const accGuess = after || 'NA'
    let specialGuess = 'NA'
    let accessoryGuess = accGuess
    const afterNorm = normalizeText(after)
    const specialFromLexAfter = pickFromLexicon(afterNorm, opts.lexicon?.specialLabels)
    const specialFromLexAny = pickFromLexicon(rawNorm, opts.lexicon?.specialLabels)
    if (specialFromLexAfter) specialGuess = specialFromLexAfter
    else if (specialFromLexAny) specialGuess = specialFromLexAny

    const accFromLexAfter = pickFromLexicon(afterNorm, opts.lexicon?.accessoryTexts)
    const accFromLexAny = pickFromLexicon(rawNorm, opts.lexicon?.accessoryTexts)
    if (accFromLexAfter) accessoryGuess = accFromLexAfter
    else if (accFromLexAny) accessoryGuess = accFromLexAny

    if (afterNorm.includes('PUERTA SHAKER')) {
      specialGuess = 'PUERTA SHAKER'
      accessoryGuess = normalizeText(afterNorm.replace(/PUERTA SHAKER/g, '')) || 'NA'
      if (accessoryGuess === 'NA') accessoryGuess = 'NA'
    }

    const lineFinal = opts.includeLineInMatch ? lineGuess : 'NA'
    const specialFinal = opts.includeSpecialLabelInMatch ? specialGuess : 'NA'

    return {
      designation: designationGuess,
      product_name: productNameGuess,
      commercial_measure: measureRaw,
      accessory_text: accessoryGuess,
      line: lineFinal,
      special_label: specialFinal,
      raw_parts: [raw],
    }
  }

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
    line: opts.includeLineInMatch ? line.trim() : 'NA',
    special_label: opts.includeSpecialLabelInMatch ? special_label.trim() : 'NA',
    raw_parts: parts,
  }
}
