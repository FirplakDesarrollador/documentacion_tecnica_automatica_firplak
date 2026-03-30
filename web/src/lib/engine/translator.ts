/**
 * Firplak Adaptive Translation Engine v2.0
 * ─────────────────────────────────────────
 * Arquitectura: Payload-Driven (recibe objeto producto con 15 campos nativos)
 * Configuración: Lee naming_config_en desde Supabase para determinar el comportamiento
 *                de cada variable.
 * 
 * BehaviorType:
 *   translate_and_emit   → Traducir vía glosario y emitir en el nombre final.
 *   classify_and_resolve → Usar para construir resolved_type; NO emitir directamente.
 *   conditional_emit     → Emitir solo si el valor existe y no genera redundancia.
 *
 * fallback_strategy:
 *   preserve             → Si no hay traducción en glosario, conservar el valor original.
 *   translate            → Si no hay traducción en glosario, marcar como faltante (bloquear Bulk Update).
 *   conditional_emit     → Lógica de emisión condicional definida por contexto.
 */

import { createClient } from '@supabase/supabase-js'

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ProductPayload {
    id?: string
    code?: string
    product_type?: string | null
    designation?: string | null
    cabinet_name?: string | null
    line?: string | null
    use_destination?: string | null
    commercial_measure?: string | null
    accessory_text?: string | null
    canto_puertas?: string | null
    door_color_text?: string | null
    rh?: string | null
    carb2?: string | null
    assembled_flag?: boolean | null
    special_label?: string | null
    private_label_client_name?: string | null
    armado_con_lvm?: string | null
    // Legacy fields (for backwards compat)
    final_name_es?: string | null
    color_name?: string | null
}

export interface TranslationResult {
    translatedName: string
    missingTerms: string[]
    isValid: boolean
    errorReason: string
    warnings: string[]
}

