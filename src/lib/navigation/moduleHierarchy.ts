import {
  AlertTriangle,
  BookOpen,
  BookOpenText,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  Database,
  DatabaseZap,
  FileOutput,
  FileText,
  GitBranch,
  Home,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Package,
  Palette,
  Printer,
  Ruler,
  Search,
  Settings,
  Tags,
  UserCog,
  Users,
  WandSparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import type { ModulePermission, Permission } from '@/types/auth'

export type TechnicalDocumentationModule = {
  id: 'generate' | 'assets' | 'datasets' | 'templates' | 'pending'
  label: string
  description: string
  permission: ModulePermission
  directHref: string
  nestedHref: string
}

/**
 * The direct routes remain canonical so independently assigned modules keep
 * their current RBAC and bookmarks. Nested routes are compatibility adapters.
 */
export const TECHNICAL_DOCUMENTATION_MODULES: readonly TechnicalDocumentationModule[] = [
  {
    id: 'generate',
    label: 'Generar',
    description: 'Selecciona productos y genera la documentación técnica.',
    permission: 'module:generate',
    directHref: '/generate',
    nestedHref: '/product-design/documentacion-tecnica/generar',
  },
  {
    id: 'assets',
    label: 'Recursos',
    description: 'Administra imágenes, logos, iconos e isométricos.',
    permission: 'module:assets',
    directHref: '/assets',
    nestedHref: '/product-design/documentacion-tecnica/recursos',
  },
  {
    id: 'datasets',
    label: 'Bases de datos',
    description: 'Carga y relaciona fuentes externas para las plantillas.',
    permission: 'module:datasets',
    directHref: '/datasets',
    nestedHref: '/product-design/documentacion-tecnica/bases-de-datos',
  },
  {
    id: 'templates',
    label: 'Plantillas',
    description: 'Diseña y administra las plantillas de documentación.',
    permission: 'module:templates',
    directHref: '/templates',
    nestedHref: '/product-design/documentacion-tecnica/plantillas',
  },
  {
    id: 'pending',
    label: 'Pendientes',
    description: 'Revisa faltantes que impiden completar la documentación.',
    permission: 'module:pending',
    directHref: '/pending',
    nestedHref: '/product-design/documentacion-tecnica/pendientes',
  },
]

export type ModuleNavigationNode = {
  id: string
  label: string
  description: string
  icon: LucideIcon
  tone: string
  href?: string
  permission?: ModulePermission
  requiresAdmin?: boolean
  showOnlyWhenChildrenVisible?: boolean
  useGenerateLastUrl?: boolean
  additionalActivePaths?: readonly string[]
  summaryTitle?: string
  summaryDescription?: string
  children?: readonly ModuleNavigationNode[]
}

export type ResolvedModuleNavigationNode = Omit<ModuleNavigationNode, 'children'> & {
  canNavigate: boolean
  children: readonly ResolvedModuleNavigationNode[]
}

const DOCUMENTATION_VISUALS: Record<
  TechnicalDocumentationModule['id'],
  Pick<ModuleNavigationNode, 'icon' | 'tone'>
> = {
  generate: { icon: FileOutput, tone: 'bg-indigo-50 text-indigo-700' },
  assets: { icon: ImageIcon, tone: 'bg-amber-50 text-amber-700' },
  datasets: { icon: Database, tone: 'bg-sky-50 text-sky-700' },
  templates: { icon: LayoutTemplate, tone: 'bg-emerald-50 text-emerald-700' },
  pending: { icon: AlertTriangle, tone: 'bg-rose-50 text-rose-700' },
}

const TECHNICAL_DOCUMENTATION_CHILDREN: readonly ModuleNavigationNode[] = TECHNICAL_DOCUMENTATION_MODULES.map((module) => ({
  id: module.id,
  label: module.label,
  description: module.description,
  href: module.directHref,
  permission: module.permission,
  useGenerateLastUrl: module.id === 'generate',
  ...DOCUMENTATION_VISUALS[module.id],
}))

export const TECHNICAL_DOCUMENTATION_NAVIGATION: ModuleNavigationNode = {
  id: 'technical-documentation',
  label: 'Documentación técnica',
  description: 'Generación, recursos, datos, plantillas y pendientes de documentación.',
  icon: BookOpenText,
  tone: 'bg-indigo-50 text-indigo-700',
  href: '/product-design/documentacion-tecnica',
  permission: 'module:product-design',
  showOnlyWhenChildrenVisible: true,
  summaryTitle: 'Documentación técnica',
  summaryDescription: 'Herramientas para preparar, diseñar y generar la documentación de producto.',
  children: TECHNICAL_DOCUMENTATION_CHILDREN,
}

export const DASHBOARD_NAVIGATION: ModuleNavigationNode = {
  id: 'dashboard',
  label: 'Inicio',
  description: 'Panel principal y accesos de creación.',
  icon: Home,
  tone: 'bg-slate-100 text-slate-700',
  href: '/',
  permission: 'module:dashboard',
  additionalActivePaths: ['/new', '/mass-import'],
}

export const PRODUCT_DESIGN_NAVIGATION: ModuleNavigationNode = {
  id: 'product-design',
  label: 'Diseño de producto',
  description: 'Cotizaciones, LdM/BOM, hojas de ruta y documentación técnica.',
  icon: Package,
  tone: 'bg-indigo-50 text-indigo-700',
  href: '/product-design',
  permission: 'module:product-design',
  summaryTitle: 'Herramientas técnicas de producto',
  summaryDescription: 'Prepara cotizaciones, alinea LdM/BOM y construye la información productiva.',
  children: [
    {
      id: 'product-design-estimations',
      label: 'Cotizaciones',
      description: 'Calcula consumos iniciales y comparte estimaciones sin crear productos en SAP.',
      icon: Calculator,
      tone: 'bg-sky-50 text-sky-700',
      href: '/product-design/estimations',
      permission: 'module:product-design',
    },
    {
      id: 'product-design-bom',
      label: 'Importación y alineación LdM/BOM',
      description: 'Importa desde SAP, relaciona componentes y prepara la base productiva.',
      icon: GitBranch,
      tone: 'bg-indigo-50 text-indigo-700',
      href: '/product-design/bom',
      permission: 'module:product-design',
    },
    {
      id: 'product-design-route-sheets',
      label: 'Hojas de ruta · Cabinets',
      description: 'Edita documentos productivos a partir de códigos importados y validados.',
      icon: ClipboardList,
      tone: 'bg-emerald-50 text-emerald-700',
      href: '/product-design/route-sheets/cabinets',
      permission: 'module:product-design',
    },
    TECHNICAL_DOCUMENTATION_NAVIGATION,
  ],
}

export const SALES_NAVIGATION: ModuleNavigationNode = {
  id: 'sales',
  label: 'Ventas',
  description: 'Cotizaciones compartidas para la gestión comercial.',
  icon: FileText,
  tone: 'bg-sky-50 text-sky-700',
  href: '/sales',
  permission: 'module:sales',
  summaryTitle: 'Ventas',
  summaryDescription: 'Consulta las cotizaciones que Diseño decidió compartir con el equipo comercial.',
  children: [
    {
      id: 'sales-estimations',
      label: 'Cotizaciones compartidas',
      description: 'Revisa costos, escenarios y decisiones comerciales sin editar la cotización.',
      icon: Calculator,
      tone: 'bg-sky-50 text-sky-700',
      href: '/sales/estimations',
      permission: 'module:sales',
    },
  ],
}

export const PRODUCTIVE_MODULES_NAVIGATION: ModuleNavigationNode = {
  id: 'productive-modules',
  label: 'Módulos productivos',
  description: 'Consulta operativa para planta e impresión de etiquetas.',
  icon: Database,
  tone: 'bg-emerald-50 text-emerald-700',
  href: '/productive-modules',
  permission: 'module:productive-modules',
  summaryTitle: 'Consulta operativa para planta',
  summaryDescription: 'Accede a hojas de ruta aprobadas e impresión operativa.',
  children: [
    {
      id: 'productive-route-sheets',
      label: 'Hojas de ruta · Cabinets',
      description: 'Visualiza e imprime la hoja de ruta aprobada para planta.',
      icon: ClipboardList,
      tone: 'bg-emerald-50 text-emerald-700',
      href: '/productive-modules/route-sheets/cabinets',
      permission: 'module:productive-modules',
    },
    {
      id: 'print',
      label: 'Impresión',
      description: 'Selecciona una plantilla y envía etiquetas a la impresora configurada.',
      icon: Printer,
      tone: 'bg-indigo-50 text-indigo-700',
      href: '/print',
      permission: 'module:print',
    },
  ],
}

export const ENGINEERING_NAVIGATION: ModuleNavigationNode = {
  id: 'engineering',
  label: 'Ingeniería',
  description: 'Herramientas de control técnico, consulta y operación SAP.',
  icon: Wrench,
  tone: 'bg-violet-50 text-violet-700',
  href: '/engineering',
  permission: 'module:engineering',
  summaryTitle: 'Herramientas técnicas de ingeniería',
  summaryDescription: 'Consulta información SAP, prepara decisiones y da trazabilidad a la operación.',
  children: [
    {
      id: 'sap-consulting',
      label: 'Consulta SAP',
      description: 'Consulta artículos, LdM, órdenes e inventario por bodega directamente desde SAP.',
      icon: Search,
      tone: 'bg-indigo-50 text-indigo-700',
      href: '/engineering/sap-consulting',
      permission: 'module:consulta-sap',
      additionalActivePaths: ['/consulta-sap'],
    },
    {
      id: 'transfer-requests',
      label: 'Solicitudes de traslado',
      description: 'Crea solicitudes verificadas, consulta historial y descarga comprobantes.',
      icon: ClipboardList,
      tone: 'bg-emerald-50 text-emerald-700',
      href: '/engineering/sap-operations/transfer-requests',
      permission: 'module:engineering',
    },
    {
      id: 'engineering-measurements',
      label: 'Mediciones de ingeniería',
      description: 'Registra geometría CAD y consumos para calibrar cotizaciones.',
      icon: Ruler,
      tone: 'bg-sky-50 text-sky-700',
      href: '/engineering/measurements',
      permission: 'module:engineering',
    },
    {
      id: 'sap-auditories',
      label: 'Auditorías SAP',
      description: 'Revisa color, bodegas y métodos de emisión en una corrida controlada.',
      icon: ClipboardCheck,
      tone: 'bg-emerald-50 text-emerald-700',
      href: '/engineering/sap-auditories',
      permission: 'module:engineering',
    },
    {
      id: 'engineering-estimations',
      label: 'Revisión técnica de cotizaciones',
      description: 'Registra criterios y observaciones sobre cotizaciones de Diseño.',
      icon: ClipboardCheck,
      tone: 'bg-amber-50 text-amber-700',
      href: '/engineering/estimations',
      permission: 'module:engineering',
    },
    {
      id: 'sap-code-creation',
      label: 'Códigos SAP',
      description: 'Prepara variantes, consulta artículos y administra códigos SAP autorizados.',
      icon: WandSparkles,
      tone: 'bg-violet-50 text-violet-700',
      href: '/engineering/sap-operations/sap-code-creation',
      permission: 'module:engineering',
    },
  ],
}

export const CONFIGURATION_NAVIGATION: ModuleNavigationNode = {
  id: 'configuration',
  label: 'Configuración',
  description: 'Catálogo, diccionarios y administración del sistema.',
  icon: Settings,
  tone: 'bg-slate-100 text-slate-700',
  href: '/configuration',
  permission: 'module:configuration',
  summaryTitle: 'Configuración',
  summaryDescription: 'Centraliza herramientas administrativas del catálogo, diccionarios y reglas del sistema.',
  children: [
    {
      id: 'configuration-families',
      label: 'Familias',
      description: 'Administra tipos y atributos técnicos de las familias.',
      icon: Package,
      tone: 'bg-slate-100 text-slate-700',
      href: '/configuration/families',
      permission: 'module:configuration',
    },
    {
      id: 'configuration-references',
      label: 'Referencias',
      description: 'Edita información maestra de referencias de producto.',
      icon: DatabaseZap,
      tone: 'bg-indigo-50 text-indigo-700',
      href: '/configuration/reference-editor',
      permission: 'module:configuration',
    },
    {
      id: 'configuration-versioning',
      label: 'Versionamiento',
      description: 'Gestiona la estructura y atributos de las versiones.',
      icon: Layers,
      tone: 'bg-orange-50 text-orange-700',
      href: '/configuration/version-editor',
      permission: 'module:configuration',
    },
    {
      id: 'configuration-skus',
      label: 'SKU',
      description: 'Edita SKU y sus datos derivados de catálogo.',
      icon: DatabaseZap,
      tone: 'bg-emerald-50 text-emerald-700',
      href: '/configuration/sku-editor',
      permission: 'module:configuration',
    },
    {
      id: 'configuration-glossary',
      label: 'Glosario',
      description: 'Mantiene términos técnicos usados en nomenclatura y documentación.',
      icon: BookOpen,
      tone: 'bg-blue-50 text-blue-700',
      href: '/configuration/glossary',
      permission: 'module:configuration',
    },
    {
      id: 'configuration-nomenclature',
      label: 'Nomenclatura',
      description: 'Configura componentes y reglas de nomenclatura.',
      icon: Tags,
      tone: 'bg-indigo-50 text-indigo-700',
      href: '/configuration/nomenclature',
      permission: 'module:configuration',
    },
    {
      id: 'configuration-versions',
      label: 'Versiones',
      description: 'Consulta y administra las versiones registradas.',
      icon: Layers,
      tone: 'bg-violet-50 text-violet-700',
      href: '/configuration/versions',
      permission: 'module:configuration',
    },
    {
      id: 'configuration-colors',
      label: 'Colores',
      description: 'Administra el catálogo de colores y sus equivalencias SAP.',
      icon: Palette,
      tone: 'bg-emerald-50 text-emerald-700',
      href: '/configuration/colors',
      permission: 'module:configuration',
    },
    {
      id: 'configuration-clients',
      label: 'Clientes',
      description: 'Gestiona clientes y alcance de marca propia.',
      icon: Users,
      tone: 'bg-slate-100 text-slate-700',
      href: '/configuration/clients',
      permission: 'module:configuration',
    },
    {
      id: 'configuration-users',
      label: 'Usuarios y roles',
      description: 'Administra usuarios, roles y módulos asignados.',
      icon: UserCog,
      tone: 'bg-slate-100 text-slate-700',
      href: '/configuration/users',
      permission: 'module:configuration',
      requiresAdmin: true,
    },
  ],
}

export const MODULE_NAVIGATION_TREE: readonly ModuleNavigationNode[] = [
  DASHBOARD_NAVIGATION,
  PRODUCT_DESIGN_NAVIGATION,
  SALES_NAVIGATION,
  PRODUCTIVE_MODULES_NAVIGATION,
  ENGINEERING_NAVIGATION,
  CONFIGURATION_NAVIGATION,
]

function canNavigateNode(
  node: ModuleNavigationNode,
  permissionSet: ReadonlySet<Permission>,
  isAdmin: boolean
): boolean {
  if (!node.href || (node.requiresAdmin && !isAdmin)) return false
  return !node.permission || permissionSet.has(node.permission)
}

export function resolveModuleNavigationNode(
  node: ModuleNavigationNode,
  permissions: readonly Permission[],
  isAdmin: boolean
): ResolvedModuleNavigationNode | null {
  const permissionSet = new Set(permissions)

  function resolve(current: ModuleNavigationNode): ResolvedModuleNavigationNode | null {
    const children = (current.children ?? [])
      .flatMap((child) => {
        const resolved = resolve(child)
        return resolved ? [resolved] : []
      })
    const canNavigate = canNavigateNode(current, permissionSet, isAdmin)
    const isVisible = current.showOnlyWhenChildrenVisible
      ? children.length > 0
      : canNavigate || children.length > 0

    return isVisible ? { ...current, canNavigate, children } : null
  }

  return resolve(node)
}

export function resolveModuleNavigationTree(
  permissions: readonly Permission[],
  isAdmin: boolean
): readonly ResolvedModuleNavigationNode[] {
  return MODULE_NAVIGATION_TREE.flatMap((node) => {
    const resolved = resolveModuleNavigationNode(node, permissions, isAdmin)
    return resolved ? [resolved] : []
  })
}

export function getNavigationHref(
  node: Pick<ModuleNavigationNode, 'href' | 'useGenerateLastUrl'>,
  generateHref = '/generate'
): string {
  if (node.useGenerateLastUrl) return generateHref
  return node.href ?? '/'
}

function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
}

export function isModuleNavigationNodeActive(
  node: ModuleNavigationNode | ResolvedModuleNavigationNode,
  pathname: string | null
): boolean {
  if (!pathname) return false
  if (node.href && isPathActive(pathname, node.href)) return true
  if (node.additionalActivePaths?.some((href) => isPathActive(pathname, href))) return true
  return (node.children ?? []).some((child) => isModuleNavigationNodeActive(child, pathname))
}
