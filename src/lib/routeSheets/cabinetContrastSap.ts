export type ContrastLineMatch =
  | 'exact'
  | 'qty_mismatch'
  | 'sap_only'
  | 'app_only'

export type ContrastLine = {
  item_code: string
  item_name: string
  app_qty: number | null
  sap_qty: number | null
  match: ContrastLineMatch
  scope: string | null
}

export type ContrastSkuResult = {
  sku_complete: string
  match: 'full' | 'differences' | 'sap_missing' | 'error'
  error: string | null
  sap_lines: ContrastLine[]
  app_lines: ContrastLine[]
  differences: ContrastLine[]
}

export type SkuCoverageIssue = {
  type: 'sap_not_in_app' | 'app_not_in_sap'
  sku_complete: string
  item_name: string | null
}

export type ContrastReport = {
  reference_id: string
  reference_code: string | null
  total_skus: number
  full_match_count: number
  difference_count: number
  error_count: number
  sku_results: ContrastSkuResult[]
  coverage_issues: SkuCoverageIssue[]
}

function groupByCode(lines: { item_code: string; item_name: string; qty: number; scope?: string | null }[]): Map<string, { item_name: string; total_qty: number; scopes: Set<string> }> {
  const grouped = new Map<string, { item_name: string; total_qty: number; scopes: Set<string> }>()
  for (const l of lines) {
    const key = l.item_code.toUpperCase()
    const existing = grouped.get(key)
    if (existing) {
      existing.total_qty += l.qty
      if (l.scope) existing.scopes.add(l.scope)
    } else {
      grouped.set(key, { item_name: l.item_name || key, total_qty: l.qty, scopes: new Set(l.scope ? [l.scope] : []) })
    }
  }
  return grouped
}

export function contrastSapVsApp(
  sapLines: { item_code: string; item_name: string; quantity: number }[],
  appLines: { item_code: string; item_name: string | null; qty: number; scope?: string | null }[]
): {
  sap_contrast_lines: ContrastLine[]
  app_contrast_lines: ContrastLine[]
  differences: ContrastLine[]
} {
  const normalizedSap = sapLines.map(l => ({
    item_code: l.item_code.trim().toUpperCase(),
    item_name: l.item_name || '',
    quantity: l.quantity ?? 1,
  }))
  const sapMap = groupByCode(normalizedSap.map(l => ({ ...l, qty: l.quantity })))
  const appMap = groupByCode(appLines.map(l => ({ item_code: l.item_code, item_name: l.item_name ?? '', qty: l.qty, scope: l.scope })))

  const allCodes = new Set([...sapMap.keys(), ...appMap.keys()])
  const sapContrast: ContrastLine[] = []
  const appContrast: ContrastLine[] = []
  const differences: ContrastLine[] = []

  for (const code of allCodes) {
    const sap = sapMap.get(code)
    const app = appMap.get(code)
    const itemName = app?.item_name || sap?.item_name || code
    const scope = app?.scopes.size === 1 ? [...app.scopes][0] : null

    const contrastLine: ContrastLine = {
      item_code: code,
      item_name: itemName,
      app_qty: app?.total_qty ?? null,
      sap_qty: sap?.total_qty ?? null,
      match: 'exact',
      scope,
    }

    if (!sap && app) {
      contrastLine.match = 'app_only'
      differences.push({ ...contrastLine, match: 'app_only' })
    } else if (sap && !app) {
      contrastLine.match = 'sap_only'
      differences.push({ ...contrastLine, match: 'sap_only' })
    } else if (sap && app && sap.total_qty !== app.total_qty) {
      contrastLine.match = 'qty_mismatch'
      differences.push({ ...contrastLine, match: 'qty_mismatch' })
    }

    sapContrast.push({ ...contrastLine, app_qty: null, sap_qty: sap?.total_qty ?? null, match: !sap ? 'app_only' : contrastLine.match })
    appContrast.push({ ...contrastLine, app_qty: app?.total_qty ?? null, sap_qty: null, match: !app ? 'sap_only' : contrastLine.match })
  }

  return { sap_contrast_lines: sapContrast, app_contrast_lines: appContrast, differences }
}
