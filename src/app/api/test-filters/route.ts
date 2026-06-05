import { NextResponse } from 'next/server';
import { getReferenceFilters } from '@/lib/data/filters';
import { apiGuard } from '@/utils/auth/access';

export async function GET() {
    const guard = await apiGuard('admin');
    if (guard.response) return guard.response;

    const data = await getReferenceFilters(['BAN05']);
    return NextResponse.json(data);
}
