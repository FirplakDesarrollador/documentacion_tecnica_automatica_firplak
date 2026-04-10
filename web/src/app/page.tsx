import { dbQuery } from '@/lib/supabase'
import Link from 'next/link'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Package, AlertCircle, LayoutTemplate, GitMerge, FileImage, 
  FileText, PlusCircle, Upload, ArrowRight, Settings2, DatabaseZap
} from 'lucide-react'
import { cn } from '@/lib/utils'

import { getFullValidationSweep } from '@/lib/engine/validationActions'

export default async function Home() {
  // Fetch real KPIs and validation state
  const validationSummary = await getFullValidationSweep()
  
  const kpiRows = await dbQuery(`
    SELECT
      (SELECT COUNT(*) FROM public.cabinet_products) as total_products,
      (SELECT COUNT(*) FROM public.plantillas_doc_tec WHERE active = true) as active_templates
  `)
  
  const kpi = kpiRows?.[0] || {}
  const totalProducts = parseInt(kpi.total_products || '0')
  const incompleteProducts = validationSummary.incompleteProductsCount
  const openExceptions = validationSummary.exceptionsCount
  const activeTemplates = parseInt(kpi.active_templates || '0')

  // Recent activity
  const recentProducts = await dbQuery(`
    SELECT id, code, final_name_es, validation_status, updated_at
    FROM public.cabinet_products
    ORDER BY updated_at DESC
    LIMIT 5
  `) || []

  // Mock data for unconnected features
  const generatedDocs = 48

  const modules = [
    {
      title: "Productos",
      description: "Base maestra, catálogo y etiquetas",
      icon: <Package className="h-6 w-6 text-indigo-500" />,
      href: "/products",
      color: "bg-indigo-50 border-indigo-100"
    },
    {
      title: "Excepciones",
      description: "Revisión de anomalías o incidencias",
      icon: <AlertCircle className="h-6 w-6 text-rose-500" />,
      href: "/exceptions",
      color: "bg-rose-50 border-rose-100"
    },
    {
      title: "Plantillas",
      description: "Diseñador visual de documentos",
      icon: <LayoutTemplate className="h-6 w-6 text-emerald-500" />,
      href: "/templates",
      color: "bg-emerald-50 border-emerald-100"
    },
    {
      title: "Reglas",
      description: "Motor de lógica y automatización",
      icon: <GitMerge className="h-6 w-6 text-blue-500" />,
      href: "/rules",
      color: "bg-blue-50 border-blue-100"
    },
    {
      title: "Recursos",
      description: "Librería de íconos, logos y SVG",
      icon: <FileImage className="h-6 w-6 text-amber-500" />,
      href: "/assets",
      color: "bg-amber-50 border-amber-100"
    },
    {
      title: "Generar",
      description: "Exportación masiva de documentos",
      icon: <FileText className="h-6 w-6 text-purple-500" />,
      href: "/generate",
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
            Tu espacio de trabajo central para la gestión técnica y automatización de documentación.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/products">
            <Button variant="outline" className="h-12 px-6 shadow-sm border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold">
              <Upload className="mr-2 h-4 w-4 text-slate-400" />
              Importar CSV
            </Button>
          </Link>
          <Link href="/templates/new">
            <Button variant="secondary" className="h-12 px-6 shadow-sm font-semibold">
              <LayoutTemplate className="mr-2 h-4 w-4 text-indigo-500" />
              Crear plantilla
            </Button>
          </Link>
          <Link href="/products/new">
            <Button className="h-12 px-6 shadow-md font-semibold bg-indigo-600 hover:bg-indigo-700 transition-all">
              <PlusCircle className="mr-2 h-4 w-4" />
              Agregar producto
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
              <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Incompletos</p>
              <div className="p-1.5 bg-amber-50 rounded-md">
                <DatabaseZap className="h-4 w-4 text-amber-500" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 mt-3 tabular-nums">{incompleteProducts}</div>
            <p className="text-[10px] text-amber-600 mt-1 font-bold">ACCION REQUERIDA</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-slate-200/60 rounded-xl overflow-hidden group hover:shadow-premium transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Excepciones</p>
              <div className="p-1.5 bg-rose-50 rounded-md">
                <AlertCircle className="h-4 w-4 text-rose-500" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 mt-3 tabular-nums">{openExceptions}</div>
            <p className="text-[10px] text-rose-600 mt-1 font-bold">CASOS PENDIENTES</p>
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
          <h2 className="text-xl font-bold text-slate-900">Accesos Rápidos</h2>
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
                <span className="text-sm font-semibold text-slate-700">Últimos Productos Editados</span>
                <Link href="/products" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Ver todos</Link>
              </div>
              <div className="divide-y divide-slate-100">
                {recentProducts.length > 0 ? recentProducts.map((p: any) => (
                  <div key={p.id} className="p-4 flex flex-col gap-1 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <Link href={`/products/${p.id}`} className="font-semibold text-sm text-slate-900 hover:text-indigo-600 truncate max-w-[180px] transition-colors">
                        {p.code}
                      </Link>
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
                <span className="text-sm font-semibold text-slate-700">Excepciones Pendientes</span>
                <Link href="/exceptions" className="text-xs font-semibold text-rose-600 hover:text-rose-700">Atender</Link>
              </div>
              <div className="p-4 flex items-center gap-3">
                 <div className="h-8 w-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                 </div>
                 <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-900">3 anomalías detectadas</span>
                    <span className="text-xs text-slate-500">En el último proceso de importación</span>
                 </div>
              </div>

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
