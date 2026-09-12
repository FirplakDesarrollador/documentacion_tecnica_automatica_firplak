import { dbQuery } from '@/lib/supabase'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Package, AlertTriangle, LayoutTemplate,
  PlusCircle, ArrowRight, Upload, Printer
} from 'lucide-react'
import { hasModuleAccess } from '@/types/auth'
import { decodeGenerateLastUrl, GENERATE_LAST_URL_COOKIE } from '@/lib/navigation/generateLastUrl'
import {
  getNavigationHref,
  resolveModuleNavigationTree,
  type ResolvedModuleNavigationNode,
} from '@/lib/navigation/moduleHierarchy'

import { getPendingStructuralSummary } from '@/lib/engine/pendingStructural'
import { requirePagePermission } from '@/utils/auth/access'
import { getDashboardActivityFeed } from '@/lib/dashboard/activityFeed'
import { formatActivityRelativeTime } from '@/lib/dashboard/activityFeedUtils'

const QUICK_ACTION_IDS = [
  'sap-consulting',
  'transfer-requests',
  'generate',
  'print',
  'templates',
  'datasets',
] as const

function findNavigationNodes(
  nodes: readonly ResolvedModuleNavigationNode[],
  ids: readonly string[],
): ResolvedModuleNavigationNode[] {
  const matches: ResolvedModuleNavigationNode[] = []

  for (const node of nodes) {
    if (ids.includes(node.id)) matches.push(node)
    matches.push(...findNavigationNodes(node.children, ids))
  }

  return matches
}

export default async function Home() {
  const access = await requirePagePermission('module:dashboard')
  const cookieStore = await cookies()
  const generateHref =
    decodeGenerateLastUrl(cookieStore.get(GENERATE_LAST_URL_COOKIE)?.value) ?? '/generate'

  const navigationTree = resolveModuleNavigationTree(access.permissions, access.isAdmin)
  const availableQuickActions = findNavigationNodes(navigationTree, QUICK_ACTION_IDS)
  const quickActionNodes = QUICK_ACTION_IDS.flatMap((id) =>
    availableQuickActions.filter((action) => action.id === id),
  )

  // Fetch real KPIs and validation state
  const pendingSummary = await getPendingStructuralSummary()
  
  const kpiRows = await dbQuery(`
    SELECT
      (SELECT COUNT(*) FROM public.product_skus) as total_products,
      (SELECT COUNT(*) FROM public.plantillas_doc_tec WHERE active = true) as active_templates,
      (SELECT COALESCE(SUM(copies), 0) FROM public.print_activity_events
       WHERE status = 'accepted' AND created_at >= now() - interval '30 days') as print_count
  `)
  
  const kpi = kpiRows?.[0] || {}
  const totalProducts = parseInt(kpi.total_products || '0')
  const pendingCount = pendingSummary.pendingCount
  const pendingCriticalCount = pendingSummary.criticalCount
  const activeTemplates = parseInt(kpi.active_templates || '0')
  const printCount = parseInt(kpi.print_count || '0')

  const activity = await getDashboardActivityFeed(access.permissions)

  const canAccessPending = hasModuleAccess(access.permissions, 'module:pending')

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

        {canAccessPending ? (
          <Link href="/pending" aria-label="Abrir pendientes" className="group outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded-xl">
            <Card className="h-full shadow-soft border-slate-200/60 rounded-xl overflow-hidden group-hover:shadow-premium transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between space-y-0 pb-2">
                  <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Pendientes</p>
                  <div className="p-1.5 bg-amber-50 rounded-md"><AlertTriangle className="h-4 w-4 text-amber-600" /></div>
                </div>
                <div className="text-3xl font-extrabold text-slate-900 mt-3 tabular-nums">{pendingCount}</div>
                <p className="text-[10px] text-amber-700 mt-1 font-bold">ACCION REQUERIDA</p>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">Criticos: {pendingCriticalCount}</p>
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Card className="shadow-soft border-slate-200/60 rounded-xl overflow-hidden group hover:shadow-premium transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Pendientes</p>
                <div className="p-1.5 bg-amber-50 rounded-md"><AlertTriangle className="h-4 w-4 text-amber-600" /></div>
              </div>
              <div className="text-3xl font-extrabold text-slate-900 mt-3 tabular-nums">{pendingCount}</div>
              <p className="text-[10px] text-amber-700 mt-1 font-bold">ACCION REQUERIDA</p>
              <p className="text-[10px] text-slate-400 mt-1 font-medium">Criticos: {pendingCriticalCount}</p>
            </CardContent>
          </Card>
        )}

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
              <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Impresiones</p>
              <div className="p-1.5 bg-purple-50 rounded-md">
                <Printer className="h-4 w-4 text-purple-500" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 mt-3 tabular-nums">{printCount}</div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">Últimos 30 días</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Modules Grid */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <h2 className="text-xl font-bold text-slate-900">Accesos rápidos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {quickActionNodes.map((action) => {
              const Icon = action.icon

              return (
                <Link key={action.id} href={getNavigationHref(action, generateHref)} className="group outline-none">
                  <Card className="relative h-full overflow-hidden border-slate-200 shadow-soft transition-all duration-200 hover:border-indigo-300 hover:shadow-premium group-focus-visible:ring-2 group-focus-visible:ring-indigo-500 group-focus-visible:ring-offset-2">
                    <CardContent className="flex min-h-24 items-center gap-3 p-4">
                      <div className={`shrink-0 rounded-lg p-2.5 ${action.tone}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-slate-900 transition-colors group-hover:text-indigo-700">
                          {action.id === 'sap-consulting' ? 'Consultas SAP' : action.id === 'print' ? 'Imprimir' : action.label}
                        </h3>
                        <p className="mt-1 text-xs leading-snug text-slate-500">{action.description}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Recent Activity / Pending Work */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-slate-900">Actividad Reciente</h2>
          <Card className="shadow-soft border-slate-200 h-full">
            <CardContent className="p-0 overflow-hidden">
              <div className="divide-y divide-slate-100">
                {activity.length > 0 ? activity.map((event) => (
                  <div key={`${event.kind}-${event.occurredAt}-${event.title}`} className="p-4 flex flex-col gap-1 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-start">
                      {event.href ? <Link href={event.href} className="font-semibold text-sm text-slate-900 truncate max-w-[180px] hover:text-indigo-700">{event.title}</Link> : <span className="font-semibold text-sm text-slate-900 truncate max-w-[180px]">{event.title}</span>}
                      <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold uppercase tracking-tight ring-1 ring-inset bg-slate-50 text-slate-600 ring-slate-600/10 hover:bg-slate-50">{event.action}</Badge>
                    </div>
                    <span className="text-xs text-slate-500 truncate">{event.subtitle}</span>
                    <time dateTime={event.occurredAt} className="text-[10px] text-slate-400">{formatActivityRelativeTime(event.occurredAt)}</time>
                  </div>
                )) : (
                  <div className="p-8 text-center text-slate-500 text-sm">Sin actividad reciente registrada.</div>
                )}
              </div>

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
