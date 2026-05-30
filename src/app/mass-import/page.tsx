import { Upload } from 'lucide-react';
import Link from 'next/link';
import { MassImportClient } from '@/app/products/mass-import/MassImportClient';

export const dynamic = 'force-dynamic'

export default function MassImportPage() {
    return (
        <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full py-8">
            <div>
                <Link
                    href="/"
                    className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-sm mb-2 transition-colors"
                >
                    Volver a Inicio
                </Link>
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                    <Upload className="w-8 h-8 text-indigo-600" />
                    Carga Masiva de Productos
                </h1>
                <p className="text-slate-500 mt-1">
                    Importa productos faltantes a través de un archivo CSV o Excel.
                </p>
            </div>
            <MassImportClient families={[]} />
        </div>
    )
}
