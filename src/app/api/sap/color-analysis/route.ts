import { NextRequest, NextResponse } from 'next/server'

import { apiGuard } from '@/utils/auth/access'
import { dbQuery } from '@/lib/supabase'
import {
  getSapItemBom,
  getSapProductTreesByPrefixes,
  type SapEntityPayload,
} from '@/lib/sap/serviceLayer'
import {
  aggregateColorAnalysis,
  classifyColorAnalysisSku,
  configurationSnapshot,
  materialLinesFromProductTree,
  materialLinesFromSapBom,
  type ColorAnalysisSku,
  type ColorConfigurationSnapshot,
  type ColorAnalysisSkuResult,
} from '@/lib/sap/colorAnalysis'
import { sapApiErrorResponse } from '../_utils'

export const runtime = 'nodejs'
export const maxDuration = 300

const COLLECTION_PREFIX_BATCH_SIZE = 8
const DIRECT_FALLBACK_CONCURRENCY = 2
const SAP_TIMEOUT_MS = 60_000
const SAP_PRODUCT_TREE_EXPAND = 'ProductTreeLines($select=ItemCode,ItemName,Quantity,IssueMethod,ChildNum,Warehouse,InventoryUOM)'

type SkuRow = Record<string, unknown>

type SapSkuCandidate = ColorAnalysisSku & {
  prefix: string
}

type FurnitureSkuData = {
  candidates: SapSkuCandidate[]
  configurationByColor: Map<string, ColorConfigurationSnapshot | null>
}

type ProductTreeGroup = {
  prefix: string
  skus: SapSkuCandidate[]
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeCode(value: unknown): string | null {
  const normalized = readString(value)?.toUpperCase() ?? null
  return normalized || null
}

function productPrefix(familyCode: string | null, referenceCode: string | null): string | null {
  if (!familyCode || !referenceCode) return null
  const normalizedFamily = familyCode.toUpperCase().startsWith('V')
    ? familyCode.toUpperCase()
    : `V${familyCode.toUpperCase()}`
  return `${normalizedFamily}-${referenceCode.toUpperCase()}-000-`
}

function numberParam(request: NextRequest, name: string, fallback: number, max: number): number {
  const parsed = Number(request.nextUrl.searchParams.get(name))
  if (!Number.isInteger(parsed) || parsed < 0) return fallback
  return Math.min(parsed, max)
}

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let nextIndex = 0
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(values[currentIndex])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()))
  return results
}

function treeCode(tree: SapEntityPayload): string | null {
  return normalizeCode(tree.TreeCode)
}

function treeLines(tree: SapEntityPayload): unknown[] | null {
  return Array.isArray(tree.ProductTreeLines) ? tree.ProductTreeLines : null
}

function classifyTreeCandidate(
  sku: SapSkuCandidate,
  tree: SapEntityPayload | null,
  fallbackLines: ReturnType<typeof materialLinesFromSapBom> | null = null
): ColorAnalysisSkuResult {
  const lines = tree ? materialLinesFromProductTree(tree) : fallbackLines ?? []
  return classifyColorAnalysisSku({
    sku,
    sapFound: Boolean(tree) || Boolean(fallbackLines),
    sapItemName: tree ? readString(tree.ProductDescription) : null,
    lines,
  })
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value !== 'string') return []
  const trimmed = value.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map(item => item.trim().replace(/^"|"$/g, ''))
      .filter(Boolean)
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false
  }
  return fallback
}

async function getSupabaseFurnitureSkus(): Promise<FurnitureSkuData> {
  const rows = await dbQuery(`
    SELECT
      ps.sku_complete,
      upper(trim(ps.color_code)) AS color_code,
      c.name_color_sap,
      COALESCE(c.color_mode, 'full') AS color_mode,
      COALESCE(c.application_colors_json, '{}'::jsonb) AS application_colors_json,
      COALESCE(c.allowed_product_types, '{}'::text[]) AS allowed_product_types,
      COALESCE(c.allowed_manufacturing_processes, '{}'::text[]) AS allowed_manufacturing_processes,
      COALESCE(c.is_active, true) AS is_active,
      c.notes,
      pr.family_code,
      pr.reference_code,
      upper(trim(f.product_type)) AS product_type,
      upper(trim(f.manufacturing_process)) AS manufacturing_process
    FROM public.product_skus ps
    JOIN public.product_versions pv ON pv.id = ps.version_id
    JOIN public.product_references pr ON pr.id = pv.reference_id
    JOIN public.families f ON f.family_code = pr.family_code
    LEFT JOIN public.colors c ON c.code_4dig = upper(trim(ps.color_code))
    WHERE upper(trim(f.product_type)) LIKE 'MUEBLE%'
      AND nullif(trim(ps.color_code), '') IS NOT NULL
      AND nullif(trim(ps.sku_complete), '') IS NOT NULL
    ORDER BY ps.sku_complete
  `) as SkuRow[]

  const configurationByColor = new Map<string, ColorConfigurationSnapshot | null>()
  const candidates = rows.flatMap(row => {
    const skuComplete = normalizeCode(row.sku_complete)
    const colorCode = normalizeCode(row.color_code)
    const familyCode = normalizeCode(row.family_code)
    const referenceCode = normalizeCode(row.reference_code)
    const prefix = productPrefix(familyCode, referenceCode)
    if (!skuComplete || !colorCode || !prefix) return []
    if (!configurationByColor.has(colorCode)) {
      configurationByColor.set(colorCode, configurationSnapshot({
        colorMode: row.color_mode,
        applicationColorsJson: parseJsonRecord(row.application_colors_json),
        allowedProductTypes: parseStringArray(row.allowed_product_types),
        allowedManufacturingProcesses: parseStringArray(row.allowed_manufacturing_processes),
        isActive: parseBoolean(row.is_active, true),
        notes: row.notes,
      }))
    }
    return [{
      skuComplete,
      colorCode,
      colorName: readString(row.name_color_sap),
      familyCode,
      referenceCode,
      productType: readString(row.product_type),
      manufacturingProcess: readString(row.manufacturing_process),
      prefix,
    }]
  })

  return { candidates, configurationByColor }
}

