'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { 
  getFamiliesWithSchema, 
  previewAddAttrToFamilies, 
  executeAddAttrToFamilies,
  previewRemoveAttrFromFamilies,
  executeRemoveAttrFromFamilies
} from '@/app/families/actions';
import { Loader2, Plus, Trash2, Search, AlertTriangle, Info } from 'lucide-react';

type FamilySchemaRow = { family_code: string; product_type: string; ref_attrs_schema: Record<string, unknown> | null }
type PreviewFamilyRow = { family_code: string; total_refs: number; refs_with_key: number; refs_without_key?: number }

export default function SchemaConfigClient() {
  const [families, setFamilies] = useState<FamilySchemaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('MUEBLE');
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewAction, setPreviewAction] = useState<'add' | 'remove' | null>(null);

  // Form state for Add
  const [attrKey, setAttrKey] = useState('');
  const [attrLabel, setAttrLabel] = useState('');
  const [attrValues, setAttrValues] = useState('');
  const [attrDefault, setAttrDefault] = useState('');

  // Form state for Remove
  const [removeAttrKey, setRemoveAttrKey] = useState('');

  // Preview data
  const [previewData, setPreviewData] = useState<PreviewFamilyRow[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

    const fetchFamilies = async () => {
        setLoading(true);
        const res = await getFamiliesWithSchema(filterType || undefined);
        if (res.success) {
            setFamilies(res.data || []);
            // Auto-select all by default if we want, or keep empty. Let's keep empty.
            setSelectedFamilies([]);
        }
        setLoading(false);
    }

    useEffect(() => {
        /* eslint-disable-next-line react-hooks/set-state-in-effect */
        fetchFamilies();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterType]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedFamilies(families.map(f => f.family_code));
    } else {
      setSelectedFamilies([]);
    }
  };

  const handleSelectFamily = (code: string, checked: boolean) => {
    if (checked) {
      setSelectedFamilies(prev => [...prev, code]);
    } else {
      setSelectedFamilies(prev => prev.filter(c => c !== code));
    }
  };

  const handlePreviewAdd = async () => {
    if (selectedFamilies.length === 0) return toast.warning('Selecciona al menos una familia');
    if (!attrKey || !attrLabel || !attrValues || !attrDefault) return toast.warning('Completa todos los campos');

    const cleanKey = attrKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanKey !== attrKey.trim()) return toast.warning('El Key debe contener solo letras minúsculas, números y guiones bajos.');

    setLoading(true);
    const res = await previewAddAttrToFamilies(selectedFamilies, attrKey.trim());
    setLoading(false);

    if (res.success) {
      setPreviewData(res.data?.families || []);
      setPreviewAction('add');
      setShowAddModal(false);
      setShowPreviewModal(true);
    } else {
      toast.error('Error generando vista previa: ' + res.error);
    }
  };

  const handleExecuteAdd = async () => {
    setIsExecuting(true);
    const allowedValuesArray = attrValues.split(',').map(v => v.trim()).filter(v => v !== '');
    
    const attrDef = {
      label: attrLabel.trim(),
      type: 'enum',
      allowed_values: allowedValuesArray,
      default_value: attrDefault.trim(),
      active: true
    };

    const res = await executeAddAttrToFamilies(selectedFamilies, attrKey.trim(), attrDef, attrDefault.trim());
    setIsExecuting(false);

    if (res.success) {
      toast.success('Atributo agregado exitosamente');
      setShowPreviewModal(false);
      setPreviewAction(null);
      // Reset form
      setAttrKey(''); setAttrLabel(''); setAttrValues(''); setAttrDefault('');
      fetchFamilies();
    } else {
      toast.error('Error al agregar atributo: ' + res.error);
    }
  };

  const handlePreviewRemove = async () => {
    if (selectedFamilies.length === 0) return toast.warning('Selecciona al menos una familia');
    if (!removeAttrKey) return toast.warning('Especifica la llave a eliminar');

    setLoading(true);
    const res = await previewRemoveAttrFromFamilies(selectedFamilies, removeAttrKey.trim());
    setLoading(false);

    if (res.success) {
      setPreviewData(res.data?.families || []);
      setPreviewAction('remove');
      setShowRemoveModal(false);
      setShowPreviewModal(true);
    } else {
      toast.error('Error generando vista previa: ' + res.error);
    }
  };

  const handleExecuteRemove = async () => {
    setIsExecuting(true);
    const res = await executeRemoveAttrFromFamilies(selectedFamilies, removeAttrKey.trim());
    setIsExecuting(false);

    if (res.success) {
      toast.success('Atributo eliminado exitosamente');
      setShowPreviewModal(false);
      setPreviewAction(null);
      setRemoveAttrKey('');
      fetchFamilies();
    } else {
      toast.error('Error al eliminar atributo: ' + res.error);
    }
  };

  // Helper to extract unique keys currently present in selected families
  const getExistingKeysInSelected = () => {
    const keys = new Set<string>();
    families.forEach(f => {
      if (selectedFamilies.includes(f.family_code) && f.ref_attrs_schema) {
        Object.keys(f.ref_attrs_schema).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-end justify-between bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">Filtrar por Product Type</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              placeholder="Ej: MUEBLE"
              className="pl-9 pr-4 py-2 border rounded-md outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setShowRemoveModal(true)}
            disabled={selectedFamilies.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed border border-red-200 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar Atributo
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            disabled={selectedFamilies.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Agregar Atributo
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
          <h2 className="font-semibold text-slate-800">Familias ({families.length})</h2>
          <span className="text-sm text-slate-500">{selectedFamilies.length} seleccionadas</span>
        </div>
        
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center p-12 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : families.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No se encontraron familias.</div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-3 border-b w-12 text-center">
                    <input 
                      type="checkbox" 
                      checked={selectedFamilies.length === families.length && families.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-3 border-b font-semibold text-slate-700">Family Code</th>
                  <th className="p-3 border-b font-semibold text-slate-700">Product Type</th>
                  <th className="p-3 border-b font-semibold text-slate-700 w-full">Atributos Definidos (Esquema)</th>
                </tr>
              </thead>
              <tbody>
                {families.map((f, idx) => {
                  const attrs = f.ref_attrs_schema ? Object.keys(f.ref_attrs_schema) : [];
                  return (
                    <tr key={idx} className="border-b hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedFamilies.includes(f.family_code)}
                          onChange={(e) => handleSelectFamily(f.family_code, e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-medium text-slate-800">{f.family_code}</td>
                      <td className="p-3 text-slate-600">{f.product_type}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {attrs.length === 0 && <span className="text-slate-400 italic text-xs">Sin atributos</span>}
                          {attrs.map(k => (
                            <span key={k} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-xs border">
                              {k}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: Agregar Atributo */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Agregar Nuevo Atributo</h3>
            <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-sm mb-6 flex gap-3">
              <Info className="w-5 h-5 shrink-0" />
              <p>Se añadirá al esquema de las <strong>{selectedFamilies.length} familias</strong> seleccionadas y se propagará su valor por defecto a las referencias que no lo tengan.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Key (identificador interno)</label>
                <input type="text" value={attrKey} onChange={e => setAttrKey(e.target.value)} placeholder="Ej: pur" className="w-full p-2 border rounded-md focus:ring-2 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Label (etiqueta UI)</label>
                <input type="text" value={attrLabel} onChange={e => setAttrLabel(e.target.value)} placeholder="Ej: PUR" className="w-full p-2 border rounded-md focus:ring-2 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Valores Permitidos (separados por coma)</label>
                <input type="text" value={attrValues} onChange={e => setAttrValues(e.target.value)} placeholder="Ej: PUR, NA" className="w-full p-2 border rounded-md focus:ring-2 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Valor por Defecto</label>
                <input type="text" value={attrDefault} onChange={e => setAttrDefault(e.target.value)} placeholder="Ej: NA" className="w-full p-2 border rounded-md focus:ring-2 outline-none" />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md">Cancelar</button>
              <button onClick={handlePreviewAdd} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />} Continuar a Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Eliminar Atributo */}
      {showRemoveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-red-600 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6" /> Eliminar Atributo
            </h3>
            <p className="text-sm text-slate-600 mb-6">Selecciona el atributo que deseas eliminar del esquema de las <strong>{selectedFamilies.length} familias</strong> seleccionadas.</p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Atributo a eliminar</label>
              <select 
                value={removeAttrKey} 
                onChange={e => setRemoveAttrKey(e.target.value)}
                className="w-full p-2 border rounded-md focus:ring-2 focus:ring-red-500 outline-none"
              >
                <option value="">Seleccione un atributo...</option>
                {getExistingKeysInSelected().map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => setShowRemoveModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md">Cancelar</button>
              <button onClick={handlePreviewRemove} disabled={loading || !removeAttrKey} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2 disabled:opacity-50">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />} Continuar a Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Vista Previa */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-0 overflow-hidden flex flex-col max-h-[90vh]">
            <div className={`p-6 border-b text-white ${previewAction === 'add' ? 'bg-slate-800' : 'bg-red-600'}`}>
              <h3 className="text-2xl font-bold">Vista Previa de {previewAction === 'add' ? 'Adición' : 'Eliminación'}</h3>
              <p className="opacity-90 mt-1">Revisa cuidadosamente el impacto antes de ejecutar la mutación masiva.</p>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                  <p className="text-slate-500 text-sm font-medium">Familias Seleccionadas</p>
                  <p className="text-3xl font-bold text-slate-800 mt-1">{selectedFamilies.length}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                  <p className="text-slate-500 text-sm font-medium">Referencias Afectadas Totales</p>
                  <p className="text-3xl font-bold text-blue-600 mt-1">
                    {previewData.reduce((acc, curr) => acc + Number(curr.total_refs), 0)}
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                  <p className="text-slate-500 text-sm font-medium">
                    {previewAction === 'add' ? 'Referencias que ya tenían la llave' : 'Referencias que perderán la llave'}
                  </p>
                  <p className="text-3xl font-bold text-amber-600 mt-1">
                    {previewData.reduce((acc, curr) => acc + Number(curr.refs_with_key), 0)}
                  </p>
                </div>
              </div>

              {previewAction === 'add' && (
                <div className="bg-blue-50 text-blue-800 p-4 rounded-lg border border-blue-100 mb-6">
                  <h4 className="font-semibold flex items-center gap-2 mb-2"><Info className="w-5 h-5"/> Resumen Operativo</h4>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li>Se definirá el atributo <strong>{attrKey}</strong> ({attrLabel}) en el esquema de {selectedFamilies.length} familias.</li>
                    <li><strong>{previewData.reduce((acc, curr) => acc + Number(curr.refs_without_key), 0)} referencias</strong> que no tenían este atributo recibirán el valor por defecto: <strong>&quot;{attrDefault}&quot;</strong>.</li>
                    <li><strong>{previewData.reduce((acc, curr) => acc + Number(curr.refs_with_key), 0)} referencias</strong> que ya poseían esta llave conservarán su valor actual intacto.</li>
                    <li>Las demás llaves del JSONB se mantendrán inalteradas.</li>
                  </ul>
                </div>
              )}

              {previewAction === 'remove' && (
                <div className="bg-red-50 text-red-800 p-4 rounded-lg border border-red-100 mb-6">
                  <h4 className="font-semibold flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5"/> Advertencia Crítica</h4>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li>Se removerá permanentemente la definición de <strong>{removeAttrKey}</strong> del esquema de {selectedFamilies.length} familias.</li>
                    <li><strong>{previewData.reduce((acc, curr) => acc + Number(curr.refs_with_key), 0)} referencias</strong> perderán este dato de su base de datos.</li>
                    <li>Las demás llaves del JSONB se mantendrán inalteradas. Esta acción no se puede deshacer de forma masiva fácilmente.</li>
                  </ul>
                </div>
              )}

              <h4 className="font-semibold text-slate-800 mb-3">Detalle por Familia</h4>
              <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-3">Familia</th>
                      <th className="p-3 text-right">Total Referencias</th>
                      <th className="p-3 text-right">Con la llave &apos;{previewAction === 'add' ? attrKey : removeAttrKey}&apos;</th>
                      {previewAction === 'add' && <th className="p-3 text-right">Sin la llave (recibirán default)</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewData.map((d, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-3 font-medium">{d.family_code}</td>
                        <td className="p-3 text-right">{d.total_refs}</td>
                        <td className="p-3 text-right text-amber-600 font-medium">{d.refs_with_key}</td>
                        {previewAction === 'add' && <td className="p-3 text-right text-green-600 font-medium">{d.refs_without_key}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="p-6 border-t bg-white flex justify-end gap-3 shrink-0">
              <button 
                onClick={() => {
                  setShowPreviewModal(false);
                  if (previewAction === 'add') setShowAddModal(true);
                  if (previewAction === 'remove') setShowRemoveModal(true);
                }} 
                disabled={isExecuting}
                className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-md font-medium"
              >
                Atrás
              </button>
              <button 
                onClick={previewAction === 'add' ? handleExecuteAdd : handleExecuteRemove} 
                disabled={isExecuting}
                className={`px-8 py-2.5 text-white rounded-md font-bold flex items-center gap-2 shadow-sm transition-transform active:scale-95 ${
                  previewAction === 'add' ? 'bg-slate-800 hover:bg-slate-900' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isExecuting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                {previewAction === 'add' ? 'Confirmar y Agregar' : 'Confirmar y Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
