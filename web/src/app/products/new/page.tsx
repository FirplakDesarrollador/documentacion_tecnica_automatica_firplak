import { ProductForm } from '../ProductForm'

export default async function NewProductPage({ 
    searchParams: searchParamsPromise 
}: { 
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const searchParams = await searchParamsPromise

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
            <ProductForm backHref={backHref} />
        </div>
    )
}
