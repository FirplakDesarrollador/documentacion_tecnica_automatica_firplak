'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Check, Loader2, RefreshCw, Search, X } from 'lucide-react'

type SapItem = Record<string, unknown>

type ConsultaSapClientProps = {
  initialCode: string
  initialItem: SapItem | null
  initialError: string | null
}

type FieldDefinition = {
  label: string
  key: string
}

type SapApiItemResponse =
  | { success: true; item: SapItem }
  | { success: false; error: string; sapCode?: string | number | null }

const USER_FIELDS: FieldDefinition[] = [
  { label: 'Inventariable', key: 'U_Inventariable' },
  { label: 'Area', key: 'U_Area' },
  { label: 'Prefijo', key: 'U_Prefijo' },
  { label: 'Version', key: 'U_Version' },
  { label: 'Color', key: 'U_Color' },
  { label: 'Linea', key: 'U_Linea' },
  { label: 'Linea orden fabricacion', key: 'U_LineaOF' },
  { label: 'Familia', key: 'U_Familia' },
  { label: 'TypeOC', key: 'U_TypeOC' },
  { label: 'Molde', key: 'U_Molde' },
  { label: 'Plano?', key: 'U_Plano' },
  { label: 'Codigo de barras?', key: 'U_CodBarras' },
  { label: 'Grupo', key: 'U_Grupo' },
  { label: 'Codigo MRB', key: 'U_CodigoMRB' },
  { label: 'Garantia', key: 'U_Garantia' },
  { label: 'Codigo dane articulos', key: 'U_CodDaneArt' },
  { label: 'Descripcion DANE Articulos', key: 'U_DescDaneArt' },
  { label: 'Unidad de medida DANE', key: 'U_UndMedDaneArt' },
  { label: 'AF. Localizaciones Act.Fijo', key: 'U_Localizaciones' },
  { label: 'AF. Placa Act.Fijo', key: 'U_Placa_Actv' },
  { label: 'AF. Fecha Compra Act.Fijo', key: 'U_FCompra_Actv' },
  { label: 'AF. Fecha Baja Act.Fijo', key: 'U_Fbaja_Actv' },
  { label: 'Altura de apilamiento', key: 'U_AltApilam' },
  { label: 'Maximas unidades a apilar', key: 'U_MaxApilam' },
  { label: 'PArancelaria', key: 'U_PArancelaria' },
  { label: 'Descripcion Molde', key: 'U_DescMolde' },
  { label: 'AF.Valor Compra Act.Fijo', key: 'U_AFVlorCompra' },
  { label: 'Familia TOC', key: 'U_FamiliaToc' },
  { label: 'Articulo TOC', key: 'U_Articulo_TOC' },
  { label: 'Requiere Molde', key: 'U_Req_Molde' },
  { label: 'PLU DEL ARTICULO', key: 'U_PLU' },
  { label: 'SN Compra', key: 'U_HBT_TerceroFacPro' },
  { label: 'SN Amortizacion', key: 'U_HBT_TerceroAmorti' },
  { label: 'SN Baja', key: 'U_HBT_TerceroBaja' },
  { label: 'Cto Neces Terminacion', key: 'U_IFRS_TERM' },
  { label: 'Cto Neces Venta', key: 'U_IFRS_VENT' },
  { label: 'Costo Marketing', key: 'U_IFRS_MARK' },
  { label: '% Garantia', key: 'U_IFRS_GTIA' },
  { label: 'Tiempo de Garantia', key: 'U_IFRS_Tiempo' },
  { label: 'Activo Padre', key: 'U_IFRS_ActPadre' },
  { label: 'Fecha Vcto. Poliza', key: 'U_HBT_FecPoliza' },
  { label: 'Fecha Vcto. Garantia', key: 'U_HBT_FecVtoGarn' },
  { label: 'Fecha Mantenimiento', key: 'U_HBT_FecMantto' },
  { label: 'Tipo de Activo', key: 'U_IFRS_TipoAF' },
]

const TAB_LABELS = [
  'General',
  'Datos de compras',
  'Datos de ventas',
  'Datos de inventario',
  'Datos de planificacion',
  'Datos de produccion',
  'Propiedades',
  'Comentarios',
  'Anexos',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (typeof value === 'boolean') return value ? 'SI' : 'NO'
  return String(value)
}

function itemValue(item: SapItem | null, key: string): string {
  if (!item) return ''
  return displayValue(item[key])
}

