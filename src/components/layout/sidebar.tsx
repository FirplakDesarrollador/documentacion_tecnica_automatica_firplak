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
    Search,
} from 'lucide-react'

import { useCallback, useEffect, useRef, useState } from 'react'

import pkg from '../../../package.json'
import { getNamingWorkStatusAction, processPendingNamingWorkAction, type NamingWorkStatus } from '@/app/naming/actions'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { GENERATE_LAST_URL_STORAGE_KEY, normalizeGenerateLastUrl } from '@/lib/navigation/generateLastUrl'
import { type Permission, type UserRole } from '@/types/auth'
import { createClient } from '@/utils/supabase/client'

type SidebarAccess = {
    user: {
        id: string
        email: string | null
    } | null
    role: UserRole
    roleLabel: string
    permissions: Permission[]
    isAuthenticated: boolean
}

type NavItem = {
    name: string
    href: string
    icon: typeof Home
    permission: Permission
}

const NAV_ITEMS: NavItem[] = [
    { name: 'Inicio', href: '/', icon: Home, permission: 'module:dashboard' },
    { name: 'Pendientes', href: '/pending', icon: AlertTriangle, permission: 'module:pending' },
    { name: 'Plantillas', href: '/templates', icon: LayoutTemplate, permission: 'module:templates' },
    { name: 'Bases de Datos', href: '/datasets', icon: Database, permission: 'module:datasets' },
    { name: 'Recursos', href: '/assets', icon: ImageIcon, permission: 'module:assets' },
    { name: 'Generar', href: '/generate', icon: FileText, permission: 'module:generate' },
    { name: 'Impresion', href: '/print', icon: Printer, permission: 'module:print' },
    { name: 'Diseño de producto', href: '/product-design', icon: Package, permission: 'module:product-design' },
    { name: 'Modulos productivos', href: '/productive-modules', icon: Database, permission: 'module:productive-modules' },
    { name: 'Configuracion', href: '/configuration', icon: Settings, permission: 'module:configuration' },
    { name: 'Consulta SAP', href: '/consulta-sap', icon: Search, permission: 'module:consulta-sap' },
]

function getUserInitials(email: string | null, roleLabel: string) {
    const source = (email || roleLabel).trim()
    if (!source) return 'SG'

    const parts = source.split(/[\s@._-]+/).filter(Boolean)
    const first = parts[0]?.[0] || 'S'
    const second = parts[1]?.[0] || parts[0]?.[1] || 'G'
    return `${first}${second}`.toUpperCase()
}

function isItemActive(pathname: string, href: string) {
    return pathname === href
        || (pathname.startsWith(href) && href !== '/')
        || (href === '/' && (pathname === '/new' || pathname === '/mass-import'))
}

function isStandaloneRoute(pathname: string | null) {
    return pathname?.startsWith('/export-render') || pathname === '/login' || pathname?.startsWith('/auth')
}

