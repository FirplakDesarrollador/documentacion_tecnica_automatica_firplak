'use server'

import { composeProductsByFilters, type ProductFilters } from '@/lib/engine/product_composer'

export async function getFilteredProducts(
    families: string[],
    references: string[],
    measures: string[],
    search: string | null,
    page: number = 1,
    pageSize: number = 200
) {
    const filters: ProductFilters = {}
    if (families.length > 0) filters.families = families
    if (references.length > 0) filters.references = references
    if (measures.length > 0) filters.measures = measures
    if (search) filters.search = search

    const result = await composeProductsByFilters(filters, pageSize, (page - 1) * pageSize)
    return result
}
