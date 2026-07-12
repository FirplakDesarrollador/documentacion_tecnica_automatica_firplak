'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Package, Lock, Mail, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [recoveryLoading, setRecoveryLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const router = useRouter()
    const supabase = createClient()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setNotice(null)

        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            })

            if (authError) {
                setError(authError.message === 'Invalid login credentials' 
                    ? 'Credenciales inválidas. Por favor verifica tu correo y contraseña.' 
                    : authError.message)
                return
            }

            router.push('/')
            router.refresh()
        } catch {
            setError('Ocurrió un error inesperado. Inténtalo de nuevo.')
        } finally {
            setLoading(false)
        }
    }

    const handlePasswordRecovery = async () => {
        const safeEmail = email.trim()
        if (!safeEmail) {
            setError('Ingresa tu correo para enviarte el enlace de recuperacion.')
            setNotice(null)
            return
        }

        setRecoveryLoading(true)
        setError(null)
        setNotice(null)

        try {
            const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/auth/update-password')}`
            const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(safeEmail, { redirectTo })

            if (recoveryError) {
                setError('No se pudo procesar la solicitud de recuperacion. Intentalo de nuevo o contacta a un administrador.')
                return
            }

            setNotice('Si el correo esta autorizado, recibiras un enlace para actualizar tu contrasena.')
        } catch {
            setError('Ocurrio un error inesperado. Intentalo de nuevo.')
        } finally {
            setRecoveryLoading(false)
        }
    }

    return (
        <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background font-sans">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-firplak-green/20 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-firplak-ivory blur-[120px]" />
            </div>

            <div className="w-full max-w-md px-6 py-12 relative z-10">
                <div className="flex flex-col items-center mb-10">
                    <div className="mb-6 rounded-2xl bg-primary p-4 text-white shadow-premium ring-1 ring-primary/15">
                        <Package className="h-10 w-10" />
                    </div>
                    <h1 className="mb-2 text-center text-3xl font-bold tracking-tight text-primary">
                        Ingreso al aplicativo
                    </h1>
                    <p className="max-w-[280px] text-center text-sm text-slate-600">
                        Ingresa con tu usuario autorizado de Supabase para acceder al sistema
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-premium">
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div className="space-y-2">
                            <label className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-600">
                                Correo Electrónico
                            </label>
                            <div className="relative group">
                                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-600" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="ejemplo@firplak.com"
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-3 focus:ring-indigo-500/20"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-600">
                                Contraseña
                            </label>
                            <div className="relative group">
                                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-600" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-3 focus:ring-indigo-500/20"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 animate-in fade-in slide-in-from-top-2">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <p className="text-xs leading-relaxed">{error}</p>
                            </div>
                        )}

                        {notice && (
                            <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-emerald-300 animate-in fade-in slide-in-from-top-2">
                                <CheckCircle2 className="h-5 w-5 shrink-0" />
                                <p className="text-xs leading-relaxed">{notice}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className={cn(
                                "w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold tracking-tight transition-all duration-300 shadow-lg",
                                loading
                                    ? "cursor-not-allowed bg-slate-200 text-slate-500"
                                    : "bg-indigo-600 text-white shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/30 active:scale-[0.98]"
                            )}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <span>Iniciando sesión...</span>
                                </>
                            ) : (
                                "Ingresar"
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={handlePasswordRecovery}
                            disabled={loading || recoveryLoading}
                            className="w-full text-center text-xs font-semibold text-slate-500 transition-colors hover:text-indigo-600 disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                            {recoveryLoading ? 'Enviando enlace...' : 'Olvide mi contrasena'}
                        </button>
                    </form>
                </div>

                <div className="mt-8 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                        Exclusivo para personal de Firplak
                    </p>
                </div>
            </div>
        </div>
    )
}
