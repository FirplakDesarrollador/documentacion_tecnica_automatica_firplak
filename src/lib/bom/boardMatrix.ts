import type {
  BoardMatrixEvidence,
  BoardMatrixConditionalStrategy,
  BoardMatrixDualCandidate,
  BoardMatrixFullProductRuleCandidate,
  BoardMatrixRole,
  BoardMatrixRoleSource,
  BoardMatrixRow,
  BoardMatrixStatus,
  ColorConfiguration,
} from './referenceImportTypes'

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.flatMap(value => value?.trim() ? [value.trim().toUpperCase()] : []))].sort()
}

function proposalForRole(configuration: ColorConfiguration | undefined, role: BoardMatrixRole): {
  colorCode: string | null
  materialProfile: string | null
} {
  if (!configuration || role === 'role_pending') return { colorCode: null, materialProfile: null }
  const key = role
  return {
    colorCode: configuration.applicationColors[key] ?? null,
    materialProfile: configuration.applicationMaterialProfiles[key] ?? null,
  }
}

function statusForRow(input: {
  role: BoardMatrixRole
  evidence: BoardMatrixEvidence[]
  observedColorCodes: string[]
  observedMaterialProfiles: string[]
}): { status: BoardMatrixStatus; statusMessage: string } {
  if (input.role === 'role_pending') return {
    status: 'role_pending',
    statusMessage: 'No hay rol logico publicado ni override semantico vigente para esta evidencia.',
  }
  if (input.observedMaterialProfiles.length === 0) return {
    status: 'profile_pending',
    statusMessage: 'SAP no permitio identificar el perfil del tablero.',
  }
  const physicalQuantities = new Map<string, number[]>()
  for (const item of input.evidence) {
    const key = [item.skuComplete, item.lineIdentity, item.role, item.materialProfile ?? 'none', item.formatKey ?? 'none'].join('|')
    physicalQuantities.set(key, [...(physicalQuantities.get(key) ?? []), item.qty])
  }
  const hasPhysicalConflict = [...physicalQuantities.values()].some(values => new Set(values).size > 1)
  if (hasPhysicalConflict) return {
    status: 'conflict_real',
    statusMessage: 'La misma clave fisica completa tiene cantidades incompatibles en SAP.',
  }
  const boardSignatures = new Set(input.evidence.map(item => [
    item.boardColorCode,
    item.materialProfile ?? 'none',
  ].join('|')))
  if (boardSignatures.size > 1) return {
    status: 'variation_by_design',
    statusMessage: 'El mismo color y rol presenta mas de una combinacion de tablero o perfil en SAP.',
  }
  return { status: 'matches', statusMessage: 'La evidencia SAP es consistente para este color y rol.' }
}

function mostCommonValue(values: string[]): string | null {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null
}

function recommendedProfileForRow(
  row: BoardMatrixRow,
  referenceMaterialProfile: string | null,
  profileIsReferenceException: boolean
): string | null {
  return profileIsReferenceException
    ? row.observedMaterialProfiles[0] ?? null
    : referenceMaterialProfile
}

function uniqueSkuCount(evidence: BoardMatrixEvidence[]): number {
  return new Set(evidence.map(item => item.skuComplete)).size
}

export type BoardProfileEvidenceSummary = {
  materialProfile: string
  skuCount: number
  examples: Array<{
    skuComplete: string
    skuItemName: string | null
    itemCode: string
    qty: number
  }>
}

export type BoardEvidenceExample = {
  skuComplete: string
  skuItemName: string | null
  itemCode: string
  boardColorCode: string
  materialProfile: string | null
  qty: number
  skuBoardPatterns: string[]
}

function boardEvidencePattern(item: BoardMatrixEvidence): string {
  return `${item.boardColorCode} · ${item.materialProfile?.trim().toUpperCase() || 'PERFIL PENDIENTE'}`
}

function boardEvidenceKey(item: BoardMatrixEvidence): string {
  return `${item.skuComplete}|${item.itemCode}|${item.lineIdentity}`
}

/**
 * SAP can contain the same physical board row more than once. For the board
 * calculation those rows are one material position, therefore their area is
 * added before evaluating patterns, consumption, or contradictions. Different
 * roles and physical formats deliberately remain separate.
 */
