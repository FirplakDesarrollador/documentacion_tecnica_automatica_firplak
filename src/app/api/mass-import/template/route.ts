import { NextResponse } from 'next/server';
import { buildMassImportTemplateXlsx } from '@/lib/massImport/template';
import { readBaseInputFile } from '@/lib/massImport/io';
import { apiGuard } from '@/utils/auth/access';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const guard = await apiGuard('module:dashboard');
  if (guard.response) return guard.response;

  try {
    const data = await req.formData();
    const file = data.get('file') as unknown as File | null;
    if (!file) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });

    const base = await readBaseInputFile(file);
    if (!base.rows.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se encontraron filas validas. Verifica que el archivo tenga headers y una columna SKU_COMPLETE.',
          error_code: 'MASS_IMPORT_BASE_NO_VALID_ROWS',
          details: {
            expected: {
              required: ['SKU_COMPLETE'],
              recommended: ['SAP_DESCRIPTION'],
              accepted_sku_headers: base.detected_columns.sku_candidates,
              accepted_description_headers: base.detected_columns.sap_description_candidates,
            },
            found_headers: base.found_headers,
            format: base.format,
            hint:
              'Para CSV/XLSX, la primera fila debe contener los titulos de columnas. Ejemplo: SKU_COMPLETE;SAP_DESCRIPTION',
          },
        },
        { status: 400 }
      );
    }

    const { buffer, meta } = await buildMassImportTemplateXlsx(base.rows);

    const filename = `PLANTILLA_CARGA_MASIVA_V6_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'x-mass-import-missing-families': String(meta.missingFamilies.length),
        'x-mass-import-missing-colors': String(meta.missingColors.length),
      },
    });
  } catch (e: unknown) {
    console.error('[mass-import/template] error', e);
    return NextResponse.json({ success: false, error: (e as Error).message || 'Failed to generate template' }, { status: 500 });
  }
}
