'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { 
  searchFamilies, getFamiliesFilterOptions,
  previewMassUpdateFamilies, executeMassUpdateFamilies,
  previewProductTypeRenameImpactAction,
  getFamiliesWithSchema,
  previewAddAttrToFamilies, executeAddAttrToFamilies,
  previewRemoveAttrFromFamilies, executeRemoveAttrFromFamilies,
  previewDeleteFamiliesAction, deleteFamiliesAction,
  getAvailableLines, updateFamilyLinesAction, deleteLineAction
} from './actions';
import { Loader2, Search, Edit, AlertTriangle, Info, Check, X, Trash2, ChevronRight, ChevronLeft, Layers, Plus } from 'lucide-react';

const NORMAL_COLS = [
  { key: 'family_name', label: 'Nombre de Familia', type: 'text' },
  { key: 'product_type', label: 'Tipo de Producto', type: 'text' },
  { key: 'use_destination', label: 'Uso / Destino', type: 'text' },
  { key: 'zone_home', label: 'Zona (Ambiente)', type: 'text' },
  { key: 'manufacturing_process', label: 'Proceso de Manufactura', type: 'text' },
  { key: 'rh_default', label: 'RH por Defecto', type: 'boolean' },
  { key: 'assembled_default', label: 'Armado por Defecto', type: 'boolean' },
];

type RenameImpact = {
  fromType: string | null;
  toType: string;
  selectedTypes: string[];
  selectedCount: number;
  sourceWillBeOrphan: boolean;
  sourceModelExists: boolean;
  targetModelExists: boolean;
  canMigrateNamingModel: boolean;
  reason: string | null;
};