export function consolidateIdenticalBoardEvidence(
  entries: Array<{ sourceColorCode: string; item: BoardMatrixEvidence }>
): Array<{ sourceColorCode: string; item: BoardMatrixEvidence }> {
  const physicalGroups = new Map<string, Array<{ sourceColorCode: string; item: BoardMatrixEvidence }>>()
  for (const entry of entries) {
    const sourceColorCode = entry.sourceColorCode.trim().toUpperCase()
    const item = entry.item
    const key = [
      sourceColorCode,
      item.skuComplete,
      item.role,
      item.baseItemCode,
      item.itemCode,
      item.boardColorCode,
      item.materialProfile ?? 'none',
      item.formatKey ?? 'none',
    ].join('|')
    physicalGroups.set(key, [...(physicalGroups.get(key) ?? []), {
      sourceColorCode,
      item: { ...item, sourceLineCount: item.sourceLineCount ?? 1 },
    }])
  }
  return [...physicalGroups.values()].flatMap(group => {
    // Repeated evidence for the exact same SAP line is a genuine
    // contradiction; different line identities are duplicate SAP rows and
    // are the only shape that can be consolidated.
    if (new Set(group.map(entry => entry.item.lineIdentity)).size !== group.length) return group
    const first = group[0]
    if (!first) return []
    return [{
      sourceColorCode: first.sourceColorCode,
      item: {
        ...first.item,
        qty: group.reduce((total, entry) => total + entry.item.qty, 0),
        sourceLineCount: group.reduce((total, entry) => total + (entry.item.sourceLineCount ?? 1), 0),
      },
    }]
  })
}

/**
 * The review sample must expose every observed board/profile pattern first.
 * Remaining slots add different SKU, so a reviewer can see variations and a
 * possible two-board SKU instead of five copies of the dominant pattern.
 */
export function summarizeBoardEvidenceExamples(
  evidence: BoardMatrixEvidence[],
  exampleLimit = 5
): BoardEvidenceExample[] {
  const sortedEvidence = [...evidence]
    .sort((left, right) => left.skuComplete.localeCompare(right.skuComplete) || left.itemCode.localeCompare(right.itemCode) || left.lineIdentity.localeCompare(right.lineIdentity))
  const patternsBySku = new Map<string, string[]>()
  const representativeByPattern = new Map<string, BoardMatrixEvidence>()
  for (const item of evidence) {
    const pattern = boardEvidencePattern(item)
    patternsBySku.set(item.skuComplete, [...new Set([...(patternsBySku.get(item.skuComplete) ?? []), pattern])].sort())
    const current = representativeByPattern.get(pattern)
    if (!current || item.skuComplete.localeCompare(current.skuComplete) < 0 || (item.skuComplete === current.skuComplete && item.itemCode.localeCompare(current.itemCode) < 0)) {
      representativeByPattern.set(pattern, item)
    }
  }
  const requiredExamples = [...representativeByPattern.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, item]) => item)
  const limit = Math.max(Math.max(1, Math.floor(exampleLimit)), requiredExamples.length)
  const selected = [...requiredExamples]
  const selectedKeys = new Set(selected.map(boardEvidenceKey))
  const selectedSkuCompletes = new Set(selected.map(item => item.skuComplete))
  for (const item of sortedEvidence) {
    if (selected.length >= limit) break
    if (selectedKeys.has(boardEvidenceKey(item)) || selectedSkuCompletes.has(item.skuComplete)) continue
    selected.push(item)
    selectedKeys.add(boardEvidenceKey(item))
    selectedSkuCompletes.add(item.skuComplete)
  }
  return selected
    .map(item => ({
      skuComplete: item.skuComplete,
      skuItemName: item.skuItemName,
      itemCode: item.itemCode,
      boardColorCode: item.boardColorCode,
      materialProfile: item.materialProfile,
      qty: item.qty,
      skuBoardPatterns: patternsBySku.get(item.skuComplete) ?? [boardEvidencePattern(item)],
    }))
}

/**
 * Keeps the variation report actionable: counts are distinct sales SKU and
 * examples retain the SAP sales description that a business reviewer needs.
 */
