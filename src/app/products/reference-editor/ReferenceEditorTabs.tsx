'use client';

import { useState } from 'react';
import SchemaConfigClient from './SchemaConfigClient';
import MassEditClient from './MassEditClient';

export default function ReferenceEditorTabs() {
  const [activeTab, setActiveTab] = useState<'schema' | 'edit'>('schema');

  return (
    <>
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('schema')}
            className={`${
              activeTab === 'schema'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            } whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors`}
          >
            Configuración de Atributos (Esquema)
          </button>
          <button
            onClick={() => setActiveTab('edit')}
            className={`${
              activeTab === 'edit'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            } whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors`}
          >
            Edición Masiva de Valores
          </button>
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'schema' ? (
          <>
            <p className="text-slate-500 mb-6">
              Define el esquema de atributos técnicos (ref_attrs) permitidos para cada familia. Los atributos aquí definidos estarán disponibles para la edición masiva.
            </p>
            <SchemaConfigClient />
          </>
        ) : (
          <>
            <p className="text-slate-500 mb-6">
              Busca referencias existentes y modifica quirúrgicamente sus valores normales o las llaves de ref_attrs definidos en el esquema de su familia.
            </p>
            <MassEditClient />
          </>
        )}
      </div>
    </>
  );
}
