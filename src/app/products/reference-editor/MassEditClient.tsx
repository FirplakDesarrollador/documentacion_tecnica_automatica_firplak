'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { searchReferences, previewMassUpdateReferences, executeMassUpdateReferences, getFilterOptions, getFamiliesWithSchema } from './actions';
import { Loader2, Search, CheckSquare, Edit, AlertTriangle, Info, Check, X } from 'lucide-react';

const NORMAL_COLS = [
  { key: 'product_name', label: 'Nombre' },
  { key: 'commercial_measure', label: 'Medida Comercial' },
  { key: 'special_label', label: 'Etiqueta Especial' },
  { key: 'designation', label: 'Designación' },
  { key: 'width_cm', label: 'Ancho (cm)' },
  { key: 'depth_cm', label: 'Fondo (cm)' },
  { key: 'height_cm', label: 'Alto (cm)' },
  { key: 'weight_kg', label: 'Peso (kg)' }
];

export default function MassEditClient() {
  const [filters, setFilters] = useState({
    productType: '',
    familyCode: '',
    referenceCode: '',
    productName: '',
    refAttrsKey: '',
    refAttrsValue: ''
  });
  
  const [references, setReferences] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Base Data for relational filters and edit panel
  const [rawData, setRawData] = useState<any[]>([]);
  const [refAttrsKeys, setRefAttrsKeys] = useState<string[]>([]);
  const [schemasData, setSchemasData] = useState<any[]>([]); // To know allowed values per family

  // Edit Panel State
  const [editType, setEditType] = useState<'normal' | 'ref_attr'>('ref_attr');
  const [editField, setEditField] = useState('');
  const [editValue, setEditValue] = useState('');

  // Preview Modal
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<{ processed: number; total: number } | null>(null);

  useEffect(() => {
    async function loadInitial() {
      setLoadingOpts(true);
      const [optsRes, schemaRes] = await Promise.all([
        getFilterOptions(),
        getFamiliesWithSchema()
      ]);
      
      if (optsRes.success && optsRes.data) {
        setRawData(optsRes.data.rawData);
        setRefAttrsKeys(optsRes.data.refAttrsKeys);
      } else {
        toast.error('Error cargando filtros relacionales');
      }

      if (schemaRes.success) {
        setSchemasData((schemaRes.data as any[]) || []);
      }
      setLoadingOpts(false);
    }
    loadInitial();
  }, []);

  // Relational Dropdown Logic
  const filteredData = useMemo(() => {
    return rawData.filter(item => {
      if (filters.productType && item.pt !== filters.productType) return false;
      if (filters.familyCode && item.fc !== filters.familyCode) return false;
      if (filters.referenceCode && item.rc !== filters.referenceCode) return false;
      if (filters.productName && item.pn !== filters.productName) return false;
      if (filters.refAttrsKey) {
        const hasKey = item.attrs && Object.prototype.hasOwnProperty.call(item.attrs, filters.refAttrsKey);
        if (!hasKey) return false;
        if (filters.refAttrsValue && String(item.attrs[filters.refAttrsKey]) !== filters.refAttrsValue) return false;
      }
      return true;
    });
  }, [rawData, filters]);

  // Derive options from the filtered data (relational)
  const productTypesOpt = Array.from(new Set(filteredData.map(d => d.pt).filter(Boolean))).sort();
  const familyCodesOpt = Array.from(new Set(filteredData.map(d => d.fc).filter(Boolean))).sort();
  const referenceCodesOpt = Array.from(new Set(filteredData.map(d => d.rc).filter(Boolean))).sort();
  const productNamesOpt = Array.from(new Set(filteredData.map(d => d.pn).filter(Boolean))).sort();
  
  // JSONB Values specific to the selected Key
  const refAttrsValuesOpt = useMemo(() => {
    if (!filters.refAttrsKey) return [];
    const vals = new Set<string>();
    filteredData.forEach(item => {
      if (item.attrs && item.attrs[filters.refAttrsKey] !== undefined) {
        vals.add(String(item.attrs[filters.refAttrsKey]));
      }
    });
    return Array.from(vals).sort();
  }, [filteredData, filters.refAttrsKey]);

  // Edit Panel Options
  const editAllowedValues = useMemo(() => {
    if (editType !== 'ref_attr' || !editField) return [];
    // We get the allowed values for this field across the families of the CURRENTLY SELECTED references
    // Since users can select references from multiple families, we union their allowed values.
    // Or we just show all values this key has ever taken + schema values.
    const selectedFams = new Set<string>();
    references.forEach(r => {
      if (selectedIds.includes(r.id)) selectedFams.add(r.family_code);
    });

    const vals = new Set<string>();
    schemasData.forEach(schema => {
      if (selectedFams.has(schema.family_code) && schema.ref_attrs_schema?.[editField]?.allowed_values) {
        schema.ref_attrs_schema[editField].allowed_values.forEach((v: string) => vals.add(v));
      }
    });
    return Array.from(vals).sort();
  }, [editType, editField, selectedIds, references, schemasData]);


  const handleSearch = async () => {
    setLoading(true);
    const res = await searchReferences(filters);
    if (res.success) {
      setReferences(res.data || []);
      setSelectedIds([]);
    } else {
      toast.error('Error al buscar referencias: ' + res.error);
    }
    setLoading(false);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(references.map(r => r.id));
    else setSelectedIds([]);
  };

  const handleSelectRef = (id: string, checked: boolean) => {
    if (checked) setSelectedIds(prev => [...prev, id]);
    else setSelectedIds(prev => prev.filter(i => i !== id));
  };

  const handleClearFilters = () => {
    setFilters({ productType: '', familyCode: '', referenceCode: '', productName: '', refAttrsKey: '', refAttrsValue: '' });
  };

  const handlePreview = async () => {
    if (selectedIds.length === 0) return toast.warning('Selecciona al menos una referencia');
    if (!editField) return toast.warning('Selecciona el campo a modificar');
    if (editValue.trim() === '') return toast.warning('Ingresa o selecciona un valor');

    const normalUpdates = editType === 'normal' ? { [editField.trim()]: editValue.trim() } : {};
    const refAttrsUpdates = editType === 'ref_attr' ? { [editField.trim()]: editValue.trim() } : {};

    setLoading(true);
    const res = await previewMassUpdateReferences(selectedIds, normalUpdates, refAttrsUpdates);
    setLoading(false);

    if (res.success) {
      setPreviewData(res.data);
      setShowPreview(true);
    } else {
      toast.error('Error generando preview: ' + res.error);
    }
  };

  const handleExecute = async () => {
    if (!previewData?.is_valid) return toast.error('Corrige los errores de validación');
    setIsExecuting(true);
    setExecutionProgress({ processed: 0, total: selectedIds.length });
    const normalUpdates = editType === 'normal' ? { [editField.trim()]: editValue.trim() } : {};
    const refAttrsUpdates = editType === 'ref_attr' ? { [editField.trim()]: editValue.trim() } : {};

    const total = selectedIds.length;
    const batchSize = 100;

    try {
      for (let start = 0; start < total; start += batchSize) {
        const batchIds = selectedIds.slice(start, start + batchSize);
        const res = await executeMassUpdateReferences(batchIds, normalUpdates, refAttrsUpdates);
        if (!res.success) throw new Error((res as any).error || 'Error desconocido');
        setExecutionProgress({ processed: Math.min(start + batchIds.length, total), total });
      }

      toast.success('Referencias actualizadas con éxito');
      setShowPreview(false);
      handleSearch();
      // To keep schemas updated in case we bypassed validation (not possible directly, but good to refresh)
      const schemaRes = await getFamiliesWithSchema();
      if (schemaRes.success) setSchemasData((schemaRes.data as any[]) || []);
    } catch (e: any) {
      toast.error('Error ejecutando actualización: ' + (e?.message || 'Error desconocido'));
    } finally {
      setIsExecuting(false);
      setExecutionProgress(null);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 space-y-4">
        {/* Filters Panel */}
        <div className="bg-white p-4 rounded-lg border shadow-sm relative">
          {loadingOpts && (
            <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center rounded-lg">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          )}
          
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800 text-sm">Filtros Relacionales</h3>
            <button onClick={handleClearFilters} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
              <X className="w-3 h-3" /> Limpiar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Product Type</label>
              <select value={filters.productType} onChange={e => setFilters({...filters, productType: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Todos</option>
                {productTypesOpt.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Familia</label>
              <select value={filters.familyCode} onChange={e => setFilters({...filters, familyCode: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Todas</option>
                {familyCodesOpt.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Referencia</label>
              <select value={filters.referenceCode} onChange={e => setFilters({...filters, referenceCode: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Todas</option>
                {referenceCodesOpt.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-500 mb-1">Nombre Exacto</label>
              <select value={filters.productName} onChange={e => setFilters({...filters, productName: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Cualquiera</option>
                {productNamesOpt.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">JSONB Key</label>
              <select value={filters.refAttrsKey} onChange={e => setFilters({...filters, refAttrsKey: e.target.value, refAttrsValue: ''})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Ninguna</option>
                {refAttrsKeys.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">JSONB Value</label>
              <select value={filters.refAttrsValue} disabled={!filters.refAttrsKey} onChange={e => setFilters({...filters, refAttrsValue: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white disabled:bg-slate-100 disabled:text-slate-400">
                <option value="">Cualquiera</option>
                {refAttrsValuesOpt.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          
          <div className="mt-4 flex justify-end">
            <button onClick={handleSearch} disabled={loading || loadingOpts} className="px-6 py-2 bg-slate-800 text-white rounded-md hover:bg-slate-900 flex items-center gap-2 text-sm font-medium">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar Referencias
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-3 bg-slate-50 border-b flex justify-between items-center shrink-0">
            <h2 className="font-semibold text-slate-800 text-sm">Resultados ({references.length})</h2>
            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">{selectedIds.length} seleccionadas</span>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-2 border-b w-10 text-center">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.length === references.length && references.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-2 border-b font-semibold text-slate-700">Fam/Ref</th>
                  <th className="p-2 border-b font-semibold text-slate-700">Nombre</th>
                  <th className="p-2 border-b font-semibold text-slate-700 w-full">Atributos (ref_attrs)</th>
                  {editField && <th className="p-2 border-b font-semibold text-slate-700 bg-indigo-50 text-indigo-800 rounded-tr-md">Valor Actual ({editField})</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {references.length === 0 && !loading && (
                  <tr><td colSpan={editField ? 5 : 4} className="p-8 text-center text-slate-500">Haz clic en Buscar para cargar resultados</td></tr>
                )}
                {references.map((r) => {
                  let currentValue = '';
                  if (editField) {
                    currentValue = editType === 'normal' ? String(r[editField] ?? '') : String(r.ref_attrs?.[editField] ?? '');
                  }
                  
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2 text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(r.id)}
                          onChange={(e) => handleSelectRef(r.id, e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-2 font-medium text-slate-800">{r.family_code}-{r.reference_code}</td>
                      <td className="p-2 text-slate-600 max-w-[200px] truncate" title={r.product_name}>{r.product_name}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {r.ref_attrs && Object.entries(r.ref_attrs).map(([k, v]) => (
                            <span key={k} className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] border" title={`${k}: ${v}`}>
                              <span className="font-semibold text-slate-500">{k}:</span> {String(v)}
                            </span>
                          ))}
                        </div>
                      </td>
                      {editField && (
                        <td className="p-2 bg-indigo-50/30 text-slate-800 font-medium">
                          {currentValue ? (
                            <span className="bg-white px-2 py-1 rounded border shadow-sm text-xs">{currentValue}</span>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Vacio</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Panel */}
      <div className="w-full lg:w-80 shrink-0">
        <div className="bg-white p-5 rounded-lg border shadow-sm sticky top-6">
          <div className="flex items-center gap-2 mb-4 pb-4 border-b">
            <Edit className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-800">Panel de Edición</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Campo</label>
              <select value={editType} onChange={e => { setEditType(e.target.value as any); setEditField(''); setEditValue(''); }} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="ref_attr">Llave (JSONB)</option>
                <option value="normal">Columna Normal</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Campo a Modificar</label>
              {editType === 'normal' ? (
                <select value={editField} onChange={e => setEditField(e.target.value)} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                  <option value="">Seleccione...</option>
                  {NORMAL_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              ) : (
                <select value={editField} onChange={e => setEditField(e.target.value)} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                  <option value="">Seleccione llave existente...</option>
                  {refAttrsKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nuevo Valor</label>
              <input 
                type="text" 
                list="allowed_values_list" 
                value={editValue} 
                onChange={e => setEditValue(e.target.value)} 
                placeholder="Escribe o selecciona..." 
                className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white"
              />
              <datalist id="allowed_values_list">
                {editType === 'ref_attr' && editAllowedValues.map(v => <option key={v} value={v} />)}
              </datalist>
              {editType === 'ref_attr' && (
                <p className="text-[11px] text-slate-500 mt-1 leading-tight">
                  Las opciones del menú desplegable son los valores permitidos actuales. Puedes escribir uno nuevo, pero si no está en el esquema de la familia, fallará la validación.
                </p>
              )}
            </div>

            <button 
              onClick={handlePreview} 
              disabled={selectedIds.length === 0 || !editField || loading}
              className="w-full mt-6 py-2.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium disabled:opacity-50 transition-colors shadow-sm"
            >
              Generar Vista Previa
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-0 overflow-hidden flex flex-col max-h-[90vh]">
            <div className={`p-6 border-b text-white ${previewData.is_valid ? 'bg-indigo-600' : 'bg-red-600'}`}>
              <h3 className="text-2xl font-bold flex items-center gap-2">
                {previewData.is_valid ? <CheckSquare className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                {previewData.is_valid ? 'Vista Previa (Válido)' : 'Errores de Validación'}
              </h3>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50 space-y-6">
              {!previewData.is_valid && (
                <div className="bg-red-50 text-red-800 p-4 rounded-lg border border-red-200">
                  <h4 className="font-bold mb-2">Supabase RPC rechazó la operación:</h4>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {previewData.errors.map((err: string, i: number) => <li key={i}>{err}</li>)}
                  </ul>
                  <p className="mt-3 text-sm font-medium bg-red-100 p-2 rounded inline-block">
                    Para forzar un valor nuevo, debes agregarlo primero en los "Valores Permitidos" de la Configuración de Esquema.
                  </p>
                </div>
              )}

              {previewData.is_valid && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                      <p className="text-slate-500 text-sm font-medium">Referencias a Modificar</p>
                      <p className="text-3xl font-bold text-slate-800 mt-1">{previewData.affected_count}</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                      <p className="text-slate-500 text-sm font-medium">Familias Involucradas</p>
                      <p className="text-3xl font-bold text-indigo-600 mt-1">{previewData.families?.length || 0}</p>
                    </div>
                  </div>

                  <div className="bg-blue-50 text-blue-800 p-4 rounded-lg border border-blue-100">
                    <h4 className="font-semibold flex items-center gap-2 mb-2"><Info className="w-5 h-5"/> Resumen Quirúrgico</h4>
                    <p className="text-sm">A las <strong>{previewData.affected_count} referencias</strong> se les aplicará la siguiente mutación:</p>
                    <div className="mt-3 bg-white p-3 rounded border font-mono text-sm text-slate-700">
                      <strong>{editField}</strong> = <span className="text-green-600 font-bold">"{editValue}"</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-6 border-t bg-white flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowPreview(false)} disabled={isExecuting} className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-md font-medium">
                Cerrar
              </button>
              {previewData.is_valid && (
                <div className="flex flex-col items-end gap-2">
                  <button onClick={handleExecute} disabled={isExecuting} className="px-8 py-2.5 text-white rounded-md font-bold flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 min-w-[220px] justify-center">
                    {isExecuting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                    {isExecuting ? (
                      <span>
                        Procesando {executionProgress?.processed ?? 0}/{executionProgress?.total ?? selectedIds.length}
                      </span>
                    ) : (
                      'Confirmar'
                    )}
                  </button>
                  {isExecuting && (
                    <div className="w-full max-w-[280px] h-2 bg-slate-100 rounded overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 transition-all"
                        style={{
                          width: `${Math.round(
                            ((executionProgress?.processed ?? 0) / Math.max(1, executionProgress?.total ?? selectedIds.length)) * 100
                          )}%`
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
