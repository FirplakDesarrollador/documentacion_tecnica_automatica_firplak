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
    normalize,
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

export const RESOURCE_TYPES = [
    'instruction_pdf',
    'front_view_dimensioned',
    'side_view_dimensioned',
    'top_view_dimensioned',
    'exploded_view',
    'assembly_step',
] as const

export type ResourceType = (typeof RESOURCE_TYPES)[number]

export type ScopeMode = 'direct' | 'inherit'

const DEFAULT_SUFFIX_WORDS: Record<ResourceType, string[]> = {
    instruction_pdf: ['INSTRUCTIVO', 'INSTRUCCIONES', 'INSTRUCCION', 'MANUAL', 'INSTALACION'],
    front_view_dimensioned: ['VISTA FRONTAL ACOTADA', 'VISTA FRONTAL', 'VISTA ACOTADA FRONTAL'],
    side_view_dimensioned: ['VISTA LATERAL ACOTADA', 'VISTA LATERAL', 'VISTA ACOTADA LATERAL'],
    top_view_dimensioned: ['VISTA SUPERIOR ACOTADA', 'VISTA SUPERIOR', 'VISTA ACOTADA SUPERIOR', 'PLANTA'],
    exploded_view: ['DESPIECE', 'VISTA EXPLOTADA', 'EXPLOTADA', 'EXPLOTADO', 'DESPIECE ARMADO'],
    assembly_step: ['PASO DE ARMADO', 'ARMADO', 'PASO'],
}

function isResourceType(value: string): value is ResourceType {
    return (RESOURCE_TYPES as readonly string[]).includes(value)
}

function usage() {
    console.log(`
Bulk associate product resources (views, exploded views, assembly steps, instruction PDFs)
by filename <-> product_references fields, linking rows in public.product_asset_links.

Required:
  --source "<folder>"         Folder with resource files (pdf/png/jpg/jpeg/svg)
  --type <type>               Resource type: instruction_pdf | front_view_dimensioned |
                              side_view_dimensioned | top_view_dimensioned | exploded_view | assembly_step

Modes:
  --dry-run                  Default. Only generates report (no uploads / DB writes)
  --apply                    Upload + create asset + insert product_asset_links rows

Scope (how targets are resolved per file):
  --scope direct|inherit     Default: direct. "inherit" expands each matched reference to
                             ALL references/versions that share the same isometric
                             (reference.isometric_asset_id / version_attrs->>'isometric_asset_id').
  --mapping "artifacts/x.csv" Per-file overrides. CSV columns: file,scope,type,label
                             (file = base name without extension; scope = direct|inherit;
                              type overrides --type for that file; label = public label).

Options:
  --recursive                Walk subfolders
  --ext ".pdf,.png"          Extensions to include (default: .pdf,.png,.jpg,.jpeg,.svg; extensionless treated as .svg)
  --overwrite                Replace existing links of the same type that point to a different asset
                             (default: only fill targets without a link of that type)
  --suffix-words "VISTA 3D,CROQUIS"  Extra words stripped from the filename before matching
  --ignore "<csv>"           Comma-separated substrings to ignore by filename (case-insensitive)
  --allow-ambiguous-accessory  If multiple accessory_text exist for same (designation,name,measure), apply anyway
  --allow-ref-conflicts      If multiple files match the same target, pick one deterministically (otherwise report as conflict and skip)
  --fail-fast-unreadable     In --apply mode, abort before any DB writes if any candidate file cannot be opened (recommended)
  --delimiter "|"            Force a delimiter ("|" or "-"). Default: auto-detect
  --report "artifacts\\x.csv" Output CSV path (default: artifacts\\bulk_resources_report_<timestamp>.csv)
  --public-slot <slot>       ONLY for instruction_pdf: create public QR links (requires a configured document_slot,
                             e.g. "manual_instalacion"). Default: resources stay internal (is_public=false).
  --public-label "<label>"   Document label used for the public slug (default: asset base name).
  --gap-report               Also write artifacts\\resource_gaps_<type>_<timestamp>.csv listing every active
                             reference with has_isometric / has_<type> / matched_by_file.

Examples:
  Dry-run (front views):
    npx ts-node -P tsconfig.scripts.json --transpile-only execution/bulk_associate_resources.ts --source "C:\\\\...\\\\VistasFrontales" --type front_view_dimensioned

  Apply inheriting isometric scope, with public QR for instruction PDFs:
    npx ts-node -P tsconfig.scripts.json --transpile-only execution/bulk_associate_resources.ts --source "C:\\\\...\\\\Instructivos" --type instruction_pdf --scope inherit --public-slot manual_instalacion --apply
`.trim())
}

function stripResourceSuffixes(baseName: string, suffixes: string[]): string {
    const sorted = [...suffixes].sort((a, b) => b.length - a.length)
    let raw = baseName.trim()
    for (;;) {
        const rawTokens = normalize(raw).split(' ').filter(Boolean)
        if (rawTokens.length === 0) break
        let stripCount = 0
        if (rawTokens.length >= 2 && rawTokens[rawTokens.length - 2] === 'PASO' && /^\d+$/.test(rawTokens[rawTokens.length - 1])) {
            stripCount = 2
        } else {
            for (const suffix of sorted) {
                const sufTokens = normalize(suffix).split(' ').filter(Boolean)
                if (sufTokens.length === 0 || sufTokens.length > rawTokens.length) continue
                const tail = rawTokens.slice(-sufTokens.length)
                if (tail.join(' ') === sufTokens.join(' ')) {
                    stripCount = sufTokens.length
                    break
                }
            }
        }
        if (stripCount === 0) break
        if (rawTokens.length - stripCount <= 0) break
        const rawParts = raw.split(/[\s|_-]+/).filter(Boolean)
        raw = rawParts.slice(0, rawParts.length - stripCount).join(' ').trim()
    }
    return raw
}

