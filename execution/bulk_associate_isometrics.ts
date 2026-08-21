import * as dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Load env before importing Supabase client (it reads env at module load).
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { dbQuery, supabaseAdmin } from '../src/lib/supabase'
import {
    errorMessage,
    parseArgs,
    shouldIgnoreFile,
    normalizeAccessory,
    isSpecificAccessory,
    normalizeVersionCode,
    buildExtendedKey,
    buildExtendedBaseKey,
    buildSpecialLabelBaseKey,
    buildLooseBaseKey,
    parseDescriptorFromBaseName,
    listFiles,
    sha256Hex,
    csvEscape,
    guessContentType,
    type ParsedDescriptor,
    type ReferenceRow,
    type VersionRow,
} from './lib/bulkImportHelpers'

function usage() {
    console.log(`
Bulk associate isometrics by filename <-> product_references fields.

Required:
  --source "<folder>"         Folder with isometric files (pdf/png/jpg/jpeg/svg)

Modes:
  --dry-run                  Default. Only generates report (no uploads / DB writes)
  --apply                    Upload + create asset + update product_references

Options:
  --recursive                Walk subfolders
  --ext ".pdf,.png"          Extensions to include (default: .pdf,.png,.jpg,.jpeg,.svg; extensionless treated as .svg). .ai is always ignored.
  --overwrite                Overwrite existing isometric_* on matched references (default: only fill missing)
  --allow-ambiguous-accessory  If multiple accessory_text exist for same (designation,name,measure), apply to all missing refs anyway (use with care)
  --ignore "<csv>"           Comma-separated substrings to ignore by filename (case-insensitive)
  --allow-ref-conflicts      If multiple files match the same reference, pick one deterministically (otherwise report as conflict and skip)
  --fail-fast-unreadable     In --apply mode, abort before any DB writes if any candidate file cannot be opened (recommended)
  --delimiter "|"            Force a delimiter ("|" or "-"). Default: auto-detect
  --report "artifacts\\x.csv" Output CSV path (default: artifacts\\bulk_isometrics_report_<timestamp>.csv)

Example (dry-run):
  npx ts-node -P tsconfig.scripts.json --transpile-only execution/bulk_associate_isometrics.ts --source "C:\\\\...\\\\Isometricos"

Example (apply):
  npx ts-node -P tsconfig.scripts.json --transpile-only execution/bulk_associate_isometrics.ts --source "C:\\\\...\\\\Isometricos" --apply
`.trim())
}