export function summarizeBoardProfileEvidence(
  evidence: BoardMatrixEvidence[],
  exampleLimit = 5
): BoardProfileEvidenceSummary[] {
  const examplesPerProfile = new Map<string, Map<string, BoardMatrixEvidence>>()
  for (const item of evidence) {
    const profile = item.materialProfile?.trim().toUpperCase() || 'PENDIENTE'
    const examplesBySku = examplesPerProfile.get(profile) ?? new Map<string, BoardMatrixEvidence>()
    const current = examplesBySku.get(item.skuComplete)
    if (!current || item.itemCode.localeCompare(current.itemCode) < 0) examplesBySku.set(item.skuComplete, item)
    examplesPerProfile.set(profile, examplesBySku)
  }
  const limit = Math.max(1, Math.floor(exampleLimit))
  return [...examplesPerProfile.entries()]
    .map(([materialProfile, examplesBySku]) => {
      const examples = [...examplesBySku.values()]
        .sort((left, right) => left.skuComplete.localeCompare(right.skuComplete) || left.itemCode.localeCompare(right.itemCode))
        .slice(0, limit)
        .map(item => ({
          skuComplete: item.skuComplete,
          skuItemName: item.skuItemName,
          itemCode: item.itemCode,
          qty: item.qty,
        }))
      return { materialProfile, skuCount: examplesBySku.size, examples }
    })
    .sort((left, right) => right.skuCount - left.skuCount || left.materialProfile.localeCompare(right.materialProfile))
}

/**
 * A global color rule is deliberately stricter than a matrix row. It must be
 * backed by every active SAP sales SKU. Differences against Supabase stay
 * visible for catalog reconciliation, but cannot erase valid SAP evidence.
 * An unread LdM or an additional board role does block the rule.
 */
export function assessBoardFullProductRuleCandidate(input: {
  colorMode: ColorConfiguration['colorMode'] | null
  sapActiveSkuCount: number
  checkedSkuCount: number
  excludedKitSkuCount: number
  sapReadErrors: Array<{ skuComplete: string; message: string }>
  rows: BoardMatrixRow[]
}): {
  candidate: BoardMatrixFullProductRuleCandidate | null
  blockers: string[]
} {
  const blockers: string[] = []

  if (input.colorMode === 'dual' || input.colorMode === 'balance') {
    blockers.push('El color está configurado como Dual o Balance; una regla de producto completo no puede reemplazar sus roles propios.')
  }
  if (input.sapActiveSkuCount === 0) blockers.push('SAP no devolvió SKU activos de versión 000 para este color.')
  if (input.sapReadErrors.length > 0) blockers.push('No se pudo leer la LdM de todos los SKU activos incluidos en la cobertura.')

  const fullProductRows = input.rows.filter(row => row.role === 'full_product')
  if (fullProductRows.length !== 1) {
    blockers.push('La evidencia no se reduce a un único rol de tablero de producto completo.')
  }
  if (input.rows.some(row => row.role !== 'full_product')) {
    blockers.push('SAP evidencia otros roles de tablero; este color requiere una decisión Dual o por diseño, no una regla unicolor global.')
  }

  const row = fullProductRows[0]
  if (!row) return { candidate: null, blockers: [...new Set(blockers)] }
  if (row.status === 'role_pending' || row.status === 'profile_pending' || row.status === 'variation_by_design' || row.status === 'conflict_real') {
    blockers.push('La fila de producto completo no tiene un patrón SAP único y resoluble.')
  }
  if (row.observedColorCodes.length !== 1 || row.observedMaterialProfiles.length !== 1) {
    blockers.push('SAP no observa un único color interno y perfil para el producto completo.')
  }
  if (uniqueSkuCount(row.evidence) !== input.checkedSkuCount) {
    blockers.push(`La fila de producto completo cubre ${uniqueSkuCount(row.evidence)}/${input.checkedSkuCount} SKU con LdM leída.`)
  }
  if (input.checkedSkuCount + input.excludedKitSkuCount !== input.sapActiveSkuCount) {
    blockers.push(`Solo ${input.checkedSkuCount} de ${input.sapActiveSkuCount} SKU activos de SAP quedaron con LdM elegible.`)
  }

  const uniqueBlockers = [...new Set(blockers)]
  return uniqueBlockers.length === 0
    ? {
      candidate: {
        boardColorCode: row.observedColorCodes[0]!,
        materialProfile: row.observedMaterialProfiles[0]!,
        evidenceSkuCount: uniqueSkuCount(row.evidence),
      },
      blockers: [],
    }
    : { candidate: null, blockers: uniqueBlockers }
}

