'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    Package,
    Home,
    Menu,
    FileText,
    Search,
    Settings,
    Image as ImageIcon,
    BookOpen,
    LayoutTemplate,
    AlertCircle
} from 'lucide-react'

import pkg from '../../../package.json'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'

export function Sidebar({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    
    const navItems = [
        { name: 'Inicio', href: '/', icon: Home },
        { name: 'Productos', href: '/products', icon: Package },
        { name: 'Excepciones', href: '/exceptions', icon: AlertCircle },
        { name: 'Plantillas', href: '/templates', icon: LayoutTemplate },
        { name: 'Reglas', href: '/rules', icon: BookOpen },
        { name: 'Recursos', href: '/assets', icon: ImageIcon },
        { name: 'Generar', href: '/generate', icon: FileText },
        { name: 'Configuración', href: '/settings', icon: Settings },
    ]

    return (
        <div className="grid h-screen w-full md:grid-cols-[240px_1fr] lg:grid-cols-[260px_1fr] bg-slate-50 font-sans">
            {/* Desktop Sidebar (Dark B2B Theme) */}
            <div className="hidden border-r border-slate-800 bg-slate-950 md:block shadow-xl z-20 relative">
                <div className="flex h-full max-h-screen flex-col">
                    <div className="flex h-16 items-center px-6 border-b border-slate-800/60">
                        <Link href="/" className="flex items-center gap-3 font-bold text-white tracking-tight transition-opacity hover:opacity-80">
                            <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400 ring-1 ring-indigo-500/30">
                                <Package className="h-5 w-5" />
                            </div>
                            <span className="text-lg">DocGen MVP</span>
                        </Link>
                    </div>
                    <div className="flex-1 overflow-y-auto py-6">
                        <div className="px-4 mb-2">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Menú Principal</p>
                        </div>
                        <nav className="grid items-start px-3 text-sm font-medium gap-1">
                            {navItems.map((item) => {
                                const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/')
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-3 rounded-md px-3 py-2 transition-all duration-200",
                                            isActive 
                                                ? "bg-indigo-500/10 text-indigo-400 font-semibold" 
                                                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                        )}
                                    >
                                        <item.icon className={cn("h-4 w-4", isActive ? "text-indigo-400" : "text-slate-400")} />
                                        {item.name}
                                    </Link>
                                )
                            })}
                        </nav>
                    </div>
                    <div className="mt-auto p-4 border-t border-slate-800/60 bg-slate-950/50">
                        <div className="flex items-center gap-3 bg-slate-900 p-3 rounded-lg border border-slate-800/60 cursor-pointer hover:bg-slate-800 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs ring-1 ring-indigo-500/30">
                                OR
                            </div>
                            <div className="flex flex-col flex-1 overflow-hidden">
                                <span className="text-sm font-medium text-white truncate">Oswaldo Rivera</span>
                                <span className="text-xs text-slate-500 truncate">Admin • v{pkg.version}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-col flex-1 overflow-hidden h-screen">
                {/* Header (Only for Mobile) */}
                <header className="flex md:hidden h-16 items-center gap-4 border-b border-slate-200 bg-white px-4 shadow-sm z-10">
                    <Sheet>
                        <SheetTrigger>
                            <div className="shrink-0 md:hidden flex items-center justify-center border border-slate-200 bg-white rounded-md p-2 w-10 h-10 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors">
                                <Menu className="h-5 w-5 text-slate-600" />
                                <span className="sr-only">Menú</span>
                            </div>
                        </SheetTrigger>
                        <SheetContent side="left" className="flex flex-col p-0 w-72">
                            <div className="flex h-16 items-center px-6 border-b border-slate-100">
                                <Link href="/" className="flex items-center gap-3 font-bold text-slate-800">
                                    <div className="bg-primary/10 p-2 rounded-lg text-primary">
                                        <Package className="h-5 w-5" />
                                    </div>
                                    <span className="text-lg">DocGen MVP</span>
                                </Link>
                            </div>
                            <nav className="grid gap-1 px-4 py-6 text-sm font-medium">
                                {navItems.map((item) => {
                                    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/')
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center gap-3 rounded-md px-3 py-2.5 transition-all",
                                                isActive 
                                                    ? "bg-primary/10 text-primary font-semibold" 
                                                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                                            )}
                                        >
                                            <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-slate-400")} />
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
                <main className="flex-1 overflow-auto bg-slate-50 p-4 md:p-6 lg:p-8">
                    <div className="mx-auto max-w-7xl">
                        {children}
                    </div>
                </main>
            </div>
            <Toaster />
        </div>
    )
}
