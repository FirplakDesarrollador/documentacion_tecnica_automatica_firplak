import { redirect } from 'next/navigation'
import { ProductForm } from '../ProductForm'
import { composeProductById } from '@/lib/engine/product_composer'

export default async function EditProductPage({ 
    params, 
    searchParams: searchParamsPromise 
}: { 
    params: Promise<{ id: string }>,
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const { id } = await params
    const searchParams = await searchParamsPromise

    const product = await composeProductById(id)

    if (!product) {
        // Redirigir al listado con un mensaje si el producto no existe en V6.1
        // (Sin fallback a cabinet_products como se solicitó)
        redirect('/products?error=not_found')
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
            <ProductForm initialData={product} backHref={backHref} readOnly={true} />
        </div>
    )
}
