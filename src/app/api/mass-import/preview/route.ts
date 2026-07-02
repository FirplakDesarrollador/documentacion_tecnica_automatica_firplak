import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { readTemplateXlsx } from '@/lib/massImport/io';
import { buildMassImportPayload, buildStrictPreviewRows } from '@/lib/massImport/payload';
import { apiGuard } from '@/utils/auth/access';

export const runtime = 'nodejs';
export const maxDuration = 60;

type SupabaseRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function POST(req: Request) {
  const guard = await apiGuard('admin');
  if (guard.response) return guard.response;

  try {
    const data = await req.formData();
    const file = data.get('file') as unknown as File | null;
    if (!file) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });

    const parsed = await readTemplateXlsx(file);
    if (!parsed.carga.length) {
      return NextResponse.json({ success: false, error: 'La hoja "Carga" esta vacia.' }, { status: 400 });
    }

    const { payload, strictIssues } = await buildMassImportPayload(parsed);
    if (strictIssues.length > 0) {
      return NextResponse.json({
        success: true,
        result: {
          success: false,
          dry_run: true,
          rows: buildStrictPreviewRows(payload.rows, strictIssues),
          strict_ref_attr_errors: strictIssues,
        },
      });
    }

    const rpcClient = supabaseServer as unknown as SupabaseRpcClient;
    const { data: rpcData, error } = await rpcClient.rpc('bulk_import_products_v3', {
      p_payload: payload,
      p_dry_run: true,
      p_test_rollback: false,
    });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, result: rpcData });
  } catch (e) {
    console.error('[mass-import/preview] error', e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Preview failed' }, { status: 500 });
  }
}
