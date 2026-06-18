import assert from 'node:assert/strict'
import test from 'node:test'

import {
    appendLabelBoxSuffix,
    buildLabelBoxesAttr,
    buildPackageQuantityLabel,
    expandLabelBoxProducts,
    filenameFormatUsesLabelBoxVariable,
    getLabelBoxRuntimeValues,
    getLabelBoxTotal,
    getLabelBoxWeightsKg,
    normalizeWeightKgTotal,
} from './labelParts'

test('detects label boxes from version_label using CAJAS', () => {
    assert.equal(buildPackageQuantityLabel(1), '1 CAJA')
    assert.equal(buildPackageQuantityLabel(2), '2 CAJAS')
    assert.equal(getLabelBoxTotal('2 CAJAS'), 2)
    assert.equal(getLabelBoxTotal('3 cajas'), 3)
    assert.equal(getLabelBoxTotal('2 PARTES'), null)
    assert.equal(getLabelBoxTotal('NA'), null)
})

test('expands a normal product once with empty runtime variables', () => {
    const [product] = expandLabelBoxProducts({
        code: 'SKU-1',
        effective_attrs: { q_package: '1 CAJA' },
        weight_kg: 15,
    })

    assert.equal(product.code, 'SKU-1')
    assert.equal(product.partes_texto, '')
    assert.equal(product.weight_kg, 15)
    assert.equal(product._labelBoxTotal, null)
})

test('expands a boxed product and assigns box text and weights', () => {
    const products = expandLabelBoxProducts({
        code: 'SKU-2',
        effective_attrs: {
            q_package: '2 CAJAS',
        },
        weight_kg: {
            peso_total: 21.2,
            weights_kg: [12.5, '8,7'],
        },
    })

    assert.equal(products.length, 2)
    assert.equal(products[0].partes_texto, 'Caja 1/2')
    assert.equal(products[0].weight_kg, 12.5)
    assert.equal(products[0].weight_lb, '27.6')
    assert.equal(products[1].partes_texto, 'Caja 2/2')
    assert.equal(products[1].weight_kg, 8.7)
    assert.equal(products[1].weight_lb, '19.2')
})

test('does not expand from version_label without q_package', () => {
    const products = expandLabelBoxProducts({
        code: 'SKU-3',
        version_label: '2 CAJAS',
        effective_attrs: {
            q_package: '1 CAJA',
        },
        weight_kg: 20,
    })

    assert.equal(products.length, 1)
    assert.equal(products[0].partes_texto, '')
})

test('does not treat a scalar total weight as a box weight for multi-box products', () => {
    const products = expandLabelBoxProducts({
        code: 'SKU-4',
        effective_attrs: {
            q_package: '2 CAJAS',
        },
        weight_kg: 59.5,
    })

    assert.equal(products.length, 2)
    assert.equal(products[0].weight_kg, null)
    assert.equal(products[0].weight_lb, '')
    assert.equal(products[1].weight_kg, null)
    assert.equal(products[1].weight_lb, '')
})

test('normalizes label box weight attrs with missing values', () => {
    assert.deepEqual(buildLabelBoxesAttr(['1.25', '', 'bad'], 3), {
        weights_kg: [1.25, null, null],
        peso_total: null,
    })
    assert.deepEqual(buildLabelBoxesAttr(['1.25', '2', '3'], 3), {
        weights_kg: [1.25, 2, 3],
        peso_total: 6.25,
    })
    assert.deepEqual(getLabelBoxWeightsKg({
        weight_kg: { weights_kg: [1, undefined] },
    }, 3), [1, null, null])
    assert.equal(normalizeWeightKgTotal({ weights_kg: [1.25, 2.5], peso_total: 3.75 }), 3.75)
    assert.equal(normalizeWeightKgTotal({ weights_kg: [1.25, 2.5] }), 3.75)
    assert.equal(normalizeWeightKgTotal('12,5'), 12.5)
    assert.equal(normalizeWeightKgTotal('{"weights_kg":[4,5]}'), 9)
})

test('builds empty and filled runtime values', () => {
    assert.equal(getLabelBoxRuntimeValues(null, null).partes_texto, '')
    assert.deepEqual(getLabelBoxRuntimeValues(2, 3), {
        partes_texto: 'Caja 2/3',
        partes_file_suffix: '2-de-3',
    })
})

test('detects filename formats that already include box variables', () => {
    assert.equal(filenameFormatUsesLabelBoxVariable('{sku_base}_{partes_texto}'), true)
    assert.equal(filenameFormatUsesLabelBoxVariable('{sku_base}_{final_name_es}'), false)
    assert.equal(appendLabelBoxSuffix('SKU_NAME', { partes_file_suffix: '1-de-2' }), 'SKU_NAME_1-de-2')
})
