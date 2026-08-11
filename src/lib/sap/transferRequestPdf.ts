export type TransferRequestPdfLine = {
  itemCode: string
  itemName: string | null
  unitOfMeasure: string | null
  quantity: number
}

export type TransferRequestPdfData = {
  docNum: number
  documentDate: string | null
  dueDate: string | null
  sourceWarehouse: string
  destinationWarehouse: string
  businessComment: string
  lines: TransferRequestPdfLine[]
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 4,
  }).format(value)
}

function formatDate(value: string | null): string {
  if (!value) return 'No disponible'

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeZone: 'America/Bogota',
  }).format(parsed)
}

export function buildTransferRequestPdfHtml(data: TransferRequestPdfData): string {
  const rows = data.lines.map((line, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(line.itemCode)}</strong></td>
      <td><strong>${escapeHtml(line.itemName || 'Sin descripción')}</strong></td>
      <td>${escapeHtml(line.unitOfMeasure || '-')}</td>
      <td class="numeric">${formatQuantity(line.quantity)}</td>
    </tr>
  `).join('')
  const totalQuantity = data.lines.reduce((total, line) => total + line.quantity, 0)

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Solicitud de traslado ${escapeHtml(data.docNum)}</title>
  <style>
    @page { size: A4; margin: 13mm 15mm; }
    * { box-sizing: border-box; }
    body { color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.35; margin: 0; }
    .header { align-items: flex-start; display: grid; grid-template-columns: 1fr 1.45fr; gap: 28px; padding: 8px 0 16px; }
    .brand-mark { background: #f8fafc; display: inline-block; padding: 10px 13px 8px; }
    .brand { color: #1f4558; font-size: 25px; font-weight: 400; letter-spacing: .035em; line-height: 1; }
    .brand-subtitle { color: #507287; font-size: 7px; letter-spacing: .16em; margin-top: 5px; text-align: center; text-transform: lowercase; }
    .company { color: #111827; font-size: 12px; font-weight: 700; margin-top: 9px; }
    .title { border-left: 7px solid #f5aa00; color: #111827; font-size: 20px; font-weight: 800; line-height: 1; margin: 3px 0 9px auto; padding-left: 8px; width: fit-content; }
    .header-fields { border-bottom: 1px dashed #3b9fff; border-top: 1px dashed #3b9fff; display: grid; grid-template-columns: 1.25fr 1.1fr 1fr; gap: 9px; padding: 6px 0 8px; }
    .label { color: #7b8794; display: block; font-size: 8.5px; margin-bottom: 4px; }
    .value { color: #111827; display: block; font-size: 10.5px; font-weight: 700; overflow-wrap: anywhere; }
    .warehouse { border-left: 4px solid #f5aa00; font-size: 13px; font-weight: 800; margin: 12px 0 10px; padding-left: 6px; }
    table { border-collapse: collapse; margin-top: 0; width: 100%; }
    th { background: #f1f5f9; border-bottom: 2px solid #3b9fff; color: #172033; font-size: 8.5px; font-weight: 500; padding: 6px 5px; text-align: left; }
    td { border-bottom: 1px dashed #8ec5f7; padding: 6px 5px; vertical-align: top; }
    .numeric { text-align: right; }
    .total { align-items: center; display: grid; grid-template-columns: 1fr 135px 110px; margin-top: 9px; }
    .total-label { border-left: 5px solid #f5aa00; border-bottom: 2px solid #3b9fff; font-size: 12px; font-weight: 800; padding: 5px 8px; text-align: right; }
    .total-value { border-bottom: 2px solid #3b9fff; font-size: 12px; font-weight: 800; padding: 5px 0; text-align: right; }
    .comments { margin-top: 16px; min-height: 34px; }
    .comments-label { font-size: 10px; font-weight: 800; margin-bottom: 3px; }
    .footer { color: #7b8794; font-size: 7.5px; margin-top: 16px; }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <div class="brand-mark"><div class="brand">FIRPLAK</div><div class="brand-subtitle">inspirando hogares</div></div>
      <div class="company">Firplak S.A.</div>
    </div>
    <div>
      <div class="title">Solicitud de traslado</div>
      <div class="header-fields">
        <div><span class="label">Almacén de salida</span><span class="value">${escapeHtml(data.sourceWarehouse)}</span></div>
        <div><span class="label">Número de documento</span><span class="value">${escapeHtml(data.docNum)}</span></div>
        <div><span class="label">Fecha de entrega</span><span class="value">${escapeHtml(formatDate(data.dueDate || data.documentDate))}</span></div>
      </div>
    </div>
  </header>

  <div class="warehouse">Almacén de entrada: ${escapeHtml(data.destinationWarehouse)}</div>
  <table>
    <thead><tr><th>#</th><th>Número de artículo</th><th>Descripción</th><th>Unidad de medida</th><th class="numeric">Cantidad</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">No se encontraron líneas verificadas.</td></tr>'}</tbody>
  </table>
  <section class="total"><span></span><span class="total-label">Total:</span><span class="total-value">${formatQuantity(totalQuantity)}</span></section>
  <section class="comments"><div class="comments-label">Comentarios</div><div>${escapeHtml(data.businessComment)}</div></section>

  <footer class="footer">
    Comprobante generado por la aplicación a partir de la relectura del documento SAP.
  </footer>
</body>
</html>`
}
