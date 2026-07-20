'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Reference = { reference_id: string; family_code: string; reference_code: string; product_name: string | null; version_id: string; version_code: string; line_count: number }
type Prepared = { context: { targetItemCode: string; sourceItemCode: string; colorName: string; resolvedLines: Array<{ resolved_item_code: string; qty: number; resolution_status: string }>; missing: string[]; warnings: string[] }; existing: boolean; existingBom: { lineCount: number } | null }

export default function SapCodeCreationClient() {
  const [references, setReferences] = useState<Reference[]>([])
  const [referenceId, setReferenceId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [colorCode, setColorCode] = useState('0466')
  const [barcodeIntent, setBarcodeIntent] = useState<'none' | 'provided'>('none')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [result, setResult] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetch('/api/product-design/sap-code-creation').then(response => response.json()).then(data => setReferences(data.references ?? [])).catch(() => setError('No se pudieron cargar las referencias.')) }, [])

  const selected = references.find(item => item.reference_id === referenceId)
  async function run(action: 'prepare' | 'compare' | 'create') {
    setBusy(true); setError(''); setResult(null)
    try {
      const response = await fetch('/api/product-design/sap-code-creation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, referenceId, versionId, colorCode, barcodeIntent, barcodeValue }) })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || data.error || 'La operación falló.')
      if (action === 'prepare') setPrepared(data)
      else setResult(data)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'La operación falló.') }
    finally { setBusy(false) }
  }

  return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto flex max-w-6xl flex-col gap-5">
    <div><Link href="/product-design" className="text-sm text-indigo-600">← Diseño de producto</Link><h1 className="mt-2 text-2xl font-bold text-slate-900">Creación de variantes SAP</h1><p className="mt-1 max-w-3xl text-sm text-slate-600">Solo referencias con BOM V2 publicada, versión 000 y evidencia SAP. El flujo prepara, compara y luego crea Item + LdM con trazabilidad.</p></div>
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-4 md:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">Referencia<select value={referenceId} onChange={event => { const ref = references.find(item => item.reference_id === event.target.value); setReferenceId(event.target.value); setVersionId(ref?.version_id ?? ''); setPrepared(null); setResult(null) }} className="mt-1 w-full rounded border p-2"><option value="">Selecciona una referencia</option>{references.map(item => <option key={item.reference_id} value={item.reference_id}>{item.family_code}-{item.reference_code} · {item.product_name ?? 'sin nombre'} · {item.line_count} líneas</option>)}</select></label>
      <label className="text-sm font-medium text-slate-700">Color nuevo (4 dígitos)<input value={colorCode} onChange={event => setColorCode(event.target.value.replace(/\D/g, '').slice(0, 4))} className="mt-1 w-full rounded border p-2" /></label>
      <div className="text-sm text-slate-600 md:col-span-2">Versión seleccionada: <strong>{selected?.version_code ?? '000'}</strong>. El SKU será <strong>{selected ? `V${selected.family_code}-${selected.reference_code}-000-${colorCode.padStart(4, '0')}` : '—'}</strong>.</div>
      <fieldset className="md:col-span-2"><legend className="text-sm font-medium text-slate-700">¿Lleva código de barras?</legend><div className="mt-2 flex gap-5 text-sm"><label><input type="radio" checked={barcodeIntent === 'none'} onChange={() => setBarcodeIntent('none')} /> No lleva</label><label><input type="radio" checked={barcodeIntent === 'provided'} onChange={() => setBarcodeIntent('provided')} /> Sí, especificar</label></div>{barcodeIntent === 'provided' && <input value={barcodeValue} onChange={event => setBarcodeValue(event.target.value)} placeholder="EAN-13" className="mt-2 w-full rounded border p-2" />}</fieldset>
    </div><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy || !referenceId} onClick={() => run('prepare')} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Procesando…' : 'Preparar y validar'}</button>{prepared?.existing && <button disabled={busy} onClick={() => run('compare')} className="rounded border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-700">Comparar con SAP</button>}{prepared && !prepared.existing && prepared.context.missing.length === 0 && <button disabled={busy} onClick={() => run('create')} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Crear Item + LdM en SAP</button>}</div></section>
    {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {prepared && <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-900">Diagnóstico: {prepared.context.targetItemCode}</h2><p className="mt-1 text-sm text-slate-600">Perfil técnico de lectura: {prepared.context.sourceItemCode}. Color: {prepared.context.colorName}. Líneas resueltas: {prepared.context.resolvedLines.length}.</p>{prepared.context.warnings.map(warning => <p key={warning} className="mt-2 text-xs text-amber-700">⚠ {warning}</p>)}{prepared.context.missing.length > 0 ? <div className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">Faltantes: {prepared.context.missing.join(', ')}</div> : <div className="mt-3 rounded bg-emerald-50 p-3 text-sm text-emerald-700">Materias primas y consumos resolubles para crear la LdM.</div>}{prepared.existing && <div className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-800">El código ya existe en SAP. La creación está bloqueada; usa Comparar.</div>}</section>}
    {Boolean(result) ? <pre className="overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">{String(JSON.stringify(result, null, 2))}</pre> : null}
  </div></main>
}