function slugify(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
}

type MappingOverride = {
    scope?: ScopeMode
    type?: string
    label?: string
}

function splitCsvLine(line: string): string[] {
    const out: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQ) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    cur += '"'
                    i++
                } else {
                    inQ = false
                }
            } else {
                cur += ch
            }
        } else if (ch === '"') {
            inQ = true
        } else if (ch === ',') {
            out.push(cur)
            cur = ''
        } else {
            cur += ch
        }
    }
    out.push(cur)
    return out.map(s => s.trim())
}

function parseMappingCsv(filePath: string | undefined): Map<string, MappingOverride> {
    const map = new Map<string, MappingOverride>()
    if (!filePath || !fs.existsSync(filePath)) return map
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    const header = lines[0] || ''
    const cols = header.split(',').map(c => c.trim().toLowerCase())
    const idx = (name: string) => cols.indexOf(name)
    const iFile = idx('file')
    const iScope = idx('scope')
    const iType = idx('type')
    const iLabel = idx('label')
    if (iFile === -1) return map
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const parts = splitCsvLine(line)
        const file = (parts[iFile] ?? '').trim()
        if (!file) continue
        const scopeRaw = (iScope >= 0 ? parts[iScope] ?? '' : '').trim().toLowerCase()
        const typeRaw = (iType >= 0 ? parts[iType] ?? '' : '').trim().toLowerCase()
        const label = (iLabel >= 0 ? parts[iLabel] ?? '' : '').trim()
        map.set(file.toLowerCase(), {
            scope: scopeRaw === 'inherit' || scopeRaw === 'direct' ? (scopeRaw as ScopeMode) : undefined,
            type: typeRaw || undefined,
            label: label || undefined,
        })
    }
    return map
}

type TargetKey = { kind: 'reference' | 'version'; id: string }

type Planned = {
    fileFullPath: string
    fileBaseName: string
    resourceType: ResourceType
    scopeMode: ScopeMode
    parsed: ParsedDescriptor | null
    candidates: ReferenceRow[]
    matchMode: string | null
    targetGranularity: 'reference' | 'version'
    versionTargets?: VersionRow[]
    skipReasonCode?: 'ACCESSORY_NOT_FOUND'
    ignored: boolean
    skipReason?: string
    refTargets: string[]
    versionTargetsFinal: string[]
    matchedRefIds: string[]
    inheritNotes: string[]
}

type AssetLinkRow = {
    id: string
    ref_id: string | null
    version_id: string | null
    asset_id: string
    version_number: number
    is_public: boolean
    public_slug: string | null
}

function getPublicAssetUrlForStoragePath(storagePath: string) {
    const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
    if (!base) return storagePath
    return `${base}/storage/v1/object/public/assets/${storagePath.replace(/^\//, '')}`
}