function sapBoolean(value: unknown): boolean {
  return value === true || value === 'tYES' || value === 'Y' || value === 'SI'
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function readPriceListOne(item: SapItem | null): string {
  if (!item || !Array.isArray(item.ItemPrices)) return ''

  const price = item.ItemPrices.find(entry => isRecord(entry) && entry.PriceList === 1)
  if (!isRecord(price)) return ''

  const amount = displayValue(price.Price)
  const currency = displayValue(price.Currency)
  return [amount, currency].filter(Boolean).join(' ')
}

function readItemType(item: SapItem | null): string {
  const value = itemValue(item, 'ItemType')
  if (value === 'itItems') return 'Articulos'
  return value
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-7 grid-cols-[210px_minmax(0,1fr)] items-center border-b border-slate-200 text-[13px]">
      <div className="truncate bg-slate-50 px-2 py-1 text-slate-700">{label}</div>
      <div className="min-h-7 truncate border-l border-slate-200 bg-white px-2 py-1 font-medium text-slate-900">
        {value}
      </div>
    </div>
  )
}

function CompactInput({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <label className={`grid items-center gap-2 ${wide ? 'grid-cols-[150px_minmax(0,1fr)]' : 'grid-cols-[150px_190px]'}`}>
      <span className="truncate text-[13px] font-medium text-slate-700">{label}</span>
      <span className="min-h-7 truncate border border-slate-300 bg-white px-2 py-1 text-[13px] text-slate-900">
        {value}
      </span>
    </label>
  )
}

