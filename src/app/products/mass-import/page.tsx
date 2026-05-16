import { MassImportClient } from './MassImportClient'

export const dynamic = 'force-dynamic'

export default async function MassImportPage() {
    return (
        <div className="p-8 max-w-[1200px] mx-auto space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Carga Masiva de Productos</h1>
                <p className="text-muted-foreground">
                    Importa productos faltantes a través de un archivo CSV o Excel.
                </p>
            </div>
            
            <MassImportClient families={[]} />
        </div>
    )
}
