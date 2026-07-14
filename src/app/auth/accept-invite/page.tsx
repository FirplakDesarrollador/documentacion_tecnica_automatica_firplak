'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, Package } from 'lucide-react'
import Link from 'next/link'

import { createClient } from '@/utils/supabase/client'

export default function AcceptInvitePage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const acceptInvite = async () => {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const inviteError = params.get('error_description')

      // Do not keep one-time session data in the address bar or browser history.
      window.history.replaceState(null, '', window.location.pathname)

      if (!accessToken || !refreshToken) {
        if (active) {
          setError(inviteError || 'El enlace de invitación no es válido o ya expiró. Solicita uno nuevo a un administrador.')
        }
        return
      }

      const { error: sessionError } = await createClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (sessionError) {
        if (active) {
          setError('No se pudo validar la invitación. Solicita un enlace nuevo a un administrador.')
        }
        return
      }

      window.location.replace('/auth/update-password')
    }

    void acceptInvite()

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background font-sans">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-firplak-green/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-firplak-ivory blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6 py-12 text-center">
        <div className="mb-6 inline-flex rounded-2xl bg-primary p-4 text-white shadow-premium ring-1 ring-primary/15">
          <Package className="h-10 w-10" />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-white p-8 shadow-premium">
            <AlertCircle className="mx-auto mb-4 h-8 w-8 text-red-500" />
            <h1 className="text-xl font-bold text-primary">No se pudo abrir la invitación</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{error}</p>
            <Link
              href="/login"
              className="mt-6 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Ir al inicio de sesión
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-premium">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-indigo-600" />
            <h1 className="mt-4 text-xl font-bold text-primary">Validando invitación</h1>
            <p className="mt-2 text-sm text-slate-600">Te llevaremos a crear tu contraseña.</p>
          </div>
        )}
      </div>
    </div>
  )
}
