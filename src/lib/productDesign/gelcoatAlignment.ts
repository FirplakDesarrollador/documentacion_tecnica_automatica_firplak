import type { EstimationDraftBomLine } from './estimationDraft'

const COLOR_SUFFIX = /-(\d{4})$/u

export function sapItemColorCode(itemCode: string | null | undefined): string | null {
  const match = itemCode?.trim().toUpperCase().match(COLOR_SUFFIX)
  return match?.[1] ?? null
}

export function isSapGelcoatLine(line: EstimationDraftBomLine): boolean {
  return Boolean(line.sapItemCode?.trim().toUpperCase().startsWith('PGEL'))
}

export type GelcoatReplacementProposal = {
  lineId: string
  currentItemCode: string
  proposedItemCode: string
}

export function proposeGelcoatReplacements(lines: readonly EstimationDraftBomLine[], colorCode: string | null): GelcoatReplacementProposal[] {
  const targetColor = colorCode?.trim()
  if (!targetColor || !/^\d{4}$/u.test(targetColor)) return []
  return lines.flatMap(line => {
    if (!isSapGelcoatLine(line) || !line.sapItemCode) return []
    const currentColor = sapItemColorCode(line.sapItemCode)
    if (!currentColor || currentColor === targetColor) return []
    return [{
      lineId: line.id,
      currentItemCode: line.sapItemCode,
      proposedItemCode: `${line.sapItemCode.slice(0, -4)}${targetColor}`,
    }]
  })
}