async function main() {
    const { getValue, hasFlag } = parseArgs(process.argv.slice(2))

    const source = getValue('source')
    if (!source) {
        usage()
        process.exit(1)
    }

    const apply = hasFlag('apply')
    const dryRun = hasFlag('dry-run') || !apply
    const recursive = hasFlag('recursive')
    const overwrite = hasFlag('overwrite')
    const allowAmbiguousAccessory = hasFlag('allow-ambiguous-accessory')
    const ignoreCsv = getValue('ignore')
    const allowRefConflicts = hasFlag('allow-ref-conflicts')
    const failFastUnreadable = hasFlag('fail-fast-unreadable')
    const forcedDelimiter = getValue('delimiter')

    const extRaw = (getValue('ext') || '.pdf,.png,.jpg,.jpeg,.svg')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => (s.startsWith('.') ? s.toLowerCase() : `.${s.toLowerCase()}`))
    const extSet = new Set(extRaw)

    const artifactsDir = path.resolve(process.cwd(), 'artifacts')
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true })

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const reportPath = path.resolve(process.cwd(), getValue('report') || path.join('artifacts', `bulk_isometrics_report_${stamp}.csv`))

    console.log(`=== Bulk Isometrics: ${dryRun ? 'DRY-RUN' : 'APPLY'} ===`)
    console.log(`Source: ${source}`)
    console.log(`Recursive: ${recursive}`)
    console.log(`Overwrite: ${overwrite}`)
    console.log(`Allow ambiguous accessory: ${allowAmbiguousAccessory}`)
    console.log(`Allow reference conflicts: ${allowRefConflicts}`)
    if (ignoreCsv) console.log(`Ignore: ${ignoreCsv}`)
    console.log(`Ext: ${Array.from(extSet).join(', ')}`)
    console.log(`Report: ${reportPath}\n`)

    console.log('1) Fetching references from Supabase...')
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
    `)) as ReferenceRow[]

    console.log('1.5) Fetching versions (for version-level overrides)...')
    const versionRows = (await dbQuery(`
        SELECT
            id,
            reference_id,
            version_code,
            (version_attrs->>'accessory_text') as accessory_text,
            (version_attrs->>'isometric_asset_id') as isometric_asset_id,
            (version_attrs->>'isometric_path') as isometric_path
        FROM public.product_versions
    `)) as VersionRow[]

    const versionsByReference = new Map<string, VersionRow[]>()
    for (const v of versionRows) {
        const list = versionsByReference.get(v.reference_id) || []
        list.push(v)
        versionsByReference.set(v.reference_id, list)
    }

    const extendedStrictIndex = new Map<string, ReferenceRow[]>()
    const extendedBaseIndex = new Map<string, ReferenceRow[]>()
    const specialLabelBaseIndex = new Map<string, ReferenceRow[]>()
    const looseBaseIndex = new Map<string, ReferenceRow[]>()
    for (const r of referenceRows) {
        const strictKey = buildExtendedKey(r)
        const sList = extendedStrictIndex.get(strictKey) || []
        sList.push(r)
        extendedStrictIndex.set(strictKey, sList)

        const baseKey = buildExtendedBaseKey(r)
        const bList = extendedBaseIndex.get(baseKey) || []
        bList.push(r)
        extendedBaseIndex.set(baseKey, bList)

        const slKey = buildSpecialLabelBaseKey(r)
        const slList = specialLabelBaseIndex.get(slKey) || []
        slList.push(r)
        specialLabelBaseIndex.set(slKey, slList)

        const looseKey = buildLooseBaseKey(r)
        const lList = looseBaseIndex.get(looseKey) || []
        lList.push(r)
        looseBaseIndex.set(looseKey, lList)
    }
    console.log(`   Loaded ${referenceRows.length} references.\n`)

    console.log('2) Listing files...')
    const allFiles = listFiles(source, recursive)
    const files = allFiles
        .filter(f => path.basename(f).toLowerCase() !== '.ai')
        .filter(f => path.extname(f).toLowerCase() !== '.ai')
        .filter(f => {
            const ext = path.extname(f).toLowerCase()
            if (!ext) return true // extensionless treated as .svg
            return extSet.has(ext)
        })
    console.log(`   Found ${files.length} candidate files.\n`)

    if (!dryRun && failFastUnreadable) {
        console.log('2.5) Preflight: checking file readability...')
        const unreadable: string[] = []
        for (const f of files) {
            try {
                const fd = fs.openSync(f, 'r')
                fs.closeSync(fd)
            } catch {
                unreadable.push(f)
            }
        }
        if (unreadable.length > 0) {
            const outPath = path.resolve(process.cwd(), 'artifacts', `bulk_isometrics_unreadable_${stamp}.txt`)
            fs.writeFileSync(outPath, unreadable.join('\n'), 'utf8')
            console.error(`   ERROR: ${unreadable.length} files are not readable by this process. See: ${outPath}`)
            process.exit(4)
        }
        console.log('   OK.\n')
    }

    const reportLines: string[] = []
    reportLines.push([
        'file_full_path',
        'file_base_name',
        'parsed_designation',
        'parsed_product_name',
        'parsed_commercial_measure',
        'parsed_accessory_text',
        'parsed_line',
        'parsed_special_label',
        'match_count',
        'matched_reference_id',
        'matched_family_code',
        'matched_reference_code',
        'existing_isometric_asset_id',
        'existing_isometric_path',
        'conflict_reference_ids',
        'conflict_file_base_names',
        'conflict_group_code',
        'action',
        'notes',
    ].join(','))

    type Planned = {
        fileFullPath: string
        fileBaseName: string
        parsed: ParsedDescriptor | null
        candidates: ReferenceRow[]
        matchMode: string | null
        targetGranularity?: 'reference' | 'version'
        versionTargets?: VersionRow[]
        skipReasonCode?: 'ACCESSORY_NOT_FOUND'
        ignored: boolean
        skipReason?: string
    }

    const planned: Planned[] = []
    const targetToPlans = new Map<string, number[]>()

    let matchedGroups = 0
    let matchedReferencesTotal = 0
    let referencesAlreadyHadIsometric = 0
    let referencesMissingIsometric = 0
    let referencesOverwritten = 0
    let appliedCount = 0
    let noMatch = 0
    let parseFailed = 0
    let errors = 0
    let assetsCreated = 0
    let assetsReused = 0

    console.log('3) Matching and processing...')
    for (const fullPath of files) {
        const base = path.parse(fullPath).name
        const ignored = shouldIgnoreFile(base, ignoreCsv)
        const parsed = ignored ? null : parseDescriptorFromBaseName(base, forcedDelimiter)

        if (ignored) {
            planned.push({
                fileFullPath: fullPath,
                fileBaseName: base,
                parsed: null,
                candidates: [],
                matchMode: null,
                targetGranularity: 'reference',
                ignored: true,
            })
            continue
        }

        if (!parsed) {
            planned.push({
                fileFullPath: fullPath,
                fileBaseName: base,
                parsed: null,
                candidates: [],
                matchMode: null,
                targetGranularity: 'reference',
                ignored: false,
                skipReason: 'parse_failed: expected at least 3 parts (designation/name/measure).',
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
            | 'loose_base_ambiguous' = 'strict'

        let targetGranularity: 'reference' | 'version' = 'reference'
        let versionTargets: VersionRow[] | undefined
        let skipReasonCode: Planned['skipReasonCode'] | undefined
        let baseCandidatesForVersion: ReferenceRow[] | null = null

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
                            // Ambiguous: multiple accessories exist for this (designation, name, measure) and we cannot decide.
                            candidates = baseCandidates
                            matchMode = 'extended_base_ambiguous'
                        }
                    }
                }
            }
        }

        // Fallback: keep special_label but ignore line (useful when line exists in DB but not in filename).
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

        // Final fallback: ignore line/special_label when file or DB is inconsistent.
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

        if (candidates.length > 0) {
            skipReasonCode = undefined
            baseCandidatesForVersion = null
        }

        // If a specific accessory was requested but no reference-level accessory matched,
        // attempt a version-level override match (product_versions.version_attrs->accessory_text).
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
                // Keep base reference candidates for context in the report.
                candidates = baseCandidatesForVersion
                matchMode = 'extended_base_accessory_filter'
                skipReasonCode = undefined
            }
        }

        // We defer report writing until after conflict detection.
        planned.push({
            fileFullPath: fullPath,
            fileBaseName: base,
            parsed,
            candidates,
            matchMode,
            targetGranularity,
            versionTargets,
            skipReasonCode,
            ignored: false,
        })

        // Track potential conflicts based on target keys:
        // - reference-level: each reference_id
        // - version-level: each version_id
        const currentPlanIdx = planned.length - 1
        const p = planned[currentPlanIdx]
        if (p.targetGranularity === 'version' && p.versionTargets && p.versionTargets.length > 0) {
            for (const v of p.versionTargets) {
                const key = `V:${v.id}`
                const arr = targetToPlans.get(key) || []
                arr.push(currentPlanIdx)
                targetToPlans.set(key, arr)
            }
        } else {
            for (const r of candidates) {
                const key = `R:${r.id}`
                const arr = targetToPlans.get(key) || []
                arr.push(currentPlanIdx)
                targetToPlans.set(key, arr)
            }
        }
    }

    // Detect targets targeted by more than one file
    const conflictingTargetKeys = new Set<string>()
    for (const [targetKey, planIdxs] of targetToPlans.entries()) {
        const uniquePlans = Array.from(new Set(planIdxs))
        if (uniquePlans.length > 1) conflictingTargetKeys.add(targetKey)
    }

    // If conflicts exist and user didn't allow, we'll report them and skip applying those refs.
    const conflictsCount = conflictingTargetKeys.size

    // Group conflicts into connected components and assign human-friendly codes: A1, A2, ...
    class UnionFind {
        parent = new Map<number, number>()
        find(x: number): number {
            const p = this.parent.get(x)
            if (p === undefined) {
                this.parent.set(x, x)
                return x
            }
            if (p === x) return x
            const r = this.find(p)
            this.parent.set(x, r)
            return r
        }
        union(a: number, b: number) {
            const ra = this.find(a)
            const rb = this.find(b)
            if (ra !== rb) this.parent.set(rb, ra)
        }
    }

    const uf = new UnionFind()
    for (const key of conflictingTargetKeys) {
        const idxs = Array.from(new Set(targetToPlans.get(key) || []))
        if (idxs.length <= 1) continue
        const head = idxs[0]
        for (let j = 1; j < idxs.length; j++) uf.union(head, idxs[j])
    }

    const rootToCode = new Map<number, string>()
    const planToConflictCode = new Map<number, string>()
    let conflictGroupCounter = 0
    for (let i = 0; i < planned.length; i++) {
        const hasAnyConflictTarget =
            (planned[i].targetGranularity === 'version' &&
                (planned[i].versionTargets || []).some(v => conflictingTargetKeys.has(`V:${v.id}`))) ||
            planned[i].candidates.some(r => conflictingTargetKeys.has(`R:${r.id}`))
        if (!hasAnyConflictTarget) continue
        const root = uf.find(i)
        let code = rootToCode.get(root)
        if (!code) {
            conflictGroupCounter++
            code = `A${conflictGroupCounter}`
            rootToCode.set(root, code)
        }
        planToConflictCode.set(i, code)
    }

    // Render report lines
    for (let i = 0; i < planned.length; i++) {
        const p = planned[i]
        const fullPath = p.fileFullPath
        const base = p.fileBaseName

        if (p.ignored) {
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                '',
                '',
                '',
                '',
                '',
                '',
                '0',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                'IGNORED',
                csvEscape(`ignored_by=${ignoreCsv || ''}`),
            ].join(','))
            continue
        }

        if (p.skipReason) {
            parseFailed++
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                '',
                '',
                '',
                '',
                '',
                '',
                '0',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                'SKIP',
                csvEscape(p.skipReason),
            ].join(','))
            continue
        }

        const parsed = p.parsed!
        const candidates = p.candidates
        const matchMode = p.matchMode || 'unknown'

        if (p.skipReasonCode === 'ACCESSORY_NOT_FOUND') {
            noMatch++
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                '0',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                'NO_MATCH',
                csvEscape(`specific_accessory_not_found: desired=${normalizeAccessory(parsed.accessory_text)}; raw_parts=${parsed.raw_parts.join(' | ')}`),
            ].join(','))
            continue
        }

        if (candidates.length === 0) {
            noMatch++
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                '0',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                'NO_MATCH',
                csvEscape(`raw_parts=${parsed.raw_parts.join(' | ')}`),
            ].join(','))
            continue
        }

        const isAccessoryAmbiguous =
            (matchMode === 'extended_base_ambiguous' ||
                matchMode === 'special_label_base_ambiguous' ||
                matchMode === 'loose_base_ambiguous')

        if (isAccessoryAmbiguous && !allowAmbiguousAccessory) {
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                String(candidates.length),
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                'AMBIGUOUS_ACCESSORY',
                csvEscape('multiple accessory_text values exist for this match; refine naming or add disambiguation (e.g., line/special_label).'),
            ].join(','))
            continue
        }

        // If this file targets records that are also targeted by other files, mark conflict.
        const fileConflictTargets: string[] = []
        if (p.targetGranularity === 'version' && p.versionTargets && p.versionTargets.length > 0) {
            for (const v of p.versionTargets) {
                const k = `V:${v.id}`
                if (conflictingTargetKeys.has(k)) fileConflictTargets.push(k)
            }
        } else {
            for (const r of candidates) {
                const k = `R:${r.id}`
                if (conflictingTargetKeys.has(k)) fileConflictTargets.push(k)
            }
        }

        const conflictIdsText = fileConflictTargets.length > 0 ? fileConflictTargets.join('|') : ''

        if (fileConflictTargets.length > 0 && !allowRefConflicts) {
            const otherPlanIdxs = new Set<number>()
            for (const targetKey of fileConflictTargets) {
                const idxs = targetToPlans.get(targetKey) || []
                for (const idx of idxs) {
                    if (idx !== i) otherPlanIdxs.add(idx)
                }
            }
            const otherNamesText = Array.from(otherPlanIdxs)
                .map(idx => planned[idx]?.fileBaseName)
                .filter(Boolean)
                .join('|')

            const conflictGroupCode = planToConflictCode.get(i) || ''
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                String(candidates.length),
                '',
                '',
                '',
                '',
                '',
                csvEscape(conflictIdsText),
                csvEscape(otherNamesText),
                csvEscape(conflictGroupCode),
                'CONFLICT_REF',
                csvEscape(`conflict_group=${conflictGroupCode}`),
            ].join(','))
            continue
        }

        // Version-level update path (product_versions.version_attrs override)
        if (p.targetGranularity === 'version' && p.versionTargets && p.versionTargets.length > 0) {
            const versionExistingCount = p.versionTargets.filter(v => Boolean(v.isometric_asset_id || v.isometric_path)).length
            const versionUpdatable = overwrite ? p.versionTargets : p.versionTargets.filter(v => !v.isometric_asset_id && !v.isometric_path)
            const versionSkipped = overwrite ? 0 : p.versionTargets.length - versionUpdatable.length

            if (!overwrite && versionUpdatable.length === 0) {
                reportLines.push([
                    csvEscape(fullPath),
                    csvEscape(base),
                    csvEscape(parsed.designation),
                    csvEscape(parsed.product_name),
                    csvEscape(parsed.commercial_measure),
                    csvEscape(parsed.accessory_text),
                    csvEscape(parsed.line),
                    csvEscape(parsed.special_label),
                    String(candidates.length),
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    'SKIP_ALL_HAVE_ISO',
                    csvEscape(`mode=${matchMode}; target=version; all matched versions already have an isometric; script never overwrites.`),
                ].join(','))
                continue
            }

            const versionCodes = Array.from(new Set(versionUpdatable.map(v => normalizeVersionCode(v.version_code)))).join('|')

            if (dryRun) {
                const example = candidates[0]
                reportLines.push([
                    csvEscape(fullPath),
                    csvEscape(base),
                    csvEscape(parsed.designation),
                    csvEscape(parsed.product_name),
                    csvEscape(parsed.commercial_measure),
                    csvEscape(parsed.accessory_text),
                    csvEscape(parsed.line),
                    csvEscape(parsed.special_label),
                    String(candidates.length),
                    csvEscape(example?.id || ''),
                    csvEscape(example?.family_code ?? ''),
                    csvEscape(example?.reference_code ?? ''),
                    '',
                    '',
                    '',
                    '',
                    '',
                    'WOULD_APPLY',
                    csvEscape(
                        `mode=${matchMode}; target=version; version_codes=${versionCodes}; would_update_versions=${versionUpdatable.length}; would_overwrite_versions=${overwrite ? versionExistingCount : 0}; would_skip_versions=${versionSkipped}`
                    ),
                ].join(','))
                continue
            }

            try {
                const extLower = path.extname(fullPath).toLowerCase()
                const effectiveExt = extLower || '.svg'
                const contentType = guessContentType(effectiveExt)
                const bytes = fs.readFileSync(fullPath)

                const hash = sha256Hex(bytes)
                const bucketPath = `assets/isometrics/${hash}${effectiveExt}`

                const { error: uploadError } = await supabaseAdmin.storage.from('assets').upload(bucketPath, bytes, {
                    contentType,
                    upsert: true,
                })
                if (uploadError) throw new Error(`storage_upload_failed: ${uploadError.message}`)

                const { data: urlData } = supabaseAdmin.storage.from('assets').getPublicUrl(bucketPath)
                const publicUrl = urlData.publicUrl
                const safeUrl = publicUrl.replace(/'/g, "''")

                const existingAsset = await dbQuery(`
                    SELECT id
                    FROM public.assets
                    WHERE type = 'isometric'
                      AND file_path = '${safeUrl}'
                    LIMIT 1
                `)

                let assetId = existingAsset?.[0]?.id as string | undefined
                if (assetId) {
                    assetsReused++
                } else {
                    const safeName = base.replace(/'/g, "''")
                    const inserted = await dbQuery(`
                        INSERT INTO public.assets (name, type, file_path)
                        VALUES ('${safeName}', 'isometric', '${safeUrl}')
                        RETURNING id
                    `)
                    assetId = inserted?.[0]?.id as string | undefined
                    if (!assetId) throw new Error('asset_insert_failed: missing asset id')
                    assetsCreated++
                }

                const versionIds = versionUpdatable.map(v => `'${v.id.replace(/'/g, "''")}'`).join(',')
                await dbQuery(`
                    UPDATE public.product_versions
                    SET version_attrs = jsonb_set(
                        jsonb_set(COALESCE(version_attrs, '{}'::jsonb), '{isometric_asset_id}', '\"${assetId.replace(/'/g, "''")}\"'),
                        '{isometric_path}', '\"${safeUrl}\"'
                    ),
                    updated_at = now()
                    WHERE id IN (${versionIds})
                    ${overwrite ? '' : "AND (COALESCE(version_attrs->>'isometric_asset_id','') = '' AND COALESCE(version_attrs->>'isometric_path','') = '')"}
                `)

                appliedCount++
                const example = candidates[0]
                reportLines.push([
                    csvEscape(fullPath),
                    csvEscape(base),
                    csvEscape(parsed.designation),
                    csvEscape(parsed.product_name),
                    csvEscape(parsed.commercial_measure),
                    csvEscape(parsed.accessory_text),
                    csvEscape(parsed.line),
                    csvEscape(parsed.special_label),
                    String(candidates.length),
                    csvEscape(example?.id || ''),
                    csvEscape(example?.family_code ?? ''),
                    csvEscape(example?.reference_code ?? ''),
                    '',
                    '',
                    '',
                    '',
                    '',
                    'APPLIED',
                    csvEscape(`mode=${matchMode}; target=version; version_codes=${versionCodes}; updated_versions=${versionUpdatable.length}; asset_id=${assetId}; hash=${hash}`),
                ].join(','))
            } catch (e: unknown) {
                errors++
                const example = candidates[0]
                reportLines.push([
                    csvEscape(fullPath),
                    csvEscape(base),
                    csvEscape(parsed.designation),
                    csvEscape(parsed.product_name),
                    csvEscape(parsed.commercial_measure),
                    csvEscape(parsed.accessory_text),
                    csvEscape(parsed.line),
                    csvEscape(parsed.special_label),
                    String(candidates.length),
                    csvEscape(example?.id || ''),
                    csvEscape(example?.family_code ?? ''),
                    csvEscape(example?.reference_code ?? ''),
                    csvEscape(example?.isometric_asset_id ?? ''),
                    csvEscape(example?.isometric_path ?? ''),
                    '',
                    '',
                    '',
                    'ERROR',
                    csvEscape(errorMessage(e)),
                ].join(','))
            }

            continue
        }

        // Determine per-file updatable list, with overwrite support.
        matchedGroups++
        matchedReferencesTotal += candidates.length

        const existingCount = candidates.filter(r => Boolean(r.isometric_asset_id || r.isometric_path)).length
        const updatable = overwrite ? candidates : candidates.filter(r => !r.isometric_asset_id && !r.isometric_path)
        const skipped = overwrite ? 0 : candidates.length - updatable.length

        referencesAlreadyHadIsometric += overwrite ? 0 : skipped
        referencesMissingIsometric += overwrite ? (candidates.length - existingCount) : updatable.length
        referencesOverwritten += overwrite ? existingCount : 0

        if (!overwrite && updatable.length === 0) {
            const example = candidates[0]
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                String(candidates.length),
                csvEscape(example?.id || ''),
                csvEscape(example?.family_code ?? ''),
                csvEscape(example?.reference_code ?? ''),
                csvEscape(example?.isometric_asset_id ?? ''),
                csvEscape(example?.isometric_path ?? ''),
                '',
                '',
                '',
                'SKIP_ALL_HAVE_ISO',
                csvEscape(`mode=${matchMode}; all matched references already have an isometric; script never overwrites.`),
            ].join(','))
            continue
        }

        if (dryRun) {
            const example = updatable[0]
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                String(candidates.length),
                csvEscape(example?.id || ''),
                csvEscape(example?.family_code ?? ''),
                csvEscape(example?.reference_code ?? ''),
                '',
                '',
                '',
                '',
                '',
                'WOULD_APPLY',
                csvEscape(`mode=${matchMode}; would_update_refs=${updatable.length}; would_overwrite_refs=${overwrite ? existingCount : 0}; would_skip_refs=${skipped}`),
            ].join(','))
            continue
        }

        try {
            const extLower = path.extname(fullPath).toLowerCase()
            const effectiveExt = extLower || '.svg'
            const contentType = guessContentType(effectiveExt)
            const bytes = fs.readFileSync(fullPath)

            // Dedupe uploads by content hash: same file bytes => same Storage path => same public URL.
            const hash = sha256Hex(bytes)
            const bucketPath = `assets/isometrics/${hash}${effectiveExt}`

            const { error: uploadError } = await supabaseAdmin.storage.from('assets').upload(bucketPath, bytes, {
                contentType,
                upsert: true,
            })
            if (uploadError) throw new Error(`storage_upload_failed: ${uploadError.message}`)

            const { data: urlData } = supabaseAdmin.storage.from('assets').getPublicUrl(bucketPath)
            const publicUrl = urlData.publicUrl
            const safeUrl = publicUrl.replace(/'/g, "''")

            // Reuse an existing asset row if it already points to the same URL (avoid duplicate assets).
            const existingAsset = await dbQuery(`
                SELECT id
                FROM public.assets
                WHERE type = 'isometric'
                  AND file_path = '${safeUrl}'
                LIMIT 1
            `)

            let assetId = existingAsset?.[0]?.id as string | undefined
            if (assetId) {
                assetsReused++
            } else {
                const safeName = base.replace(/'/g, "''")
                const inserted = await dbQuery(`
                    INSERT INTO public.assets (name, type, file_path)
                    VALUES ('${safeName}', 'isometric', '${safeUrl}')
                    RETURNING id
                `)
                assetId = inserted?.[0]?.id as string | undefined
                if (!assetId) throw new Error('asset_insert_failed: missing asset id')
                assetsCreated++
            }

            // Update all missing references in this match group with the same asset.
            const refIds = updatable.map(r => `'${r.id.replace(/'/g, "''")}'`).join(',')
            await dbQuery(`
                UPDATE public.product_references
                SET isometric_asset_id = '${assetId.replace(/'/g, "''")}',
                    isometric_path = '${safeUrl}',
                    updated_at = now()
                WHERE id IN (${refIds})
                  ${overwrite ? '' : 'AND isometric_asset_id IS NULL AND isometric_path IS NULL'}
            `)

            appliedCount++
            const example = updatable[0]
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                String(candidates.length),
                csvEscape(example?.id || ''),
                csvEscape(example?.family_code ?? ''),
                csvEscape(example?.reference_code ?? ''),
                '',
                '',
                '',
                '',
                '',
                'APPLIED',
                csvEscape(`mode=${matchMode}; asset_id=${assetId}; updated_refs=${updatable.length}; overwritten_refs=${overwrite ? existingCount : 0}; skipped_refs=${skipped}; hash=${hash}`),
            ].join(','))
        } catch (e: unknown) {
            errors++
            const example = candidates[0]
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                String(candidates.length),
                csvEscape(example?.id || ''),
                csvEscape(example?.family_code ?? ''),
                csvEscape(example?.reference_code ?? ''),
                csvEscape(example?.isometric_asset_id ?? ''),
                csvEscape(example?.isometric_path ?? ''),
                '',
                '',
                '',
                'ERROR',
                csvEscape(errorMessage(e)),
            ].join(','))
        }
    }

    console.log('\n4) Writing report...')
    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8')

    console.log('\n=== Summary ===')
    console.log(`Files considered: ${files.length}`)
    console.log(`Parse failed: ${parseFailed}`)
    console.log(`No match: ${noMatch}`)
    console.log(`Matched groups: ${matchedGroups}`)
    console.log(`Matched references (total): ${matchedReferencesTotal}`)
    console.log(`References already had isometric (skipped unless overwrite): ${referencesAlreadyHadIsometric}`)
    console.log(`References missing isometric: ${referencesMissingIsometric}`)
    console.log(`References overwritten: ${referencesOverwritten}`)
    console.log(`Conflicting references (matched by >1 file): ${conflictsCount}`)
    console.log(`Applied: ${appliedCount}`)
    if (!dryRun) {
        console.log(`Assets created: ${assetsCreated}`)
        console.log(`Assets reused: ${assetsReused}`)
    }
    console.log(`Errors: ${errors}`)
    console.log(`Report: ${reportPath}`)

    if (errors > 0) process.exitCode = 2
    if (!dryRun && appliedCount === 0) process.exitCode = 3
}

main().catch(e => {
    console.error('FATAL:', e?.message || e)
    process.exit(1)
})
