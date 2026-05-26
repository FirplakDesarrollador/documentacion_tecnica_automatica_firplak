import { ChevronLeft, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import MassEditClient from '@/app/families/MassEditClient';

export default function ConfigFamiliesPage() {
  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full py-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/configuration"
            className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-sm mb-2 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Volver a Configuración
          </Link>
          <h1 className="text-3xl font-bold text-slate-900">
            Gestión de Familias
          </h1>
          <p className="text-slate-500 mt-1">
            Editor masivo de propiedades y esquemas de familias de producto.
          </p>
        </div>
        <Link href="/configuration/families/new">
          <button className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 shadow-sm">
            <PlusCircle className="mr-2 h-4 w-4" /> Nueva Familia
          </button>
        </Link>
      </div>
      <MassEditClient />
    </div>
  );
}
