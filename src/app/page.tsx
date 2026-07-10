import { dbQuery } from '@/lib/supabase'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Package, AlertTriangle, LayoutTemplate, GitMerge, FileImage, 
  FileText, PlusCircle, ArrowRight, Upload
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { decodeGenerateLastUrl, GENERATE_LAST_URL_COOKIE } from '@/lib/navigation/generateLastUrl'

import { getPendingStructuralSummary } from '@/lib/engine/pendingStructural'
import { requirePagePermission } from '@/utils/auth/access'

interface RecentProduct {
  id: string
  code: string
  final_name_es: string | null
  validation_status: string
  updated_at: string
}

export default async function Home() {
  const cookieStore = await cookies()
  const generateHref =
    decodeGenerateLastUrl(cookieStore.get(GENERATE_LAST_URL_COOKIE)?.value) ?? '/generate'

  await requirePagePermission('module:dashboard')

  // Fetch real KPIs and validation state
  const pendingSummary = await getPendingStructuralSummary()
  
  const kpiRows = await dbQuery(`
    SELECT
      (SELECT COUNT(*) FROM public.product_skus) as total_products,
      (SELECT COUNT(*) FROM public.plantillas_doc_tec WHERE active = true) as active_templates
  `)
  
  const kpi = kpiRows?.[0] || {}
  const totalProducts = parseInt(kpi.total_products || '0')
  const pendingCount = pendingSummary.pendingCount
  const pendingCriticalCount = pendingSummary.criticalCount
  const activeTemplates = parseInt(kpi.active_templates || '0')

  // Recent activity
  const recentProducts = await dbQuery(`
    SELECT s.id, s.sku_complete as code, s.final_complete_name_es as final_name_es, v.validation_status, s.updated_at
    FROM public.product_skus s
    JOIN public.product_versions v ON s.version_id = v.id
    ORDER BY s.updated_at DESC
    LIMIT 5
  `) || []

  // Mock data for unconnected features
  const generatedDocs = 48

  const modules = [
    {
      title: "Pendientes",
      description: "Reporte de faltantes e incidencias",
      icon: <AlertTriangle className="h-6 w-6 text-amber-600" />,
      href: "/pending",
      color: "bg-amber-50 border-amber-100"
    },
    {
      title: "Plantillas",
      description: "Disenador visual de documentos",
      icon: <LayoutTemplate className="h-6 w-6 text-emerald-500" />,
      href: "/templates",
      color: "bg-emerald-50 border-emerald-100"
    },
    {
      title: "Configuracion",
      description: "Ajustes, diccionarios y reglas",
      icon: <GitMerge className="h-6 w-6 text-blue-500" />,
      href: "/configuration",
      color: "bg-blue-50 border-blue-100"
    },
    {
      title: "Recursos",
      description: "Libreria de iconos, logos y SVG",
      icon: <FileImage className="h-6 w-6 text-amber-500" />,
      href: "/assets",
      color: "bg-amber-50 border-amber-100"
    },
    {
      title: "Generar",
      description: "Exportacion masiva de documentos",
      icon: <FileText className="h-6 w-6 text-purple-500" />,
      href: generateHref,
      color: "bg-purple-50 border-purple-100"
    }
  ]

  return (
    <div className="flex flex-col gap-8 text-foreground pb-10">
      
      {/* Header & Primary Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-white p-8 rounded-2xl border border-slate-200 shadow-soft">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 font-sans">Panel principal</h1>
          <p className="text-slate-500 mt-2 text-lg max-w-lg leading-relaxed font-sans">
            Tu espacio de trabajo central para la gestion tecnica y automatizacion de documentacion.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/new">
            <Button className="h-12 px-6 shadow-md font-semibold bg-indigo-600 hover:bg-indigo-700 transition-all">
              <PlusCircle className="mr-2 h-4 w-4" />
              Agregar producto
            </Button>
          </Link>
          <Link href="/mass-import">
            <Button variant="outline" className="h-12 px-6 shadow-md font-semibold border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-all">
              <Upload className="mr-2 h-4 w-4" />
              Carga masiva
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-soft border-slate-200/60 rounded-xl overflow-hidden group hover:shadow-premium transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Productos Totales</p>
              <div className="p-1.5 bg-slate-100 rounded-md group-hover:bg-indigo-50 transition-colors">
                <Package className="h-4 w-4 text-slate-400 group-hover:text-indigo-500" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 mt-3 tabular-nums">{totalProducts}</div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium italic">Base maestra consolidada</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-slate-200/60 rounded-xl overflow-hidden group hover:shadow-premium transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Pendientes</p>
              <div className="p-1.5 bg-amber-50 rounded-md">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 mt-3 tabular-nums">{pendingCount}</div>
            <p className="text-[10px] text-amber-700 mt-1 font-bold">ACCION REQUERIDA</p>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">Criticos: {pendingCriticalCount}</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-slate-200/60 rounded-xl overflow-hidden group hover:shadow-premium transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Plantillas Activas</p>
              <div className="p-1.5 bg-emerald-50 rounded-md">
                <LayoutTemplate className="h-4 w-4 text-emerald-500" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 mt-3 tabular-nums">{activeTemplates}</div>
            <p className="text-[10px] text-emerald-600 mt-1 font-bold">SISTEMA LISTO</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-slate-200/60 rounded-xl overflow-hidden group hover:shadow-premium transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Docs. Generados</p>
              <div className="p-1.5 bg-purple-50 rounded-md">
                <FileText className="h-4 w-4 text-purple-500" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 mt-3 tabular-nums">{generatedDocs}</div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">Historial 24h</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Modules Grid */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <h2 className="text-xl font-bold text-slate-900">Accesos Rapidos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {modules.map((m) => (
              <Link key={m.href} href={m.href} className="group outline-none">
                <Card className="relative overflow-hidden shadow-soft hover:shadow-premium border-slate-200 hover:border-indigo-300 transition-all duration-200 cursor-pointer h-full group-focus-visible:ring-2 group-focus-visible:ring-indigo-500 group-focus-visible:ring-offset-2">
                  <CardContent className="p-6 flex items-start gap-4 h-full">
                    <div className={`p-3 rounded-xl border ${m.color}`}>
                      {m.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">{m.title}</h3>
                      <p className="text-sm text-slate-500 mt-1 leading-snug">{m.description}</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-indigo-500 group-hover:-translate-x-1 transition-all self-center absolute right-6 opacity-0 group-hover:opacity-100 group-hover:translate-x-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity / Pending Work */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-slate-900">Actividad Reciente</h2>
          <Card className="shadow-soft border-slate-200 h-full">
            <CardContent className="p-0 overflow-hidden">
              <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex justify-between items-center">
                <span className="text-sm font-semibold text-slate-700">Ultimos Productos Editados</span>
              </div>
              <div className="divide-y divide-slate-100">
                {recentProducts.length > 0 ? recentProducts.map((p: RecentProduct) => (
                  <div key={p.id} className="p-4 flex flex-col gap-1 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-sm text-slate-900 truncate max-w-[180px]">
                        {p.code}
                      </span>
                      <Badge
                        className={cn(
                          "text-[9px] px-1.5 py-0 h-4 font-bold uppercase tracking-tight ring-1 ring-inset",
                          p.validation_status === 'ready'
                            ? "bg-indigo-50 text-indigo-700 ring-indigo-700/10 hover:bg-indigo-50"
                            : p.validation_status === 'needs_review'
                              ? "bg-rose-50 text-rose-700 ring-rose-700/10 hover:bg-rose-50"
                              : "bg-slate-50 text-slate-600 ring-slate-600/10 hover:bg-slate-50"
                        )}
                      >
                        {p.validation_status === 'incomplete' ? 'Incompleto' : p.validation_status === 'needs_review' ? 'Revisar' : 'Listo'}
                      </Badge>
                    </div>
                    <span className="text-xs text-slate-500 truncate">{p.final_name_es || 'Sin nombre'}</span>
                  </div>
                )) : (
                  <div className="p-8 text-center text-slate-500 text-sm">No hay productos recientes.</div>
                )}
              </div>
              
              <div className="p-4 bg-slate-50/80 border-y border-slate-100 flex justify-between items-center mt-2">
                <span className="text-sm font-semibold text-slate-700">Pendientes</span>
                <Link href="/pending" className="text-xs font-semibold text-amber-700 hover:text-amber-800">Ver reporte</Link>
              </div>
              <div className="p-4 flex items-center gap-3">
                 <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                 </div>
                 <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-900">{pendingCount} pendientes detectados</span>
                    <span className="text-xs text-slate-500">Criticos: {pendingCriticalCount}</span>
                 </div>
              </div>

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
