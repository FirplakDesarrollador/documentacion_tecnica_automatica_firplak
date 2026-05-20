import { Metadata } from 'next';
import MassEditClient from './MassEditClient';
import Link from 'next/link';
import { ChevronLeft, Layers } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Editor de Versionamiento | SamiGen',
  description: 'Herramienta de edición masiva para versiones de producto.',
};

export default function VersionEditorPage() {
  return (
    <main className="p-6 max-w-[1600px] mx-auto">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link 
            href="/products" 
            className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-sm mb-2 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Volver a Productos
          </Link>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Layers className="w-8 h-8 text-orange-600" />
            Editor de Versionamiento
          </h1>
          <p className="text-slate-500 mt-1">
            Búsqueda relacional y modificación masiva de etiquetas y atributos a nivel de versión.
          </p>
        </div>
      </div>

      <MassEditClient />
    </main>
  );
}
