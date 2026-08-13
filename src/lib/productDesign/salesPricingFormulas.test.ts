import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_SALES_PRICING_FORMULAS, evaluateSalesPricing, normalizeSalesPercentage } from './salesPricingFormulas'

test('calcula los precios iniciales con porcentajes expresados por Ventas', () => {
  const result = evaluateSalesPricing(DEFAULT_SALES_PRICING_FORMULAS, {
    materialCost: 100_000,
    expandedCost: 140_000,
    mcPct: normalizeSalesPercentage(67),
    discountPct: normalizeSalesPercentage(40),
  })
  assert.equal(Math.round(result.minimumPrice), 303_030)
  assert.equal(Math.round(result.maximumPrice), 505_051)
  assert.equal(Math.round(result.pvp), 480_808)
})

test('rechaza porcentajes que harían inválido el denominador', () => {
  assert.throws(() => normalizeSalesPercentage(100))
  assert.throws(() => normalizeSalesPercentage(-1))
})

test('no acepta JavaScript ni variables fuera del contrato', () => {
  assert.throws(() => evaluateSalesPricing({ ...DEFAULT_SALES_PRICING_FORMULAS, pvp: 'window.alert(1)' }, { materialCost: 100, expandedCost: 100, mcPct: 0.4, discountPct: 0.1 }))
})
