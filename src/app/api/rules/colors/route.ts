import { NextResponse } from 'next/server';
import { getColorsAction, upsertColorAction } from '@/app/rules/colors/actions';

export async function GET() {
  try {
    const colors = await getColorsAction();
    return NextResponse.json(colors);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { code_4dig, name_color_sap } = await req.json();
    const result = await upsertColorAction({ code_4dig, name_color_sap, isNew: false });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { code_4dig, name_color_sap } = await req.json();
    const result = await upsertColorAction({ code_4dig, name_color_sap, isNew: true });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
