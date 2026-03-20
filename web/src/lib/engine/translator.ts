import { dbQuery } from '@/lib/supabase'

export interface TranslationResult {
    translatedName: string
    missingTerms: string[]
}

/**
 * Deterministic translation engine for Firplak product names.
 * Uses a glossary-based approach with sliding window matching.
 */
export async function translateSpanishToEnglish(nameEs: string): Promise<TranslationResult> {
    if (!nameEs) return { translatedName: '', missingTerms: [] }

    // 1. Fetch entire glossary (small enough to keep in memory for the request)
    const glossaryRows = await dbQuery(`SELECT term_es, term_en, category FROM public.glossary`)
    const glossary: Record<string, string> = {}
    glossaryRows.forEach((r: any) => {
        glossary[r.term_es.toUpperCase()] = r.term_en.toUpperCase()
    })

    const cleanName = nameEs.toUpperCase().trim()
    const tokens = cleanName.split(/\s+/)
    const translatedTokens: string[] = []
    const missingTerms: string[] = []

    // 2. Identification logic
    // We assume the first word is the Model/Line and should NOT be translated
    // unless it matches a specific glossary term.
    let i = 0;
    while (i < tokens.length) {
        let found = false
        
        // Try longest match first (up to 4 words)
        for (let len = 4; len >= 1; len--) {
            if (i + len > tokens.length) continue
            
            const phrase = tokens.slice(i, i + len).join(' ')
            
            // Handle Number/Dimensions (e.g. 63X48 or 63 X 48)
            const dimMatch = phrase.match(/^(\d+(?:\.\d+)?)\s*[Xx]\s*(\d+(?:\.\d+)?)$/)
            if (dimMatch) {
                const w_in = Math.round(parseFloat(dimMatch[1]) / 2.54)
                const h_in = Math.round(parseFloat(dimMatch[2]) / 2.54)
                translatedTokens.push(`${w_in}INX${h_in}IN`)
                i += len
                found = true
                break
            }

            // Simple single number conversion (e.g. 63 -> 25IN)
            if (len === 1 && /^\d+(?:\.\d+)?$/.test(phrase)) {
                const val_in = Math.round(parseFloat(phrase) / 2.54)
                translatedTokens.push(`${val_in}IN`)
                i += 1
                found = true
                break
            }

            if (glossary[phrase]) {
                translatedTokens.push(glossary[phrase])
                i += len
                found = true
                break
            }
        }

        if (!found) {
            // Remove 'NA' (No aplica) from result tokens to keep names clean
            if (tokens[i] === 'NA') {
                i++
                continue
            }
            
            // If it's the first word, treat as Model (no translation, no warning)
            if (i === 0) {
                translatedTokens.push(tokens[i])
            } else {
                // Untranslated word
                translatedTokens.push(`[${tokens[i]}]`)
                missingTerms.push(tokens[i])
            }
            i++
        }
    }

    // 3. Final Ordering Logic (Firplak Standard)
    // Structure: [MODEL] [TYPE] [DIMENSIONS] [FEATURES]
    // For now, we keep the original order since the glossary usually covers phrases.
    // If the user wants specific reordering, we can use the 'category' from glossary.

    return {
        translatedName: translatedTokens.join(' '),
        missingTerms: [...new Set(missingTerms)]
    }
}