export function Sidebar({
    children,
    access,
    initialGenerateHref = '/generate',
}: {
    children: React.ReactNode
    access: SidebarAccess
    initialGenerateHref?: string
}) {
    const pathname = usePathname()
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [namingStatus, setNamingStatus] = useState<NamingWorkStatus | null>(null)
    const [namingBusy, setNamingBusy] = useState(false)
    const [namingAutoProcessing, setNamingAutoProcessing] = useState(false)
    const namingProcessingRef = useRef(false)

    const router = useRouter()
    const supabase = createClient()
    const visibleNavItems = NAV_ITEMS.filter((item) => access.permissions.includes(item.permission))
    const roleLabel = access.roleLabel
    const userEmail = access.user?.email ?? null
    const userInitials = getUserInitials(userEmail, roleLabel)
    const canManageNaming = access.permissions.includes('action:naming:manage')
    useEffect(() => {
        const saved = localStorage.getItem('sidebar-collapsed')

        queueMicrotask(() => {
            setMounted(true)
            if (saved !== null) {
                setIsCollapsed(saved === 'true')
            }
        })
    }, [])
    const generateHref = mounted
        ? normalizeGenerateLastUrl(window.localStorage.getItem(GENERATE_LAST_URL_STORAGE_KEY)) ?? initialGenerateHref
        : initialGenerateHref

    const refreshNamingStatus = useCallback(async () => {
        if (!canManageNaming || isStandaloneRoute(pathname)) return
        try {
            const status = await getNamingWorkStatusAction()
            setNamingStatus(status)
        } catch (error) {
            console.error('refreshNamingStatus error:', error)
        }
    }, [canManageNaming, pathname])

    useEffect(() => {
        if (!mounted || !canManageNaming) return

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
    }, [canManageNaming, mounted, refreshNamingStatus])

    const processNamingWork = useCallback(async (mode: 'auto' | 'manual' = 'manual') => {
        if (namingProcessingRef.current || !canManageNaming) return

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
    }, [canManageNaming])

    useEffect(() => {
        if (!mounted || !canManageNaming || !namingStatus?.hasWork) return
        if (isStandaloneRoute(pathname)) return

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
    }, [canManageNaming, mounted, namingStatus?.hasWork, pathname, processNamingWork])

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
        return (
            <div className="flex h-screen w-full bg-background font-sans opacity-0">
                <div className="hidden w-[260px] shrink-0 bg-sidebar md:block" />
                <div className="flex-1" />
            </div>
        )
    }

    if (isStandaloneRoute(pathname)) {
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
            <div className="flex h-screen w-full overflow-hidden bg-background font-sans">
                <div
                    className={cn(
                        'relative z-40 hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar shadow-[8px_0_32px_-24px_rgba(22,44,57,0.55)] transition-all duration-300 ease-in-out md:flex',
                        isCollapsed ? 'w-[80px]' : 'w-[240px] lg:w-[260px]'
                    )}
                >
                    <div className="flex h-full max-h-screen flex-col">
                        <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
                            <Link href={access.role === 'production' ? '/print' : '/'} className={cn('flex items-center gap-3 font-bold tracking-tight text-sidebar-foreground transition-opacity hover:opacity-85', isCollapsed && 'justify-center px-0')}>
                                <div className="shrink-0 rounded-lg bg-white/10 p-2 text-firplak-ivory ring-1 ring-white/15">
                                    <Package className="h-5 w-5" />
                                </div>
                                {!isCollapsed && <span className="text-lg truncate">SamiGen</span>}
                            </Link>

                            {!isCollapsed && (
                                <button
                                    onClick={toggleSidebar}
                                    className="rounded-md p-1.5 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                                    title="Colapsar menu"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                            )}
                            {isCollapsed && (
                                <button
                                    onClick={toggleSidebar}
                                    className="absolute -right-3 top-20 z-30 rounded-full border border-white/15 bg-sidebar-accent p-1 text-white shadow-lg transition-colors hover:bg-firplak-green"
                                    title="Expandir menu"
                                >
                                    <ChevronRight className="h-3 w-3" />
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto py-6">
                            {visibleNavItems.length > 0 && (
                                <>
                                    <div className={cn('px-4 mb-2', isCollapsed && 'px-0 text-center')}>
                                        {!isCollapsed ? (
                                            <p className="text-xs font-semibold uppercase tracking-wider text-white/55">Menu principal</p>
                                        ) : (
                                            <div className="mx-4 my-2 h-px bg-white/10" />
                                        )}
                                    </div>
                                    <nav className="grid items-start px-3 text-sm font-medium gap-1">
                                        {visibleNavItems.map((item) => {
                                            const itemHref = item.permission === 'module:generate' ? generateHref : item.href
                                            const isActive = isItemActive(pathname, item.href)
                                            return (
                                                <Link
                                                    key={item.name}
                                                    href={itemHref}
                                                    title={isCollapsed ? item.name : undefined}
                                                    className={cn(
                                                        'group relative flex items-center rounded-lg px-3 py-2.5 transition-all duration-200',
                                                        isActive
                                                            ? 'bg-white/10 font-semibold text-white ring-1 ring-white/10'
                                                            : 'text-white/65 hover:bg-white/10 hover:text-white',
                                                        isCollapsed ? 'justify-center px-2' : 'gap-3'
                                                    )}
                                                >
                                                    {isActive && (
                                                        <div className="absolute bottom-1.5 left-0 top-1.5 w-1 rounded-r-full bg-firplak-green" />
                                                    )}
                                                    <item.icon className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-firplak-ivory' : 'text-white/60 group-hover:text-white')} />
                                                    {!isCollapsed && <span className="truncate">{item.name}</span>}
                                                </Link>
                                            )
                                        })}
                                    </nav>
                                </>
                            )}
                        </div>

                        <div className="mt-auto border-t border-white/10 bg-black/5 p-4">
                            {canManageNaming && (
                                        isCollapsed ? (
                                            <button
                                                type="button"
                                                onClick={handleProcessNamingWork}
                                                disabled={namingIsProcessing || !namingHasWork}
                                                title={namingHasWork ? 'Aplicar nomenclatura pendiente' : 'Nomenclatura al dia'}
                                                className="flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-white/60 transition-colors hover:bg-white/10 disabled:cursor-default disabled:hover:bg-transparent"
                                            >
                                                {namingIsProcessing ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                                                ) : (
                                                    <div className={cn('h-1.5 w-1.5 rounded-full', namingDotClass)} />
                                                )}
                                                <span className={cn('text-[10px] font-bold uppercase', namingBadgeClass)}>NM</span>
                                            </button>
                                        ) : (
                                            <div className="w-full rounded-lg border border-white/10 bg-black/10 p-2.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[11px] text-white/65">Nomenclatura</span>
                                                    <div className="flex items-center gap-1.5">
                                                        <div className={cn('h-1.5 w-1.5 rounded-full', namingDotClass)} />
                                                        <span className={cn('text-[10px] font-bold uppercase', namingBadgeClass)}>
                                                            {namingIsProcessing ? 'Procesando' : (namingHasWork ? 'Pendiente' : 'Al dia')}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="mt-1 text-[10px] text-white/45">
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
                                        )
                                    )}

                            <div className={cn('flex flex-col gap-1', isCollapsed ? 'items-center' : 'gap-1.5')}>
                                <div className={cn('flex cursor-default items-center rounded-lg border border-white/10 bg-black/10 transition-all', isCollapsed ? 'p-1.5 justify-center' : 'gap-3 p-3')}>
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-firplak-ivory ring-1 ring-white/15">
                                        {userInitials}
                                    </div>
                                    {!isCollapsed && (
                                        <div className="flex flex-col flex-1 overflow-hidden">
                                            <span className="text-sm font-medium text-slate-300 truncate font-sans">{userEmail || 'Sesion autenticada'}</span>
                                            <span className="text-[10px] text-slate-500 truncate uppercase tracking-tight">{roleLabel} • v{pkg.version}</span>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleSignOut}
                                    className={cn(
                                        'group flex items-center rounded-lg px-3 py-2 text-white/65 transition-all duration-200 hover:bg-red-500/10 hover:text-red-300',
                                        isCollapsed ? 'justify-center' : 'gap-3'
                                    )}
                                    title={isCollapsed ? 'Cerrar sesion' : undefined}
                                >
                                    <LogOut className="h-4 w-4 shrink-0 transition-colors" />
                                    {!isCollapsed && <span className="text-sm font-medium">Cerrar sesion</span>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col flex-1 min-w-0 overflow-hidden h-screen relative z-0">
                    <header className="z-10 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/95 px-4 shadow-sm md:hidden">
                        <Sheet>
                            <SheetTrigger>
                                <div className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white p-2 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-primary md:hidden">
                                    <Menu className="h-5 w-5 text-slate-600" />
                                    <span className="sr-only">Menu</span>
                                </div>
                            </SheetTrigger>
                            <SheetContent side="left" className="flex w-72 flex-col border-sidebar-border bg-sidebar p-0">
                                <div className="flex h-16 items-center border-b border-white/10 px-6">
                                    <Link href={access.role === 'production' ? '/print' : '/'} className="flex items-center gap-3 font-bold text-sidebar-foreground">
                                        <div className="rounded-lg bg-white/10 p-2 text-firplak-ivory ring-1 ring-white/15">
                                            <Package className="h-5 w-5" />
                                        </div>
                                        <span className="text-lg">SamiGen</span>
                                    </Link>
                                </div>
                                <nav className="grid gap-1 px-3 py-6 text-sm font-medium">
                                    {visibleNavItems.map((item) => {
                                        const itemHref = item.permission === 'module:generate' ? generateHref : item.href
                                        const isActive = isItemActive(pathname, item.href)
                                        return (
                                            <Link
                                                key={item.href}
                                                href={itemHref}
                                                className={cn(
                                                    'flex items-center gap-3 rounded-lg px-3 py-3 transition-all relative',
                                                    isActive
                                                        ? 'bg-white/10 font-semibold text-white ring-1 ring-white/10'
                                                        : 'text-white/65 hover:bg-white/10 hover:text-white'
                                                )}
                                            >
                                                {isActive && (
                                                    <div className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-firplak-green" />
                                                )}
                                                <item.icon className={cn('h-5 w-5', isActive ? 'text-firplak-ivory' : 'text-white/60')} />
                                                {item.name}
                                            </Link>
                                        )
                                    })}
                                </nav>
                            </SheetContent>
                        </Sheet>
                        <div className="w-full flex-1 flex justify-end md:justify-start" />
                    </header>

                    <main className={cn(
                        'flex-1 overflow-auto bg-background p-4 md:p-6 lg:p-8',
                        pathname?.includes('/builder') && 'overflow-hidden flex flex-col h-full p-4'
                    )}>
                        <div className={cn(
                            'mx-auto max-w-7xl',
                            pathname?.includes('/builder') && 'flex-1 flex flex-col h-full w-full max-w-none'
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
