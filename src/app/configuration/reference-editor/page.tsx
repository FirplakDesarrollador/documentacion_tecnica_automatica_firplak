import { ChevronLeft, DatabaseZap } from 'lucide-react';
import Link from 'next/link';
import ReferenceEditorTabs from './ReferenceEditorTabs';

export default function ConfigReferenceEditorPage() {
  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full py-8">
      <div>
        <Link
          href="/configuration"
          className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-sm mb-2 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Volver a Configuración
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <DatabaseZap className="w-8 h-8 text-indigo-600" />
          Editor de Referencias
        </h1>
        <p className="text-slate-500 mt-1">
          Búsqueda relacional y modificación masiva de valores y atributos de referencias.
        </p>
      </div>
      <ReferenceEditorTabs />
    </div>
  );
}
