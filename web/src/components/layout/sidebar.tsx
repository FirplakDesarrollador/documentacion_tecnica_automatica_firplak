import Link from 'next/link'
import {
    Bell,
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'

export function Sidebar({ children }: { children: React.ReactNode }) {
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
        <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
            <div className="hidden border-r bg-muted/40 md:block">
                <div className="flex h-full max-h-screen flex-col gap-2">
                    <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
                        <Link href="/" className="flex items-center gap-2 font-semibold">
                            <Package className="h-6 w-6" />
                            <span className="">DocGen MVP</span>
                        </Link>
                    </div>
                    <div className="flex-1">
                        <nav className="grid items-start px-2 text-sm font-medium lg:px-4 mt-4">
                            {navItems.map((item) => (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                                >
                                    <item.icon className="h-4 w-4" />
                                    {item.name}
                                </Link>
                            ))}
                        </nav>
                    </div>
                    <div className="mt-auto p-4 flex justify-between items-center text-xs text-muted-foreground">
                        <span>v{pkg.version}</span>
                    </div>
                </div>
            </div>
            <div className="flex flex-col">
                <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
                    <Sheet>
                        <SheetTrigger>
                            <div className="shrink-0 md:hidden flex items-center justify-center border bg-background rounded-md p-2 w-10 h-10 hover:bg-accent hover:text-accent-foreground cursor-pointer">
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Menu</span>
                            </div>
                        </SheetTrigger>
                        <SheetContent side="left" className="flex flex-col">
                            <nav className="grid gap-2 text-lg font-medium">
                                <Link
                                    href="/"
                                    className="flex items-center gap-2 text-lg font-semibold"
                                >
                                    <Package className="h-6 w-6" />
                                    <span className="sr-only">DocGen MVP</span>
                                </Link>
                                {navItems.map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className="mx-[-0.65rem] flex items-center gap-4 rounded-xl px-3 py-2 text-muted-foreground hover:text-foreground"
                                    >
                                        <item.icon className="h-5 w-5" />
                                        {item.name}
                                    </Link>
                                ))}
                            </nav>
                        </SheetContent>
                    </Sheet>
                    <div className="w-full flex-1">
                        <form>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Buscar productos..."
                                    className="w-full appearance-none bg-background pl-8 shadow-none md:w-2/3 lg:w-1/3"
                                />
                            </div>
                        </form>
                    </div>
                </header>
                <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-muted/10">
                    {children}
                </main>
            </div>
            <Toaster />
        </div>
    )
}
