import { createClient } from '@supabase/supabase-js'

export interface TranslationResult {
    translatedName: string
    missingTerms: string[]
    isValid: boolean
    errorReason: string
}

let cachedGlossary: Record<string, { en: string, cat: string }> | null = null;
let lastCacheTime = 0;

/**
 * Deterministic translation engine for Firplak product names.
 * Uses a glossary-based approach with sliding window matching explicitly mapped to categories.
 */
export async function translateSpanishToEnglish(nameEs: string, productContext?: any): Promise<TranslationResult> {
    if (!nameEs) return { translatedName: '', missingTerms: [], isValid: false, errorReason: 'Nombre vacío' }

    // 1. Fetch glossary rules 
    if (!cachedGlossary || Date.now() - lastCacheTime > 60000) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const supabase = createClient(supabaseUrl, supabaseKey)

        const { data, error } = await supabase
            .from('glossary')
            .select('term_es, term_en, category')
            .eq('active', true)
            .order('priority', { ascending: false })
            
        if (error) throw new Error("Translation Dictionary Sync Error: " + error.message)
        
        const freshGlossary: Record<string, { en: string, cat: string }> = {}
        data?.forEach((r: any) => {
            freshGlossary[r.term_es.toUpperCase().trim()] = { en: r.term_en.toUpperCase().trim(), cat: r.category }
        })
        cachedGlossary = freshGlossary;
        lastCacheTime = Date.now();
    }
    const glossary = cachedGlossary;

    const cleanName = nameEs.toUpperCase().trim()
    const tokens = cleanName.split(/\s+/)
    
    interface ParsedBlock {
        textEn: string;
        category: string;
        isMissing: boolean;
        original: string;
    }
    let blocks: ParsedBlock[] = []
    const missingTerms: string[] = []

    // Map safe terminology explicitly to context
    const safeWords = new Set<string>()
    if (productContext) {
        if (productContext.furniture_name) productContext.furniture_name.toUpperCase().split(/[\s/]+/).forEach((w: string) => safeWords.add(w))
        if (productContext.line) productContext.line.toUpperCase().split(/[\s/]+/).forEach((w: string) => safeWords.add(w))
        if (productContext.color_name) productContext.color_name.toUpperCase().split(/[\s/]+/).forEach((w: string) => safeWords.add(w))
    }

    let i = 0;
    while (i < tokens.length) {
        let found = false
        
        // Sliding window up to 4 words matching exact glossary phrases
        for (let len = 4; len >= 1; len--) {
            if (i + len > tokens.length) continue
            
            const phrase = tokens.slice(i, i + len).join(' ')
            
            // Regex for Strict Dimensional Replacement
            const dimMatch = phrase.match(/^(\d+(?:\.\d+)?)\s*[Xx]\s*(\d+(?:\.\d+)?)$/)
            if (dimMatch) {
                const w_in = Math.round(parseFloat(dimMatch[1]) / 2.54)
                const h_in = Math.round(parseFloat(dimMatch[2]) / 2.54)
                blocks.push({ textEn: `${w_in}INX${h_in}IN`, category: 'SIZE', isMissing: false, original: phrase })
                i += len
                found = true
                break
            }

            // Single Dimensions: Disable isolated numbers from becoming INCH to prevent "2 DOORS" becoming "1IN DOORS"
            // We just allow raw numbers to pass as safe without INCH mapping, UNLESS explicitly required.
            // That will be handled down in the !found block.

            // Core Glossary Hit
            if (glossary[phrase]) {
                blocks.push({ 
                    textEn: glossary[phrase].en, 
                    category: glossary[phrase].cat, 
                    isMissing: false, 
                    original: phrase 
                })
                i += len
                found = true
                break
            }
        }

        if (!found) {
            const token = tokens[i]
            if (token === 'NA' || token === 'N/A') {
                i++
                continue
            }

            // Treat standard numbers as safe elements, neither missing nor needing inch conversion
            if (/^\d+(?:\.\d+)?$/.test(token)) {
                blocks.push({ textEn: token, category: 'QUANTITY_OR_SIZE', isMissing: false, original: token })
                i++
                continue
            }

            // Unresolved Token Processing Check
            let isSafe = false
            if (token.includes('/')) {
                const parts = token.split('/')
                isSafe = parts.every(p => safeWords.has(p) || glossary[p])
                if (!isSafe && typeof productContext?.color_name === 'string' && productContext.color_name.toUpperCase().includes(token.toUpperCase())) {
                    isSafe = true
                }
            } else {
                isSafe = safeWords.has(token)
            }

            // Hardcode 'KIT' bypass if it slipped past the DB mappings
            if (token === 'KIT' || isSafe || token.includes('/')) {
                blocks.push({ textEn: token, category: 'MODEL_OR_FINISH', isMissing: false, original: token })
            } else {
                blocks.push({ textEn: token, category: 'UNKNOWN', isMissing: true, original: token })
                missingTerms.push(token)
            }
            i++
        }
    }

    // Advanced Structural Hierarchy Sort & Semantic Redundancy Resolution

    // Rule 1: Eliminate redundant LAV identifier if VANITY already classifies it
    const hasVanity = blocks.some(b => b.category === 'TYPE' && b.textEn.includes('VANITY'));
    if (hasVanity) {
        blocks = blocks.filter(b => !(b.category === 'TYPE' && (b.textEn === 'LAV' || b.textEn === 'WASHBASIN')));
    }

    // Rule 2: Explicit absolute positional hierarchy
    const orderIndex: Record<string, number> = {
        'MODEL': 1,
        'INSTALLATION': 2,
        'TYPE': 3,
        'SIZE': 4,
        'QUANTITY_OR_SIZE': 5,
        'FEATURE': 6,
        'MATERIAL': 7,
        'PLUMBING': 8,
        'ACCESSORY': 9,
        'FINISH': 10,
        'TECH_CODE': 11,
        'UNKNOWN': 99
    };

    // Sub-categorize generic MODEL_OR_FINISH into MODEL or FINISH based on context matches
    blocks.forEach(b => {
        if (b.category === 'MODEL_OR_FINISH') {
            b.category = 'MODEL'; // default behavior fallback
            if (typeof productContext?.color_name === 'string' && productContext.color_name.toUpperCase().includes(b.textEn)) {
                b.category = 'FINISH';
            } else if (b.textEn.includes('/')) {
                b.category = 'FINISH'; // Composites are fundamentally finishes
            } else if (typeof productContext?.furniture_name === 'string' && productContext.furniture_name.toUpperCase().includes(b.textEn)) {
                b.category = 'MODEL';
            } else if (typeof productContext?.line === 'string' && productContext.line.toUpperCase().includes(b.textEn)) {
                b.category = 'MODEL';
            }
        }
    });

    blocks.sort((a, b) => (orderIndex[a.category] || 99) - (orderIndex[b.category] || 99));

    const translatedName = blocks.map(b => b.textEn).join(' ').trim()

    // Strict Validations Final Logic
    let isValid = true
    let errorReason = ''

    if (translatedName !== translatedName.toUpperCase()) {
        isValid = false
        errorReason = 'El nombre en inglés requerido no está en mayúscula sostenida.'
    } else if (/\bCM\b/.test(translatedName)) {
        isValid = false
        errorReason = 'El nombre retuvo la medida CM sin convertir a pulgadas de forma estricta.'
    } else if (/\bSOFT CLOSE CONCEALED\b/.test(translatedName)) {
        isValid = false
        errorReason = 'Existen fragmentos desarticulados "SOFT CLOSE CONCEALED", prioriza la frase enlazada completa "CIERRE LENTO OCULTO".'
    } else {
        const forbidden = ['FURNITURE', 'PRODUCT', 'WASHBASIN FURNITURE', 'FLOOR STANDING', 'LVM', 'RH']
        for (const word of forbidden) {
            const regex = new RegExp(`\\b${word}\\b`)
            if (regex.test(translatedName)) {
                isValid = false
                errorReason = `Contiene término prohibido o insuficientemente procesado: ${word}`
                break
            }
        }
    }
    
    // Explicit Missing Trap Block
    const uMissing = [...new Set(missingTerms)]
    if (isValid && uMissing.length > 0) {
        isValid = false
        errorReason = `El motor identificó términos fantasma no controlados: ${uMissing.join(', ')}`
    }

    return {
        translatedName: isValid ? translatedName : '',
        missingTerms: uMissing,
        isValid,
        errorReason
    }
}
