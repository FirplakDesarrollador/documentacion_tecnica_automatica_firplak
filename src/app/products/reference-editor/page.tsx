import { Metadata } from 'next';
import ReferenceEditorTabs from './ReferenceEditorTabs';

export const metadata: Metadata = {
  title: 'Editor de Referencias | Firplak',
  description: 'Módulo de edición masiva de referencias y configuración de atributos',
};

export default function ReferenceEditorPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-slate-800">Editor de Referencias</h2>
      </div>
      <ReferenceEditorTabs />
    </div>
  );
}
