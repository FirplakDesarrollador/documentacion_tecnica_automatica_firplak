import { ChevronLeft, Edit3 } from 'lucide-react';
import Link from 'next/link';
import MassEditClient from '@/app/products/sku-editor/MassEditClient';

export default function ConfigSkuEditorPage() {
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
          <Edit3 className="w-8 h-8 text-emerald-500" />
          Editor Masivo de SKUs
        </h1>
        <p className="text-slate-500 mt-1">
          Herramienta avanzada para actualizar masivamente información de los SKUs, como código de barras, estado, y atributos personalizados JSONB (sku_attrs).
        </p>
      </div>
      <MassEditClient />
    </div>
  );
}
