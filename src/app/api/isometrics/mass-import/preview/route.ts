import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/supabase'
import { apiGuard } from '@/utils/auth/access'
import {
  buildExtendedBaseKey,
  buildExtendedKey,
  buildLooseBaseKey,
  buildSpecialLabelBaseKey,
  isSpecificAccessory,
  normalizeAccessory,
  normalizeCommercialMeasure,
  normalizeText,
  normalizeLine,
  normalizeProductName,
  normalizeSpecialLabel,
  normalizeVersionCode,
  parseDescriptorFromBaseName,
  extractWidthFromCommercialMeasure,
  isOneDimensionalMeasure,
  type BulkIsometricMatchOptions,
  type ParsedIsometricDescriptor,
} from '@/lib/isometrics/bulkMatch'
import { assignConflictGroupCodes } from '@/lib/isometrics/conflictGroups'

export const runtime = 'nodejs'
export const maxDuration = 60

type PreviewFileInput = {
  relative_path: string
  base_name: string
  ext: string // includes dot, e.g. ".svg" or "" when unknown/extensionless
}

type PreviewRequest = {
  files: PreviewFileInput[]
  options?: {
    familyCodesCsv?: string
    familyCodes?: string[]
    overwriteExisting?: boolean
    ignoreAi?: boolean
    treatExtensionlessAsSvg?: boolean
    includeLineInMatch?: boolean
    includeSpecialLabelInMatch?: boolean
    ignoreKeywordsCsv?: string
    forcedDelimiter?: '|' | '-'
  }
}

