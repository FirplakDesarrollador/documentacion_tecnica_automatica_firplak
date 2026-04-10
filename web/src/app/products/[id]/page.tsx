import { dbQuery } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { ProductForm } from '../ProductForm'

export default async function EditProductPage({ 
    params, 
    searchParams: searchParamsPromise 
}: { 
    params: Promise<{ id: string }>,
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const { id } = await params
    const searchParams = await searchParamsPromise

    const rows = await dbQuery(`SELECT * FROM public.cabinet_products WHERE id='${id}' LIMIT 1`)
    const product = rows?.[0]

    if (!product) {
        redirect('/products')
    }

    // Construct back link with current filters
    const urlParams = new URLSearchParams()
    Object.entries(searchParams).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            value.forEach(v => urlParams.append(key, v))
        } else if (value !== undefined) {
            urlParams.append(key, value)
        }
    })
    const backHref = `/products${urlParams.toString() ? `?${urlParams.toString()}` : ''}`

    return (
        <div className="max-w-5xl mx-auto w-full">
            <ProductForm initialData={product} backHref={backHref} />
        </div>
    )
}