export function buildBoardMatrixRows(input: {
  evidence: Array<{ sourceColorCode: string; item: BoardMatrixEvidence }>
  colorConfigurations: Map<string, ColorConfiguration>
}): BoardMatrixRow[] {
  const consolidatedEvidence = consolidateIdenticalBoardEvidence(input.evidence)
  const sourceColorsWithPendingDual = new Set(
    [...new Set(consolidatedEvidence.map(entry => entry.sourceColorCode.trim().toUpperCase()))]
      .filter(sourceColorCode => detectBoardDualCandidates({
        evidence: consolidatedEvidence
          .filter(entry => entry.sourceColorCode.trim().toUpperCase() === sourceColorCode && entry.item.role === 'role_pending')
          .map(entry => entry.item),
      }).length > 0)
  )
  const byKey = new Map<string, Array<{ sourceColorCode: string; item: BoardMatrixEvidence }>>()
  for (const entry of consolidatedEvidence) {
    const sourceColorCode = entry.sourceColorCode.trim().toUpperCase()
    const key = `${sourceColorCode}|${entry.item.role}`
    byKey.set(key, [...(byKey.get(key) ?? []), { ...entry, sourceColorCode }])
  }
  const rows = [...byKey.entries()].map(([key, entries]) => {
    const sourceColorCode = entries[0]?.sourceColorCode ?? ''
    const role = entries[0]?.item.role ?? 'role_pending'
    const roleSource: BoardMatrixRoleSource = entries.some(entry => entry.item.roleSource === 'published_bom')
      ? 'published_bom'
      : entries.some(entry => entry.item.roleSource === 'sku_override')
        ? 'sku_override'
        : entries.some(entry => entry.item.roleSource === 'evidence')
          ? 'evidence'
          : 'pending'
    const evidence = entries.map(entry => entry.item).sort((left, right) => left.skuComplete.localeCompare(right.skuComplete) || left.itemCode.localeCompare(right.itemCode))
    const observedColorCodes = uniqueSorted(evidence.map(item => item.boardColorCode))
    const observedMaterialProfiles = uniqueSorted(evidence.map(item => item.materialProfile))
    const proposal = proposalForRole(input.colorConfigurations.get(sourceColorCode), role)
    const assessed = statusForRow({
      role,
      evidence,
      observedColorCodes,
      observedMaterialProfiles,
    })
    return {
      key,
      sourceColorCode,
      role,
      roleSource,
      observedColorCodes,
      proposedColorCode: proposal.colorCode,
      observedMaterialProfiles,
      proposedMaterialProfile: proposal.materialProfile,
      referenceMaterialProfile: null,
      referenceMaterialProfiles: [],
      recommendedColorCode: null,
      recommendedMaterialProfile: null,
      normalizedConsumptionQty: null,
      isProductColorMatch: false,
      profileIsReferenceException: false,
      hasConditionalBoardRule: false,
      hasPersistedBoardResolution: false,
      baseItemCodes: uniqueSorted(evidence.map(item => item.baseItemCode)),
      formatKeys: uniqueSorted(evidence.map(item => item.formatKey)),
      evidence,
      status: assessed.status,
      statusMessage: assessed.statusMessage,
    }
  })
  const referenceProfileByRole = new Map<BoardMatrixRole, string | null>()
  const referenceProfilesByRole = new Map<BoardMatrixRole, string[]>()
  const normalizedConsumptionByRole = new Map<BoardMatrixRole, number | null>()
  for (const role of [...new Set(rows.map(row => row.role))]) {
    const evidence = rows.filter(row => row.role === role).flatMap(row => row.evidence)
    const referenceMaterialProfiles = uniqueSorted(evidence.map(item => item.materialProfile))
    referenceProfilesByRole.set(role, referenceMaterialProfiles)
    referenceProfileByRole.set(role, mostCommonValue(evidence.flatMap(item => item.materialProfile ? [item.materialProfile.trim().toUpperCase()] : [])))
    normalizedConsumptionByRole.set(role, role === 'role_pending' || evidence.length === 0
      ? null
      : Math.max(...evidence.map(item => item.qty)))
  }
  return rows.map(row => {
    const referenceMaterialProfile = referenceProfileByRole.get(row.role) ?? null
    const referenceMaterialProfiles = referenceProfilesByRole.get(row.role) ?? []
    const isProductColorMatch = row.observedColorCodes.length === 1 && row.observedColorCodes[0] === row.sourceColorCode
    const profileIsReferenceException = referenceMaterialProfile !== null
      && row.observedMaterialProfiles.length === 1
      && row.observedMaterialProfiles[0] !== referenceMaterialProfile
    const configuredColorMatchesSap = row.proposedColorCode !== null
      && row.observedColorCodes.length === 1
      && row.proposedColorCode === row.observedColorCodes[0]
    const configuredProfileMatchesSap = row.proposedMaterialProfile !== null
      && row.observedMaterialProfiles.length === 1
      && row.proposedMaterialProfile === row.observedMaterialProfiles[0]
    const hasConditionalBoardRule = row.role === 'full_product'
      && (input.colorConfigurations.get(row.sourceColorCode)?.boardProfileConditions?.length ?? 0) > 0
    const hasPersistedBoardResolution = input.colorConfigurations.get(row.sourceColorCode)?.boardMatrixResolution?.status === 'configured'
    const hasSavedConditionalBoardRule = hasConditionalBoardRule
      && !sourceColorsWithPendingDual.has(row.sourceColorCode)
    const canClassifyException = row.status !== 'role_pending'
      && row.status !== 'profile_pending'
      && row.status !== 'conflict_real'
      && row.status !== 'variation_by_design'
    const status = hasSavedConditionalBoardRule
      ? 'matches' as const
      : canClassifyException && profileIsReferenceException && !configuredProfileMatchesSap
      ? 'profile_override_candidate' as const
      : canClassifyException && !isProductColorMatch && !configuredColorMatchesSap
        ? 'color_override_candidate' as const
        : row.status
    const recommendedMaterialProfile = recommendedProfileForRow(row, referenceMaterialProfile, profileIsReferenceException)
    const statusMessage = hasSavedConditionalBoardRule
      ? 'La estrategia condicional de tablero está guardada en la configuración de este color.'
      : status === 'profile_override_candidate'
      ? `SAP observa el perfil ${row.observedMaterialProfiles[0]} para este color, mientras el patrón de la referencia es ${referenceMaterialProfile}; requiere decidir una regla condicional por color o SKU.`
      : status === 'color_override_candidate'
        ? `El tablero interno ${row.observedColorCodes[0]} difiere del color de producto ${row.sourceColorCode}; requiere validar su cobertura SAP.`
        : canClassifyException && (configuredColorMatchesSap || configuredProfileMatchesSap)
          ? 'La configuración actual del color coincide con la evidencia SAP de este rol.'
        : row.statusMessage
    return {
      ...row,
      referenceMaterialProfile,
      referenceMaterialProfiles,
      recommendedColorCode: !isProductColorMatch && row.observedColorCodes.length === 1 ? row.observedColorCodes[0] : null,
      recommendedMaterialProfile,
      normalizedConsumptionQty: normalizedConsumptionByRole.get(row.role) ?? null,
      isProductColorMatch,
      profileIsReferenceException,
      hasConditionalBoardRule,
      hasPersistedBoardResolution,
      status,
      statusMessage,
    }
  }).sort((left, right) => left.sourceColorCode.localeCompare(right.sourceColorCode) || left.role.localeCompare(right.role))
}

