'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Package } from 'lucide-react'

import { cn } from '@/lib/utils'

import { completePasswordSetupAction } from './actions'

type PasswordSetupFormProps = {
  userId: string
  token: string
}

export default function PasswordSetupForm({ userId, token }: PasswordSetupFormProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await completePasswordSetupAction({
        userId,
        token,
        password,
        confirmPassword,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setCompleted(true)
      setPassword('')
      setConfirmPassword('')
    } catch {
      setError('No se pudo actualizar la contraseña. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const hasValidLink = Boolean(userId && token)

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background font-sans">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-firplak-green/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-firplak-ivory blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6 py-12">
        <div className="mb-10 flex flex-col items-center">
          <div className="mb-6 rounded-2xl bg-primary p-4 text-white shadow-premium ring-1 ring-primary/15">
            <Package className="h-10 w-10" />
          </div>
          <h1 className="mb-2 text-center text-3xl font-bold tracking-tight text-primary">Crear contraseña</h1>
          <p className="max-w-[320px] text-center text-sm text-slate-600">
            Define tu contraseña para activar o recuperar el acceso a SamiGen.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-premium">
          {completed ? (
            <div className="space-y-5 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <div>
                <h2 className="text-xl font-bold text-primary">Contraseña actualizada correctamente</h2>
                <p className="mt-2 text-sm text-slate-600">Tu acceso ya está activo. Ingresa a SamiGen con tu correo y la nueva contraseña.</p>
              </div>
              <Link
                href="/login"
                className="inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-primary/90"
              >
                Iniciar sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="password" className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Nueva contraseña
                </label>
                <div className="group relative">
                  <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-600" />
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-3 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="confirm-password" className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Confirmar contraseña
                </label>
                <div className="group relative">
                  <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-600" />
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repite la contraseña"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-3 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              {error || !hasValidLink ? (
                <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-700">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p className="text-xs leading-relaxed">
                    {error || 'El enlace de acceso no es válido. Solicita uno nuevo a un administrador.'}
                  </p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading || !hasValidLink}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-bold tracking-tight shadow-lg transition-all duration-300',
                  loading || !hasValidLink
                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                    : 'bg-indigo-600 text-white shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/30 active:scale-[0.98]'
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Actualizando...</span>
                  </>
                ) : (
                  'Guardar contraseña'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
