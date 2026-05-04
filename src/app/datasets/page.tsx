import { getDatasetsAction } from './actions'
import { DatasetsClient } from '@/components/datasets/DatasetsClient'

export default async function DatasetsPage() {
    const datasets = await getDatasetsAction()

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Bases de Datos Externas</h1>
                    <p className="text-slate-500 mt-2 text-sm max-w-2xl">
                        Importa archivos CSV o Excel para crear nuevas fuentes de datos que alimenten tus plantillas de documentación.
                    </p>
                </div>
            </div>
            <DatasetsClient initialDatasets={datasets} />
        </div>
    )
}
