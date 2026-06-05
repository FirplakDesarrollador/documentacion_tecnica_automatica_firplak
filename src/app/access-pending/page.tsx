import Link from 'next/link'
import { Clock3 } from 'lucide-react'
import { redirect } from 'next/navigation'

import { USER_ROLE_LABELS } from '@/types/auth'
import { getAccessContext } from '@/utils/auth/access'

export const dynamic = 'force-dynamic'

export default async function AccessPendingPage() {
    const access = await getAccessContext()

    if (!access.user) {
        redirect('/login')
    }

    if (access.role === 'admin') {
        redirect('/')
    }

    if (access.role === 'production') {
        redirect('/print')
    }

    return (
        <div className="flex min-h-full items-center justify-center py-10">
            <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                            <Clock3 className="h-7 w-7" />
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Acceso restringido</p>
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Tu cuenta aun no tiene modulos habilitados</h1>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm text-slate-600">
                            Sesion iniciada como <span className="font-semibold text-slate-900">{access.user.email || 'usuario autenticado'}</span>.
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                            Rol detectado: <span className="font-semibold text-slate-900">{USER_ROLE_LABELS[access.role]}</span>.
                        </p>
                        <p className="mt-4 text-sm leading-relaxed text-slate-600">
                            En esta primera version solo estan habilitados los roles <span className="font-semibold text-slate-900">Admin</span> y
                            <span className="font-semibold text-slate-900"> Produccion</span>. Si tu cuenta debe acceder al sistema, un administrador
                            debe asignarte el rol correcto en Supabase.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            href="/login"
                            className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                        >
                            Volver al login
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
