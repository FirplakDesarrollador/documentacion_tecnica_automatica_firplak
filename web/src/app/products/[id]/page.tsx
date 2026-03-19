import { dbQuery } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { EditProductForm } from './EditProductForm'

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const rows = await dbQuery(`SELECT * FROM public.products WHERE id='${id}' LIMIT 1`)
    const product = rows?.[0]

    if (!product) {
        redirect('/products')
    }

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Editar Producto</h1>
                    <p className="text-muted-foreground">Actualizar la información maestra del producto.</p>
                </div>
            </div>

            <EditProductForm initialData={product} />
        </div>
    )
}
