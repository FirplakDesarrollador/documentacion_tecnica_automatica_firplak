import { revalidatePath, revalidateTag } from 'next/cache'

export async function POST(req: Request) {
    const secret = process.env.REVALIDATE_SECRET
    const provided = req.headers.get('x-revalidate-secret') || ''

    if (!secret || provided !== secret) {
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Invalidate cached validation sweep (Home + Exceptions).
    revalidateTag('validation-sweep', { expire: 0 })

    // Redundant path invalidation for safety.
    revalidatePath('/')
    revalidatePath('/pending')

    return Response.json({ ok: true })
}
