import { NextResponse } from 'next/server';
import { getColorsAction, upsertColorAction } from '@/app/rules/colors/actions';
import { apiGuard } from '@/utils/auth/access';

export async function GET() {
  const guard = await apiGuard('admin');
  if (guard.response) return guard.response;

  try {
    const colors = await getColorsAction();
    return NextResponse.json(colors);
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const guard = await apiGuard('admin');
  if (guard.response) return guard.response;

  try {
    const { code_4dig, name_color_sap } = await req.json();
    const result = await upsertColorAction({ code_4dig, name_color_sap, isNew: false });
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const guard = await apiGuard('admin');
  if (guard.response) return guard.response;

  try {
    const { code_4dig, name_color_sap } = await req.json();
    const result = await upsertColorAction({ code_4dig, name_color_sap, isNew: true });
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