interface FieldConfig {
    variable_id: string
    order_index: number
    emit: boolean
    behavior: 'translate_and_emit' | 'classify_and_resolve' | 'conditional_emit'
    drop_if_resolved: boolean
    resolved_by: string | null
    fallback_strategy: 'preserve' | 'translate' | 'conditional_emit'
    group_key: string | null
    notes: string | null
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let cachedGlossary: Record<string, string> | null = null
let cachedConfig: Record<string, FieldConfig> | null = null
let lastGlossaryFetch = 0
let lastConfigFetch = 0

const CACHE_TTL_MS = 60_000

// ─── Supabase ─────────────────────────────────────────────────────────────────

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
        || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

async function loadGlossary(): Promise<Record<string, string>> {
    if (cachedGlossary && Date.now() - lastGlossaryFetch < CACHE_TTL_MS) return cachedGlossary
    const sb = getSupabase()
    const { data, error } = await sb
        .from('glossary')
        .select('term_es, term_en')
        .eq('active', true)
        .order('priority', { ascending: false })
    if (error) throw new Error('Glossary load error: ' + error.message)
    const g: Record<string, string> = {}
    data?.forEach((r: any) => { g[r.term_es.toUpperCase().trim()] = r.term_en.toUpperCase().trim() })
    cachedGlossary = g
    lastGlossaryFetch = Date.now()
    return g
}

async function loadConfig(targetEntity: string): Promise<Record<string, FieldConfig>> {
    if (cachedConfig && Date.now() - lastConfigFetch < CACHE_TTL_MS) return cachedConfig
    const sb = getSupabase()
    const { data, error } = await sb
        .from('naming_config_en')
        .select('*')
        .eq('target_entity', targetEntity)
        .order('order_index', { ascending: true })
    if (error) throw new Error('Config load error: ' + error.message)
    const cfg: Record<string, FieldConfig> = {}
    data?.forEach((r: any) => { cfg[r.variable_id] = r as FieldConfig })
    cachedConfig = cfg
    lastConfigFetch = Date.now()
    return cfg
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeTechnicalText(val: string): string {
    if (!val) return ''
    const upper = val.toUpperCase().trim()
    
    // Conservative rule: only normalize common units with space if they look like measures
    // e.g. "2 MM" -> "2MM", but not touching "LADO A" or codes.
    const normalized = upper
        .replace(/(\d+(?:\/\d+)?)\s+(MM|IN|CM|PULG)\b/g, '$1$2')
        .replace(/\s+/g, ' ')
        .trim()

    // Specific SAP canto normalization
    if (normalized.includes('CANTO')) {
        return normalized
            .replace(/CANTO\s*(\d+MM)/g, 'CANTO $1')
            .replace(/CANTO(\d+MM)/g, 'CANTO $1')
    }

    return normalized
}

const PLACEHOLDERS = ['NA', 'N/A', 'NULL', 'NONE', 'VACÍO', '-', '.', 'UNDEFINED']

function isPlaceholder(val: string): boolean {
    if (!val) return true
    const clean = val.toUpperCase().trim()
    return PLACEHOLDERS.includes(clean) || clean === ''
}

function isSymbolOnly(val: string): boolean {
    // Returns true if name is just symbols like "+", "&", "*", etc.
    return /^[^a-zA-Z0-9]+$/.test(val.trim())
}

/*
## Resultados del Refinamiento Integral (ES + EN)

### 1. Gobernanza y Sincronización Estructural
- **Detección Activa**: El sistema ahora detecta si el `Orden ES` cambió y alerta en `Orden EN` con un banner rojo detallado.
- **Resincronización Inteligente**: Botón "Resincronizar con Orden ES" que añade variables nuevas y elimina obsoletas sin perder la configuración previa.
- **Bloqueo de Seguridad**: No se permite realizar `Bulk Update` si existe desincronización estructural, asegurando nombres coherentes en ambos idiomas.

### 2. Inteligencia de Bloques Técnicos (`accessory_text`)
- **Resolución de Herrajes**: El motor ya no fragmenta rieles por palabras. Resuelve bloques completos:
  - `RIEL FULL EXTENSION CIERRE LENTO` -> `SLIDES FULL EXTENSION SOFT CLOSE`
  - `RFE CIERRE LENTO` -> `SFE SOFT CLOSE`
- **Manejo del Conector "+"**: El signo `+` se preserva como conector lógico y ya no se solicita en el glosario.
- **Filtrado de Ruido**: Se ha blindado el motor contra fragmentos atómicos (como la "R" suelta), eliminando peticiones de glosario absurdas.

### 3. Experiencia de Usuario y Glosario
- **Persistencia Corregida**: El error 500 al guardar términos de glosario inline ha sido resuelto (eliminada dependencia de `updated_at`).
- **Ciclo de Revalidación Automático**: Al guardar términos en la Vista Previa, el sistema refresca automáticamente los resultados y actualiza los bloqueos de navegación.

## Verificación Visual

![Alerta de Desincronización y Traducción Técnica](file:///c:/Users/oswaldo.rivera/.gemini/antigravity/brain/1dab293e-83e7-45d4-ab1b-de2654f2136a/nomenclature_sync_verification_1774633546231.webp)
> Demostración del banner de alerta por desincronización y la correcta traducción de bloques técnicos compuestos con el conector '+'.

## Estado Final: LISTO PARA PRODUCCIÓN
El módulo de nomenclatura es ahora **determinista, bilingüe y sincronizado**.
*/
const INTERNAL_GLOSSARY: Record<string, string> = {
    'MANIJA': 'HANDLE',
    'PUERTA': 'DOOR',
    'CANTO': 'EDGE BAND',
    'NEGRO': 'BLACK',
    'NEGRA': 'BLACK',
    'BLANCO': 'WHITE',
    'BLANCA': 'WHITE',
    'GRIS': 'GREY',
    'CAFE': 'BROWN',
    'MADERA': 'WOOD',
    'SOPORTE': 'VANITY SUPPORT',
    'CUBO': 'VANITY CUBE',
    'KIT': 'KIT',
    'BASE': 'BASE',
    'PISO': 'FLOOR',
    'ALTURA': 'HEIGHT',
    'FONDO': 'DEPTH',
    'ANCHO': 'WIDTH',
    'LARGO': 'LONG',
    'LARGA': 'LONG',
    'CORTO': 'SHORT',
    'CORTA': 'SHORT',
    'GRANDE': 'LARGE',
    'PEQUEÑO': 'SMALL',
    'PEQUEÑA': 'SMALL',
    'MATE': 'MATTE',
    'BRILLANTE': 'GLOSSY',
    'VESSEL': 'VESSEL',
    'INTEL': 'INTEL',
    // Herrajes y rieles (bloques comunes)
    'RIEL': 'SLIDES',
    'RIEL FULL EXTENSION': 'SLIDES FULL EXTENSION',
    'RFE': 'SFE',
    'R OCULTO': 'S CONCEALED',
    'RIEL OCULTO': 'SLIDES CONCEALED',
    'CIERRE LENTO': 'SOFT CLOSE',
    'CIERRE LENTO OCULTO': 'CONCEALED SOFT CLOSE',
    'FULL EXTENSION': 'FULL EXTENSION',
    // Bloques técnicos compuestos requeridos
    'RIEL FULL EXTENSION CIERRE LENTO': 'SLIDES FULL EXTENSION SOFT CLOSE',
    'RFE CIERRE LENTO': 'SFE SOFT CLOSE',
    'RIEL OCULTO CIERRE LENTO': 'SLIDES CONCEALED SOFT CLOSE',
    'R OCULTO CIERRE LENTO': 'S CONCEALED SOFT CLOSE',
}

const COLORS = ['BLACK', 'WHITE', 'GREY', 'BROWN', 'RED', 'BLUE', 'GREEN', 'YELLOW', 'CHROME', 'SATIN', 'MATTE', 'GLOSSY']

// ─── Dimension Converter ──────────────────────────────────────────────────────

function convertMeasureToPulgadas(value: string): string | null {
    if (!value) return null
    // Soporta: 60X21.5, 60X21,5, 60X21.5CM, 60X21,5 CM, etc.
    // Ignora unidades al final para la captura, pero captura los números decimales con coma o punto.
    const clean = value.trim().toUpperCase().replace('CM', '').replace('PULG', '').trim()
    const match = clean.match(/^(\d+(?:[.,]\d+)?)\s*[Xx]\s*(\d+(?:[.,]\d+)?)$/)
    if (!match) return null
    
    // Normalizar coma a punto para parseFloat
    const valW = match[1].replace(',', '.')
    const valH = match[2].replace(',', '.')
    
    const w = Math.round(parseFloat(valW) / 2.54)
    const h = Math.round(parseFloat(valH) / 2.54)
    return `${w}INX${h}IN`
}

// ─── Resolved Type Builder ────────────────────────────────────────────────────
// Combines product_type + designation + use_destination → commercial EN type block.

const RESOLVED_TYPE_MAP: Record<string, string> = {
    'MUEBLE|ELEVADO|LAVAMANOS':   'WALL MOUNTED VANITY',
    'MUEBLE|ELEVADO|LAVAMANOS DOBLE': 'WALL MOUNTED DOUBLE VANITY',
    'MUEBLE|PISO|LAVAMANOS':      'FREESTANDING VANITY',
    'MUEBLE|CUBO|LAVAMANOS':      'VANITY CUBE',
    'MUEBLE|CUBO-CAJON|LAVAMANOS': 'VANITY CUBE DRAWER',
    'MUEBLE|SOPORTE|LAVAMANOS':   'VANITY SUPPORT',
    'MUEBLE|SOPORTE Y ESTRUCTURA|LAVAMANOS': 'VANITY SUPPORT AND STRUCTURE',
    'MUEBLE|SOPORTE Y ESTRUCTURA CON ENTREPAÑO|LAVAMANOS': 'VANITY SUPPORT AND STRUCTURE WITH SHELF',
    'MUEBLE|ELEVADO|COCINA':      'WALL CABINET',
    'MUEBLE|PISO|COCINA':         'BASE CABINET',
    'MUEBLE|EMPOTRADO|LAVAMANOS': 'BUILT-IN VANITY',
    'TAPA||LAVAMANOS':            'VANITY TOP',
    'TAPA|VESSEL|LAVAMANOS':      'VESSEL VANITY TOP',
    'TAPA|INTEL|LAVAMANOS':       'INTEL VANITY TOP',
    // Fallbacks con solo tipo + designación (cuando no hay destino explícito)
    'MUEBLE|CUBO':                'VANITY CUBE',
    'MUEBLE|CUBO-CAJON':          'VANITY CUBE DRAWER',
    'MUEBLE|SOPORTE':             'VANITY SUPPORT',
    'MUEBLE|ELEVADO':             'WALL CABINET',
    'MUEBLE|PISO':                'BASE CABINET',
    'MUEBLE|EMPOTRADO':           'BUILT-IN CABINET',
    'PLATAFORMA||':               'PLATFORM',
}

function resolveTypeBlock(product: ProductPayload): string {
    const clean = (s: string | null | undefined) => {
        const n = normalizeTechnicalText(s || '')
        return n.replace(/\b(PARA|A|DE)\b/g, '').replace(/\s+/g, ' ').trim()
    }
    
    let pType = clean(product.product_type || 'MUEBLE')
    const desig = clean(product.designation || '')
    const dest  = clean(product.use_destination || '')

    // Use-case specific type overrides (Priority)
    if (pType === 'TAPA') {
        if (desig.includes('VESSEL')) return 'VESSEL VANITY TOP'
        if (desig.includes('INTEL')) return 'INTEL VANITY TOP'
        return 'VANITY TOP'
    }

    const keys = [
        `${pType}|${desig}|${dest}`,
        `${pType}|${dest}|${desig}`,
        `${pType}|${desig}`,
        `${pType}|${dest}`
    ]

    for (const key of keys) {
        if (RESOLVED_TYPE_MAP[key]) return RESOLVED_TYPE_MAP[key]
    }
    
    // Last resort fallback based on destination context
    if (dest.includes('LAVAMANOS') || product.commercial_measure?.includes('LVM') || product.special_label?.includes('LVM')) {
        return 'VANITY'
    }
    if (dest.includes('COCINA')) return 'KITCHEN CABINET'
    
    // Absolute generic fallback
    return pType === 'MUEBLE' ? 'CABINET' : pType
}

// ─── Field Translator ─────────────────────────────────────────────────────────
// Returns { value, isMissing } for each field.

function translateField(
    rawValue: string,
    fieldConfig: FieldConfig,
    glossary: Record<string, string>,
    missingTerms: string[],
    warnings: string[]
): string {
    const upper = normalizeTechnicalText(rawValue)
    if (isPlaceholder(upper)) return ''

    // ── Compound Handle (Split by +) ──────────────────────────────────────────
    if (upper.includes('+')) {
        // Remove spaces around the connector for consistent splitting
        const normalizedSeparator = upper.replace(/\s*\+\s*/g, '+')
        const parts = normalizedSeparator.split('+').map(p => p.trim())
        const translatedParts = parts.map(p => translateField(p, fieldConfig, glossary, missingTerms, warnings))
        return translatedParts.filter(p => !isPlaceholder(p)).join(' + ')
    }

    // ── Pre-check: If fallback is preserve ────────────────────────────────────
    if (fieldConfig.fallback_strategy === 'preserve') {
        const fullGlossary = { ...glossary, ...INTERNAL_GLOSSARY }
        const direct = fullGlossary[upper]
        if (direct) {
            if (isPlaceholder(direct)) return ''
            return direct
        }
        // FAIL-SAFE: If the full phrase 'preserve' is not in glossary, 
        // we DO NOT return the Spanish 'upper' yet. We allow the sliding window
        // below to try to translate the parts. This fixes "MANIJA NEGRA 128".
    }

    // ── Combined Glossary (Internal has precedence for technical precision) ──
    const fullGlossary = { ...glossary, ...INTERNAL_GLOSSARY }
    if (fullGlossary[upper]) return fullGlossary[upper]
    
    // Multi-word sliding window (up to 4 tokens) - Greedy Approach
    const tokens = upper.split(/\s+/)
    let translatedTokens: string[] = []
    let i = 0
    
    while (i < tokens.length) {
        let found = false
        // Try longest phrase first (Greedy Match)
        for (let len = Math.min(5, tokens.length - i); len >= 1; len--) {
            const phrase = tokens.slice(i, i + len).join(' ')
            if (fullGlossary[phrase]) {
                translatedTokens.push(fullGlossary[phrase])
                i += len
                found = true
                break
            }
        }
        
        if (!found) {
            const tok = tokens[i]
            // Filter Symbols and Atomic leftovers (Single letters like 'R' unless they represent something)
            if (isPlaceholder(tok) || isSymbolOnly(tok)) { 
                i++
                continue 
            }

            // Atomic Single Letter Check (e.g. "R" that didn't match a phrase)
            // Skip from missingTerms if it's a single letter without semantic value in internal glossary
            const isSingleLetter = /^[A-Z]$/.test(tok)
            const isInternal = !!INTERNAL_GLOSSARY[tok]

            // Tokens seguros: números puros, números con unidad basica, o strings de medida
            const isSafe = /^\d+(?:\.\d+)?(MM|IN|CM)?$/.test(tok) || /^(\d+(?:\.\d+)?)\s*[Xx]\s*(\d+(?:\.\d+)?)$/.test(tok)
            
            if (!isSafe && !isInternal && !isSingleLetter && !missingTerms.includes(tok)) {
                missingTerms.push(tok)
            }
            
            // Emit only if it's not a single letter noise (or if it's internal)
            if (isInternal) {
                translatedTokens.push(INTERNAL_GLOSSARY[tok])
            } else if (!isSingleLetter || isSafe) {
                translatedTokens.push(tok)
            }
            
            i++
        }
    }

    // ── Technical Flip Heuristic: Color and Thickness (Post-processing) ────────────────
    // 1. [NOUN, COLOR] -> [COLOR, NOUN]
    // 2. [EDGE BAND, THICKNESS] -> [THICKNESS, EDGE BAND]
    const finalTokens: string[] = []
    const technicalBlocks = ['SLIDES', 'SFE', 'RIEL', 'CONCEALED']

    for (let k = 0; k < translatedTokens.length; k++) {
        const current = translatedTokens[k]
        const next = translatedTokens[k+1]
        
        const isTechnicalCurrent = technicalBlocks.some(b => current.includes(b))

        // Flip Color: [Non-Technical, COLOR] -> [COLOR, Non-Technical]
        if (next && COLORS.includes(next) && !COLORS.includes(current) && !/^\d+/.test(current) && !isTechnicalCurrent) {
            finalTokens.push(next)
            finalTokens.push(current)
            k++ 
        } 
        // Flip Edge Band Thickness: [EDGE BAND, 2MM] -> [2MM, EDGE BAND]
        else if (current === 'EDGE BAND' && next && /^\d+(?:\.\d+)?MM$/.test(next)) {
            finalTokens.push(next)
            finalTokens.push(current)
            k++
        }
        else {
            finalTokens.push(current)
        }
    }

    return finalTokens.join(' ').trim()
}

// ─── RH special handler ───────────────────────────────────────────────────────

function translateRH(value: string | null | undefined): string | null {
    if (isPlaceholder(value || '')) return null
    const u = normalizeTechnicalText(value!)
    if (u === 'RH') return 'MR'
    return u
}

// ─── Validation Layer ─────────────────────────────────────────────────────────

const FORBIDDEN_TERMS = ['FURNITURE', 'PRODUCT', 'WASHBASIN FURNITURE', 'FLOOR STANDING', 'LVM', ' RH ']

function validateResult(name: string, missingTerms: string[], warnings: string[]): { isValid: boolean; errorReason: string } {
    if (!name) return { isValid: false, errorReason: 'Nombre en inglés vacío.' }
    if (name !== name.toUpperCase()) return { isValid: false, errorReason: 'El nombre no está en MAYÚSCULAS.' }
    if (/\bCM\b/.test(name)) return { isValid: false, errorReason: 'Medida CM no convertida a IN.' }
    for (const f of FORBIDDEN_TERMS) {
        if (name.includes(f)) return { isValid: false, errorReason: `Término prohibido: "${f}".` }
    }
    if (missingTerms.length > 0) return { isValid: false, errorReason: `Términos sin traducción aprobada: ${missingTerms.join(', ')}` }
    return { isValid: true, errorReason: '' }
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export async function translateProductToEnglish(
    product: ProductPayload,
    targetEntity: string = 'MUEBLE',
    activeVariableIds?: string[]
): Promise<TranslationResult> {
    const missingTerms: string[] = []
    const warnings: string[] = []

    const isActuallyActive = (varId: string) => {
        if (!activeVariableIds) return true
        const mapping: Record<string, string[]> = {
            'rh': ['rh_flag', 'rh'],
            'canto_puertas': ['edge_2mm_flag', 'canto_puertas'],
            'carb2': ['carb2'],
            'cabinet_name': ['cabinet_name'],
            'line': ['line'],
            'commercial_measure': ['commercial_measure'],
            'accessory_text': ['accessory_text'],
            'door_color_text': ['door_color_text', 'id_color_frente'],
            'special_label': ['special_label'],
            'private_label_client_name': ['private_label_client_name'],
            'resolved_type': ['product_type', 'designation', 'use_destination']
        }
        const possibleKeys = mapping[varId] || [varId]
        return possibleKeys.some(k => activeVariableIds.includes(k))
    }

    const [glossary, config] = await Promise.all([ loadGlossary(), loadConfig(targetEntity) ])
    const resolvedTypeName = resolveTypeBlock(product)

    interface Slot { order: number; variable_id: string; textEn: string }
    const slots: Slot[] = []
    
    // ── SlotTracker (Smarter Deduplication) ──────────────────────────────────
    const trackAndAdd = (varId: string, val: string, order: number) => {
        if (!val || isPlaceholder(val)) return
        const cleanVal = val.trim()
        
        // If context says VANITY, we don't want CABINET anywhere.
        if (cleanVal === 'CABINET') {
            const hasSpecificContext = slots.some(s => 
                s.textEn.includes('VANITY') || 
                s.textEn.includes('SFE') || 
                s.textEn.includes('SLIDES') || 
                s.textEn.includes('EDGE BAND') ||
                /^\d+.*IN/.test(s.textEn) // Has measures
            )
            if (hasSpecificContext) return
        }

        const isTechnicalVal = cleanVal.includes('VANITY') || 
                               cleanVal.includes('SFE') || 
                               cleanVal.includes('SLIDES') || 
                               cleanVal.includes('EDGE BAND') ||
                               cleanVal.includes('CONCEALED') ||
                               cleanVal.includes('HANDLE') ||
                               /^\d+.*IN/.test(cleanVal)

        if (isTechnicalVal && slots.some(s => s.textEn === 'CABINET')) {
            // Remove existing generic cabinet because we now have technical context
            for (let i = slots.length - 1; i >= 0; i--) {
                if (slots[i].textEn === 'CABINET') slots.splice(i, 1)
            }
        }

        // Substring containment sweep
        for (let i = slots.length - 1; i >= 0; i--) {
            const existing = slots[i].textEn
            if (existing === cleanVal) return // Exact duplicate
            
            // For technical fragments like EDGE BAND, check containment
            const isTechnical = cleanVal.includes('EDGE BAND') || cleanVal.includes('SOFT CLOSE') || cleanVal.includes('VANITY')
            if (isTechnical) {
                if (existing.includes(cleanVal)) return // New is already covered
                if (cleanVal.includes(existing)) {
                    slots.splice(i, 1) // New covers existing, remove existing
                }
            }
        }
        
        slots.push({ order, variable_id: varId, textEn: cleanVal })
    }

    // ── Variable processing loop ──────────────────────────────────────────────

    // ── rh
    if (config['rh']?.emit && product.rh && isActuallyActive('rh')) {
        const translated = translateRH(product.rh)
        if (translated) trackAndAdd('rh', translated, config['rh'].order_index)
    }

    // ── carb2
    if (config['carb2']?.emit && product.carb2 && isActuallyActive('carb2')) {
        const u = normalizeTechnicalText(product.carb2)
        if (!isPlaceholder(u)) trackAndAdd('carb2', u, config['carb2'].order_index)
    }

    // ── cabinet_name
    if (config['cabinet_name']?.emit && product.cabinet_name && isActuallyActive('cabinet_name')) {
        const val = translateField(product.cabinet_name, config['cabinet_name'], glossary, missingTerms, warnings)
        trackAndAdd('cabinet_name', val, config['cabinet_name'].order_index)
    }

    // ── line
    if (config['line']?.emit && product.line && isActuallyActive('line')) {
        const val = translateField(product.line, config['line'], glossary, missingTerms, warnings)
        trackAndAdd('line', val, config['line'].order_index)
    }

    // ── resolved_type 
    if (config['resolved_type']?.emit && isActuallyActive('resolved_type')) {
        trackAndAdd('resolved_type', resolvedTypeName, config['resolved_type'].order_index)
    }

    // ── commercial_measure
    if (config['commercial_measure']?.emit && product.commercial_measure && isActuallyActive('commercial_measure')) {
        const converted = convertMeasureToPulgadas(product.commercial_measure)
        const val = converted || translateField(product.commercial_measure, config['commercial_measure'], glossary, missingTerms, warnings)
        trackAndAdd('commercial_measure', val, config['commercial_measure'].order_index)
    }

    // ── accessory_text
    if (config['accessory_text']?.emit && product.accessory_text && isActuallyActive('accessory_text')) {
        const val = translateField(product.accessory_text, config['accessory_text'], glossary, missingTerms, warnings)
        trackAndAdd('accessory_text', val, config['accessory_text'].order_index)
    }

    // ── canto_puertas
    if (config['canto_puertas']?.emit && product.canto_puertas && isActuallyActive('canto_puertas')) {
        const val = translateField(product.canto_puertas, config['canto_puertas'], glossary, missingTerms, warnings)
        trackAndAdd('canto_puertas', val, config['canto_puertas'].order_index)
    }

    // ── door_color_text
    if (config['door_color_text']?.emit && product.door_color_text && isActuallyActive('door_color_text')) {
        const val = translateField(product.door_color_text, config['door_color_text'], glossary, missingTerms, warnings)
        trackAndAdd('door_color_text', val, config['door_color_text'].order_index)
    }

    // ── special_label
    if (config['special_label']?.emit && product.special_label && isActuallyActive('special_label')) {
        const val = translateField(product.special_label, config['special_label'], glossary, missingTerms, warnings)
        trackAndAdd('special_label', val, config['special_label'].order_index)
    }

    // ── Others: client, assembled, lvm...
    if (config['private_label_client_name']?.emit && product.private_label_client_name) {
        trackAndAdd('private_label_client_name', product.private_label_client_name, config['private_label_client_name'].order_index)
    }
    if (config['assembled_flag']?.emit && product.assembled_flag) {
        trackAndAdd('assembled_flag', 'ASSEMBLED', config['assembled_flag'].order_index)
    }
    if (config['armado_con_lvm']?.emit && product.armado_con_lvm) {
        const val = translateField(product.armado_con_lvm, config['armado_con_lvm'], glossary, missingTerms, warnings)
        
        // Redundancy check: if already has VANITY, don't repeat WASHBASIN/LAV
        const currentText = slots.map(s => s.textEn.toUpperCase()).join(' ')
        const isRedundant = currentText.includes('VANITY') && (val.includes('WASHBASIN') || val.includes('LAV'))
        
        if (!isRedundant) {
            trackAndAdd('armado_con_lvm', val, config['armado_con_lvm'].order_index)
        }
    }

    // ── Sort and Assemble ─────────────────────────────────────────────────────
    slots.sort((a, b) => a.order - b.order)
    const finalParts = slots.map(s => s.textEn.trim()).filter(p => !isPlaceholder(p))
    
    // Final deduplication (safety net)
    const seen = new Set<string>()
    const deduped: string[] = []
    for (const p of finalParts) {
        if (!seen.has(p)) { seen.add(p); deduped.push(p) }
    }

    const translatedName = deduped.join(' ').trim()
    const { isValid, errorReason } = validateResult(translatedName, missingTerms, warnings)

    return {
        // Relaxed: return the name regardless of validity, so partial translations are shown.
        // The isValid flag will still indicate if more glossary entries are needed.
        translatedName: translatedName || '', 
        missingTerms: [...new Set(missingTerms)],
        isValid,
        errorReason,
        warnings
    }
}

// ─── Legacy Compatibility Shim ────────────────────────────────────────────────
// Allows existing callers that pass a string to still work during migration.
// Internally it wraps the string into a minimal ProductPayload.

export async function translateSpanishToEnglish(
    nameEs: string,
    productContext?: any
): Promise<Omit<TranslationResult, 'warnings'>> {
    // If a full product context is provided, use the new engine
    if (productContext && productContext.product_type) {
        const result = await translateProductToEnglish(productContext as ProductPayload)
        return {
            translatedName: result.translatedName,
            missingTerms: result.missingTerms,
            isValid: result.isValid,
            errorReason: result.errorReason
        }
    }

    // Minimal fallback: cannot do meaningful field-by-field translation from a string alone.
    // Returns the string uppercased with a warning.
    return {
        translatedName: '',
        missingTerms: [],
        isValid: false,
        errorReason: 'Motor adaptativo requiere el objeto producto completo (15 campos). Pasaste solo un string.'
    }
}
