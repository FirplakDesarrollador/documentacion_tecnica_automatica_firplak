import { NextResponse } from 'next/server';
import { getColorsAction, upsertColorAction } from '@/app/rules/colors/actions';
import type { ColorApplicationMap, ColorMode } from '@/app/rules/colors/productiveScopes';
import { apiGuard } from '@/utils/auth/access';

type ColorApiPayload = {
  code_4dig?: string;
  name_color_sap?: string;
  color_mode?: ColorMode | null;
  application_colors_json?: ColorApplicationMap | null;
  allowed_product_types?: string[] | null;
  allowed_manufacturing_processes?: string[] | null;
  is_active?: boolean | null;
  notes?: string | null;
};

function normalizeColorApiPayload(payload: ColorApiPayload) {
  return {
    code_4dig: payload.code_4dig ?? '',
    name_color_sap: payload.name_color_sap ?? '',
    color_mode: payload.color_mode,
    application_colors_json: payload.application_colors_json,
    allowed_product_types: payload.allowed_product_types,
    allowed_manufacturing_processes: payload.allowed_manufacturing_processes,
    is_active: payload.is_active,
    notes: payload.notes,
  };
}

export async function GET() {
  const guard = await apiGuard('module:configuration');
  if (guard.response) return guard.response;

  try {
    const colors = await getColorsAction();
    return NextResponse.json(colors);
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const guard = await apiGuard('module:configuration');
  if (guard.response) return guard.response;

  try {
    const payload = await req.json() as ColorApiPayload;
    const result = await upsertColorAction({
      ...normalizeColorApiPayload(payload),
      isNew: false,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const guard = await apiGuard('module:configuration');
  if (guard.response) return guard.response;

  try {
    const payload = await req.json() as ColorApiPayload;
    const result = await upsertColorAction({
      ...normalizeColorApiPayload(payload),
      isNew: true,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