export function evaluateGlobalBoardDualCandidate(input: {
  checkedSkuCompletes: string[]
  sapReadErrorCount: number
  evidence: BoardMatrixEvidence[]
}): { candidate: boolean; message: string | null } {
  if (input.checkedSkuCompletes.length === 0) return { candidate: false, message: null }
  if (input.sapReadErrorCount > 0) return {
    candidate: false,
    message: 'No se puede proponer Dual global mientras falte leer un SKU activo en SAP.',
  }
  const signatures = new Set<string>()
  for (const skuComplete of input.checkedSkuCompletes) {
    const skuEvidence = input.evidence.filter(item => item.skuComplete === skuComplete)
    const structure = skuEvidence.filter(item => item.role === 'structure')
    const front = skuEvidence.filter(item => item.role === 'front')
    const hasOnlyDualRoles = skuEvidence.every(item => item.role === 'structure' || item.role === 'front')
    const roleSignature = (items: BoardMatrixEvidence[]) => [...new Set(items.map(item => `${item.boardColorCode}:${item.materialProfile ?? 'none'}`))].sort()
    const structureSignature = roleSignature(structure)
    const frontSignature = roleSignature(front)
    if (!hasOnlyDualRoles || structureSignature.length !== 1 || frontSignature.length !== 1 || structureSignature[0] === frontSignature[0]) {
      return {
        candidate: false,
        message: 'El patron Dual no cubre de forma identica todos los SKU activos; queda pendiente por SKU o diseno.',
      }
    }
    signatures.add(`${structureSignature[0]}|${frontSignature[0]}`)
  }
  return signatures.size === 1
    ? { candidate: true, message: 'Todos los SKU elegibles y activos presentan el mismo patron Dual.' }
    : { candidate: false, message: 'Los SKU activos presentan mas de un patron Dual; queda pendiente por SKU o diseno.' }
}

