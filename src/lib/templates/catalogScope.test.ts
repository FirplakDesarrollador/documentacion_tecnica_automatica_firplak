import assert from 'node:assert/strict'
import test from 'node:test'
import type { NamingVariableSource } from '@/lib/engine/namingVariableCatalog'
import {
    extractTemplateScopeBindings,
    getTemplateCatalogScope,
    validateTemplateScopeBindings,
} from './catalogScope'
import {
    buildCatalogTargetContext,
    buildCatalogTargetQuery,
    getPersistedTemplateRenderSettings,
} from './catalogScopeServer'

test('keeps external datasets outside the Core catalog scope', () => {
    assert.equal(getTemplateCatalogScope('custom_datasets', 'reference'), null)
    assert.equal(getTemplateCatalogScope('core_firplak', 'reference'), 'reference')
})

test('rejects SKU bindings for a reference template', () => {
    const bindings = extractTemplateScopeBindings([
        { type: 'dynamic_text', dataField: 'sku_complete' },
        { type: 'text', content: 'Familia: {product_type}' },
    ], '{ref_code}_{final_complete_name_es}')
    const issues = validateTemplateScopeBindings('reference', bindings)
    assert.deepEqual(issues.map((issue) => issue.variable).sort(), ['final_complete_name_es', 'sku_complete'])
})

test('allows reference attributes and runtime variables at reference scope', () => {
    const bindings = extractTemplateScopeBindings([
        { type: 'dynamic_text', dataField: 'q_package' },
        { type: 'text', content: '{print_datetime} - {accessory_text}' },
    ])
    const sources = new Map<string, NamingVariableSource>([
        ['q_package', 'ref_attrs'],
        ['accessory_text', 'ref_attrs'],
    ])
    assert.deepEqual(validateTemplateScopeBindings('reference', bindings, sources), [])
})

test('applies the variable matrix from family through SKU', () => {
    const bindings = extractTemplateScopeBindings([
        { type: 'dynamic_text', dataField: 'product_type' },
        { type: 'dynamic_text', dataField: 'product_name' },
        { type: 'dynamic_text', dataField: 'final_base_name_es' },
        { type: 'dynamic_text', dataField: 'color_name' },
    ])
    const sources = new Map<string, NamingVariableSource>([['color_name', 'color']])

    assert.deepEqual(
        validateTemplateScopeBindings('family', bindings, sources).map((issue) => issue.variable).sort(),
        ['color_name', 'final_base_name_es', 'product_name'],
    )
    assert.deepEqual(
        validateTemplateScopeBindings('version', bindings, sources).map((issue) => issue.variable),
        ['color_name'],
    )
    assert.deepEqual(validateTemplateScopeBindings('sku', bindings, sources), [])
})

test('keeps family defaults available at family scope', () => {
    const bindings = extractTemplateScopeBindings([
        { type: 'dynamic_text', dataField: 'rh' },
        { type: 'dynamic_text', dataField: 'rh_default' },
    ])

    assert.deepEqual(validateTemplateScopeBindings('family', bindings), [])
})

test('searches code and name fields for every catalog scope', () => {
    const expectedSearchColumns = {
        family: ['f.family_code', 'f.family_name'],
        reference: ['r.reference_code', 'r.product_name'],
        version: ['v.version_code', 'v.final_base_name_es'],
        sku: ['s.sku_complete', 's.final_complete_name_es'],
    }

    for (const [scope, columns] of Object.entries(expectedSearchColumns)) {
        const query = buildCatalogTargetQuery({
            scope: scope as 'family' | 'reference' | 'version' | 'sku',
            search: 'coincidencia',
        })
        for (const column of columns) assert.match(query, new RegExp(column.replace('.', '\\.')))
        assert.match(query, /ILIKE '%coincidencia%'/)
    }
})

test('uses persisted Core dimensions and font settings for server rendering', () => {
    assert.deepEqual(
        getPersistedTemplateRenderSettings({
            width_mm: 216,
            height_mm: 279,
            template_font_family: 'Roboto',
        }),
        {
            widthPx: 864,
            heightPx: 1116,
            templateFontFamily: 'roboto',
        },
    )
    assert.equal(
        getPersistedTemplateRenderSettings({
            width_mm: null,
            height_mm: 279,
            template_font_family: 'roboto',
        }),
        null,
    )
})

test('builds render context only from the selected level and its ancestors', () => {
    const row = {
        family_code: 'FAM-01',
        family_name: 'Familia principal',
        product_type: 'Mueble',
        rh_default: true,
        reference_id: 'ref-id',
        reference_code: 'REF-01',
        product_name: 'Referencia principal',
        ref_status: 'ACTIVO',
        ref_attrs: { accessory_text: 'Riel' },
        version_id: 'version-id',
        version_code: 'V1',
        final_base_name_es: 'Nombre base',
        version_status: 'ACTIVO',
        global_version_rule_status: 'ACTIVO',
        version_attrs: { version_only: 'sí' },
        sku_id: 'sku-id',
        sku_complete: 'SKU-01',
        final_complete_name_es: 'Nombre completo',
        sku_status: 'ACTIVO',
        sku_attrs: { sku_only: 'sí' },
        color_code: '0001',
    }

    const reference = buildCatalogTargetContext('reference', row)
    assert.equal(reference?.catalog_target_id, 'ref-id')
    assert.equal(reference?.accessory_text, 'Riel')
    assert.equal(reference?.version_only, undefined)
    assert.equal(reference?.sku_only, undefined)
    assert.equal(reference?.sku_complete, undefined)

    const family = buildCatalogTargetContext('family', row)
    assert.equal(family?.rh, 'RH')
    assert.equal(family?.rh_default, true)

    const version = buildCatalogTargetContext('version', row)
    assert.equal(version?.version_only, 'sí')
    assert.equal(version?.sku_only, undefined)
    assert.equal(version?.sku_complete, undefined)

    const sku = buildCatalogTargetContext('sku', row)
    assert.equal(sku?.sku_only, 'sí')
    assert.equal(sku?.sku_complete, 'SKU-01')
})