function SapCheckbox({ label, checked, disabled = false }: { label: string; checked: boolean; disabled?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-[13px] ${disabled ? 'text-slate-400' : 'text-slate-800'}`}>
      <span className={`flex size-4 items-center justify-center border ${checked ? 'border-slate-700 bg-white' : 'border-slate-300 bg-white'}`}>
        {checked ? <Check className="size-3 stroke-[3]" /> : null}
      </span>
      <span className="truncate">{label}</span>
    </div>
  )
}

export function ConsultaSapClient({ initialCode, initialItem, initialError }: ConsultaSapClientProps) {
  const [code, setCode] = useState(initialCode)
  const [item, setItem] = useState<SapItem | null>(initialItem)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)

  const activeCode = itemValue(item, 'ItemCode') || code
  const priceListOne = useMemo(() => readPriceListOne(item), [item])

  async function fetchItem(nextCode: string) {
    const normalizedCode = nextCode.trim()
    if (!normalizedCode) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/sap/items/${encodeURIComponent(normalizedCode)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      const payload = await response.json() as SapApiItemResponse

      if (!response.ok || !payload.success) {
        setItem(null)
        setError(payload.success ? 'No se pudo consultar SAP' : payload.error)
        return
      }

      setItem(payload.item)
      setCode(normalizedCode)
    } catch (fetchError: unknown) {
      setItem(null)
      setError(fetchError instanceof Error ? fetchError.message : 'No se pudo consultar SAP')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void fetchItem(code)
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 border border-slate-300 bg-white px-3 py-2">
          <label className="flex min-w-[360px] flex-1 items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Numero de articulo</span>
            <input
              value={code}
              onChange={event => setCode(event.target.value.toUpperCase())}
              className="h-9 min-w-0 flex-1 border border-slate-300 px-3 font-mono text-sm outline-none focus:border-amber-500"
              placeholder="VBAN12-0012-000-0458"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 border border-amber-600 bg-amber-400 px-3 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Consultar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void fetchItem(activeCode)}
            className="inline-flex h-9 items-center gap-2 border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className="size-4" />
            Actualizar
          </button>
          <div className="ml-auto flex items-center gap-2 text-xs font-medium text-slate-600">
            <span className={`size-2 rounded-full ${error ? 'bg-red-500' : 'bg-emerald-500'}`} />
            Service Layer
          </div>
        </form>

        {error ? (
          <div className="flex items-start gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <X className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <section className="grid gap-3 xl:grid-cols-[510px_minmax(0,1fr)]">
          <aside className="max-h-[calc(100vh-135px)] overflow-auto border border-slate-300 bg-white">
            <div className="sticky top-0 z-10 border-b border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold">
              General
            </div>
            <div>
              {USER_FIELDS.map(field => (
                <FieldRow key={field.key} label={field.label} value={itemValue(item, field.key)} />
              ))}
            </div>
          </aside>

          <section className="min-w-0 border border-slate-300 bg-white">
            <div className="border-b-4 border-amber-400 bg-slate-100 px-3 py-2 text-sm font-semibold">
              Datos maestros de articulo
            </div>

            <div className="grid gap-4 p-3 xl:grid-cols-[minmax(0,1fr)_330px]">
              <div className="grid gap-2">
                <CompactInput label="Numero articulo" value={activeCode} />
                <CompactInput label="Descripcion" value={itemValue(item, 'ItemName')} wide />
                <CompactInput label="Nombre extranjero" value={itemValue(item, 'ForeignName')} wide />
                <CompactInput label="Clase de articulo" value={readItemType(item)} />
                <CompactInput label="Grupo de articulos" value={itemValue(item, 'ItemsGroupCode')} />
                <CompactInput label="Grupo unid. medida" value={itemValue(item, 'UoMGroupEntry') === '-1' ? 'Manual' : itemValue(item, 'UoMGroupEntry')} />
                <CompactInput label="Lista de precios" value={priceListOne || '1'} />
              </div>

              <div className="grid content-start gap-2 border-l border-slate-200 pl-4">
                <SapCheckbox label="Articulo de inventario" checked={sapBoolean(item?.InventoryItem)} />
                <SapCheckbox label="Articulo venta" checked={sapBoolean(item?.SalesItem)} />
                <SapCheckbox label="Articulo de compra" checked={sapBoolean(item?.PurchaseItem)} />
                <SapCheckbox label="Indicador de activo fijo" checked={sapBoolean(item?.AssetItem)} disabled />
                <CompactInput label="Codigo de barras" value={itemValue(item, 'BarCode')} />
                <CompactInput label="Precio por unidad" value={itemValue(item, 'SalesUnit') || itemValue(item, 'InventoryUOM')} />
              </div>
            </div>

            <div className="border-t border-slate-300 px-3 pt-2">
              <div className="flex overflow-x-auto">
                {TAB_LABELS.map((label, index) => (
                  <div
                    key={label}
                    className={`min-w-max border border-b-0 border-slate-300 px-5 py-1.5 text-center text-[13px] ${
                      index === 0 ? 'bg-white font-semibold' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div className="m-3 min-h-[470px] border border-slate-300 bg-white p-4">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="grid content-start gap-2">
                  <SapCheckbox label="Sujeto a retencion de impuesto" checked={false} />
                  <SapCheckbox label="Sujeto a impuesto" checked={false} disabled />
                  <SapCheckbox label="Impuesto indirecto" checked />
                  <SapCheckbox label="No aplicar grupos de descuento" checked={false} />
                  <div className="mt-2 grid gap-2">
                    <CompactInput label="Fabricante" value={itemValue(item, 'Manufacturer')} />
                    <CompactInput label="ID adicional" value={itemValue(item, 'SWW')} />
                    <CompactInput label="Forma de envio" value={itemValue(item, 'ShipType')} />
                    <CompactInput label="Numeros de serie y lote" value={sapBoolean(item?.ManageSerialNumbers) || sapBoolean(item?.ManageBatchNumbers) ? 'Si' : 'Ning.'} />
                    <CompactInput label="Articulo gestionado por" value={sapBoolean(item?.ManageBatchNumbers) ? 'Lotes' : sapBoolean(item?.ManageSerialNumbers) ? 'Series' : 'Ning.'} />
                  </div>
                </div>

                <div className="grid content-between gap-6">
                  <div className="grid gap-2 text-[13px]">
                    <label className="flex items-center gap-2">
                      <span className={`size-4 rounded-full border ${sapBoolean(item?.Valid) ? 'border-slate-500 bg-white' : 'border-slate-300'}`}>
                        {sapBoolean(item?.Valid) ? <span className="m-1 block size-1.5 rounded-full bg-slate-700" /> : null}
                      </span>
                      Activo
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="size-4 rounded-full border border-slate-300" />
                      Inactivo
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="size-4 rounded-full border border-slate-300" />
                      Avanzado
                    </label>
                    <div className="mt-2 grid grid-cols-[70px_130px_55px_130px] items-center gap-2">
                      <span>Desde</span>
                      <span className="min-h-7 border border-slate-300 px-2 py-1">{formatDate(item?.ValidFrom)}</span>
                      <span>Hasta</span>
                      <span className="min-h-7 border border-slate-300 px-2 py-1">{formatDate(item?.ValidTo)}</span>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <CompactInput label="Comentarios" value={itemValue(item, 'User_Text')} wide />
                    <CompactInput label="Pais/region origen" value={itemValue(item, 'CountryOfOrigin')} wide />
                    <CompactInput label="Identificacion estandar" value={itemValue(item, 'NCMCode')} wide />
                    <CompactInput label="Clasificacion producto basico" value={itemValue(item, 'MaterialType')} wide />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}
