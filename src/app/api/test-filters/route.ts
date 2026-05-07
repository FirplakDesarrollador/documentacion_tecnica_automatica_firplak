import { NextResponse } from 'next/server';
import { getReferenceFilters } from '@/lib/data/filters';

export async function GET() {
    const data = await getReferenceFilters(['BAN05']);
    return NextResponse.json(data);
}
