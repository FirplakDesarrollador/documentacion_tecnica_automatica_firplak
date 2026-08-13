export type FamilySapInference = {
  familyName: string
  productType: string
  zoneHome: string
  useDestination: string
  analyzedItemCount: number
  commonTerms: string[]
}

const IGNORED_TERMS = new Set([
  'BRILLANTE', 'MATE', 'BLANCO', 'NEGRO', 'MARFIL', 'NATURAL', 'GRIS', 'PERLA',
  'CON', 'SIN', 'PARA', 'DE', 'DEL', 'LA', 'EL', 'Y', 'EN', 'COLOR', 'FORT',
  'PERF', 'CUB', 'GRIF', 'VESSSEL', 'VESSEL', 'LVM', 'MS', 'FV',
])

const PRODUCT_CLASSIFICATIONS: Array<{ terms: string[]; productType: string; zoneHome: string; useDestination: string }> = [
  { terms: ['LAVARROPAS'], productType: 'LAVARROPAS', zoneHome: 'ROPAS', useDestination: 'LAVARROPAS' },
  { terms: ['LAVAMANOS', 'LVM'], productType: 'LAVAMANOS', zoneHome: 'BAÑO', useDestination: 'LAVAMANOS' },
  { terms: ['MESON', 'MESÓN'], productType: 'MESÓN', zoneHome: 'COCINA', useDestination: 'MESÓN' },
  { terms: ['MUEBLE'], productType: 'MUEBLE', zoneHome: '', useDestination: 'MUEBLE' },
]

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
}

export function familyNameFromSapItemGroup(groupName: string): string {
  return groupName
    .trim()
    .replace(/^[A-Z0-9]+\s*[-–:]\s*/iu, '')
    .trim()
}

function descriptionTerms(value: string): string[] {
  return normalizeText(value)
    .split(/[^A-Z0-9]+/u)
    .filter(term => term.length >= 3 && !/^\d+$/u.test(term) && !IGNORED_TERMS.has(term))
}

function mostFrequent(values: readonly string[]): string | null {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()]
    .toSorted(([leftTerm, leftCount], [rightTerm, rightCount]) => rightCount - leftCount || leftTerm.localeCompare(rightTerm))
    .at(0)?.[0] ?? null
}

/**
 * Produces editable catalogue suggestions from recurring SAP item-description
 * terms. It deliberately does not persist or assert that the classification is
 * correct: a family can contain legacy or exceptional naming.
 */
export function inferFamilyFromSapDescriptions(itemNames: readonly string[]): FamilySapInference {
  const nonEmptyNames = itemNames.map(name => name.trim()).filter(Boolean)
  const tokenizedNames = nonEmptyNames.map(descriptionTerms)
  const allTerms = tokenizedNames.flat()
  const commonTerms = [...new Set(allTerms.filter(term => allTerms.filter(candidate => candidate === term).length >= Math.max(2, Math.ceil(nonEmptyNames.length * 0.6))))]

  const classification = PRODUCT_CLASSIFICATIONS
    .map(candidate => ({
      candidate,
      occurrences: candidate.terms.reduce((total, term) => total + allTerms.filter(value => value === normalizeText(term)).length, 0),
    }))
    .toSorted((left, right) => right.occurrences - left.occurrences)[0]

  const frequentType = mostFrequent(allTerms)
  const productType = classification?.occurrences
    ? classification.candidate.productType
    : frequentType ?? ''
  const representativeTerms = tokenizedNames[0]?.filter(term => commonTerms.includes(term)).slice(0, 3) ?? []
  const familyName = representativeTerms.join(' ') || productType

  return {
    familyName,
    productType,
    zoneHome: classification?.occurrences ? classification.candidate.zoneHome : '',
    useDestination: classification?.occurrences ? classification.candidate.useDestination : '',
    analyzedItemCount: nonEmptyNames.length,
    commonTerms,
  }
}