function escapeSql(value: string) {
    return value.replace(/'/g, "''")
}

async function main() {
    const { getValue, hasFlag } = parseArgs(process.argv.slice(2))

    const source = getValue('source')
    const typeRaw = getValue('type')
    if (!source || !typeRaw) {
        usage()
        process.exit(1)
    }
    if (!isResourceType(typeRaw)) {
        console.error(`Invalid --type "${typeRaw}". Allowed: ${RESOURCE_TYPES.join(', ')}`)
        process.exit(1)
    }
    const resourceType = typeRaw

    const apply = hasFlag('apply')
    const dryRun = hasFlag('dry-run') || !apply
    const recursive = hasFlag('recursive')
    const overwrite = hasFlag('overwrite')
    const allowAmbiguousAccessory = hasFlag('allow-ambiguous-accessory')
    const ignoreCsv = getValue('ignore')
    const allowRefConflicts = hasFlag('allow-ref-conflicts')
    const failFastUnreadable = hasFlag('fail-fast-unreadable')
    const forcedDelimiter = getValue('delimiter')
    const globalScope: ScopeMode = getValue('scope') === 'inherit' ? 'inherit' : 'direct'
    const mappingPath = getValue('mapping')
    const publicSlot = getValue('public-slot')
    const publicLabel = getValue('public-label')
    const gapReport = hasFlag('gap-report')
    const extraSuffixes = (getValue('suffix-words') || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    const suffixes = [...DEFAULT_SUFFIX_WORDS[resourceType], ...extraSuffixes]

    if (publicSlot && resourceType !== 'instruction_pdf') {
        console.error('--public-slot is only valid with --type instruction_pdf. Other resources stay internal.')
        process.exit(1)
    }

    const extRaw = (getValue('ext') || '.pdf,.png,.jpg,.jpeg,.svg')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => (s.startsWith('.') ? s.toLowerCase() : `.${s.toLowerCase()}`))
    const extSet = new Set(extRaw)

    const artifactsDir = path.resolve(process.cwd(), 'artifacts')
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true })

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const reportPath = path.resolve(process.cwd(), getValue('report') || path.join('artifacts', `bulk_resources_report_${stamp}.csv`))
    const gapPath = path.resolve(process.cwd(), path.join('artifacts', `resource_gaps_${resourceType}_${stamp}.csv`))

    console.log(`=== Bulk Resources: ${dryRun ? 'DRY-RUN' : 'APPLY'} ===`)
    console.log(`Type: ${resourceType}`)
    console.log(`Source: ${source}`)
    console.log(`Scope: ${globalScope}${mappingPath ? ` (with per-file overrides: ${mappingPath})` : ''}`)
    console.log(`Public: ${publicSlot ? `slot=${publicSlot}` : 'internal only'}`)
    console.log(`Recursive: ${recursive}`)
    console.log(`Overwrite: ${overwrite}`)
    console.log(`Allow ambiguous accessory: ${allowAmbiguousAccessory}`)
    console.log(`Allow reference conflicts: ${allowRefConflicts}`)
    if (ignoreCsv) console.log(`Ignore: ${ignoreCsv}`)
    console.log(`Ext: ${Array.from(extSet).join(', ')}`)
    console.log(`Report: ${reportPath}`)
    if (gapReport) console.log(`Gap report: ${gapPath}`)
    console.log('')

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
    const refIsoIndex = new Map<string, string[]>()
    const versionIsoIndex = new Map<string, string[]>()
    for (const v of versionRows) {
        const list = versionsByReference.get(v.reference_id) || []
        list.push(v)
        versionsByReference.set(v.reference_id, list)
        if (v.isometric_asset_id) {
            const ids = versionIsoIndex.get(v.isometric_asset_id) || []
            ids.push(v.id)
            versionIsoIndex.set(v.isometric_asset_id, ids)
        }
    }
    for (const r of referenceRows) {
        if (r.isometric_asset_id) {
            const ids = refIsoIndex.get(r.isometric_asset_id) || []
            ids.push(r.id)
            refIsoIndex.set(r.isometric_asset_id, ids)
        }
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

    console.log('1.7) Fetching existing product_asset_links for this type...')
    const linkRows = (await dbQuery(`
        SELECT
            pal.id,
            pal.reference_id::text as ref_id,
            pal.version_id::text as version_id,
            pal.asset_id::text as asset_id,
            pal.version_number,
            pal.is_public,
            pal.public_slug
        FROM public.product_asset_links pal
        JOIN public.assets a ON a.id = pal.asset_id
        WHERE a.type = '${escapeSql(resourceType)}'
          AND pal.status <> 'replaced'
    `)) as AssetLinkRow[]

    const refLinkIndex = new Map<string, AssetLinkRow[]>()
    const versionLinkIndex = new Map<string, AssetLinkRow[]>()
    for (const l of linkRows) {
        if (l.ref_id) {
            const list = refLinkIndex.get(l.ref_id) || []
            list.push(l)
            refLinkIndex.set(l.ref_id, list)
        }
        if (l.version_id) {
            const list = versionLinkIndex.get(l.version_id) || []
            list.push(l)
            versionLinkIndex.set(l.version_id, list)
        }
    }
    console.log(`   Found ${linkRows.length} existing links.\n`)

    let publicPrefix: { prefix: string; label: string } | null = null
    const slugMaxVn = new Map<string, number>()
    if (publicSlot) {
        const prefixRows = await dbQuery(`
            SELECT prefix, label
            FROM public.document_slug_prefixes
            WHERE document_slot = '${escapeSql(publicSlot)}'
              AND active = true
            LIMIT 1
        `) as Array<{ prefix?: string | null; label?: string | null }>
        const prefixData = prefixRows?.[0]
        if (!prefixData?.prefix) {
            console.error(`No active prefix configured for document_slot "${publicSlot}". Configure it in Configuracion > Nomenclatura.`)
            process.exit(1)
        }
        publicPrefix = { prefix: prefixData.prefix, label: prefixData.label || '' }
        const vnRows = await dbQuery(`
            SELECT public_slug, COALESCE(MAX(version_number), 0)::int as max_vn
            FROM public.product_asset_links
            WHERE public_slug IS NOT NULL
            GROUP BY public_slug
        `) as Array<{ public_slug?: string | null; max_vn?: number | string | null }>
        for (const row of vnRows || []) {
            if (row.public_slug) slugMaxVn.set(row.public_slug, Number(row.max_vn) || 0)
        }
    }

    const mapping = parseMappingCsv(mappingPath)

    console.log('2) Listing files...')
    const allFiles = listFiles(source, recursive)
    const files = allFiles
        .filter(f => path.basename(f).toLowerCase() !== '.ai')
        .filter(f => path.extname(f).toLowerCase() !== '.ai')
        .filter(f => {
            const ext = path.extname(f).toLowerCase()
            if (!ext) return true
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
            const outPath = path.resolve(process.cwd(), 'artifacts', `bulk_resources_unreadable_${stamp}.txt`)
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
        'resource_type',
        'scope_mode',
        'parsed_designation',
        'parsed_product_name',
        'parsed_commercial_measure',
        'parsed_accessory_text',
        'parsed_line',
        'parsed_special_label',
        'match_mode',
        'target_granularity',
        'matched_references',
        'matched_versions',
        'expanded_references',
        'expanded_versions',
        'target_total',
        'existing_links',
        'inserted_links',
        'action',
        'notes',
    ].join(','))

    const planned: Planned[] = []
    const targetToPlans = new Map<string, number[]>()

    let parseFailed = 0
    let noMatch = 0
    let ambiguousSkipped = 0
    let appliedCount = 0
    let skippedAlreadyLinked = 0
    let skippedHasOther = 0
    let errors = 0
    let assetsCreated = 0
    let assetsReused = 0
    let targetsInserted = 0

    const expandFromIsometrics = (isoIds: string[]) => {
        const refs = new Set<string>()
        const versions = new Set<string>()
        for (const iso of isoIds) {
            for (const rid of refIsoIndex.get(iso) || []) refs.add(rid)
            for (const vid of versionIsoIndex.get(iso) || []) versions.add(vid)
        }
        return { refs: Array.from(refs), versions: Array.from(versions) }
    }

    console.log('3) Matching and processing...')
    for (const fullPath of files) {
        const base = path.parse(fullPath).name
        const mappingOverride = mapping.get(base.toLowerCase())
        const scopeMode: ScopeMode = mappingOverride?.scope || globalScope
        const fileType = mappingOverride?.type ? (isResourceType(mappingOverride.type) ? mappingOverride.type : resourceType) : resourceType
        const fileSuffixes = fileType === resourceType ? suffixes : [...DEFAULT_SUFFIX_WORDS[fileType], ...extraSuffixes]

        const ignored = shouldIgnoreFile(base, ignoreCsv)
        const stripped = ignored ? base : stripResourceSuffixes(base, fileSuffixes)
        const parsed = ignored ? null : parseDescriptorFromBaseName(stripped, forcedDelimiter)

        const inheritNotes: string[] = []

        if (ignored) {
            planned.push({
                fileFullPath: fullPath,
                fileBaseName: base,
                resourceType: fileType,
                scopeMode,
                parsed: null,
                candidates: [],
                matchMode: null,
                targetGranularity: 'reference',
                ignored: true,
                refTargets: [],
                versionTargetsFinal: [],
                matchedRefIds: [],
                inheritNotes,
            })
            continue
        }

        if (!parsed) {
            planned.push({
                fileFullPath: fullPath,
                fileBaseName: base,
                resourceType: fileType,
                scopeMode,
                parsed: null,
                candidates: [],
                matchMode: null,
                targetGranularity: 'reference',
                ignored: false,
                skipReason: 'parse_failed: expected at least 3 parts (designation/name/measure).',
                refTargets: [],
                versionTargetsFinal: [],
                matchedRefIds: [],
                inheritNotes,
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

        const matchedRefIds = candidates.map(r => r.id)
        if (targetGranularity === 'version' && versionTargets) {
            for (const v of versionTargets) matchedRefIds.push(v.reference_id)
        }

        let refTargets: string[] = []
        let versionTargetsFinal: string[] = []

        if (scopeMode === 'direct') {
            if (targetGranularity === 'version' && versionTargets && versionTargets.length > 0) {
                versionTargetsFinal = versionTargets.map(v => v.id)
            } else {
                refTargets = candidates.map(r => r.id)
            }
        } else {
            if (targetGranularity === 'version' && versionTargets && versionTargets.length > 0) {
                const isoIds: string[] = []
                for (const v of versionTargets) {
                    if (v.isometric_asset_id) isoIds.push(v.isometric_asset_id)
                    else versionTargetsFinal.push(v.id)
                }
                if (isoIds.length > 0) {
                    const expanded = expandFromIsometrics(Array.from(new Set(isoIds)))
                    refTargets = expanded.refs
                    versionTargetsFinal = Array.from(new Set([...versionTargetsFinal, ...expanded.versions]))
                    inheritNotes.push(`inherit_from_version_iso=${isoIds.length}`)
                }
                if (refTargets.length === 0 && versionTargetsFinal.length === 0) {
                    versionTargetsFinal = versionTargets.map(v => v.id)
                    inheritNotes.push('fallback_direct_no_isometric')
                }
            } else {
                const isoIds: string[] = []
                for (const r of candidates) {
                    if (r.isometric_asset_id) isoIds.push(r.isometric_asset_id)
                    else refTargets.push(r.id)
                }
                if (isoIds.length > 0) {
                    const expanded = expandFromIsometrics(Array.from(new Set(isoIds)))
                    refTargets = Array.from(new Set([...refTargets, ...expanded.refs]))
                    versionTargetsFinal = expanded.versions
                    inheritNotes.push(`inherit_from_ref_iso=${isoIds.length}`)
                }
                if (refTargets.length === 0 && versionTargetsFinal.length === 0) {
                    refTargets = candidates.map(r => r.id)
                    inheritNotes.push('fallback_direct_no_isometric')
                }
            }
        }

        planned.push({
            fileFullPath: fullPath,
            fileBaseName: base,
            resourceType: fileType,
            scopeMode,
            parsed,
            candidates,
            matchMode,
            targetGranularity,
            versionTargets,
            skipReasonCode,
            ignored: false,
            refTargets,
            versionTargetsFinal,
            matchedRefIds,
            inheritNotes,
        })

        const currentPlanIdx = planned.length - 1
        for (const refId of refTargets) {
            const key = `R:${refId}`
            const arr = targetToPlans.get(key) || []
            arr.push(currentPlanIdx)
            targetToPlans.set(key, arr)
        }
        for (const versionId of versionTargetsFinal) {
            const key = `V:${versionId}`
            const arr = targetToPlans.get(key) || []
            arr.push(currentPlanIdx)
            targetToPlans.set(key, arr)
        }
    }

    const conflictingTargetKeys = new Set<string>()
    for (const [targetKey, planIdxs] of targetToPlans.entries()) {
        if (Array.from(new Set(planIdxs)).length > 1) conflictingTargetKeys.add(targetKey)
    }
    const conflictsCount = conflictingTargetKeys.size

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
        const p = planned[i]
        const hasAnyConflictTarget =
            p.refTargets.some(r => conflictingTargetKeys.has(`R:${r}`)) ||
            p.versionTargetsFinal.some(v => conflictingTargetKeys.has(`V:${v}`))
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

    for (let i = 0; i < planned.length; i++) {
        const p = planned[i]
        const fullPath = p.fileFullPath
        const base = p.fileBaseName
        const mappingOverride = mapping.get(base.toLowerCase())

        if (p.ignored) {
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                p.resourceType,
                p.scopeMode,
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '0',
                '0',
                '0',
                '0',
                '0',
                '',
                '0',
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
                p.resourceType,
                p.scopeMode,
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '0',
                '0',
                '0',
                '0',
                '0',
                '',
                '0',
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
                p.resourceType,
                p.scopeMode,
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                matchMode,
                p.targetGranularity,
                '0',
                '0',
                '0',
                '0',
                '0',
                '',
                '0',
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
                p.resourceType,
                p.scopeMode,
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                matchMode,
                p.targetGranularity,
                '0',
                '0',
                '0',
                '0',
                '0',
                '',
                '0',
                'NO_MATCH',
                csvEscape(`raw_parts=${parsed.raw_parts.join(' | ')}`),
            ].join(','))
            continue
        }

        const isAccessoryAmbiguous =
            matchMode === 'extended_base_ambiguous' ||
            matchMode === 'special_label_base_ambiguous' ||
            matchMode === 'loose_base_ambiguous'

        if (isAccessoryAmbiguous && !allowAmbiguousAccessory) {
            ambiguousSkipped++
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                p.resourceType,
                p.scopeMode,
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                matchMode,
                p.targetGranularity,
                String(candidates.length),
                '0',
                '0',
                '0',
                '0',
                '',
                '0',
                'AMBIGUOUS_ACCESSORY',
                csvEscape('multiple accessory_text values exist for this match; refine naming or add disambiguation (e.g., line/special_label).'),
            ].join(','))
            continue
        }

        const fileConflictTargets: string[] = []
        for (const refId of p.refTargets) {
            const k = `R:${refId}`
            if (conflictingTargetKeys.has(k)) fileConflictTargets.push(k)
        }
        for (const versionId of p.versionTargetsFinal) {
            const k = `V:${versionId}`
            if (conflictingTargetKeys.has(k)) fileConflictTargets.push(k)
        }

        if (fileConflictTargets.length > 0 && !allowRefConflicts) {
            const conflictGroupCode = planToConflictCode.get(i) || ''
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                p.resourceType,
                p.scopeMode,
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                matchMode,
                p.targetGranularity,
                String(p.matchedRefIds.length),
                '0',
                String(p.refTargets.length),
                String(p.versionTargetsFinal.length),
                String(p.refTargets.length + p.versionTargetsFinal.length),
                '',
                '0',
                'CONFLICT_REF',
                csvEscape(`conflict_group=${conflictGroupCode}`),
            ].join(','))
            continue
        }

        const targetList: TargetKey[] = [
            ...p.refTargets.map(id => ({ kind: 'reference' as const, id })),
            ...p.versionTargetsFinal.map(id => ({ kind: 'version' as const, id })),
        ]

        if (targetList.length === 0) {
            noMatch++
            reportLines.push([
                csvEscape(fullPath),
                csvEscape(base),
                p.resourceType,
                p.scopeMode,
                csvEscape(parsed.designation),
                csvEscape(parsed.product_name),
                csvEscape(parsed.commercial_measure),
                csvEscape(parsed.accessory_text),
                csvEscape(parsed.line),
                csvEscape(parsed.special_label),
                matchMode,
                p.targetGranularity,
                String(p.matchedRefIds.length),
                '0',
                '0',
                '0',
                '0',
                '',
                '0',
                'NO_MATCH',
                csvEscape(`no targets resolved (scope=${p.scopeMode}); ${p.inheritNotes.join('; ')}`),
            ].join(','))
            continue
        }

        // Resolve existing links for these targets (read-only, works in dry-run too).
        let existingLinksForTargets = 0
        let alreadyLinkedCount = 0
        let hasOtherCount = 0
        const willInsert: TargetKey[] = []

        // Determine which asset this file maps to (by content hash) so re-runs can
        // detect "already linked to the same asset". Only reads the file when some
        // target already has links; otherwise the asset is new and can't be linked yet.
        let assetIdPreview: string | null = null
        const targetsWithLinks = targetList.filter(target => {
            const existing = target.kind === 'reference'
                ? (refLinkIndex.get(target.id) || [])
                : (versionLinkIndex.get(target.id) || [])
            return existing.length > 0
        })
        if (targetsWithLinks.length > 0) {
            try {
                const hashBytes = fs.readFileSync(fullPath)
                const hash = sha256Hex(hashBytes)
                const extLower = path.extname(fullPath).toLowerCase()
                const effectiveExt = extLower || '.svg'
                const bucketPath = `assets/resources/${p.resourceType}/${hash}${effectiveExt}`
                const safeUrl = getPublicAssetUrlForStoragePath(bucketPath).replace(/'/g, "''")
                const assetLookup = await dbQuery(`
                    SELECT id
                    FROM public.assets
                    WHERE type = '${escapeSql(p.resourceType)}'
                      AND file_path = '${safeUrl}'
                    LIMIT 1
                `) as Array<{ id?: string | null }>
                assetIdPreview = assetLookup?.[0]?.id ?? null
            } catch {
                // File unreadable; assetIdPreview stays null (apply will surface the error).
            }
        }

        for (const target of targetList) {
            const existing = target.kind === 'reference'
                ? (refLinkIndex.get(target.id) || [])
                : (versionLinkIndex.get(target.id) || [])
            if (existing.length === 0) {
                willInsert.push(target)
                continue
            }
            existingLinksForTargets += existing.length
            const sameAsset = assetIdPreview !== null && existing.some(l => l.asset_id === assetIdPreview)
            if (sameAsset) {
                alreadyLinkedCount++
            } else {
                hasOtherCount++
            }
        }

        const notes = [
            `mode=${matchMode}`,
            `scope=${p.scopeMode}`,
            `matched_refs=${p.matchedRefIds.length}`,
            `target_refs=${p.refTargets.length}`,
            `target_versions=${p.versionTargetsFinal.length}`,
            ...p.inheritNotes,
        ]

        if (!dryRun) {
            try {
                const extLower = path.extname(fullPath).toLowerCase()
                const effectiveExt = extLower || '.svg'
                const contentType = guessContentType(effectiveExt)
                const bytes = fs.readFileSync(fullPath)

                const hash = sha256Hex(bytes)
                const bucketPath = `assets/resources/${p.resourceType}/${hash}${effectiveExt}`

                const { error: uploadError } = await supabaseAdmin.storage.from('assets').upload(bucketPath, bytes, {
                    contentType,
                    upsert: true,
                })
                if (uploadError) throw new Error(`storage_upload_failed: ${uploadError.message}`)

                const publicUrl = getPublicAssetUrlForStoragePath(bucketPath)
                const safeUrl = publicUrl.replace(/'/g, "''")

                const existingAsset = await dbQuery(`
                    SELECT id
                    FROM public.assets
                    WHERE type = '${escapeSql(p.resourceType)}'
                      AND file_path = '${safeUrl}'
                    LIMIT 1
                `) as Array<{ id?: string | null }>

                let assetId = existingAsset?.[0]?.id as string | undefined
                if (assetId) {
                    assetsReused++
                } else {
                    const inserted = await dbQuery(`
                        INSERT INTO public.assets (name, type, file_path)
                        VALUES ('${escapeSql(base)}', '${escapeSql(p.resourceType)}', '${safeUrl}')
                        RETURNING id
                    `) as Array<{ id?: string | null }>
                    assetId = inserted?.[0]?.id as string | undefined
                    if (!assetId) throw new Error('asset_insert_failed: missing asset id')
                    assetsCreated++
                }

                const isPublicFile = Boolean(publicSlot) && p.resourceType === 'instruction_pdf'
                let finalPublicSlug: string | null = null
                let finalSlugPrefix: string | null = null
                let finalSlugBody: string | null = null
                let finalDocumentSlot: string | null = null
                let finalDocumentLabel: string | null = null
                let finalVersionNumber = 1

                if (isPublicFile && publicPrefix) {
                    const label = mappingOverride?.label || publicLabel || base
                    const slugBody = slugify(label)
                    if (!slugBody) throw new Error('public_slug_failed: empty slug body')
                    const publicSlug = `${publicPrefix.prefix}/${slugBody}`
                    finalPublicSlug = publicSlug
                    finalSlugPrefix = publicPrefix.prefix
                    finalSlugBody = slugBody
                    finalDocumentSlot = publicSlot ?? null
                    finalDocumentLabel = label
                    finalVersionNumber = (slugMaxVn.get(publicSlug) || 0) + 1
                }

                // Overwrite semantics: for targets already linked to another asset of this type, mark old rows replaced.
                const targetsToReplace: TargetKey[] = overwrite
                    ? targetList.filter(target => {
                        const existing = target.kind === 'reference'
                            ? (refLinkIndex.get(target.id) || [])
                            : (versionLinkIndex.get(target.id) || [])
                        return existing.length > 0 && !existing.some(l => l.asset_id === assetId)
                    })
                    : []

                if (targetsToReplace.length > 0) {
                    const refIds = targetsToReplace.filter(t => t.kind === 'reference').map(t => t.id)
                    const versionIds = targetsToReplace.filter(t => t.kind === 'version').map(t => t.id)
                    const conditions: string[] = []
                    if (refIds.length > 0) conditions.push(`reference_id IN (${refIds.map(id => `'${escapeSql(id)}'`).join(',')})`)
                    if (versionIds.length > 0) conditions.push(`version_id IN (${versionIds.map(id => `'${escapeSql(id)}'`).join(',')})`)
                    await dbQuery(`
                        UPDATE public.product_asset_links
                        SET status = 'replaced',
                            updated_at = now()
                        WHERE asset_id IN (
                            SELECT a2.id FROM public.assets a2 WHERE a2.type = '${escapeSql(p.resourceType)}'
                        )
                          AND status <> 'replaced'
                          AND (${conditions.join(' OR ')})
                    `)
                }

                if (finalPublicSlug) {
                    // Replacing previously approved rows with the same public slug for these targets.
                    const refIds = p.refTargets.map(id => `'${escapeSql(id)}'`).join(',')
                    const versionIds = p.versionTargetsFinal.map(id => `'${escapeSql(id)}'`).join(',')
                    const conditions: string[] = []
                    if (refIds) conditions.push(`reference_id IN (${refIds})`)
                    if (versionIds) conditions.push(`version_id IN (${versionIds})`)
                    if (conditions.length > 0) {
                        await dbQuery(`
                            UPDATE public.product_asset_links
                            SET status = 'replaced',
                                updated_at = now()
                            WHERE public_slug = '${escapeSql(finalPublicSlug)}'
                              AND status = 'approved'
                              AND (${conditions.join(' OR ')})
                        `)
                    }
                    slugMaxVn.set(finalPublicSlug, finalVersionNumber)
                }

                const insertValues = willInsert.map(target => {
                    const refValue = target.kind === 'reference' ? `'${escapeSql(target.id)}'` : 'NULL'
                    const versionValue = target.kind === 'version' ? `'${escapeSql(target.id)}'` : 'NULL'
                    const slugValue = finalPublicSlug ? `'${escapeSql(finalPublicSlug)}'` : 'NULL'
                    const slotValue = finalDocumentSlot ? `'${escapeSql(finalDocumentSlot)}'` : 'NULL'
                    const labelValue = finalDocumentLabel ? `'${escapeSql(finalDocumentLabel)}'` : 'NULL'
                    const prefixValue = finalSlugPrefix ? `'${escapeSql(finalSlugPrefix)}'` : 'NULL'
                    const bodyValue = finalSlugBody ? `'${escapeSql(finalSlugBody)}'` : 'NULL'
                    return `(
                        '${escapeSql(assetId!)}',
                        ${refValue},
                        ${versionValue},
                        NULL,
                        NULL,
                        NULL,
                        NULL,
                        NULL,
                        NULL,
                        ${isPublicFile ? 'true' : 'false'},
                        ${slotValue},
                        ${labelValue},
                        ${prefixValue},
                        ${bodyValue},
                        ${slugValue},
                        1,
                        ${finalVersionNumber},
                        'approved',
                        0,
                        NULL
                    )`
                })

                if (insertValues.length > 0) {
                    await dbQuery(`
                        INSERT INTO public.product_asset_links (
                            asset_id,
                            reference_id,
                            version_id,
                            sku_id,
                            family_code,
                            product_type,
                            manufacturing_process,
                            use_destination,
                            global_key,
                            is_public,
                            document_slot,
                            document_label,
                            slug_prefix,
                            slug_body,
                            public_slug,
                            slug_strategy_version,
                            version_number,
                            status,
                            sort_order,
                            revision_note
                        )
                        VALUES ${insertValues.join(',')}
                    `)
                }

                const insertedNow = willInsert.length
                targetsInserted += insertedNow
                if (insertedNow > 0) {
                    appliedCount++
                } else if (alreadyLinkedCount > 0 && hasOtherCount === 0) {
                    skippedAlreadyLinked++
                } else if (hasOtherCount > 0) {
                    skippedHasOther++
                }

                reportLines.push([
                    csvEscape(fullPath),
                    csvEscape(base),
                    p.resourceType,
                    p.scopeMode,
                    csvEscape(parsed.designation),
                    csvEscape(parsed.product_name),
                    csvEscape(parsed.commercial_measure),
                    csvEscape(parsed.accessory_text),
                    csvEscape(parsed.line),
                    csvEscape(parsed.special_label),
                    matchMode,
                    p.targetGranularity,
                    String(p.matchedRefIds.length),
                    '0',
                    String(p.refTargets.length),
                    String(p.versionTargetsFinal.length),
                    String(targetList.length),
                    String(existingLinksForTargets),
                    String(insertedNow),
                    insertedNow > 0 ? 'APPLIED' : (alreadyLinkedCount > 0 && hasOtherCount === 0 ? 'SKIP_ALREADY_LINKED' : 'SKIP_HAS_OTHER'),
                    csvEscape(notes.concat([`asset_id=${assetId}`, `hash=${hash}`]).join('; ')),
                ].join(','))
            } catch (e: unknown) {
                errors++
                reportLines.push([
                    csvEscape(fullPath),
                    csvEscape(base),
                    p.resourceType,
                    p.scopeMode,
                    csvEscape(parsed.designation),
                    csvEscape(parsed.product_name),
                    csvEscape(parsed.commercial_measure),
                    csvEscape(parsed.accessory_text),
                    csvEscape(parsed.line),
                    csvEscape(parsed.special_label),
                    matchMode,
                    p.targetGranularity,
                    String(p.matchedRefIds.length),
                    '0',
                    String(p.refTargets.length),
                    String(p.versionTargetsFinal.length),
                    String(targetList.length),
                    String(existingLinksForTargets),
                    '0',
                    'ERROR',
                    csvEscape(errorMessage(e)),
                ].join(','))
            }
            continue
        }

        // Dry-run reporting
        const willInsertCount = willInsert.length
        let action = 'WOULD_APPLY'
        if (willInsertCount === 0 && alreadyLinkedCount > 0 && hasOtherCount === 0) action = 'SKIP_ALREADY_LINKED'
        else if (willInsertCount === 0 && hasOtherCount > 0) action = 'SKIP_HAS_OTHER'
        reportLines.push([
            csvEscape(fullPath),
            csvEscape(base),
            p.resourceType,
            p.scopeMode,
            csvEscape(parsed.designation),
            csvEscape(parsed.product_name),
            csvEscape(parsed.commercial_measure),
            csvEscape(parsed.accessory_text),
            csvEscape(parsed.line),
            csvEscape(parsed.special_label),
            matchMode,
            p.targetGranularity,
            String(p.matchedRefIds.length),
            '0',
            String(p.refTargets.length),
            String(p.versionTargetsFinal.length),
            String(targetList.length),
            String(existingLinksForTargets),
            String(willInsertCount),
            action,
            csvEscape(notes.concat([`would_insert=${willInsertCount}`, `already_linked=${alreadyLinkedCount}`, `has_other_asset=${hasOtherCount}`]).join('; ')),
        ].join(','))
        if (willInsertCount > 0) appliedCount++
        else if (alreadyLinkedCount > 0 && hasOtherCount === 0) skippedAlreadyLinked++
        else if (hasOtherCount > 0) skippedHasOther++
    }

    if (gapReport) {
        console.log('4.5) Building gap report...')
        const gapRows = await dbQuery(`
            SELECT
                r.id,
                r.family_code,
                r.reference_code,
                r.product_name,
                r.designation,
                r.commercial_measure,
                CASE WHEN r.isometric_asset_id IS NOT NULL OR r.isometric_path IS NOT NULL THEN true ELSE false END as has_isometric,
                EXISTS (
                    SELECT 1 FROM public.product_asset_links pal
                    JOIN public.assets a ON a.id = pal.asset_id
                    WHERE a.type = '${escapeSql(resourceType)}'
                      AND pal.status <> 'replaced'
                      AND (pal.reference_id = r.id OR pal.version_id IN (SELECT v2.id FROM public.product_versions v2 WHERE v2.reference_id = r.id))
                ) as has_resource
            FROM public.product_references r
            WHERE r.status IS NULL OR r.status <> 'INACTIVO'
            ORDER BY r.family_code NULLS LAST, r.reference_code NULLS LAST
        `) as Array<{
            id?: string | null
            family_code?: string | null
            reference_code?: string | null
            product_name?: string | null
            designation?: string | null
            commercial_measure?: string | null
            has_isometric?: boolean | null
            has_resource?: boolean | null
        }>

        const matchedRefSet = new Set<string>()
        for (const p of planned) {
            for (const rid of p.matchedRefIds) matchedRefSet.add(rid)
        }
        const gapLines: string[] = []
        gapLines.push([
            'reference_id',
            'family_code',
            'reference_code',
            'product_name',
            'designation',
            'commercial_measure',
            'has_isometric',
            `has_${resourceType}`,
            'matched_by_file',
        ].join(','))
        for (const row of gapRows || []) {
            const rid = String(row.id || '')
            const matched = matchedRefSet.has(rid)
            gapLines.push([
                rid,
                csvEscape(row.family_code || ''),
                csvEscape(row.reference_code || ''),
                csvEscape(row.product_name || ''),
                csvEscape(row.designation || ''),
                csvEscape(row.commercial_measure || ''),
                String(Boolean(row.has_isometric)),
                String(Boolean(row.has_resource)),
                String(matched),
            ].join(','))
        }
        fs.writeFileSync(gapPath, gapLines.join('\n'), 'utf8')
        const hasResourceCount = (gapRows || []).filter(r => Boolean(r.has_resource)).length
        const missingCount = (gapRows || []).length - hasResourceCount
        console.log(`   Gap report written: ${gapPath} (with resource: ${hasResourceCount}, missing: ${missingCount})`)
    }

    console.log('\n4) Writing report...')
    fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8')

    console.log('\n=== Summary ===')
    console.log(`Files considered: ${files.length}`)
    console.log(`Parse failed: ${parseFailed}`)
    console.log(`No match: ${noMatch}`)
    console.log(`Ambiguous accessory (skipped): ${ambiguousSkipped}`)
    console.log(`Conflicting targets (skipped): ${conflictsCount}`)
    console.log(`Applied (files with insertions): ${appliedCount}`)
    console.log(`Skipped (already linked to same asset): ${skippedAlreadyLinked}`)
    console.log(`Skipped (already linked to other asset): ${skippedHasOther}`)
    console.log(`Links inserted: ${targetsInserted}`)
    if (!dryRun) {
        console.log(`Assets created: ${assetsCreated}`)
        console.log(`Assets reused: ${assetsReused}`)
    }
    console.log(`Errors: ${errors}`)
    console.log(`Report: ${reportPath}`)

    if (errors > 0) process.exitCode = 2
    if (!dryRun && appliedCount === 0 && targetsInserted === 0) process.exitCode = 3
}

main().catch(e => {
    console.error('FATAL:', e?.message || e)
    process.exit(1)
})