'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { searchVersions, previewMassUpdateVersions, executeMassUpdateVersions, getVersionFilterOptions } from './actions';
import { Loader2, Search, CheckSquare, Edit, AlertTriangle, Info, Check, X, Layers } from 'lucide-react';

const NORMAL_COLS = [
  { key: 'version_label', label: 'Etiqueta de Versión', type: 'text' },
  { key: 'status', label: 'Estado (ACTIVO/INACTIVO)', type: 'text' }
];

function formatKeyToLabel(key: string): string {
  const map: Record<string, string> = {
    private_label_client_name: 'Nombre del Cliente (Marca Propia)',
    special_label: 'Etiqueta Especial',
    weight_kg: 'Peso (kg)',
    width_cm: 'Ancho (cm)',
    depth_cm: 'Fondo (cm)',
    height_cm: 'Alto (cm)',
    custom_note: 'Anotación Especial',
    rh: 'Resistencia a la Humedad (RH)',
    carb2: 'Certificación CARB2',
    bisagras: 'Tipo de Bisagras',
    canto_puertas: 'Canto de Puertas',
    accessory_text: 'Texto de Accesorio',
    door_color_text: 'Color de Puertas',
    armado_con_lvm: 'Armado con LVM',
    assembled_flag: 'Estado de Armado (assembled_flag)',
    product_type: 'Tipo de Producto (product_type)',
  };
  if (map[key]) return map[key];
  return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export default function MassEditClient() {
  const [filters, setFilters] = useState({
    familyCode: '',
    referenceCode: '',
    versionCode: '',
    productName: '',
    designation: '',
    commercialMeasure: '',
    specialLabel: '',
    refAttrsKey: '',
    refAttrsValue: '',
    versionAttrsKey: '',
    versionAttrsValue: '',
    keyword: ''
  });
  
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Opts for filters
  const [filterOpts, setFilterOpts] = useState<any>({});

  // Edit Panel State
  const [editType, setEditType] = useState<'normal' | 'version_attr'>('version_attr');
  const [editField, setEditField] = useState('');
  const [editValue, setEditValue] = useState('');
  
  // Custom / Clear mode for dynamic overrides
  const [customValueMode, setCustomValueMode] = useState(false);
  const [clearOverrideMode, setClearOverrideMode] = useState(false);

  // Preview Modal
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<{ processed: number; total: number } | null>(null);

  useEffect(() => {
    async function loadInitial() {
      setLoadingOpts(true);
      const optsRes = await getVersionFilterOptions();
      
      if (optsRes.success && optsRes.data) {
        setFilterOpts(optsRes.data);
      } else {
        toast.error('Error cargando filtros');
      }
      setLoadingOpts(false);
    }
    loadInitial();
  }, []);

  // Compute dynamic override fields, filtering by selected family if applicable
  const dynamicOverrideFields = useMemo(() => {
    const baseCols = [
      { key: 'private_label_client_name', label: 'Nombre del Cliente (Marca Propia)', type: 'text' },
      { key: 'special_label', label: 'Etiqueta Especial', type: 'text' },
      { key: 'weight_kg', label: 'Peso (kg)', type: 'number' },
      { key: 'width_cm', label: 'Ancho (cm)', type: 'number' },
      { key: 'depth_cm', label: 'Fondo (cm)', type: 'number' },
      { key: 'height_cm', label: 'Alto (cm)', type: 'number' },
      { key: 'custom_note', label: 'Anotación Especial', type: 'text' }
    ];

    let refKeys: string[] = [];

    if (filters.familyCode && filterOpts.familyRefAttrsKeys?.[filters.familyCode]) {
      refKeys = filterOpts.familyRefAttrsKeys[filters.familyCode];
    } else {
      const keysSet = new Set<string>();
      if (versions.length > 0) {
        versions.forEach(v => {
          if (v.ref_attrs && typeof v.ref_attrs === 'object') {
            Object.keys(v.ref_attrs).forEach(k => keysSet.add(k));
          }
        });
      }
      if (keysSet.size > 0) {
        refKeys = Array.from(keysSet);
      } else {
        refKeys = filterOpts.refAttrsKeys || [];
      }
    }

    const combined = [...baseCols];
    refKeys.forEach(k => {
      if (!combined.some(c => c.key === k)) {
        combined.push({
          key: k,
          label: formatKeyToLabel(k),
          type: 'text'
        });
      }
    });

    return combined;
  }, [filters.familyCode, filterOpts.familyRefAttrsKeys, filterOpts.refAttrsKeys, versions]);

  // Derived data type based on field
  const currentFieldDef = useMemo(() => {
    if (editType === 'normal') return NORMAL_COLS.find(c => c.key === editField);
    return dynamicOverrideFields.find(c => c.key === editField);
  }, [editType, editField, dynamicOverrideFields]);

  // Compile suggested values for the selected field
  const suggestedValues = useMemo(() => {
    if (!editField || editType !== 'version_attr') return [];
    
    const vals = new Set<string>();
    
    if (editField === 'rh') {
      vals.add('RH');
      vals.add('NA');
    } else if (editField === 'carb2') {
      vals.add('CARB2');
      vals.add('NA');
    } else if (editField === 'assembled_flag') {
      vals.add('true');
      vals.add('false');
    }

    const refVals = filterOpts.refAttrsValues?.[editField] || [];
    refVals.forEach((v: string) => vals.add(v));

    const verVals = filterOpts.versionAttrsValues?.[editField] || [];
    verVals.forEach((v: string) => vals.add(v));

    versions.forEach(v => {
      const refVal = v.ref_attrs?.[editField];
      if (refVal !== undefined && refVal !== null) vals.add(String(refVal));
      
      const verVal = v.version_attrs?.[editField];
      if (verVal !== undefined && verVal !== null) vals.add(String(verVal));
    });

    return Array.from(vals)
      .map(v => v.trim())
      .filter(v => v !== '' && v.toUpperCase() !== 'NULL' && !(editField === 'private_label_client_name' && v.toUpperCase() === 'NA'));
  }, [editField, editType, filterOpts.refAttrsValues, filterOpts.versionAttrsValues, versions]);

  // Reset custom/clear modes and pre-select first suggestion if available
  useEffect(() => {
    setCustomValueMode(false);
    setClearOverrideMode(false);
    
    if (suggestedValues.length > 0) {
      setEditValue(suggestedValues[0]);
    } else {
      setEditValue('');
      setCustomValueMode(true);
    }
  }, [editField, suggestedValues]);

  const getEffectiveCurrentValue = (row: any, field: string) => {
    switch (field) {
      case 'private_label_client_name':
        return row.resolved_private_label_client_name ?? '';
      case 'special_label':
        return row.resolved_special_label ?? '';
      case 'width_cm':
      case 'depth_cm':
      case 'height_cm':
      case 'weight_kg':
        return row.effective_attrs?.[field] ?? row[field] ?? '';
      default:
        return row.effective_attrs?.[field] ?? row.version_attrs?.[field] ?? '';
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    const res = await searchVersions(filters);
    if (res.success) {
      // client-side filter for versionAttrs if needed
      let resultData = res.data || [];
      if (filters.versionAttrsKey) {
        resultData = resultData.filter((row: any) => {
          const attrs = row.version_attrs;
          if (!attrs || typeof attrs !== 'object') return false;
          if (!Object.prototype.hasOwnProperty.call(attrs, filters.versionAttrsKey)) return false;
          if (filters.versionAttrsValue) {
            return String(attrs[filters.versionAttrsKey]) === String(filters.versionAttrsValue);
          }
          return true;
        });
      }
      setVersions(resultData);
      setSelectedIds([]);
    } else {
      toast.error('Error al buscar versiones: ' + (res as any).error);
    }
    setLoading(false);
  };

  const handleSelectAll = (checked: boolean) => {
    const editableIds = versions.map(v => v.id);
    if (checked) setSelectedIds(editableIds);
    else setSelectedIds([]);
  };

  const handleSelectRef = (id: string, checked: boolean) => {
    if (checked) setSelectedIds(prev => [...prev, id]);
    else setSelectedIds(prev => prev.filter(i => i !== id));
  };

  const handleClearFilters = () => {
    setFilters({
      familyCode: '', referenceCode: '', versionCode: '',
      productName: '', designation: '', commercialMeasure: '', specialLabel: '',
      refAttrsKey: '', refAttrsValue: '', versionAttrsKey: '', versionAttrsValue: '',
      keyword: ''
    });
  };

  const parseEditValue = () => {
    if (clearOverrideMode) return null;
    
    let finalValue: any = editValue.trim();
    if (editType === 'version_attr' && currentFieldDef) {
      if (currentFieldDef.type === 'number') {
        if (finalValue === '') return null;
        finalValue = Number(finalValue);
        if (isNaN(finalValue)) throw new Error('El valor no es un número válido');
      } else if (currentFieldDef.type === 'boolean') {
        if (finalValue === '') return null;
        if (finalValue.toLowerCase() === 'true') finalValue = true;
        else if (finalValue.toLowerCase() === 'false') finalValue = false;
        else throw new Error('El valor no es un booleano válido (true o false)');
      }
    }
    return finalValue;
  };

  const handlePreview = async () => {
    if (selectedIds.length === 0) return toast.warning('Selecciona al menos una versión');
    if (!editField) return toast.warning('Selecciona el campo a modificar');
    if (editValue.trim() === '' && !clearOverrideMode) return toast.warning('Ingresa un valor');

    let parsedValue: any;
    try {
      parsedValue = parseEditValue();
    } catch (e: any) {
      return toast.warning(e.message);
    }

    const normalUpdates = editType === 'normal' ? { [editField.trim()]: parsedValue } : {};
    const versionAttrsUpdates = editType === 'version_attr' ? { [editField.trim()]: parsedValue } : {};

    setLoading(true);
    const res = await previewMassUpdateVersions(selectedIds, normalUpdates, versionAttrsUpdates);
    setLoading(false);

    if (res.success) {
      setPreviewData({...(res.data as any), parsedValue});
      setShowPreview(true);
    } else {
      toast.error('Error generando preview: ' + (res as any).error);
    }
  };

  const handleExecute = async () => {
    if (!previewData?.is_valid) return toast.error('Corrige los errores de validación');
    setIsExecuting(true);
    setExecutionProgress({ processed: 0, total: selectedIds.length });
    
    let parsedValue: any;
    try {
      parsedValue = parseEditValue();
    } catch (e: any) {
      setIsExecuting(false);
      setExecutionProgress(null);
      return toast.warning(e.message);
    }

    const normalUpdates = editType === 'normal' ? { [editField.trim()]: parsedValue } : {};
    const versionAttrsUpdates = editType === 'version_attr' ? { [editField.trim()]: parsedValue } : {};

    const total = selectedIds.length;
    const batchSize = 100;

    try {
      for (let start = 0; start < total; start += batchSize) {
        const batchIds = selectedIds.slice(start, start + batchSize);
        const res = await executeMassUpdateVersions(batchIds, normalUpdates, versionAttrsUpdates);
        if (!res.success) throw new Error((res as any).error || 'Error desconocido');
        setExecutionProgress({ processed: Math.min(start + batchIds.length, total), total });
      }

      toast.success('Versiones actualizadas con éxito');
      setShowPreview(false);
      handleSearch();
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
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          )}
          
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800 text-sm">Filtros Relacionales</h3>
            <button onClick={handleClearFilters} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
              <X className="w-3 h-3" /> Limpiar
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-500 mb-1">Buscador General (Cualquier campo: nombre final, SKU base, código versión, overrides, etc.)</label>
            <div className="relative">
              <input
                type="text"
                value={filters.keyword}
                onChange={e => setFilters({...filters, keyword: e.target.value})}
                placeholder="Buscar palabra clave (ej: blanco, soder, picasso, 120, etc)..."
                className="w-full pl-9 pr-4 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-orange-500 bg-white"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Familia</label>
              <select value={filters.familyCode} onChange={e => setFilters({...filters, familyCode: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Todas</option>
                {filterOpts.familyCodes?.map((o:string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Referencia</label>
              <select value={filters.referenceCode} onChange={e => setFilters({...filters, referenceCode: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Todas</option>
                {filterOpts.referenceCodes?.map((o:string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Versión</label>
              <select value={filters.versionCode} onChange={e => setFilters({...filters, versionCode: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Todas</option>
                {filterOpts.versionCodes?.map((o:string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Nombre Exacto</label>
              <select value={filters.productName} onChange={e => setFilters({...filters, productName: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Cualquiera</option>
                {filterOpts.productNames?.map((o:string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Designación</label>
              <select value={filters.designation} onChange={e => setFilters({...filters, designation: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Cualquiera</option>
                {filterOpts.designations?.map((o:string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Medida Com.</label>
              <select value={filters.commercialMeasure} onChange={e => setFilters({...filters, commercialMeasure: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Cualquiera</option>
                {filterOpts.measures?.map((o:string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Etiq. Especial</label>
              <select value={filters.specialLabel} onChange={e => setFilters({...filters, specialLabel: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Cualquiera</option>
                {filterOpts.labels?.map((o:string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Llave ref_attrs</label>
              <select value={filters.refAttrsKey} onChange={e => setFilters({...filters, refAttrsKey: e.target.value, refAttrsValue: ''})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Ninguna</option>
                {filterOpts.refAttrsKeys?.map((o:string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Valor ref_attrs</label>
              <select value={filters.refAttrsValue} disabled={!filters.refAttrsKey} onChange={e => setFilters({...filters, refAttrsValue: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white disabled:bg-slate-100 disabled:text-slate-400">
                <option value="">Cualquiera</option>
                {filters.refAttrsKey && filterOpts.refAttrsValues?.[filters.refAttrsKey]?.map((o:string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Llave version_attrs</label>
              <select value={filters.versionAttrsKey} onChange={e => setFilters({...filters, versionAttrsKey: e.target.value, versionAttrsValue: ''})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Ninguna</option>
                {filterOpts.versionAttrsKeys?.map((o:string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Valor version_attrs</label>
              <select value={filters.versionAttrsValue} disabled={!filters.versionAttrsKey} onChange={e => setFilters({...filters, versionAttrsValue: e.target.value})} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white disabled:bg-slate-100 disabled:text-slate-400">
                <option value="">Cualquiera</option>
                {filters.versionAttrsKey && filterOpts.versionAttrsValues?.[filters.versionAttrsKey]?.map((o:string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          
          <div className="mt-4 flex justify-end">
            <button onClick={handleSearch} disabled={loading || loadingOpts} className="px-6 py-2 bg-slate-800 text-white rounded-md hover:bg-slate-900 flex items-center gap-2 text-sm font-medium">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar Versiones
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-3 bg-slate-50 border-b flex justify-between items-center shrink-0">
            <h2 className="font-semibold text-slate-800 text-sm">Resultados ({versions.length})</h2>
            <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-md">{selectedIds.length} seleccionados</span>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-2 border-b w-10 text-center">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.length === versions.length && versions.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-2 border-b font-semibold text-slate-700">Código Versión / SKU Base</th>
                  <th className="p-2 border-b font-semibold text-slate-700 w-[280px]">Nombre Final Base (Generado)</th>
                  <th className="p-2 border-b font-semibold text-slate-700">Atributos Versión (version_attrs)</th>
                  {editField && <th className="p-2 border-b font-semibold text-slate-700 bg-orange-50 text-orange-800 rounded-tr-md">Valor Actual Efectivo ({editField})</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {versions.length === 0 && !loading && (
                  <tr><td colSpan={editField ? 5 : 4} className="p-8 text-center text-slate-500">Haz clic en Buscar para cargar resultados</td></tr>
                )}
                {versions.map((v) => {
                  let currentValue = '';
                  if (editField) {
                    currentValue = editType === 'normal'
                      ? String(v[editField] ?? '')
                      : String(getEffectiveCurrentValue(v, editField) ?? '');
                  }
                  const isInactive = v.effective_status === 'INACTIVO';
                  const inactiveReasons = Array.isArray(v.inactive_reasons) ? v.inactive_reasons.join(', ') : '';
                  
                  return (
                    <tr
                      key={v.id}
                      className={`transition-colors ${isInactive ? 'bg-rose-50/50 text-slate-500 opacity-75 hover:bg-rose-50' : 'hover:bg-slate-50'}`}
                      title={inactiveReasons || undefined}
                    >
                      <td className="p-2 text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(v.id)}
                          onChange={(e) => handleSelectRef(v.id, e.target.checked)}
                          className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-2 font-medium text-slate-800">
                        {v.version_code}
                        <br/>
                        <span className={`text-xs font-normal ${isInactive ? 'text-rose-500' : 'text-slate-400'}`}>
                          {v.sku_base} | {v.effective_status}
                          {inactiveReasons ? ` | ${inactiveReasons}` : ''}
                        </span>
                      </td>
                      <td className="p-2 text-slate-600 whitespace-normal break-words max-w-[280px] text-[11px] leading-snug" title={v.final_base_name_es}>{v.final_base_name_es || '-'}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {v.version_attrs && Object.entries(v.version_attrs).map(([k, val]) => (
                            <span key={k} className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] border" title={`${k}: ${JSON.stringify(val)}`}>
                              <span className="font-semibold text-slate-500">{k}:</span> {JSON.stringify(val)}
                            </span>
                          ))}
                        </div>
                      </td>
                      {editField && (
                        <td className="p-2 bg-orange-50/30 text-slate-800 font-medium">
                          {currentValue ? (
                            <span className="bg-white px-2 py-1 rounded border shadow-sm text-xs truncate max-w-[150px] inline-block" title={currentValue}>{currentValue}</span>
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
            <Edit className="w-5 h-5 text-orange-600" />
            <h3 className="font-bold text-slate-800">Panel de Edición</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Campo</label>
              <select value={editType} onChange={e => { setEditType(e.target.value as any); setEditField(''); setEditValue(''); }} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="version_attr">Excepciones (Overrides)</option>
                <option value="normal">Columna Normal</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Campo a Modificar</label>
              <select value={editField} onChange={e => setEditField(e.target.value)} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Seleccione...</option>
                {(editType === 'normal' ? NORMAL_COLS : dynamicOverrideFields).map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>

            {currentFieldDef && (
              <div className="bg-slate-50 p-2 rounded text-[10px] text-slate-500 uppercase font-bold tracking-tight">
                Tipo esperado: {currentFieldDef.type === 'text' ? 'Texto' : currentFieldDef.type === 'number' ? 'Número' : 'Booleano'}
              </div>
            )}

            {editField && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nuevo Valor</label>
                
                {editType === 'version_attr' && suggestedValues.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={clearOverrideMode ? '__clear__' : customValueMode ? '__custom__' : editValue}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '__clear__') {
                          setClearOverrideMode(true);
                          setCustomValueMode(false);
                          setEditValue('');
                        } else if (val === '__custom__') {
                          setClearOverrideMode(false);
                          setCustomValueMode(true);
                          setEditValue('');
                        } else {
                          setClearOverrideMode(false);
                          setCustomValueMode(false);
                          setEditValue(val);
                        }
                      }}
                      className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                    >
                      {suggestedValues.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                      <option value="__clear__">-- Eliminar override / Usar valor por defecto --</option>
                      <option value="__custom__">-- Escribir valor personalizado --</option>
                    </select>

                    {(customValueMode || clearOverrideMode) && (
                      <div className="pt-1">
                        {clearOverrideMode ? (
                          <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                            Se eliminará esta excepción. La versión heredará el valor de la referencia original.
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            placeholder={currentFieldDef?.type === 'number' ? 'Ingresa un número...' : 'Escribe el valor personalizado...'}
                            className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {editField === 'status' && editType === 'normal' ? (
                      <select
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                      >
                        <option value="ACTIVO">ACTIVO</option>
                        <option value="INACTIVO">INACTIVO</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        placeholder={currentFieldDef?.type === 'number' ? 'Ingresa un número...' : 'Escribe el nuevo valor...'}
                        className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            <button 
              onClick={handlePreview} 
              disabled={selectedIds.length === 0 || !editField || loading}
              className="w-full mt-6 py-2.5 bg-orange-600 text-white rounded-md hover:bg-orange-700 font-medium disabled:opacity-50 transition-colors shadow-sm"
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
            <div className={`p-6 border-b text-white ${previewData.is_valid ? 'bg-orange-600' : 'bg-red-600'}`}>
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
                    {previewData.errors?.map((err: string, i: number) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}

              {previewData.is_valid && (
                <>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                      <p className="text-slate-500 text-sm font-medium">Versiones a Modificar</p>
                      <p className="text-3xl font-bold text-slate-800 mt-1">{previewData.affected_count}</p>
                    </div>
                  </div>

                  <div className="bg-orange-50 text-orange-800 p-4 rounded-lg border border-orange-100">
                    <h4 className="font-semibold flex items-center gap-2 mb-2"><Info className="w-5 h-5"/> Resumen de Actualización</h4>
                    <p className="text-sm">A las <strong>{previewData.affected_count} versiones</strong> se les aplicará el siguiente cambio:</p>
                    <div className="mt-3 bg-white p-3 rounded border font-mono text-sm text-slate-700">
                      <strong>{editField}</strong> = <span className="text-orange-600 font-bold">{JSON.stringify(previewData.parsedValue)}</span> 
                      {editType === 'version_attr' && <span className="text-slate-400 ml-2">({typeof previewData.parsedValue})</span>}
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
                  <button onClick={handleExecute} disabled={isExecuting} className="px-8 py-2.5 text-white rounded-md font-bold flex items-center gap-2 bg-orange-600 hover:bg-orange-700 min-w-[220px] justify-center">
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
                        className="h-full bg-orange-600 transition-all"
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
