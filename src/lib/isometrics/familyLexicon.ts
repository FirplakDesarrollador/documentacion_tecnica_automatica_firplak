import { normalizeText } from '@/lib/isometrics/bulkMatch'

export type FamilyLexicon = {
  familyCodes: string[]
  designations: string[] // raw values from DB
  productNames: string[]
  specialLabels: string[]
  lines: string[]
  accessories: string[]
  measures: string[] // commercial_measure values as stored in DB
}

type NormalizedPhrase = { raw: string; norm: string; scoreLen: number }

export function buildNormalizedPhrases(values: string[]) {
  const uniq = new Map<string, NormalizedPhrase>()
  for (const v of values) {
    const raw = String(v || '').trim()
    if (!raw) continue
    const norm = normalizeText(raw)
    if (!norm || norm === 'NA') continue
    // Prefer the longest raw variant for the same normalized form.
    const scoreLen = norm.length
    const prev = uniq.get(norm)
    if (!prev || scoreLen > prev.scoreLen) uniq.set(norm, { raw, norm, scoreLen })
  }
  // Longest-first avoids matching "SUPER" before "SUPERIOR", etc.
  return Array.from(uniq.values()).sort((a, b) => b.scoreLen - a.scoreLen)
}

export function findBestPhraseMatch(haystack: string, phrases: NormalizedPhrase[]) {
  const h = normalizeText(haystack)
  if (!h || h === 'NA') return null
  for (const p of phrases) {
    if (h.includes(p.norm)) return p.raw
  }
  return null
}