function groupByPrefix(skus: SapSkuCandidate[]): ProductTreeGroup[] {
  const groups = new Map<string, SapSkuCandidate[]>()
  for (const sku of skus) {
    const group = groups.get(sku.prefix) ?? []
    group.push(sku)
    groups.set(sku.prefix, group)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([prefix, groupSkus]) => ({ prefix, skus: groupSkus }))
}

async function collectSapResults(groups: ProductTreeGroup[]): Promise<ColorAnalysisSkuResult[]> {
  const results: ColorAnalysisSkuResult[] = []
  const prefixBatches = chunk(groups, COLLECTION_PREFIX_BATCH_SIZE)

  for (const prefixBatch of prefixBatches) {
    const prefixes = prefixBatch.map(group => group.prefix)
    let trees: SapEntityPayload[] = []
    let collectionLinesAvailable = true

    try {
      trees = await getSapProductTreesByPrefixes(prefixes, {
        select: ['TreeCode', 'TreeType', 'Quantity', 'ProductDescription'],
        expand: [SAP_PRODUCT_TREE_EXPAND],
        top: prefixBatch.reduce((total, group) => total + group.skus.length, 0),
        timeoutMs: SAP_TIMEOUT_MS,
      })
      collectionLinesAvailable = trees.every(tree => treeLines(tree) !== null)
    } catch {
      collectionLinesAvailable = false
    }

    const treeByCode = new Map(trees.flatMap(tree => {
      const code = treeCode(tree)
      return code ? [[code, tree] as const] : []
    }))

    if (collectionLinesAvailable) {
      for (const group of prefixBatch) {
        for (const sku of group.skus) {
          results.push(classifyTreeCandidate(sku, treeByCode.get(sku.skuComplete) ?? null))
        }
      }
      continue
    }

    const fallbackSkus = prefixBatch.flatMap(group => group.skus)
    const fallbackResults = await mapWithConcurrency(
      fallbackSkus,
      DIRECT_FALLBACK_CONCURRENCY,
      async sku => {
        const bom = await getSapItemBom(sku.skuComplete)
        return bom
          ? classifyTreeCandidate(sku, null, materialLinesFromSapBom(bom))
          : classifyTreeCandidate(sku, null, null)
      }
    )
    results.push(...fallbackResults)
  }

  return results
}

export async function GET(request: NextRequest) {
  const guard = await apiGuard('module:consulta-sap')
  if (guard.response) return guard.response

  try {
    const { candidates, configurationByColor } = await getSupabaseFurnitureSkus()
    const groups = groupByPrefix(candidates)
    const page = numberParam(request, 'page', 0, 1000)
    const pageSize = numberParam(request, 'pageSize', groups.length, 1000) || groups.length
    const pageGroups = groups.slice(page * pageSize, (page + 1) * pageSize)
    const skuResults = await collectSapResults(pageGroups)
    const colors = aggregateColorAnalysis(skuResults, configurationByColor)
    const hasNextPage = (page + 1) * pageSize < groups.length

    return NextResponse.json({
      success: true,
      reportType: 'sap_furniture_color_analysis',
      source: {
        productType: 'MUEBLE',
        manufacturingProcess: 'MUEBLES NACIONAL + MUEBLES EXTERIOR',
        supabaseSkuCount: candidates.length,
        supabaseReferenceCount: groups.length,
        processedReferenceCount: pageGroups.length,
        page,
        pageSize,
        hasNextPage,
        nextPage: hasNextPage ? page + 1 : null,
      },
      coverage: {
        processedSkuCount: skuResults.length,
        sapFoundSkuCount: skuResults.filter(result => result.sapFound).length,
        sapMissingSkuCount: skuResults.filter(result => !result.sapFound).length,
        skuWithoutBoardCount: skuResults.filter(result => result.boardPattern === 'SIN_TABLERO').length,
        skuWithoutEdgeCount: skuResults.filter(result => result.edgePattern === 'SIN_CANTO').length,
      },
      interpretation: {
        boardPatterns: {
          UNICOLOR: 'Un solo codigo de tablero dentro del SKU; no implica que coincida con el color comercial.',
          DUAL: 'Dos codigos de tablero dentro del SKU; los roles estructura/frente son candidatos ordenados por consumo.',
          BALANCE: 'Tres codigos de tablero dentro del SKU; los roles estructura/frente/estructura interna son candidatos ordenados por consumo.',
        },
        configurationEvidence: 'configurationEvidence y sus scopes son propuestas derivadas de SAP. No escriben en public.colors y requieren revision cuando requiresReview es true.',
        quantity: 'totalQuantity y quantityShare se calculan sobre Quantity de las lineas SAP clasificadas como TABLERO o CANTO.',
        combinations: 'Cada combinacion agrupa exactamente los colores de tablero y canto que aparecen juntos en los SKU listados.',
      },
      colors,
    })
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