/**
 * Builds complete alternatives from the profile that each reference already
 * selects and the board that SAP actually uses. No profile name or color code
 * is hardcoded: a strategy is offered only when SAP maps each source profile
 * to one unambiguous internal board/profile combination.
 */
export function deriveBoardConditionalRuleStrategies(input: {
  sourceColorCode: string
  evidence: BoardMatrixEvidence[]
  referenceMaterialProfileHint?: string | null
}): BoardMatrixConditionalStrategy[] {
  const sourceColorCode = input.sourceColorCode.trim().toUpperCase()
  const byReferenceProfile = new Map<string, Map<string, BoardMatrixEvidence[]>>()
  for (const item of input.evidence) {
    const referenceProfile = item.referenceMaterialProfile?.trim().toUpperCase()
    const observedProfile = item.materialProfile?.trim().toUpperCase()
    if (item.role !== 'full_product' || !referenceProfile || !observedProfile) continue
    const targetKey = `${item.boardColorCode.trim().toUpperCase()}|${observedProfile}`
    const targets = byReferenceProfile.get(referenceProfile) ?? new Map<string, BoardMatrixEvidence[]>()
    targets.set(targetKey, [...(targets.get(targetKey) ?? []), item])
    byReferenceProfile.set(referenceProfile, targets)
  }

  let mappings = [...byReferenceProfile.entries()].flatMap(([sourceMaterialProfile, targets]) => {
    if (targets.size !== 1) return []
    const [targetKey, observations] = [...targets.entries()][0] ?? []
    if (!targetKey || !observations) return []
    const [targetBoardColorCode, targetMaterialProfile] = targetKey.split('|')
    if (!targetBoardColorCode || !targetMaterialProfile) return []
    return [{
      sourceMaterialProfile,
      targetBoardColorCode,
      targetMaterialProfile,
      evidenceSkuCount: uniqueSkuCount(observations),
    }]
  }).sort((left, right) => right.evidenceSkuCount - left.evidenceSkuCount || left.sourceMaterialProfile.localeCompare(right.sourceMaterialProfile))

  const referenceMaterialProfileHint = input.referenceMaterialProfileHint?.trim().toUpperCase() || null
  if (mappings.length < 2 && referenceMaterialProfileHint) {
    const fullProductEvidence = input.evidence.filter(item =>
      item.role === 'full_product' && Boolean(item.materialProfile?.trim())
    )
    const byObservedPattern = new Map<string, BoardMatrixEvidence[]>()
    for (const item of fullProductEvidence) {
      const boardColorCode = item.boardColorCode.trim().toUpperCase()
      const materialProfile = item.materialProfile?.trim().toUpperCase()
      if (!materialProfile) continue
      const patternKey = `${boardColorCode}|${materialProfile}`
      byObservedPattern.set(patternKey, [...(byObservedPattern.get(patternKey) ?? []), item])
    }
    const internalPatterns = [...byObservedPattern.entries()].filter(([patternKey]) => !patternKey.startsWith(`${sourceColorCode}|`))
    const sourcePatterns = [...byObservedPattern.entries()].filter(([patternKey]) => patternKey.startsWith(`${sourceColorCode}|`))

    // A selected reference can supply the missing source profile when the
    // transversal SAP catalog does not yet have a published BOM for each SKU.
    // It remains a proposal: only one internal target and one or more explicit
    // source-color exceptions are enough to make the two alternatives legible.
    if (internalPatterns.length === 1 && sourcePatterns.length > 0) {
      const [internalPatternKey, internalObservations] = internalPatterns[0] ?? []
      const [targetBoardColorCode, targetMaterialProfile] = internalPatternKey?.split('|') ?? []
      if (targetBoardColorCode && targetMaterialProfile) {
        const hintedMapping = {
          sourceMaterialProfile: referenceMaterialProfileHint,
          targetBoardColorCode,
          targetMaterialProfile,
          evidenceSkuCount: uniqueSkuCount(internalObservations ?? []),
        }
        const sourceMappings = sourcePatterns.flatMap(([sourcePatternKey, observations]) => {
          const [, sourceMaterialProfile] = sourcePatternKey.split('|')
          if (!sourceMaterialProfile || sourceMaterialProfile === referenceMaterialProfileHint) return []
          return [{
            sourceMaterialProfile,
            targetBoardColorCode: sourceColorCode,
            targetMaterialProfile: sourceMaterialProfile,
            evidenceSkuCount: uniqueSkuCount(observations),
          }]
        })
        if (sourceMappings.length > 0) {
          mappings = [hintedMapping, ...sourceMappings]
        }
      }
    }
  }

  const hasActionableMapping = mappings.some(mapping =>
    mapping.targetBoardColorCode !== sourceColorCode
    || mapping.targetMaterialProfile !== mapping.sourceMaterialProfile
  )
  if (!hasActionableMapping && referenceMaterialProfileHint) {
    const profileOnlyPatterns = new Map<string, BoardMatrixEvidence[]>()
    for (const item of input.evidence) {
      const boardColorCode = item.boardColorCode.trim().toUpperCase()
      const materialProfile = item.materialProfile?.trim().toUpperCase()
      if (item.role !== 'full_product' || boardColorCode !== sourceColorCode || !materialProfile || materialProfile === referenceMaterialProfileHint) continue
      profileOnlyPatterns.set(materialProfile, [...(profileOnlyPatterns.get(materialProfile) ?? []), item])
    }
    const rankedPatterns = [...profileOnlyPatterns.entries()]
      .map(([materialProfile, observations]) => ({ materialProfile, observations, evidenceSkuCount: uniqueSkuCount(observations) }))
      .sort((left, right) => right.evidenceSkuCount - left.evidenceSkuCount || left.materialProfile.localeCompare(right.materialProfile))
    const defaultPattern = rankedPatterns[0]
    const secondPattern = rankedPatterns[1]
    // Do not choose a profile by chance: this fallback needs a clear SAP majority.
    if (defaultPattern && (!secondPattern || defaultPattern.evidenceSkuCount > secondPattern.evidenceSkuCount)) {
      const exceptionMappings = rankedPatterns
        .filter(pattern => pattern.materialProfile !== defaultPattern.materialProfile)
        .map(pattern => ({
          sourceMaterialProfile: pattern.materialProfile,
          targetBoardColorCode: sourceColorCode,
          targetMaterialProfile: pattern.materialProfile,
          evidenceSkuCount: pattern.evidenceSkuCount,
        }))
      if (exceptionMappings.length > 0) {
        mappings = [{
          sourceMaterialProfile: referenceMaterialProfileHint,
          targetBoardColorCode: sourceColorCode,
          targetMaterialProfile: defaultPattern.materialProfile,
          evidenceSkuCount: defaultPattern.evidenceSkuCount,
        }, ...exceptionMappings]
      }
    }
  }

  if (mappings.length < 2) return []
  const evidenceSkuCount = new Set(input.evidence.map(item => item.skuComplete)).size
  const preserveProductColorConditions = mappings.filter(mapping =>
    mapping.targetBoardColorCode !== sourceColorCode
    || mapping.targetMaterialProfile !== mapping.sourceMaterialProfile
  )
  const strategies: BoardMatrixConditionalStrategy[] = preserveProductColorConditions.length > 0
    ? [{
      strategyId: 'keep_product_color',
      kind: 'keep_product_color',
      defaultBoardColorCode: sourceColorCode,
      defaultMaterialProfile: null,
      conditions: preserveProductColorConditions,
      evidenceSkuCount,
    }]
    : []

  const internalDefault = [...mappings]
    // A conditional alternative can change only the material profile while
    // preserving the product color (for example, 0442 ST -> 0442 CARB2).
    .filter(mapping => mapping.targetBoardColorCode !== sourceColorCode || mapping.targetMaterialProfile !== mapping.sourceMaterialProfile)
    .sort((left, right) => right.evidenceSkuCount - left.evidenceSkuCount || left.targetBoardColorCode.localeCompare(right.targetBoardColorCode) || left.targetMaterialProfile.localeCompare(right.targetMaterialProfile))[0]
  if (!internalDefault) return strategies
  const defaultSignature = `${internalDefault.targetBoardColorCode}|${internalDefault.targetMaterialProfile}`
  const exceptionConditions = mappings.filter(mapping => `${mapping.targetBoardColorCode}|${mapping.targetMaterialProfile}` !== defaultSignature)
  if (exceptionConditions.length === 0) return strategies
  strategies.push({
    strategyId: `internal_default_${internalDefault.targetBoardColorCode}_${internalDefault.targetMaterialProfile}`.toLowerCase(),
    kind: 'use_internal_default',
    defaultBoardColorCode: internalDefault.targetBoardColorCode,
    defaultMaterialProfile: internalDefault.targetMaterialProfile,
    conditions: exceptionConditions,
    evidenceSkuCount,
  })
  return strategies
}