export default function MassEditClient() {
  const [filters, setFilters] = useState({
    familyCode: '',
    familyName: '',
    productType: '',
    zoneHome: '',
    manufacturingProcess: '',
  });

  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [filterOpts, setFilterOpts] = useState<any>({});

  // Edit Panel State
  const [editType, setEditType] = useState<'normal' | 'schema_attr'>('normal');
  const [editField, setEditField] = useState('');
  const [editValue, setEditValue] = useState('');

  // Schema mode
  const [schemaMode, setSchemaMode] = useState<'add' | 'remove'>('add');
  const [familiesWithSchema, setFamiliesWithSchema] = useState<any[]>([]);
  const [newAttrKey, setNewAttrKey] = useState('');
  const [attrType, setAttrType] = useState<'string' | 'number' | 'boolean'>('string');
  const [allowedValues, setAllowedValues] = useState<string[]>([]);
  const [newAllowedValue, setNewAllowedValue] = useState('');
  const [newAttrDefault, setNewAttrDefault] = useState('');
  const [removeAttrKey, setRemoveAttrKey] = useState('');

  // Preview Modal
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<{ processed: number; total: number } | null>(null);
  const [migrateNamingModel, setMigrateNamingModel] = useState(false);

  // Delete Wizard
  const [showDeleteWizard, setShowDeleteWizard] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deletePreview, setDeletePreview] = useState<any[]>([]);
  const [deleteTotals, setDeleteTotals] = useState({ fams: 0, refs: 0, versions: 0, skus: 0 });
  const [deleteChecks, setDeleteChecks] = useState({ irreversible: false, verified: false, consulted: false });
  const [isDeleting, setIsDeleting] = useState(false);

  // Lines Modal
  const [linesModalFamily, setLinesModalFamily] = useState<string | null>(null);
  const [linesModalFamilyName, setLinesModalFamilyName] = useState('');
  const [linesModalSelected, setLinesModalSelected] = useState<string[]>([]);
  const [availableLines, setAvailableLines] = useState<string[]>([]);
  const [savingLines, setSavingLines] = useState(false);
  const [newLineInput, setNewLineInput] = useState('');

  useEffect(() => {
    async function loadInitial() {
      setLoadingOpts(true);
      const [optsRes, schemaRes, linesRes] = await Promise.all([
        getFamiliesFilterOptions(),
        getFamiliesWithSchema(),
        getAvailableLines()
      ]);

      if (optsRes.success && optsRes.data) {
        setFilterOpts(optsRes.data);
      } else {
        toast.error('Error cargando filtros');
      }

      if (schemaRes.success) {
        setFamiliesWithSchema((schemaRes.data as any[]) || []);
      }

      if (linesRes.success) {
        setAvailableLines(linesRes.data || []);
      }

      setLoadingOpts(false);
    }
    loadInitial();
  }, []);

  // Derive schema keys for remove dropdown
  const allSchemaKeys = useMemo(() => {
    const keys = new Set<string>();
    familiesWithSchema.forEach(f => {
      if (f.ref_attrs_schema && typeof f.ref_attrs_schema === 'object') {
        Object.keys(f.ref_attrs_schema).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys).sort();
  }, [familiesWithSchema]);

  const currentFieldDef = useMemo(() => {
    if (editType === 'normal') return NORMAL_COLS.find(c => c.key === editField);
    return null;
  }, [editType, editField]);

  const handleSearch = async () => {
    setLoading(true);
    const res = await searchFamilies(filters);
    if (res.success) {
      setFamilies(res.data || []);
      setSelectedIds([]);
    } else {
      toast.error('Error al buscar familias: ' + (res as any).error);
    }
    setLoading(false);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(families.map(f => f.family_code));
    else setSelectedIds([]);
  };

  const handleSelectOne = (code: string, checked: boolean) => {
    if (checked) setSelectedIds(prev => [...prev, code]);
    else setSelectedIds(prev => prev.filter(c => c !== code));
  };

  const handleClearFilters = () => {
    setFilters({ familyCode: '', familyName: '', productType: '', zoneHome: '', manufacturingProcess: '' });
  };

  const handlePreview = async () => {
    if (selectedIds.length === 0) return toast.warning('Selecciona al menos una familia');
    if (!editField && editType === 'normal') return toast.warning('Selecciona el campo a modificar');

    if (editType === 'schema_attr') {
      if (schemaMode === 'add' && !newAttrKey.trim()) return toast.warning('Ingresa el nombre del nuevo atributo');
      if (schemaMode === 'remove' && !removeAttrKey) return toast.warning('Selecciona el atributo a eliminar');
    } else if (editType === 'normal') {
      if (!editField) return toast.warning('Selecciona el campo a modificar');
      if (editValue.toString().trim() === '' && currentFieldDef?.type !== 'boolean') return toast.warning('Ingresa un valor');
    }

    if (editType === 'schema_attr') {
      if (schemaMode === 'add') {
        setLoading(true);
        const res = await previewAddAttrToFamilies(selectedIds, newAttrKey.trim());
        setLoading(false);
        if (res.success) {
          const builtDef = JSON.stringify({ type: attrType, allowed_values: allowedValues });
          setPreviewData({ ...res.data, schemaAction: 'add', attrKey: newAttrKey.trim(), attrDef: builtDef, attrDefault: newAttrDefault });
          setMigrateNamingModel(false);
          setShowPreview(true);
        } else {
          toast.error('Error en preview: ' + (res as any).error);
        }
      } else {
        setLoading(true);
        const res = await previewRemoveAttrFromFamilies(selectedIds, removeAttrKey);
        setLoading(false);
        if (res.success) {
          setPreviewData({ ...res.data, schemaAction: 'remove', attrKey: removeAttrKey });
          setMigrateNamingModel(false);
          setShowPreview(true);
        } else {
          toast.error('Error en preview: ' + (res as any).error);
        }
      }
    } else {
      const parsedValue = currentFieldDef?.type === 'boolean' ? editValue === 'true' : editValue.trim();
      setLoading(true);
      const res = await previewMassUpdateFamilies(selectedIds, { [editField]: parsedValue });
      let impact: RenameImpact | null = null;
      if (res.success && editField === 'product_type' && typeof parsedValue === 'string') {
        const impactRes = await previewProductTypeRenameImpactAction(selectedIds, parsedValue);
        if (impactRes.success) {
          impact = (impactRes.data as RenameImpact) || null;
        }
      }
      setLoading(false);
      if (res.success) {
        setMigrateNamingModel(!!impact?.canMigrateNamingModel);
        setPreviewData({ ...res.data, parsedValue, editField, editValue, renameImpact: impact });
        setShowPreview(true);
      } else {
        toast.error('Error generando preview: ' + (res as any).error);
      }
    }
  };

  const handleExecute = async () => {
    if (!previewData?.is_valid) return toast.error('Corrige los errores de validación');
    setIsExecuting(true);
    setExecutionProgress({ processed: 0, total: selectedIds.length });

    try {
      if (editType === 'schema_attr') {
        if (previewData.schemaAction === 'add') {
          let attrDefObj: any;
          try { attrDefObj = JSON.parse(previewData.attrDef); } catch { attrDefObj = { type: 'string', allowed_values: [] }; }
          const res = await executeAddAttrToFamilies(selectedIds, previewData.attrKey, attrDefObj, previewData.attrDefault);
          if (!res.success) throw new Error((res as any).error || 'Error desconocido');
        } else {
          const res = await executeRemoveAttrFromFamilies(selectedIds, previewData.attrKey);
          if (!res.success) throw new Error((res as any).error || 'Error desconocido');
        }
        toast.success(editType === 'schema_attr' && schemaMode === 'add' ? 'Atributo agregado con éxito' : 'Atributo eliminado con éxito');
      } else {
        const parsedValue = currentFieldDef?.type === 'boolean' ? previewData.editValue === 'true' : previewData.editValue;
        const migrationOptions = previewData.editField === 'product_type' && previewData.renameImpact
          ? {
            migrateNamingModel: migrateNamingModel && previewData.renameImpact.canMigrateNamingModel,
            migrationFromType: previewData.renameImpact.fromType || undefined,
          }
          : undefined;

        const res = await executeMassUpdateFamilies(selectedIds, { [previewData.editField]: parsedValue }, migrationOptions);
        if (!res.success) throw new Error((res as any).error || 'Error desconocido');
        toast.success('Familias actualizadas con éxito');
        if ((res as any).namingMigration?.migrated) {
          const info = (res as any).namingMigration;
          toast.success(`Nomenclatura migrada: ${info.fromType} -> ${info.toType}`);
        }
      }

      setShowPreview(false);
      handleSearch();

      const schemaRes = await getFamiliesWithSchema();
      if (schemaRes.success) setFamiliesWithSchema((schemaRes.data as any[]) || []);

      setExecutionProgress(null);
      setIsExecuting(false);
      setMigrateNamingModel(false);
    } catch (e) {
      toast.error('Error ejecutando actualización: ' + (e instanceof Error ? e.message : String(e) || 'Error desconocido'));
      setIsExecuting(false);
      setExecutionProgress(null);
    }
  };

  // --- Delete Wizard Handlers ---

  const openDeleteWizard = async () => {
    if (selectedIds.length === 0) return toast.warning('Selecciona al menos una familia');
    setIsDeleting(true);
    try {
      const res = await previewDeleteFamiliesAction(selectedIds);
      if (res.success) {
        const data = res.data || [];
        setDeletePreview(data);
        const totals = data.reduce((acc: any, f: any) => ({
          fams: acc.fams + 1,
          refs: acc.refs + (parseInt(f.ref_count) || 0),
          versions: acc.versions + (parseInt(f.version_count) || 0),
          skus: acc.skus + (parseInt(f.sku_count) || 0),
        }), { fams: 0, refs: 0, versions: 0, skus: 0 });
        setDeleteTotals(totals);
        setDeleteStep(1);
        setDeleteChecks({ irreversible: false, verified: false, consulted: false });
        setShowDeleteWizard(true);
      } else {
        toast.error('Error al obtener previsualización: ' + (res as any).error);
      }
    } catch (e) {
      toast.error('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
    setIsDeleting(false);
  };

  const handleDeleteExecute = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteFamiliesAction(selectedIds);
      toast.success(`Se eliminaron ${selectedIds.length} familias y todos sus datos en cascada`);
      const orphaned = (result as any)?.orphanedProductTypes || [];
      if (orphaned.length > 0) {
        toast.warning(`Atencion: quedaron modelos de nomenclatura huérfanos (${orphaned.join(', ')}). Puedes revisarlos en Configuracion.`);
      }
      setShowDeleteWizard(false);
      handleSearch();
    } catch (e) {
      toast.error('Error eliminando: ' + (e instanceof Error ? e.message : String(e)));
    }
    setIsDeleting(false);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 space-y-4">
        {/* Filters Panel */}
        <div className="bg-white p-4 rounded-lg border shadow-sm relative">
          {loadingOpts && (
            <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center rounded-lg">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800 text-sm">Filtros</h3>
            <button onClick={handleClearFilters} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
              <X className="w-3 h-3" /> Limpiar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Código de Familia</label>
              <input
                type="text"
                value={filters.familyCode}
                onChange={e => setFilters({ ...filters, familyCode: e.target.value })}
                placeholder="Buscar código..."
                className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
              <input
                type="text"
                value={filters.familyName}
                onChange={e => setFilters({ ...filters, familyName: e.target.value })}
                placeholder="Buscar nombre..."
                className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tipo de Producto</label>
              <select value={filters.productType} onChange={e => setFilters({ ...filters, productType: e.target.value })} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Todos</option>
                {filterOpts.productTypes?.map((o: string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Zona (Ambiente)</label>
              <select value={filters.zoneHome} onChange={e => setFilters({ ...filters, zoneHome: e.target.value })} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Todas</option>
                {filterOpts.zoneHomes?.map((o: string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Proceso de Manufactura</label>
              <select value={filters.manufacturingProcess} onChange={e => setFilters({ ...filters, manufacturingProcess: e.target.value })} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="">Todos</option>
                {filterOpts.manufacturingProcesses?.map((o: string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button onClick={handleSearch} disabled={loading || loadingOpts} className="px-6 py-2 bg-slate-800 text-white rounded-md hover:bg-slate-900 flex items-center gap-2 text-sm font-medium">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar Familias
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-3 bg-slate-50 border-b flex justify-between items-center shrink-0">
            <h2 className="font-semibold text-slate-800 text-sm">Resultados ({families.length})</h2>
            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-md">{selectedIds.length} seleccionadas</span>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-2 border-b w-10 text-center">
                    <input
                      type="checkbox"
                      checked={families.length > 0 && families.every(f => selectedIds.includes(f.family_code))}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-2 border-b font-semibold text-slate-700">Código</th>
                  <th className="p-2 border-b font-semibold text-slate-700">Nombre</th>
                  <th className="p-2 border-b font-semibold text-slate-700">Tipo Producto</th>
                  <th className="p-2 border-b font-semibold text-slate-700">Zona</th>
                  <th className="p-2 border-b font-semibold text-slate-700">Manufactura</th>
                  <th className="p-2 border-b font-semibold text-slate-700">RH</th>
                  <th className="p-2 border-b font-semibold text-slate-700">Armado</th>
                  <th className="p-2 border-b font-semibold text-slate-700 w-[240px]">Esquema</th>
                  <th className="p-2 border-b font-semibold text-slate-700 w-[200px]">Líneas</th>
                  {editField && editType === 'normal' && <th className="p-2 border-b font-semibold text-slate-700 bg-amber-50 text-amber-800 rounded-tr-md">Valor Actual ({editField})</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {families.length === 0 && !loading && (
                  <tr><td colSpan={editField && editType === 'normal' ? 11 : 10} className="p-8 text-center text-slate-500">Haz clic en Buscar para cargar resultados</td></tr>
                )}
                {families.map((f) => {
                  let currentValue = '';
                  if (editField && editType === 'normal') {
                    const raw = f[editField];
                    currentValue = raw === true ? 'Sí' : raw === false ? 'No' : String(raw ?? '');
                  }
                  return (
                    <tr key={f.family_code} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(f.family_code)}
                          onChange={(e) => handleSelectOne(f.family_code, e.target.checked)}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-2 font-mono font-medium text-slate-800">{f.family_code}</td>
                      <td className="p-2 text-slate-600 max-w-[240px] whitespace-normal break-words">{f.family_name}</td>
                      <td className="p-2 text-slate-600">{f.product_type || '-'}</td>
                      <td className="p-2 text-slate-600 max-w-[140px] whitespace-normal break-words">{f.zone_home || '-'}</td>
                      <td className="p-2 text-slate-600 max-w-[200px] whitespace-normal break-words">{f.manufacturing_process || '-'}</td>
                      <td className="p-2 text-center">
                        <span className={`inline-block w-5 h-5 rounded-full ${f.rh_default ? 'bg-green-500' : 'bg-slate-200'}`} />
                      </td>
                      <td className="p-2 text-center">
                        <span className={`inline-block w-5 h-5 rounded-full ${f.assembled_default ? 'bg-green-500' : 'bg-slate-200'}`} />
                      </td>
                      <td className="p-2 py-3">
                        <div className="flex items-start gap-1 flex-wrap max-w-[300px] min-h-[26px]">
                          {(f.ref_attrs_schema && typeof f.ref_attrs_schema === 'object' && !Array.isArray(f.ref_attrs_schema)
                            ? Object.keys(f.ref_attrs_schema)
                            : []
                          ).length > 0 ? (
                            Object.keys(f.ref_attrs_schema).map(k => (
                              <span key={k} className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded text-[10px] font-medium whitespace-nowrap">{k}</span>
                            ))
                          ) : (
                            <span className="text-slate-300 text-[10px] italic">Sin esquema</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {Array.isArray(f.allowed_lines) && f.allowed_lines.length > 0 ? (
                            f.allowed_lines.slice(0, 3).map((line: string) => (
                              <span key={line} className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-medium">{line}</span>
                            ))
                          ) : (
                            <span className="text-slate-300 text-[10px] italic">Sin líneas</span>
                          )}
                          <button
                            onClick={() => {
                              setLinesModalFamily(f.family_code);
                              setLinesModalFamilyName(f.family_name || '');
                              setLinesModalSelected(Array.isArray(f.allowed_lines) ? [...f.allowed_lines] : []);
                            }}
                            className="ml-1 p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Editar líneas"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      {editField && editType === 'normal' && (
                        <td className="p-2 bg-amber-50/30 text-slate-800 font-medium">
                          {currentValue ? (
                            <span className="bg-white px-2 py-1 rounded border shadow-sm text-xs truncate max-w-[150px] inline-block" title={currentValue}>{currentValue}</span>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Vacío</span>
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
            <Edit className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-slate-800">Panel de Edición</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Campo</label>
              <select value={editType} onChange={e => { setEditType(e.target.value as any); setEditField(''); setEditValue(''); }} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                <option value="normal">Columna Normal</option>
                <option value="schema_attr">Atributo del Esquema</option>
              </select>
            </div>

            {editType === 'normal' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Campo a Modificar</label>
                  <select value={editField} onChange={e => { setEditField(e.target.value); setEditValue(''); }} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                    <option value="">Seleccione...</option>
                    {NORMAL_COLS.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {currentFieldDef && (
                  <div className="bg-slate-50 p-2 rounded text-[10px] text-slate-500 uppercase font-bold tracking-tight">
                    Tipo: {currentFieldDef.type === 'boolean' ? 'Sí/No' : 'Texto'}
                  </div>
                )}

                {editField && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nuevo Valor</label>
                    {currentFieldDef?.type === 'boolean' ? (
                      <select value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                        <option value="">Seleccione...</option>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        placeholder="Escribe el nuevo valor..."
                        className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white"
                      />
                    )}
                  </div>
                )}
              </>
            )}

            {editType === 'schema_attr' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Acción</label>
                  <select value={schemaMode} onChange={e => { setSchemaMode(e.target.value as any); setNewAttrKey(''); setAttrType('string'); setAllowedValues([]); setNewAllowedValue(''); setNewAttrDefault(''); setRemoveAttrKey(''); }} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                    <option value="add">Agregar Atributo</option>
                    <option value="remove">Eliminar Atributo</option>
                  </select>
                </div>

                {schemaMode === 'add' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Atributo</label>
                      <input
                        type="text"
                        value={newAttrKey}
                        onChange={e => setNewAttrKey(e.target.value)}
                        placeholder="Ej: material"
                        className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Dato</label>
                      <select value={attrType} onChange={e => setAttrType(e.target.value as any)} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                        <option value="string">Texto</option>
                        <option value="number">Número</option>
                        <option value="boolean">Sí / No</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Valores Permitidos <span className="text-slate-400 font-normal">(opcional — vacío = cualquier valor)</span></label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={newAllowedValue}
                          onChange={e => setNewAllowedValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && newAllowedValue.trim()) {
                              e.preventDefault();
                              const v = newAllowedValue.trim();
                              if (!allowedValues.includes(v)) setAllowedValues(prev => [...prev, v].sort());
                              setNewAllowedValue('');
                            }
                          }}
                          placeholder="Escribe un valor y presiona Enter..."
                          className="flex-1 p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const v = newAllowedValue.trim();
                            if (v && !allowedValues.includes(v)) setAllowedValues(prev => [...prev, v].sort());
                            setNewAllowedValue('');
                          }}
                          disabled={!newAllowedValue.trim()}
                          className="px-3 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 text-sm disabled:opacity-50"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {allowedValues.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-lg border min-h-[36px]">
                          {allowedValues.map(v => (
                            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-xs font-medium">
                              {v}
                              <button
                                type="button"
                                onClick={() => setAllowedValues(prev => prev.filter(x => x !== v))}
                                className="hover:bg-amber-200 rounded p-0.5"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Valor por Defecto</label>
                      <input
                        type="text"
                        value={newAttrDefault}
                        onChange={e => setNewAttrDefault(e.target.value)}
                        placeholder="Ej: MDF"
                        className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white"
                      />
                    </div>
                  </>
                )}

                {schemaMode === 'remove' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Atributo a Eliminar</label>
                    <select value={removeAttrKey} onChange={e => setRemoveAttrKey(e.target.value)} className="w-full p-2 border rounded-md text-sm outline-none focus:ring-2 bg-white">
                      <option value="">Seleccione...</option>
                      {allSchemaKeys.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}

            <button
              onClick={handlePreview}
              disabled={selectedIds.length === 0 || loading}
              className="w-full mt-6 py-2.5 bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
              Generar Vista Previa
            </button>

            <hr className="border-slate-200 my-4" />

            <button
              onClick={openDeleteWizard}
              disabled={selectedIds.length === 0 || isDeleting}
              className="w-full py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100 font-medium disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Eliminar {selectedIds.length > 0 ? `${selectedIds.length} ` : ''}Familias
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-0 overflow-hidden flex flex-col max-h-[90vh]">
            <div className={`p-6 border-b text-white ${previewData.is_valid ? 'bg-amber-600' : 'bg-red-600'}`}>
              <h3 className="text-2xl font-bold flex items-center gap-2">
                {previewData.is_valid ? <Info className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                {previewData.is_valid ? 'Vista Previa (Válido)' : 'Errores de Validación'}
              </h3>
            </div>

            <div className="p-6 overflow-y-auto bg-slate-50 space-y-6">
              {!previewData.is_valid && (
                <div className="bg-red-50 text-red-800 p-4 rounded-lg border border-red-200">
                  <h4 className="font-bold mb-2">Errores detectados:</h4>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {previewData.errors?.map((err: string, i: number) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}

              {previewData.is_valid && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                      <p className="text-slate-500 text-sm font-medium">Familias a Modificar</p>
                      <p className="text-3xl font-bold text-slate-800 mt-1">{previewData.affected_count}</p>
                    </div>
                  </div>

                  <div className="bg-amber-50 text-amber-800 p-4 rounded-lg border border-amber-100">
                    <h4 className="font-semibold flex items-center gap-2 mb-2"><Info className="w-5 h-5" /> Resumen</h4>
                    {editType === 'schema_attr' ? (
                      <div className="mt-3 bg-white p-3 rounded border font-mono text-sm text-slate-700">
                        <strong>{previewData.schemaAction === 'add' ? 'Agregar' : 'Eliminar'} atributo</strong>: <span className="text-amber-600 font-bold">{previewData.attrKey}</span>
                        {previewData.schemaAction === 'add' && (
                          <div className="mt-2 text-slate-500 text-xs">
                            <p>Tipo: <span className="text-slate-700 font-medium">{attrType === 'string' ? 'Texto' : attrType === 'number' ? 'Número' : 'Sí / No'}</span></p>
                            <p>Valores permitidos: <span className="text-slate-700 font-medium">{allowedValues.length > 0 ? allowedValues.join(', ') : 'Cualquiera'}</span></p>
                            <p>Valor por defecto: <span className="text-slate-700 font-medium">{previewData.attrDefault || '(ninguno)'}</span></p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 bg-white p-3 rounded border font-mono text-sm text-slate-700">
                        <strong>{previewData.editField}</strong> = <span className="text-green-600 font-bold">{JSON.stringify(previewData.parsedValue)}</span>
                      </div>
                    )}
                  </div>

                  {previewData.editField === 'product_type' && previewData.renameImpact && (
                    <div className="bg-blue-50 text-blue-900 p-4 rounded-lg border border-blue-100">
                      <h4 className="font-semibold flex items-center gap-2 mb-2"><Info className="w-5 h-5" /> Relación con Nomenclatura</h4>

                      {previewData.renameImpact.canMigrateNamingModel ? (
                        <div className="space-y-3">
                          <p className="text-sm">
                            Detectado renombre completo de product_type: <strong>{previewData.renameImpact.fromType}</strong> -&gt; <strong>{previewData.renameImpact.toType}</strong>.
                          </p>
                          <label className="flex items-start gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={migrateNamingModel}
                              onChange={(e) => setMigrateNamingModel(e.target.checked)}
                              className="mt-0.5"
                            />
                            <span>
                              Migrar configuración de nomenclatura (reglas ES + configuración EN) de
                              <strong> {previewData.renameImpact.fromType}</strong> a
                              <strong> {previewData.renameImpact.toType}</strong>.
                            </span>
                          </label>
                        </div>
                      ) : (
                        <p className="text-sm">
                          {previewData.renameImpact.reason || 'No aplica migración automática de nomenclatura para este cambio.'}
                        </p>
                      )}
                    </div>
                  )}

                  {previewData.schemaAction === 'remove' && Array.isArray(previewData.families) && previewData.families.length > 0 && (
                    <div className="bg-white p-4 rounded-lg border">
                      <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-500" />
                        Desglose por Familia
                      </h4>
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="p-2 border-b font-semibold text-slate-600">Familia</th>
                            <th className="p-2 border-b font-semibold text-slate-600 text-right">Referencias Totales</th>
                            <th className="p-2 border-b font-semibold text-slate-600 text-right">Con este atributo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {previewData.families.map((f: any) => (
                            <tr key={f.family_code} className="hover:bg-slate-50">
                              <td className="p-2 font-mono font-medium text-slate-800">{f.family_code}</td>
                              <td className="p-2 text-right text-slate-600">{f.total_refs}</td>
                              <td className="p-2 text-right">
                                <span className={`font-medium ${Number(f.refs_with_key) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                  {f.refs_with_key}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-xs text-slate-400 mt-2">
                        Se eliminará el atributo <strong>{previewData.attrKey}</strong> del esquema y de todas las referencias de las familias seleccionadas.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-6 border-t bg-white flex justify-end gap-3 shrink-0">
              <button
                onClick={() => {
                  setShowPreview(false);
                  setMigrateNamingModel(false);
                }}
                disabled={isExecuting}
                className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-md font-medium"
              >
                Cerrar
              </button>
              {previewData.is_valid && (
                <div className="flex flex-col items-end gap-2">
                  <button onClick={handleExecute} disabled={isExecuting} className="px-8 py-2.5 text-white rounded-md font-bold flex items-center gap-2 bg-amber-600 hover:bg-amber-700 min-w-[220px] justify-center">
                    {isExecuting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                    {isExecuting ? (
                      <span>Procesando {executionProgress?.processed ?? 0}/{executionProgress?.total ?? selectedIds.length}</span>
                    ) : (
                      'Confirmar'
                    )}
                  </button>
                  {isExecuting && (
                    <div className="w-full max-w-[280px] h-2 bg-slate-100 rounded overflow-hidden">
                      <div
                        className="h-full bg-amber-600 transition-all"
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

      {/* Delete Wizard Modal */}
      {showDeleteWizard && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-0 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Step 1 — Scope */}
            {deleteStep === 1 && (
              <>
                <div className="p-6 border-b bg-red-600 text-white">
                  <h3 className="text-2xl font-bold flex items-center gap-2">
                    <Trash2 className="w-6 h-6" />
                    Eliminar Familias
                  </h3>
                  <p className="text-red-100 mt-1">Esta acción eliminará permanentemente:</p>
                </div>
                <div className="p-6 space-y-6 bg-slate-50">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                      <p className="text-3xl font-bold text-slate-800">{deleteTotals.fams}</p>
                      <p className="text-sm text-slate-500">Familias</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                      <p className="text-3xl font-bold text-slate-800">{deleteTotals.refs}</p>
                      <p className="text-sm text-slate-500">Referencias</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                      <p className="text-3xl font-bold text-slate-800">{deleteTotals.versions}</p>
                      <p className="text-sm text-slate-500">Versiones</p>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                      <p className="text-3xl font-bold text-slate-800">{deleteTotals.skus}</p>
                      <p className="text-sm text-slate-500">SKUs</p>
                    </div>
                  </div>

                  <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                    <p className="text-sm text-red-800 font-medium flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                      <span>Los nombres comerciales y datos técnicos se perderán para siempre. No hay backups. Si hay activos isométricos asociados, también serán eliminados.</span>
                    </p>
                  </div>
                </div>
                <div className="p-6 border-t bg-white flex justify-end gap-3 shrink-0">
                  <button onClick={() => setShowDeleteWizard(false)} className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-md font-medium">
                    Cancelar
                  </button>
                  <button onClick={() => setDeleteStep(2)} className="px-6 py-2.5 bg-slate-800 text-white rounded-md hover:bg-slate-900 font-medium flex items-center gap-2">
                    Ver detalle <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* Step 2 — Breakdown */}
            {deleteStep === 2 && (
              <>
                <div className="p-6 border-b bg-red-600 text-white">
                  <h3 className="text-2xl font-bold flex items-center gap-2">
                    <Layers className="w-6 h-6" />
                    Desglose por Familia
                  </h3>
                </div>
                <div className="p-6 overflow-y-auto bg-slate-50">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="p-2 border-b font-semibold text-slate-700">Código</th>
                        <th className="p-2 border-b font-semibold text-slate-700">Nombre</th>
                        <th className="p-2 border-b font-semibold text-slate-700 text-right">Ref</th>
                        <th className="p-2 border-b font-semibold text-slate-700 text-right">Ver</th>
                        <th className="p-2 border-b font-semibold text-slate-700 text-right">SKU</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {deletePreview.map((f: any) => (
                        <tr key={f.family_code} className="hover:bg-slate-100">
                          <td className="p-2 font-mono font-medium text-slate-800">{f.family_code}</td>
                          <td className="p-2 text-slate-600">{f.family_name || '-'}</td>
                          <td className="p-2 text-right font-medium text-slate-800">{f.ref_count || 0}</td>
                          <td className="p-2 text-right font-medium text-slate-800">{f.version_count || 0}</td>
                          <td className="p-2 text-right font-medium text-slate-800">{f.sku_count || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold">
                      <tr>
                        <td colSpan={2} className="p-2 text-right text-slate-700">Total:</td>
                        <td className="p-2 text-right text-red-700">{deleteTotals.refs}</td>
                        <td className="p-2 text-right text-red-700">{deleteTotals.versions}</td>
                        <td className="p-2 text-right text-red-700">{deleteTotals.skus}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="p-6 border-t bg-white flex justify-between shrink-0">
                  <button onClick={() => setDeleteStep(1)} className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-md font-medium flex items-center gap-2">
                    <ChevronLeft className="w-4 h-4" /> Atrás
                  </button>
                  <button onClick={() => setDeleteStep(3)} className="px-6 py-2.5 bg-slate-800 text-white rounded-md hover:bg-slate-900 font-medium flex items-center gap-2">
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* Step 3 — Human Validation */}
            {deleteStep === 3 && (
              <>
                <div className="p-6 border-b bg-red-600 text-white">
                  <h3 className="text-2xl font-bold flex items-center gap-2">
                    <AlertTriangle className="w-6 h-6" />
                    Confirmación Final
                  </h3>
                </div>
                <div className="p-6 space-y-4 bg-slate-50">
                  <p className="text-sm text-slate-700 font-medium">
                    Para eliminar <strong>{deleteTotals.fams} familias</strong> ({deleteTotals.skus} SKUs en total) debes confirmar:
                  </p>

                  <label className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={deleteChecks.irreversible}
                      onChange={e => setDeleteChecks(c => ({ ...c, irreversible: e.target.checked }))}
                      className="mt-0.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm text-slate-700">Entiendo que esta acción es <strong>IRREVERSIBLE</strong> y eliminará {deleteTotals.refs} referencias, {deleteTotals.versions} versiones y {deleteTotals.skus} SKUs permanentemente.</span>
                  </label>

                  <label className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={deleteChecks.verified}
                      onChange={e => setDeleteChecks(c => ({ ...c, verified: e.target.checked }))}
                      className="mt-0.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm text-slate-700">He verificado que son familias de prueba o bulto, no datos de producción reales.</span>
                  </label>

                  <label className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={deleteChecks.consulted}
                      onChange={e => setDeleteChecks(c => ({ ...c, consulted: e.target.checked }))}
                      className="mt-0.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm text-slate-700">Ya consulté con Oswaldo sobre esta decisión.</span>
                  </label>
                </div>
                <div className="p-6 border-t bg-white flex justify-between shrink-0">
                  <button onClick={() => setDeleteStep(2)} disabled={isDeleting} className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-md font-medium flex items-center gap-2">
                    <ChevronLeft className="w-4 h-4" /> Atrás
                  </button>
                  <button
                    onClick={handleDeleteExecute}
                    disabled={!deleteChecks.irreversible || !deleteChecks.verified || !deleteChecks.consulted || isDeleting}
                    className="px-6 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium disabled:opacity-50 flex items-center gap-2 shadow-sm"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {isDeleting ? 'Eliminando...' : 'Eliminar permanentemente'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Lines Modal */}
      {linesModalFamily && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-0 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-5 border-b bg-blue-600 text-white">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Líneas Comerciales
              </h3>
              <p className="text-blue-100 text-sm mt-1">{linesModalFamily} — {linesModalFamilyName}</p>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto bg-slate-50">
              <p className="text-xs text-slate-500 font-medium">Selecciona las líneas autorizadas para esta familia:</p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLineInput}
                  onChange={e => setNewLineInput(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newLineInput.trim()) {
                      const trimmed = newLineInput.trim();
                      if (!linesModalSelected.includes(trimmed)) {
                        setLinesModalSelected(prev => [...prev, trimmed].sort());
                        setAvailableLines(prev => prev.includes(trimmed) ? prev : [...prev, trimmed].sort());
                      }
                      setNewLineInput('');
                    }
                  }}
                  placeholder="Nueva línea..."
                  className="flex-1 p-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = newLineInput.trim();
                    if (trimmed) {
                      if (!linesModalSelected.includes(trimmed)) {
                        setLinesModalSelected(prev => [...prev, trimmed].sort());
                        setAvailableLines(prev => prev.includes(trimmed) ? prev : [...prev, trimmed].sort());
                      }
                      setNewLineInput('');
                    }
                  }}
                  disabled={!newLineInput.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableLines.map(line => {
                  const isActive = linesModalSelected.includes(line);
                  return (
                    <div key={line} className="relative group">
                      <button
                        type="button"
                        onClick={() => {
                          if (isActive) {
                            setLinesModalSelected(prev => prev.filter(l => l !== line));
                          } else {
                            setLinesModalSelected(prev => [...prev, line].sort());
                          }
                        }}
                        className={`w-full text-xs font-bold py-2.5 px-3 rounded-xl border transition-all flex items-center justify-between ${
                          isActive
                            ? 'bg-blue-100 border-blue-300 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-blue-200 hover:bg-blue-50/50'
                        }`}
                      >
                        {line}
                        {isActive ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 opacity-50" />}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(`¿Eliminar la línea "${line}" del sistema?\n\nSe pondrá a NULL en todas las referencias que la usen y se removerá de todas las familias.`)) return;
                          try {
                            await deleteLineAction(line);
                            setAvailableLines(prev => prev.filter(l => l !== line));
                            setLinesModalSelected(prev => prev.filter(l => l !== line));
                            toast.success(`Línea "${line}" eliminada`);
                          } catch (e) {
                            toast.error('Error: ' + (e instanceof Error ? e.message : String(e)));
                          }
                        }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-sm hover:bg-red-600"
                        title="Eliminar línea del sistema"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
              {linesModalSelected.length > 0 && (
                <div className="pt-2 flex flex-wrap gap-1.5 border-t border-slate-200">
                  {linesModalSelected.map(line => (
                    <span key={line} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold">
                      {line}
                      <button
                        type="button"
                        onClick={() => setLinesModalSelected(prev => prev.filter(l => l !== line))}
                        className="hover:bg-blue-700 rounded p-0.5 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 border-t bg-white flex justify-end gap-3 shrink-0">
              <button
                onClick={() => { setLinesModalFamily(null); setLinesModalSelected([]); }}
                disabled={savingLines}
                className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-md font-medium text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setSavingLines(true);
                  try {
                    await updateFamilyLinesAction(linesModalFamily, linesModalSelected);
                    toast.success('Líneas actualizadas');
                    setLinesModalFamily(null);
                    handleSearch();
                  } catch (e) {
                    toast.error('Error: ' + (e instanceof Error ? e.message : String(e)));
                  }
                  setSavingLines(false);
                }}
                disabled={savingLines}
                className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm flex items-center gap-2"
              >
                {savingLines ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
