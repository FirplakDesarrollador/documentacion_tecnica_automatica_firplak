import { NextResponse } from 'next/server'

import { buildEstimationBomWorkbook } from '@/lib/sales/estimationBomWorkbook'
import { DEFAULT_SALES_PRICING_FORMULAS, evaluateSalesPricing, normalizeSalesPricingFormulaConfig, SALES_PRICING_FORMULAS_SETTING_KEY } from '@/lib/productDesign/salesPricingFormulas'
import { getSapCostedBom } from '@/lib/sap/consultaCostedBom'
import { convertSapCostedBomToEstimationExport } from '@/lib/sap/costedBomEstimationExport'
import { dbQuery } from '@/lib/supabase'
import { apiGuard } from '@/utils/auth/access'
import { sapApiErrorResponse } from '../../../../_utils'

export const runtime = 'nodejs'
export const maxDuration = 60

function filenameItemCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/gu, '_') || 'SIN_CODIGO'
}

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ itemCode: string }> },
) {
  const guard = await apiGuard('module:consulta-sap', 'module:product-design')
  if (guard.response) return guard.response

  try {
    const { itemCode } = await paramsPromise
    const result = await getSapCostedBom(itemCode)
    if (!result) return NextResponse.json({ success: false, error: 'El artículo no tiene una LdM SAP.' }, { status: 404 })

    const exported = convertSapCostedBomToEstimationExport(result.tree)
    const settings = await dbQuery('SELECT value FROM public.app_settings WHERE key = $1 LIMIT 1', [SALES_PRICING_FORMULAS_SETTING_KEY])
    let formulaConfig = DEFAULT_SALES_PRICING_FORMULAS
    try {
      formulaConfig = normalizeSalesPricingFormulaConfig(settings[0]?.value)
    } catch {
      formulaConfig = DEFAULT_SALES_PRICING_FORMULAS
    }
    const url = new URL(request.url)
    const contributionMarginPct = Number(url.searchParams.get('mcPct') ?? 40) / 100
    const discountPct = Number(url.searchParams.get('discountPct') ?? 0) / 100
    if (!Number.isFinite(contributionMarginPct) || contributionMarginPct <= 0 || contributionMarginPct >= 1 || !Number.isFinite(discountPct) || discountPct < 0 || discountPct >= 1) {
      return NextResponse.json({ success: false, error: 'MC % debe ser mayor que 0 y descuento % debe estar entre 0 y menor que 100.' }, { status: 400 })
    }
    const workbook = await buildEstimationBomWorkbook(result.tree.itemCode, exported.rows, {
      currency: 'COP',
      contributionMarginPct,
      discountPct,
      formulaConfig,
      totals: exported.totals,
      calculated: evaluateSalesPricing(formulaConfig, {
        materialCost: exported.totals.materialsAndPackaging,
        expandedCost: exported.totals.expandedTotal,
        mcPct: contributionMarginPct,
        discountPct,
      }),
    })
    const date = new Date().toISOString().slice(0, 10)
    const filename = `LdM_Costeo_${filenameItemCode(result.tree.itemCode)}_${date}.xlsx`
    return new NextResponse(workbook as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: unknown) {
    return sapApiErrorResponse(error)
  }
}