type ReferenceRow = {
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

type VersionRow = {
  id: string
  reference_id: string
  version_code: string
  accessory_text: string | null
  isometric_asset_id: string | null
  isometric_path: string | null
}

type TargetReferenceSummary = {
  id: string
  family_code: string | null
  reference_code: string | null
  designation: string | null
  product_name: string | null
  commercial_measure: string | null
  line: string | null
  special_label: string | null
  accessory_text: string | null
}

type TargetVersionSummary = {
  id: string
  reference_id: string
  version_code: string
  accessory_text: string | null
  reference_code: string | null
  family_code: string | null
  designation: string | null
  product_name: string | null
  commercial_measure: string | null
  line: string | null
  special_label: string | null
}

function parseIgnoreKeywords(ignoreKeywordsCsv?: string) {
  const raw = String(ignoreKeywordsCsv || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return raw.map(s => normalizeText(s)).filter(s => s && s !== 'NA')
}

function parseFamilyCodesCsv(familyCodesCsv?: string) {
  const raw = String(familyCodesCsv || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return raw.map(s => String(s).trim().toUpperCase()).filter(Boolean)
}

function parseFamilyCodes(options: { familyCodesCsv?: string; familyCodes?: string[] }) {
  const fromArray = Array.isArray(options.familyCodes) ? options.familyCodes.map(v => String(v).trim()).filter(Boolean) : []
  const base = (fromArray.length > 0 ? fromArray : parseFamilyCodesCsv(options.familyCodesCsv)).map(v => v.toUpperCase())

  // Prefix-tolerant expansion:
  // - If user selects "VCOC01", also search "COC01" (strip first char).
  // - If user selects "COC01", also search "VCOC01"/"PCOC01"/"CCOC01" because family codes may be prefixed in DB.
  const expanded = new Set<string>()
  for (const c of base) {
    if (!c) continue
    expanded.add(c)
    if (/^[VCP].+/.test(c) && c.length > 1) expanded.add(c.slice(1))
    if (!/^[VCP].+/.test(c)) {
      expanded.add(`V${c}`)
      expanded.add(`C${c}`)
      expanded.add(`P${c}`)
    }
  }
  return Array.from(expanded).sort()
}

function shouldIgnoreByKeywords(baseName: string, keywords: string[]) {
  if (!keywords.length) return false
  const n = normalizeText(baseName)
  return keywords.some(k => k && k !== 'NA' && n.includes(k))
}

function isAiFile(baseName: string, ext: string) {
  const e = String(ext || '').toLowerCase()
  if (e === '.ai') return true
  const b = String(baseName || '').toLowerCase()
  return b.endsWith('.ai')
}

export async function POST(req: Request) {
  const guard = await apiGuard('module:assets')
  if (guard.response) return guard.response

  try {
    const body = (await req.json().catch(() => null)) as PreviewRequest | null
    if (!body || !Array.isArray(body.files)) {
      return NextResponse.json({ success: false, error: 'Invalid payload. Expected { files: [...] }.' }, { status: 400 })
    }

    const options = body.options || {}
    const includeLineInMatch = options.includeLineInMatch !== false
    const includeSpecialLabelInMatch = options.includeSpecialLabelInMatch !== false
    const forcedDelimiter = options.forcedDelimiter
    const ignoreAi = options.ignoreAi !== false

    const matchOpts: BulkIsometricMatchOptions = {
      includeLineInMatch,
      includeSpecialLabelInMatch,
      forcedDelimiter,
      lexicon: undefined,
    }

    const ignoreKeywords = parseIgnoreKeywords(options.ignoreKeywordsCsv)
    const familyCodes = parseFamilyCodes(options)
    const familyWhere =
      familyCodes.length > 0 ? `WHERE family_code IN (${familyCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(',')})` : ''
    const referenceIdsSubquery = familyCodes.length > 0 ? `(SELECT id FROM public.product_references ${familyWhere})` : ''

    // 1) Fetch references + versions (same source of truth as the proven CLI script)
    const referenceRows = (await dbQuery(`
      SELECT
        id,
        family_code,
        reference_code,
        designation,
        line,
        special_label,
        product_name,
        commercial_measure,
        (ref_attrs->>'accessory_text') as accessory_text,
        isometric_asset_id,
        isometric_path
      FROM public.product_references
      ${familyWhere}
    `)) as ReferenceRow[]

    const versionRows = (await dbQuery(`
      SELECT
        id,
        reference_id,
        version_code,
        (version_attrs->>'accessory_text') as accessory_text,
        (version_attrs->>'isometric_asset_id') as isometric_asset_id,
        (version_attrs->>'isometric_path') as isometric_path
      FROM public.product_versions
      ${familyCodes.length > 0 ? `WHERE reference_id IN ${referenceIdsSubquery}` : ''}
    `)) as VersionRow[]

    const versionsByReference = new Map<string, VersionRow[]>()
    for (const v of versionRows) {
      const list = versionsByReference.get(v.reference_id) || []
      list.push(v)
      versionsByReference.set(v.reference_id, list)
    }
    const referenceById = new Map<string, ReferenceRow>()
    for (const r of referenceRows) referenceById.set(r.id, r)

    const extendedStrictIndex = new Map<string, ReferenceRow[]>()
    const extendedBaseIndex = new Map<string, ReferenceRow[]>()
    const specialLabelBaseIndex = new Map<string, ReferenceRow[]>()
    const looseBaseIndex = new Map<string, ReferenceRow[]>()
    const measureDesignationIndex = new Map<string, ReferenceRow[]>()
    const widthStrictIndex = new Map<string, ReferenceRow[]>()
    const widthBaseIndex = new Map<string, ReferenceRow[]>()
    const widthSpecialLabelBaseIndex = new Map<string, ReferenceRow[]>()
    const widthLooseBaseIndex = new Map<string, ReferenceRow[]>()
    for (const r of referenceRows) {
      const strictKey = buildExtendedKey(r)
      ;(extendedStrictIndex.get(strictKey) || extendedStrictIndex.set(strictKey, []).get(strictKey)!).push(r)

      const baseKey = buildExtendedBaseKey(r)
      ;(extendedBaseIndex.get(baseKey) || extendedBaseIndex.set(baseKey, []).get(baseKey)!).push(r)

      const slKey = buildSpecialLabelBaseKey(r)
      ;(specialLabelBaseIndex.get(slKey) || specialLabelBaseIndex.set(slKey, []).get(slKey)!).push(r)

      const looseKey = buildLooseBaseKey(r)
      ;(looseBaseIndex.get(looseKey) || looseBaseIndex.set(looseKey, []).get(looseKey)!).push(r)

      // Fallback index that ignores product_name (useful when product_name is empty/NA in DB, e.g. some kitchen/alacena items).
      const mdKey = [
        normalizeText(r.designation),
        normalizeCommercialMeasure(r.commercial_measure),
        normalizeLine(r.line),
        normalizeSpecialLabel(r.special_label),
        normalizeAccessory(r.accessory_text),
      ].join('|||')
      ;(measureDesignationIndex.get(mdKey) || measureDesignationIndex.set(mdKey, []).get(mdKey)!).push(r)

      // Width-only keys (for filenames that only include "150" but DB has "150X55", etc.)
      const width = extractWidthFromCommercialMeasure(r.commercial_measure)
      const wStrictKey = [
        normalizeText(r.designation),
        normalizeProductName(r.product_name),
        normalizeText(width),
        normalizeLine(r.line),
        normalizeSpecialLabel(r.special_label),
        normalizeAccessory(r.accessory_text),
      ].join('|||')
      ;(widthStrictIndex.get(wStrictKey) || widthStrictIndex.set(wStrictKey, []).get(wStrictKey)!).push(r)

      const wBaseKey = [
        normalizeText(r.designation),
        normalizeProductName(r.product_name),
        normalizeText(width),
        normalizeLine(r.line),
        normalizeSpecialLabel(r.special_label),
      ].join('|||')
      ;(widthBaseIndex.get(wBaseKey) || widthBaseIndex.set(wBaseKey, []).get(wBaseKey)!).push(r)

      const wSlKey = [
        normalizeText(r.designation),
        normalizeProductName(r.product_name),
        normalizeText(width),
        normalizeSpecialLabel(r.special_label),
      ].join('|||')
      ;(widthSpecialLabelBaseIndex.get(wSlKey) || widthSpecialLabelBaseIndex.set(wSlKey, []).get(wSlKey)!).push(r)

      const wLooseKey = [normalizeText(r.designation), normalizeProductName(r.product_name), normalizeText(width)].join(
        '|||'
      )
      ;(widthLooseBaseIndex.get(wLooseKey) || widthLooseBaseIndex.set(wLooseKey, []).get(wLooseKey)!).push(r)
    }

    const lexicon = (() => {
      if (familyCodes.length === 0) return undefined
      const designations = Array.from(new Set(referenceRows.map(r => String(r.designation || '').trim()).filter(Boolean)))
      const productNames = Array.from(new Set(referenceRows.map(r => String(r.product_name || '').trim()).filter(Boolean)))
      const specialLabels = Array.from(new Set(referenceRows.map(r => String(r.special_label || '').trim()).filter(Boolean)))
      const lines = Array.from(new Set(referenceRows.map(r => String(r.line || '').trim()).filter(Boolean)))
      const commercialMeasures = Array.from(new Set(referenceRows.map(r => String(r.commercial_measure || '').trim()).filter(Boolean)))
      const accessoryTexts = Array.from(
        new Set(
          referenceRows
            .map(r => String(r.accessory_text || '').trim())
            .concat(versionRows.map(v => String(v.accessory_text || '').trim()))
            .filter(Boolean)
        )
      )
      return { designations, productNames, specialLabels, lines, accessoryTexts, commercialMeasures }
    })()

    if (lexicon) matchOpts.lexicon = lexicon

    // 2) Create job + items (optional). If tables don't exist, fall back to stateless mode.
    let jobId: string | null = null
    let mode: 'stateful' | 'stateless' = 'stateful'
    try {
      const jobRows =
        (await dbQuery(`
          INSERT INTO public.bulk_isometric_import_jobs (status, options, total, created_at, updated_at)
          VALUES (
            'preview_ready',
            '${JSON.stringify({ ...options, includeLineInMatch, includeSpecialLabelInMatch, ignoreAi, familyCodes }).replace(/'/g, "''")}'::jsonb,
            ${body.files.length},
            now(),
            now()
          )
          RETURNING id
        `)) || []
      const id = String(jobRows?.[0]?.id || '')
      if (id) jobId = id
      else {
        mode = 'stateless'
        jobId = null
      }
    } catch {
      mode = 'stateless'
      jobId = null
    }

    type Planned = {
      file: PreviewFileInput
      parsed: ParsedIsometricDescriptor | null
      matchStatus: string
      matchMode: string | null
      targetGranularity: 'reference' | 'version'
      candidateReferences: ReferenceRow[]
      versionTargets?: VersionRow[]
      skipReasonCode?: 'ACCESSORY_NOT_FOUND'
      notes?: string
      ignored: boolean
    }

    const planned: Planned[] = []
    for (const f of body.files) {
      const ext = String(f.ext || '')
      const base = String(f.base_name || '').trim()

      if (!base) {
        planned.push({
          file: f,
          parsed: null,
          matchStatus: 'PARSE_FAILED',
          matchMode: null,
          targetGranularity: 'reference',
          candidateReferences: [],
          ignored: false,
          notes: 'empty_base_name',
        })
        continue
      }

      if (ignoreAi && isAiFile(base, ext)) {
        planned.push({
          file: f,
          parsed: null,
          matchStatus: 'IGNORED_AI',
          matchMode: null,
          targetGranularity: 'reference',
          candidateReferences: [],
          ignored: true,
        })
        continue
      }

      if (shouldIgnoreByKeywords(base, ignoreKeywords)) {
        planned.push({
          file: f,
          parsed: null,
          matchStatus: 'IGNORED_KEYWORD',
          matchMode: null,
          targetGranularity: 'reference',
          candidateReferences: [],
          ignored: true,
          notes: `ignored_by_keywords`,
        })
        continue
      }

      const parsed = parseDescriptorFromBaseName(base, matchOpts)
      if (!parsed) {
        planned.push({
          file: f,
          parsed: null,
          matchStatus: 'PARSE_FAILED',
          matchMode: null,
          targetGranularity: 'reference',
          candidateReferences: [],
          ignored: false,
          notes: 'parse_failed',
        })
        continue
      }

      const desiredAcc = normalizeAccessory(parsed.accessory_text)
      const desiredAccSpecific = isSpecificAccessory(desiredAcc)

      const strictKey = buildExtendedKey(parsed)
      let candidates = extendedStrictIndex.get(strictKey) || []
      let matchMode:
        | 'strict'
        | 'extended_base_single_accessory'
        | 'extended_base_accessory_filter'
        | 'extended_base_ambiguous'
        | 'special_label_base_single_accessory'
        | 'special_label_base_accessory_filter'
        | 'special_label_base_ambiguous'
        | 'loose_base_single_accessory'
        | 'loose_base_accessory_filter'
        | 'loose_base_ambiguous'
        | 'width_only_strict'
        | 'width_only_base'
        | 'width_only_special_label_base'
        | 'width_only_loose_base' = 'strict'

      let targetGranularity: 'reference' | 'version' = 'reference'
      let versionTargets: VersionRow[] | undefined
      let skipReasonCode: Planned['skipReasonCode'] | undefined
      let baseCandidatesForVersion: ReferenceRow[] | null = null
      let notes: string | undefined

      if (candidates.length === 0) {
        const baseKey = buildExtendedBaseKey(parsed)
        const baseCandidates = extendedBaseIndex.get(baseKey) || []
        if (baseCandidates.length > 0) {
          const accessorySet = new Set(baseCandidates.map(r => normalizeAccessory(r.accessory_text)))
          if (accessorySet.size === 1) {
            const only = Array.from(accessorySet)[0]
            if (desiredAccSpecific && only !== desiredAcc) {
              baseCandidatesForVersion = baseCandidates
              skipReasonCode = 'ACCESSORY_NOT_FOUND'
            } else {
              candidates = baseCandidates
              matchMode = 'extended_base_single_accessory'
            }
          } else {
            const filtered = baseCandidates.filter(r => normalizeAccessory(r.accessory_text) === desiredAcc)
            if (filtered.length > 0) {
              candidates = filtered
              matchMode = 'extended_base_accessory_filter'
            } else {
              if (desiredAccSpecific) {
                baseCandidatesForVersion = baseCandidates
                skipReasonCode = 'ACCESSORY_NOT_FOUND'
              } else {
                candidates = baseCandidates
                matchMode = 'extended_base_ambiguous'
              }
            }
          }
        }
      }

      if (candidates.length === 0) {
        const slKey = buildSpecialLabelBaseKey(parsed)
        const slCandidates = specialLabelBaseIndex.get(slKey) || []
        if (slCandidates.length > 0) {
          const accessorySet = new Set(slCandidates.map(r => normalizeAccessory(r.accessory_text)))
          if (accessorySet.size === 1) {
            const only = Array.from(accessorySet)[0]
            if (desiredAccSpecific && only !== desiredAcc) {
              baseCandidatesForVersion = slCandidates
              skipReasonCode = 'ACCESSORY_NOT_FOUND'
            } else {
              candidates = slCandidates
              matchMode = 'special_label_base_single_accessory'
            }
          } else {
            const filtered = slCandidates.filter(r => normalizeAccessory(r.accessory_text) === desiredAcc)
            if (filtered.length > 0) {
              candidates = filtered
              matchMode = 'special_label_base_accessory_filter'
            } else {
              if (desiredAccSpecific) {
                baseCandidatesForVersion = slCandidates
                skipReasonCode = 'ACCESSORY_NOT_FOUND'
              } else {
                candidates = slCandidates
                matchMode = 'special_label_base_ambiguous'
              }
            }
          }
        }
      }

      if (candidates.length === 0) {
        const looseKey = buildLooseBaseKey(parsed)
        const looseCandidates = looseBaseIndex.get(looseKey) || []
        if (looseCandidates.length > 0) {
          const accessorySet = new Set(looseCandidates.map(r => normalizeAccessory(r.accessory_text)))
          if (accessorySet.size === 1) {
            const only = Array.from(accessorySet)[0]
            if (desiredAccSpecific && only !== desiredAcc) {
              baseCandidatesForVersion = looseCandidates
              skipReasonCode = 'ACCESSORY_NOT_FOUND'
            } else {
              candidates = looseCandidates
              matchMode = 'loose_base_single_accessory'
            }
          } else {
            const filtered = looseCandidates.filter(r => normalizeAccessory(r.accessory_text) === desiredAcc)
            if (filtered.length > 0) {
              candidates = filtered
              matchMode = 'loose_base_accessory_filter'
            } else {
              if (desiredAccSpecific) {
                baseCandidatesForVersion = looseCandidates
                skipReasonCode = 'ACCESSORY_NOT_FOUND'
              } else {
                candidates = looseCandidates
                matchMode = 'loose_base_ambiguous'
              }
            }
          }
        }
      }

      // Fallback: if still no candidates, try matching by designation+measure(+line/special_label/accessory) ignoring product_name.
      if (candidates.length === 0) {
        const mdKey = [
          normalizeText(parsed.designation),
          normalizeCommercialMeasure(parsed.commercial_measure),
          normalizeLine(parsed.line),
          normalizeSpecialLabel(parsed.special_label),
          normalizeAccessory(parsed.accessory_text),
        ].join('|||')
        const mdCandidates = measureDesignationIndex.get(mdKey) || []
        if (mdCandidates.length > 0) {
          candidates = mdCandidates
          matchMode = 'loose_base_ambiguous'
          notes = notes ? `${notes}|ignored_product_name` : 'ignored_product_name'
        }
      }

      // Width-only fallback: if the filename only includes width (e.g. "150CM" => "150"),
      // allow matching against references whose commercial_measure starts with that width (e.g. "150X55").
      if (candidates.length === 0 && isOneDimensionalMeasure(parsed.commercial_measure)) {
        const width = extractWidthFromCommercialMeasure(parsed.commercial_measure)
        const wStrictKey = [
          normalizeText(parsed.designation),
          normalizeProductName(parsed.product_name),
          normalizeText(width),
          normalizeLine(parsed.line),
          normalizeSpecialLabel(parsed.special_label),
          normalizeAccessory(parsed.accessory_text),
        ].join('|||')
        const wStrict = widthStrictIndex.get(wStrictKey) || []
        if (wStrict.length > 0) {
          candidates = wStrict
          matchMode = 'width_only_strict'
          notes = notes ? `${notes}|width_only_measure` : 'width_only_measure'
        } else {
          const wBaseKey = [
            normalizeText(parsed.designation),
            normalizeProductName(parsed.product_name),
            normalizeText(width),
            normalizeLine(parsed.line),
            normalizeSpecialLabel(parsed.special_label),
          ].join('|||')
          const wBase = widthBaseIndex.get(wBaseKey) || []
          if (wBase.length > 0) {
            const accessorySet = new Set(wBase.map(r => normalizeAccessory(r.accessory_text)))
            if (accessorySet.size === 1) {
              candidates = wBase
              matchMode = 'width_only_base'
              notes = notes ? `${notes}|width_only_measure` : 'width_only_measure'
            } else {
              const filtered = wBase.filter(r => normalizeAccessory(r.accessory_text) === desiredAcc)
              if (filtered.length > 0) {
                candidates = filtered
                matchMode = 'width_only_base'
                notes = notes ? `${notes}|width_only_measure` : 'width_only_measure'
              }
            }
          } else {
            const wSlKey = [
              normalizeText(parsed.designation),
              normalizeProductName(parsed.product_name),
              normalizeText(width),
              normalizeSpecialLabel(parsed.special_label),
            ].join('|||')
            const wSl = widthSpecialLabelBaseIndex.get(wSlKey) || []
            if (wSl.length > 0) {
              candidates = wSl
              matchMode = 'width_only_special_label_base'
              notes = notes ? `${notes}|width_only_measure` : 'width_only_measure'
            } else {
              const wLooseKey = [
                normalizeText(parsed.designation),
                normalizeProductName(parsed.product_name),
                normalizeText(width),
              ].join('|||')
              const wLoose = widthLooseBaseIndex.get(wLooseKey) || []
              if (wLoose.length > 0) {
                candidates = wLoose
                matchMode = 'width_only_loose_base'
                notes = notes ? `${notes}|width_only_measure` : 'width_only_measure'
              }
            }
          }
        }
      }

      if (candidates.length > 0) {
        skipReasonCode = undefined
        baseCandidatesForVersion = null
      }

      if (candidates.length === 0 && desiredAccSpecific && baseCandidatesForVersion && baseCandidatesForVersion.length > 0) {
        const matched: VersionRow[] = []
        for (const r of baseCandidatesForVersion) {
          const vList = versionsByReference.get(r.id) || []
          for (const v of vList) {
            if (normalizeAccessory(v.accessory_text) === desiredAcc) matched.push(v)
          }
        }
        if (matched.length > 0) {
          const cme = matched.filter(v => normalizeVersionCode(v.version_code) === 'CME')
          versionTargets = cme.length > 0 ? cme : matched
          targetGranularity = 'version'
          candidates = baseCandidatesForVersion
          matchMode = 'extended_base_accessory_filter'
          skipReasonCode = undefined
        }
      }

      const matchStatus = (() => {
        if (candidates.length === 0) {
          if (skipReasonCode === 'ACCESSORY_NOT_FOUND') return 'NO_MATCH'
          return 'NO_MATCH'
        }
        if (
          matchMode === 'extended_base_ambiguous' ||
          matchMode === 'special_label_base_ambiguous' ||
          matchMode === 'loose_base_ambiguous' ||
          matchMode === 'width_only_strict' ||
          matchMode === 'width_only_base' ||
          matchMode === 'width_only_special_label_base' ||
          matchMode === 'width_only_loose_base'
        ) {
          return 'AMBIGUOUS'
        }
        return targetGranularity === 'version' ? 'MATCH_OK_VERSION_OVERRIDE' : 'MATCH_OK_REFERENCE'
      })()

      planned.push({
        file: f,
        parsed,
        matchStatus,
        matchMode,
        targetGranularity,
        candidateReferences: candidates,
        versionTargets,
        skipReasonCode,
        ignored: false,
        notes,
      })
    }

    // 3) Conflicts grouping (same semantics as CLI: if any target ref/version is hit by >1 file)
    const planTargets = planned.map(p => {
      const keys: string[] = []
      if (p.matchStatus.startsWith('MATCH_OK')) {
        if (p.targetGranularity === 'version' && p.versionTargets && p.versionTargets.length > 0) {
          for (const v of p.versionTargets) keys.push(`V:${v.id}`)
        } else {
          for (const r of p.candidateReferences) keys.push(`R:${r.id}`)
        }
      }
      return { targetKeys: keys }
    })

    const { planIndexToGroupCode, conflictingTargetKeys } = assignConflictGroupCodes({ planTargets })

    // Update matchStatus to CONFLICT_REF when needed
    for (let i = 0; i < planned.length; i++) {
      const code = planIndexToGroupCode.get(i)
      if (!code) continue
      const p = planned[i]
      if (!p.matchStatus.startsWith('MATCH_OK')) continue
      p.matchStatus = 'CONFLICT_REF'
      p.notes = p.notes ? `${p.notes}|conflict_group=${code}` : `conflict_group=${code}`
    }

    // Counters
    let ignored = 0
    let matchOk = 0
    let noMatch = 0
    let ambiguous = 0
    let conflicts = 0
    for (const p of planned) {
      if (p.matchStatus.startsWith('IGNORED')) ignored++
      else if (p.matchStatus === 'AMBIGUOUS') ambiguous++
      else if (p.matchStatus === 'CONFLICT_REF') conflicts++
      else if (p.matchStatus.startsWith('MATCH_OK')) matchOk++
      else if (p.matchStatus === 'NO_MATCH' || p.matchStatus === 'PARSE_FAILED') noMatch++
    }

    if (jobId) {
      try {
        await dbQuery(`
          UPDATE public.bulk_isometric_import_jobs
          SET ignored = ${ignored},
              match_ok = ${matchOk},
              no_match = ${noMatch},
              ambiguous = ${ambiguous},
              conflicts = ${conflicts},
              updated_at = now()
          WHERE id = '${jobId.replace(/'/g, "''")}'
        `)
      } catch {
        // ignore
      }
    }

    // Insert items if stateful
    const itemRows: { id: string }[] = []
    if (jobId) {
      for (let i = 0; i < planned.length; i++) {
        const p = planned[i]
        const code = planIndexToGroupCode.get(i) || null
        const parsedJson = p.parsed ? JSON.stringify(p.parsed) : '{}'
        const refIds =
          p.candidateReferences && p.candidateReferences.length > 0
            ? `ARRAY[${p.candidateReferences.map(r => `'${r.id.replace(/'/g, "''")}'`).join(',')}]::uuid[]`
            : 'NULL'
        const verIds =
          p.versionTargets && p.versionTargets.length > 0
            ? `ARRAY[${p.versionTargets.map(v => `'${v.id.replace(/'/g, "''")}'`).join(',')}]::uuid[]`
            : 'NULL'

        const rows =
          (await dbQuery(`
            INSERT INTO public.bulk_isometric_import_items (
              job_id, relative_path, base_name, ext,
              parsed, match_status,
              target_reference_ids, target_version_ids,
              conflict_group_code, selected,
              notes, created_at, updated_at
            ) VALUES (
              '${jobId.replace(/'/g, "''")}',
              '${String(p.file.relative_path || '').replace(/'/g, "''")}',
              '${String(p.file.base_name || '').replace(/'/g, "''")}',
              '${String(p.file.ext || '').replace(/'/g, "''")}',
              '${parsedJson.replace(/'/g, "''")}'::jsonb,
              '${p.matchStatus.replace(/'/g, "''")}',
              ${refIds},
              ${verIds},
              ${code ? `'${code.replace(/'/g, "''")}'` : 'NULL'},
              false,
              ${p.notes ? `'${String(p.notes).replace(/'/g, "''")}'` : 'NULL'},
              now(),
              now()
            )
            RETURNING id
          `)) || []
        itemRows.push({ id: rows?.[0]?.id })
      }
    }

    const responseItems = planned.map((p, idx) => {
      const group = planIndexToGroupCode.get(idx) || null
      const targetType = p.targetGranularity
      const targetRefIds = (p.candidateReferences || []).map(r => r.id)
      const targetVerIds = (p.versionTargets || []).map(v => v.id)
      const conflictTargets =
        p.targetGranularity === 'version'
          ? targetVerIds.filter(id => conflictingTargetKeys.has(`V:${id}`))
          : targetRefIds.filter(id => conflictingTargetKeys.has(`R:${id}`))

      const target_reference_summaries: TargetReferenceSummary[] = (p.candidateReferences || []).map(r => ({
        id: r.id,
        family_code: r.family_code,
        reference_code: r.reference_code,
        designation: r.designation,
        product_name: r.product_name,
        commercial_measure: r.commercial_measure,
        line: r.line,
        special_label: r.special_label,
        accessory_text: r.accessory_text,
      }))

      const target_version_summaries: TargetVersionSummary[] = (p.versionTargets || []).map(v => {
        const ref = referenceById.get(v.reference_id)
        return {
          id: v.id,
          reference_id: v.reference_id,
          version_code: v.version_code,
          accessory_text: v.accessory_text,
          reference_code: ref?.reference_code ?? null,
          family_code: ref?.family_code ?? null,
          designation: ref?.designation ?? null,
          product_name: ref?.product_name ?? null,
          commercial_measure: ref?.commercial_measure ?? null,
          line: ref?.line ?? null,
          special_label: ref?.special_label ?? null,
        }
      })

      const conflict_target_reference_summaries =
        targetType === 'reference' ? target_reference_summaries.filter(r => conflictTargets.includes(r.id)) : []
      const conflict_target_version_summaries =
        targetType === 'version' ? target_version_summaries.filter(v => conflictTargets.includes(v.id)) : []

      return {
        item_id: jobId ? itemRows[idx]?.id : p.file.relative_path,
        relative_path: p.file.relative_path,
        base_name: p.file.base_name,
        ext: p.file.ext,
        parsed: p.parsed,
        match_status: p.matchStatus,
        match_mode: p.matchMode,
        target_granularity: targetType,
        target_reference_ids: targetRefIds,
        target_version_ids: targetVerIds,
        target_reference_summaries,
        target_version_summaries,
        conflict_group_code: group,
        conflict_target_ids: conflictTargets,
        conflict_target_reference_summaries,
        conflict_target_version_summaries,
        notes: p.notes || null,
      }
    })

    return NextResponse.json({
      success: true,
      job: { id: jobId, mode, total: body.files.length, ignored, matchOk, noMatch, ambiguous, conflicts },
      items: responseItems,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Preview failed'
    console.error('[isometrics/mass-import/preview] error', e)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
