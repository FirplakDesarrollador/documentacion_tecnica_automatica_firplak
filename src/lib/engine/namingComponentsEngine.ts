import { evaluateProductRules, type RuleEngineResult } from './ruleEvaluator'
import {
    DEFAULT_NAMING_TYPE,
    componentsToRules,
    componentsToTranslatorConfig,
    loadNamingComponents,
    normalizeNamingProductType,
    type NamingComponent,
} from './namingComponents'
import { translateProductToEnglish, type ProductPayload, type TranslationResult } from './translator'

export interface NamingComponentsEngineResult {
    namingType: string
    productType: string
    components: NamingComponent[]
    evaluation: RuleEngineResult
    translation: TranslationResult
    finalNameEs: string
    finalNameEn: string
    storableFinalNameEn: string
    missingTerms: string[]
    isValid: boolean
    validation_status: 'ready' | 'needs_review'
    errorReason: string
    activeVariableIds: string[]
}

function emptyEvaluation(product: ProductPayload): RuleEngineResult {
    return {
        finalNameEs: '',
        finalNameEn: '',
        activeIcons: [],
        trace: [],
        activeVariableIds: [],
        transformedProduct: { ...product } as unknown as RuleEngineResult['transformedProduct'],
    }
}

function emptyTranslation(errorReason: string): TranslationResult {
    return {
        translatedName: '',
        missingTerms: [],
        isValid: false,
        errorReason,
        warnings: [],
        fieldTranslations: {},
    }
}

export async function computeNameWithNamingComponents(
    product: ProductPayload,
    namingType: string = DEFAULT_NAMING_TYPE,
    forceGlossaryRefresh: boolean = false
): Promise<NamingComponentsEngineResult> {
    const productType = normalizeNamingProductType(product.product_type || 'MUEBLE') || 'MUEBLE'
    const components = await loadNamingComponents(productType, namingType)

    if (components.length === 0) {
        const errorReason = `No hay componentes de nomenclatura para ${productType}/${namingType}.`
        const evaluation = emptyEvaluation(product)
        const translation = emptyTranslation(errorReason)
        return {
            namingType,
            productType,
            components,
            evaluation,
            translation,
            finalNameEs: '',
            finalNameEn: '',
            storableFinalNameEn: '',
            missingTerms: [],
            isValid: false,
            validation_status: 'needs_review',
            errorReason,
            activeVariableIds: [],
        }
    }

    const rules = componentsToRules(components, productType)
    const evaluation = evaluateProductRules(
        product as unknown as Parameters<typeof evaluateProductRules>[0],
        rules as unknown as Parameters<typeof evaluateProductRules>[1]
    )
    const finalNameEs = evaluation.finalNameEs
    const translation = await translateProductToEnglish(
        { ...evaluation.transformedProduct, final_name_es: finalNameEs } as ProductPayload,
        productType,
        evaluation.activeVariableIds,
        forceGlossaryRefresh,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        componentsToTranslatorConfig(components) as any
    )
    const isValid = Boolean(finalNameEs) && translation.isValid
    const missingTerms = [...new Set(translation.missingTerms || [])]

    return {
        namingType,
        productType,
        components,
        evaluation,
        translation,
        finalNameEs,
        finalNameEn: translation.translatedName || '',
        storableFinalNameEn: isValid ? translation.translatedName || '' : '',
        missingTerms,
        isValid,
        validation_status: isValid ? 'ready' : 'needs_review',
        errorReason: isValid ? '' : (translation.errorReason || 'Nombre invÃ¡lido o traducciÃ³n pendiente.'),
        activeVariableIds: evaluation.activeVariableIds,
    }
}
