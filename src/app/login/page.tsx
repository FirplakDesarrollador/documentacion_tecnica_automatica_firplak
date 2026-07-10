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
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 relative overflow-hidden font-sans">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
            </div>

            <div className="w-full max-w-md px-6 py-12 relative z-10">
                <div className="flex flex-col items-center mb-10">
                    <div className="bg-indigo-500/20 p-4 rounded-2xl text-indigo-400 ring-1 ring-indigo-500/30 mb-6 shadow-xl shadow-indigo-500/10">
                        <Package className="h-10 w-10" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight text-center mb-2">
                        Ingreso al aplicativo
                    </h1>
                    <p className="text-slate-400 text-center text-sm max-w-[280px]">
                        Ingresa con tu usuario autorizado de Supabase para acceder al sistema
                    </p>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-8 rounded-3xl shadow-2xl">
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">
                                Correo Electrónico
                            </label>
                            <div className="relative group">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="ejemplo@firplak.com"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">
                                Contraseña
                            </label>
                            <div className="relative group">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 transition-all"
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
                                    ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 hover:shadow-indigo-600/40 active:scale-[0.98]"
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
                            className="w-full text-center text-xs font-semibold text-slate-400 transition-colors hover:text-indigo-300 disabled:cursor-not-allowed disabled:text-slate-600"
                        >
                            {recoveryLoading ? 'Enviando enlace...' : 'Olvide mi contrasena'}
                        </button>
                    </form>
                </div>

                <div className="mt-8 text-center">
                    <p className="text-[10px] text-slate-600 uppercase tracking-[0.2em] font-bold">
                        Exclusivo para personal de Firplak
                    </p>
                </div>
            </div>
        </div>
    )
}
