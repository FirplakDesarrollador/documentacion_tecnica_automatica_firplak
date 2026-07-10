'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Package } from 'lucide-react'

import { cn } from '@/lib/utils'
import { createClient } from '@/utils/supabase/client'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        setError('No se pudo actualizar la contrasena. El enlace pudo expirar; solicita uno nuevo.')
        return
      }

      setSuccess('Contrasena actualizada correctamente.')
      router.push('/')
      router.refresh()
    } catch {
      setError('Ocurrio un error inesperado. Intentalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950 font-sans">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6 py-12">
        <div className="mb-10 flex flex-col items-center">
          <div className="mb-6 rounded-2xl bg-indigo-500/20 p-4 text-indigo-400 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500/30">
            <Package className="h-10 w-10" />
          </div>
          <h1 className="mb-2 text-center text-3xl font-bold tracking-tight text-white">
            Actualizar contrasena
          </h1>
          <p className="max-w-[300px] text-center text-sm text-slate-400">
            Define una nueva contrasena para completar tu invitacion o recuperacion de acceso.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/40 p-8 shadow-2xl backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Nueva contrasena
              </label>
              <div className="group relative">
                <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-400" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimo 8 caracteres"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-3 pl-10 pr-4 text-slate-200 transition-all placeholder:text-slate-600 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Confirmar contrasena
              </label>
              <div className="group relative">
                <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-400" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repite la contrasena"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-3 pl-10 pr-4 text-slate-200 transition-all placeholder:text-slate-600 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
            </div>

            {error ? (
              <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="text-xs leading-relaxed">{error}</p>
              </div>
            ) : null}

            {success ? (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-300">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <p className="text-xs leading-relaxed">{success}</p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-bold tracking-tight shadow-lg transition-all duration-300',
                loading
                  ? 'cursor-not-allowed bg-slate-800 text-slate-500'
                  : 'bg-indigo-600 text-white shadow-indigo-600/20 hover:bg-indigo-500 hover:shadow-indigo-600/40 active:scale-[0.98]'
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Actualizando...</span>
                </>
              ) : (
                'Actualizar contrasena'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
