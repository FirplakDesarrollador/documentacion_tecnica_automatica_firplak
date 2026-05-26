'use client';

import MassEditClient from './MassEditClient';

export default function ReferenceEditorTabs() {
  return (
    <div className="mt-2">
      <p className="text-slate-500 mb-6">
        Busca referencias existentes y modifica quirúrgicamente sus valores normales o las llaves de ref_attrs definidos en el esquema de su familia.
      </p>
      <MassEditClient />
    </div>
  );
}
