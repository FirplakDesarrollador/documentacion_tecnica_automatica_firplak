'use server'

import { composeProductsByFilters, type ProductFilters } from '@/lib/engine/product_composer'

export async function getFilteredProducts(
    search: string | null,
    page: number = 1,
    pageSize: number = 500
) {
    const filters: ProductFilters = {}
    if (search) filters.search = search

    const result = await composeProductsByFilters(filters, pageSize, (page - 1) * pageSize)
    return result
}