/**
 * A Dual candidate is a two-board SAP pattern. Quantity only proposes the
 * structure/front ordering for review; the user still chooses a case before
 * it becomes a color rule or a per-SKU override.
 */
export function detectBoardDualCandidates(input: {
  evidence: BoardMatrixEvidence[]
}): BoardMatrixDualCandidate[] {
  const evidence = consolidateIdenticalBoardEvidence(input.evidence.map(item => ({ sourceColorCode: '', item }))).map(entry => entry.item)
  const candidateCases = new Map<string, BoardMatrixDualCandidate['cases']>()
  const evidenceBySku = new Map<string, BoardMatrixEvidence[]>()
  for (const item of evidence) evidenceBySku.set(item.skuComplete, [...(evidenceBySku.get(item.skuComplete) ?? []), item])

  for (const [skuComplete, skuEvidence] of evidenceBySku) {
    const byPattern = new Map<string, BoardMatrixEvidence[]>()
    for (const item of skuEvidence) {
      const materialProfile = item.materialProfile?.trim().toUpperCase()
      if (!materialProfile) continue
      const key = `${item.boardColorCode.trim().toUpperCase()}|${materialProfile}`
      byPattern.set(key, [...(byPattern.get(key) ?? []), item])
    }
    if (byPattern.size !== 2) continue
    const patterns = [...byPattern.entries()].map(([key, items]) => {
      const [colorCode, materialProfile] = key.split('|')
      return {
        colorCode: colorCode ?? '',
        materialProfile: materialProfile ?? '',
        qty: items.reduce((total, item) => total + item.qty, 0),
        items,
      }
    }).sort((left, right) => right.qty - left.qty || left.colorCode.localeCompare(right.colorCode) || left.materialProfile.localeCompare(right.materialProfile))
    const structure = patterns[0]
    const front = patterns[1]
    if (!structure || !front || structure.qty === front.qty || structure.colorCode === front.colorCode) continue
    const candidateKey = `${structure.colorCode}|${structure.materialProfile}|${front.colorCode}|${front.materialProfile}`
    const boardLines = [...structure.items, ...front.items]
      .sort((left, right) => left.itemCode.localeCompare(right.itemCode) || left.lineIdentity.localeCompare(right.lineIdentity))
      .map(item => ({
        itemCode: item.itemCode,
        itemName: item.itemName ?? null,
        colorCode: item.boardColorCode,
        materialProfile: item.materialProfile,
        qty: item.qty,
      }))
    candidateCases.set(candidateKey, [...(candidateCases.get(candidateKey) ?? []), {
      skuComplete,
      skuItemName: skuEvidence[0]?.skuItemName ?? null,
      structureQty: structure.qty,
      frontQty: front.qty,
      boardLines,
    }])
  }

  return [...candidateCases.entries()]
    .map(([key, cases]) => {
      const [structureColorCode, structureMaterialProfile, frontColorCode, frontMaterialProfile] = key.split('|')
      return {
        structureColorCode: structureColorCode ?? '',
        structureMaterialProfile: structureMaterialProfile ?? '',
        frontColorCode: frontColorCode ?? '',
        frontMaterialProfile: frontMaterialProfile ?? '',
        evidenceSkuCount: cases.length,
        cases: cases.sort((left, right) => left.skuComplete.localeCompare(right.skuComplete)),
      }
    })
    .sort((left, right) => right.evidenceSkuCount - left.evidenceSkuCount || left.structureColorCode.localeCompare(right.structureColorCode) || left.frontColorCode.localeCompare(right.frontColorCode))
}
