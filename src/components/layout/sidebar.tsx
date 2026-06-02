'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    Package,
    Home,
    Menu,
    FileText,
    Settings,
    Image as ImageIcon,
    LayoutTemplate,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Database,
    LogOut,
    Loader2,
    Printer,
    RefreshCw,
} from 'lucide-react'

import { useCallback, useRef, useState, useEffect } from 'react'

import pkg from '../../../package.json'
import { getNamingWorkStatusAction, processPendingNamingWorkAction, type NamingWorkStatus } from '@/app/naming/actions'
import { createClient } from '@/utils/supabase/client'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'

export function Sidebar({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [namingStatus, setNamingStatus] = useState<NamingWorkStatus | null>(null)
    const [namingBusy, setNamingBusy] = useState(false)
    const [namingAutoProcessing, setNamingAutoProcessing] = useState(false)
    const namingProcessingRef = useRef(false)

    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        /* eslint-disable react-hooks/set-state-in-effect */
        setMounted(true)
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved !== null) {
            setIsCollapsed(saved === 'true')
        }
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [])

    const refreshNamingStatus = useCallback(async () => {
        if (pathname?.startsWith('/export-render') || pathname === '/login') return
        try {
            const status = await getNamingWorkStatusAction()
            setNamingStatus(status)
        } catch (error) {
            console.error('refreshNamingStatus error:', error)
        }
    }, [pathname])

    useEffect(() => {
        if (!mounted) return
        const initialId = window.setTimeout(() => {
            void refreshNamingStatus()
        }, 0)
        const intervalId = window.setInterval(() => {
            void refreshNamingStatus()
        }, 15000)
        return () => {
            window.clearTimeout(initialId)
            window.clearInterval(intervalId)
        }
    }, [mounted, refreshNamingStatus])

    const processNamingWork = useCallback(async (mode: 'auto' | 'manual' = 'manual') => {
        if (namingProcessingRef.current) return
        namingProcessingRef.current = true
        if (mode === 'manual') setNamingBusy(true)
        if (mode === 'auto') setNamingAutoProcessing(true)
        try {
            const result = await processPendingNamingWorkAction(5000)
            setNamingStatus(result.status)
        } catch (error) {
            console.error('processNamingWork error:', error)
        } finally {
            namingProcessingRef.current = false
            if (mode === 'manual') setNamingBusy(false)
            if (mode === 'auto') setNamingAutoProcessing(false)
        }
    }, [])

    useEffect(() => {
        if (!mounted || !namingStatus?.hasWork) return
        if (pathname?.startsWith('/export-render') || pathname === '/login') return

        const initialId = window.setTimeout(() => {
            void processNamingWork('auto')
        }, 500)
        const intervalId = window.setInterval(() => {
            void processNamingWork('auto')
        }, 7000)

        return () => {
            window.clearTimeout(initialId)
            window.clearInterval(intervalId)
        }
    }, [mounted, namingStatus?.hasWork, pathname, processNamingWork])

    const handleProcessNamingWork = async () => {
        if (!namingStatus?.hasWork) return
        await processNamingWork('manual')
    }

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    const toggleSidebar = () => {
        const newState = !isCollapsed
        setIsCollapsed(newState)
        localStorage.setItem('sidebar-collapsed', String(newState))
    }

    if (!mounted) {
        // Render simple version to avoid hydration flicker
        return (
            <div className="flex h-screen w-full bg-slate-50 font-sans opacity-0">
                <div className="hidden md:block w-[260px] shrink-0 bg-slate-950" />
                <div className="flex-1" />
            </div>
        )
    }
    
    const navItems = [
        { name: 'Inicio', href: '/', icon: Home },
        { name: 'Pendientes', href: '/pending', icon: AlertTriangle },
        { name: 'Plantillas', href: '/templates', icon: LayoutTemplate },
        { name: 'Bases de Datos', href: '/datasets', icon: Database },
        { name: 'Recursos', href: '/assets', icon: ImageIcon },
        { name: 'Generar', href: '/generate', icon: FileText },
        { name: 'Impresión', href: '/print', icon: Printer },
        { name: 'Configuración', href: '/configuration', icon: Settings },
    ]

    // Si estamos en la ruta de exportación headless o en login, NO renderizar Sidebar ni estilos contenedores
    if (pathname?.startsWith('/export-render') || pathname === '/login') {
        return <>{children}</>
    }

    const activeNamingJob = namingStatus?.activeJobs[0] ?? null
    const namingHasWork = Boolean(namingStatus?.hasWork)
    const namingTotal = activeNamingJob?.total_count || namingStatus?.staleTotal || 0
    const namingProcessed = activeNamingJob?.processed_count || 0
    const namingIsProcessing = namingBusy || namingAutoProcessing
    const namingBadgeClass = namingHasWork
        ? 'text-amber-500/90'
        : 'text-emerald-500/90'
    const namingDotClass = namingHasWork
        ? 'bg-amber-500 animate-pulse'
        : 'bg-emerald-500'


    return (
        <>
            <div className="flex h-screen w-full bg-slate-50 font-sans overflow-hidden">
            {/* Desktop Sidebar (Dark B2B Theme) */}
            <div 
                className={cn(
                    "hidden border-r border-slate-800 bg-slate-950 md:flex flex-col shadow-xl z-40 relative transition-all duration-300 ease-in-out shrink-0",
                    isCollapsed ? "w-[80px]" : "w-[240px] lg:w-[260px]"
                )}
            >
                <div className="flex h-full max-h-screen flex-col">
                    <div className="flex h-16 items-center px-6 border-b border-slate-800/60 justify-between">
                        <Link href="/" className={cn("flex items-center gap-3 font-bold text-white tracking-tight transition-opacity hover:opacity-80", isCollapsed && "justify-center px-0")}>
                            <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400 ring-1 ring-indigo-500/30 shrink-0">
                                <Package className="h-5 w-5" />
                            </div>
                            {!isCollapsed && <span className="text-lg truncate">SamiGen</span>}
                        </Link>
                        
                        {!isCollapsed && (
                            <button 
                                onClick={toggleSidebar}
                                className="p-1.5 rounded-md hover:bg-slate-800 text-slate-500 hover:text-white transition-colors"
                                title="Colapsar menú"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                        )}
                        {isCollapsed && (
                             <button 
                                onClick={toggleSidebar}
                                className="absolute -right-3 top-20 bg-slate-800 text-white p-1 rounded-full border border-slate-700 shadow-lg hover:bg-indigo-600 transition-colors z-30"
                                title="Expandir menú"
                             >
                                <ChevronRight className="h-3 w-3" />
                             </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto py-6">
                        <div className={cn("px-4 mb-2", isCollapsed && "px-0 text-center")}>
                            {!isCollapsed ? (
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Menú Principal</p>
                            ) : (
                                <div className="h-px bg-slate-800/60 mx-4 my-2" />
                            )}
                        </div>
                        <nav className="grid items-start px-3 text-sm font-medium gap-1">
                            {navItems.map((item) => {
                                const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/') || (item.href === '/' && (pathname === '/new' || pathname === '/mass-import'))
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        title={isCollapsed ? item.name : undefined}
                                        className={cn(
                                            "group flex items-center rounded-lg px-3 py-2.5 transition-all duration-200 relative",
                                            isActive 
                                                ? "bg-indigo-500/10 text-indigo-400 font-semibold" 
                                                : "text-slate-400 hover:text-white hover:bg-slate-800/40",
                                            isCollapsed ? "justify-center px-2" : "gap-3"
                                        )}
                                    >
                                        {isActive && (
                                            <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-indigo-500 rounded-r-full" />
                                        )}
                                        <item.icon className={cn("h-4 w-4 transition-colors shrink-0", isActive ? "text-indigo-400" : "text-slate-400 group-hover:text-white")} />
                                        {!isCollapsed && <span className="truncate">{item.name}</span>}
                                    </Link>
                                )
                            })}
                        </nav>
                    </div>
                    <div className="mt-auto p-4 border-t border-slate-800/60 bg-slate-950/50">
                        {/* Service Status Indicators */}
                        <div className={cn("flex flex-col gap-2 mb-4 px-2", isCollapsed && "items-center px-0")}>
                            {!isCollapsed ? (
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Estado de Servicios</p>
                            ) : (
                                <div className="h-px bg-slate-800/60 w-full mb-2" />
                            )}
                            
                            {/* DB Status */}
                            <div className={cn("flex items-center justify-between w-full", isCollapsed && "justify-center")}>
                                {!isCollapsed && <span className="text-[11px] text-slate-400">Base de Datos</span>}
                                <div className={cn("flex items-center gap-1.5", isCollapsed && "flex-col gap-0.5")}>
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-emerald-500/90 uppercase">{isCollapsed ? 'DB' : 'Activo'}</span>
                                </div>
                            </div>

                            {/* AI Status */}
                            <div className={cn("flex items-center justify-between w-full", isCollapsed && "justify-center")}>
                                {!isCollapsed && <span className="text-[11px] text-slate-400">I. Artificial</span>}
                                <div className={cn("flex items-center gap-1.5", isCollapsed && "flex-col gap-0.5")}>
                                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500/50" />
                                    <span className="text-[10px] font-bold text-amber-500/70 uppercase">{isCollapsed ? 'IA' : 'En espera'}</span>
                                </div>
                            </div>

                            {/* Storage Status */}
                            <div className={cn("flex items-center justify-between w-full", isCollapsed && "justify-center")}>
                                {!isCollapsed && <span className="text-[11px] text-slate-400">Archivos</span>}
                                <div className={cn("flex items-center gap-1.5", isCollapsed && "flex-col gap-0.5")}>
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-emerald-500/90 uppercase">{isCollapsed ? 'AR' : 'Conectado'}</span>
                                </div>
                            </div>

                            {/* Naming Work Status */}
                            {isCollapsed ? (
                                <button
                                    type="button"
                                    onClick={handleProcessNamingWork}
                                    disabled={namingIsProcessing || !namingHasWork}
                                    title={namingHasWork ? 'Aplicar nomenclatura pendiente' : 'Nomenclatura al dia'}
                                    className="flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-slate-400 transition-colors hover:bg-slate-800/50 disabled:cursor-default disabled:hover:bg-transparent"
                                >
                                    {namingIsProcessing ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                                    ) : (
                                        <div className={cn("h-1.5 w-1.5 rounded-full", namingDotClass)} />
                                    )}
                                    <span className={cn("text-[10px] font-bold uppercase", namingBadgeClass)}>NM</span>
                                </button>
                            ) : (
                                <div className="w-full rounded-lg border border-slate-800/70 bg-slate-900/60 p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] text-slate-400">Nomenclatura</span>
                                        <div className="flex items-center gap-1.5">
                                            <div className={cn("h-1.5 w-1.5 rounded-full", namingDotClass)} />
                                            <span className={cn("text-[10px] font-bold uppercase", namingBadgeClass)}>
                                                {namingIsProcessing ? 'Procesando' : (namingHasWork ? 'Pendiente' : 'Al dia')}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-1 text-[10px] text-slate-500">
                                        {namingHasWork
                                            ? `${namingProcessed} / ${namingTotal} procesados${namingAutoProcessing ? ' - automatico' : ''}`
                                            : 'Sin trabajos pendientes'}
                                    </div>
                                    {namingHasWork && (
                                        <button
                                            type="button"
                                            onClick={handleProcessNamingWork}
                                            disabled={namingIsProcessing}
                                            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-70"
                                        >
                                            {namingIsProcessing ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <RefreshCw className="h-3 w-3" />
                                            )}
                                            {namingIsProcessing ? 'Procesando...' : 'Aplicar pendiente'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className={cn("flex flex-col gap-1", isCollapsed ? "items-center" : "gap-1.5")}>
                            <div className={cn("flex items-center bg-slate-900/50 rounded-lg border border-slate-800/40 cursor-default transition-all", isCollapsed ? "p-1.5 justify-center" : "gap-3 p-3")}>
                                <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xs ring-1 ring-indigo-500/20 shrink-0">
                                    OR
                                </div>
                                {!isCollapsed && (
                                    <div className="flex flex-col flex-1 overflow-hidden">
                                        <span className="text-sm font-medium text-slate-300 truncate font-sans">Firplak I+D</span>
                                        <span className="text-[10px] text-slate-500 truncate uppercase tracking-tight">Admin • v{pkg.version}</span>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleSignOut}
                                className={cn(
                                    "flex items-center rounded-lg px-3 py-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 group",
                                    isCollapsed ? "justify-center" : "gap-3"
                                )}
                                title={isCollapsed ? "Cerrar Sesión" : undefined}
                            >
                                <LogOut className="h-4 w-4 shrink-0 transition-colors" />
                                {!isCollapsed && <span className="text-sm font-medium">Cerrar Sesión</span>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden h-screen relative z-0">
                {/* Header (Only for Mobile) */}
                <header className="flex md:hidden h-16 items-center gap-4 border-b border-slate-200 bg-white px-4 shadow-sm z-10">
                    <Sheet>
                        <SheetTrigger>
                            <div className="shrink-0 md:hidden flex items-center justify-center border border-slate-200 bg-white rounded-md p-2 w-10 h-10 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors">
                                <Menu className="h-5 w-5 text-slate-600" />
                                <span className="sr-only">Menú</span>
                            </div>
                        </SheetTrigger>
                        <SheetContent side="left" className="flex flex-col p-0 w-72 bg-slate-950 border-slate-800">
                            <div className="flex h-16 items-center px-6 border-b border-slate-800/60">
                                <Link href="/" className="flex items-center gap-3 font-bold text-white">
                                    <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400 ring-1 ring-indigo-500/30">
                                        <Package className="h-5 w-5" />
                                    </div>
                                    <span className="text-lg">SamiGen</span>
                                </Link>
                            </div>
                            <nav className="grid gap-1 px-3 py-6 text-sm font-medium">
                                {navItems.map((item) => {
                                    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/') || (item.href === '/' && (pathname === '/new' || pathname === '/mass-import'))
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center gap-3 rounded-lg px-3 py-3 transition-all relative",
                                                isActive 
                                                    ? "bg-indigo-500/10 text-indigo-400 font-semibold" 
                                                    : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                                            )}
                                        >
                                            {isActive && (
                                                <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r-full" />
                                            )}
                                            <item.icon className={cn("h-5 w-5", isActive ? "text-indigo-400" : "text-slate-400")} />
                                            {item.name}
                                        </Link>
                                    )
                                })}
                            </nav>
                        </SheetContent>
                    </Sheet>
                    <div className="w-full flex-1 flex justify-end md:justify-start">
                        {/* Search bar removed per user request */}
                    </div>
                </header>
                
                {/* Main Content */}
                <main className={cn(
                    "flex-1 overflow-auto bg-slate-50 p-4 md:p-6 lg:p-8",
                    pathname?.includes('/builder') && "overflow-hidden flex flex-col h-full p-4"
                )}>
                    <div className={cn(
                        "mx-auto max-w-7xl",
                        pathname?.includes('/builder') && "flex-1 flex flex-col h-full w-full max-w-none"
                    )}>
                        {children}
                    </div>
                </main>
            </div>
            </div>
            <Toaster />
        </>
    )
}
