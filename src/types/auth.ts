export const SYSTEM_USER_ROLES = [
  'pending',
  'admin',
  'production',
  'designer',
  'engineering',
] as const

export const USER_ROLES = SYSTEM_USER_ROLES

export type SystemUserRole = (typeof SYSTEM_USER_ROLES)[number]
export type UserRole = string

export const ADMIN_ROLE = 'admin'
export const PENDING_ROLE = 'pending'

export const SYSTEM_USER_ROLE_LABELS: Record<SystemUserRole, string> = {
  pending: 'Pendiente',
  admin: 'Admin',
  production: 'Producción',
  designer: 'Diseño',
  engineering: 'Ingeniería',
}

export const USER_ROLE_LABELS: Record<string, string> = SYSTEM_USER_ROLE_LABELS

export const PERMISSIONS = [
  'module:dashboard',
  'module:pending',
  'module:templates',
  'module:datasets',
  'module:assets',
  'module:generate',
  'module:print',
  'module:product-design',
  'module:product-design:estimations',
  'module:product-design:bom',
  'module:product-design:route-sheets',
  'module:sales',
  'module:sales:estimations',
  'module:productive-modules',
  'module:productive-modules:route-sheets',
  'module:engineering',
  'module:engineering:transfer-requests',
  'module:engineering:measurements',
  'module:engineering:sap-auditories',
  'module:engineering:estimations',
  'module:engineering:sap-code-creation',
  'module:configuration',
  'module:configuration:families',
  'module:configuration:references',
  'module:configuration:versioning',
  'module:configuration:skus',
  'module:configuration:glossary',
  'module:configuration:nomenclature',
  'module:configuration:versions',
  'module:configuration:colors',
  'module:configuration:clients',
  'module:consulta-sap',
  'action:print',
  'action:naming:manage',
  'action:sap-code:manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]
export type ModulePermission = Extract<Permission, `module:${string}`>
export type InternalPermission = Extract<Permission, `action:${string}`>
export const SAP_CODE_MANAGEMENT_PERMISSION = 'action:sap-code:manage' as const

export type AppModuleChildDefinition = {
  key: ModulePermission
  label: string
  href: string
  description: string
}

export type AppModuleDefinition = {
  key: ModulePermission
  label: string
  href: string
  assignable: boolean
  children?: readonly AppModuleChildDefinition[]
}

export const APP_MODULES: AppModuleDefinition[] = [
  {
    key: 'module:dashboard',
    label: 'Inicio',
    href: '/',
    assignable: true,
  },
  {
    key: 'module:pending',
    label: 'Pendientes',
    href: '/pending',
    assignable: true,
  },
  {
    key: 'module:templates',
    label: 'Plantillas',
    href: '/templates',
    assignable: true,
  },
  {
    key: 'module:datasets',
    label: 'Bases de Datos',
    href: '/datasets',
    assignable: true,
  },
  {
    key: 'module:assets',
    label: 'Recursos',
    href: '/assets',
    assignable: true,
  },
  {
    key: 'module:generate',
    label: 'Generar',
    href: '/generate',
    assignable: true,
  },
  {
    key: 'module:print',
    label: 'Impresión',
    href: '/print',
    assignable: true,
  },
  {
    key: 'module:product-design',
    label: 'Diseño de producto',
    href: '/product-design',
    assignable: true,
    children: [
      { key: 'module:product-design:estimations', label: 'Cotizaciones', href: '/product-design/estimations', description: 'Calcula consumos y cotizaciones de producto.' },
      { key: 'module:product-design:bom', label: 'Importacion y alineacion LdM/BOM', href: '/product-design/bom', description: 'Importa, relaciona y alinea estructuras de producto.' },
      { key: 'module:product-design:route-sheets', label: 'Hojas de ruta - Cabinets', href: '/product-design/route-sheets/cabinets', description: 'Edita hojas de ruta productivas.' },
      { key: 'module:generate', label: 'Generar', href: '/generate', description: 'Genera documentacion tecnica.' },
      { key: 'module:assets', label: 'Recursos', href: '/assets', description: 'Administra imagenes, logos e isometricos.' },
      { key: 'module:datasets', label: 'Bases de datos', href: '/datasets', description: 'Carga y relaciona fuentes externas.' },
      { key: 'module:templates', label: 'Plantillas', href: '/templates', description: 'Disena plantillas de documentacion.' },
      { key: 'module:pending', label: 'Pendientes', href: '/pending', description: 'Revisa faltantes de documentacion.' },
    ],
  },
  {
    key: 'module:sales',
    label: 'Ventas',
    href: '/sales',
    assignable: true,
    children: [
      { key: 'module:sales:estimations', label: 'Cotizaciones compartidas', href: '/sales/estimations', description: 'Consulta cotizaciones compartidas con Ventas.' },
    ],
  },
  {
    key: 'module:productive-modules',
    label: 'Módulos productivos',
    href: '/productive-modules',
    assignable: true,
    children: [
      { key: 'module:productive-modules:route-sheets', label: 'Hojas de ruta - Cabinets', href: '/productive-modules/route-sheets/cabinets', description: 'Consulta hojas de ruta aprobadas para planta.' },
      { key: 'module:print', label: 'Impresion', href: '/print', description: 'Imprime etiquetas operativas.' },
    ],
  },
  {
    key: 'module:engineering',
    label: 'Ingeniería',
    href: '/engineering',
    assignable: true,
    children: [
      { key: 'module:consulta-sap', label: 'Consulta SAP', href: '/engineering/sap-consulting', description: 'Consulta articulos, LdM, ordenes e inventario.' },
      { key: 'module:engineering:transfer-requests', label: 'Solicitudes de traslado', href: '/engineering/sap-operations/transfer-requests', description: 'Crea y consulta solicitudes de traslado.' },
      { key: 'module:engineering:measurements', label: 'Mediciones de ingenieria', href: '/engineering/measurements', description: 'Registra geometria CAD y consumos.' },
      { key: 'module:engineering:sap-auditories', label: 'Auditorias SAP', href: '/engineering/sap-auditories', description: 'Audita color, bodegas y metodos SAP.' },
      { key: 'module:engineering:estimations', label: 'Revision tecnica de cotizaciones', href: '/engineering/estimations', description: 'Registra criterios tecnicos de cotizaciones.' },
      { key: 'module:engineering:sap-code-creation', label: 'Codigos SAP', href: '/engineering/sap-operations/sap-code-creation', description: 'Prepara y administra codigos SAP.' },
    ],
  },
  {
    key: 'module:configuration',
    label: 'Configuración',
    href: '/configuration',
    assignable: true,
    children: [
      { key: 'module:configuration:families', label: 'Familias', href: '/configuration/families', description: 'Administra familias y atributos tecnicos.' },
      { key: 'module:configuration:references', label: 'Referencias', href: '/configuration/reference-editor', description: 'Edita referencias de producto.' },
      { key: 'module:configuration:versioning', label: 'Versionamiento', href: '/configuration/version-editor', description: 'Gestiona estructura y atributos de versiones.' },
      { key: 'module:configuration:skus', label: 'SKU', href: '/configuration/sku-editor', description: 'Edita SKU y datos derivados.' },
      { key: 'module:configuration:glossary', label: 'Glosario', href: '/configuration/glossary', description: 'Mantiene terminos tecnicos.' },
      { key: 'module:configuration:nomenclature', label: 'Nomenclatura', href: '/configuration/nomenclature', description: 'Configura reglas de nomenclatura.' },
      { key: 'module:configuration:versions', label: 'Versiones', href: '/configuration/versions', description: 'Consulta y administra versiones.' },
      { key: 'module:configuration:colors', label: 'Colores', href: '/configuration/colors', description: 'Administra colores y equivalencias SAP.' },
      { key: 'module:configuration:clients', label: 'Clientes', href: '/configuration/clients', description: 'Gestiona clientes y alcance de marca.' },
    ],
  },
  {
    key: 'module:consulta-sap',
    label: 'Consulta SAP',
    href: '/engineering/sap-consulting',
    assignable: true,
  },
]

export const MODULE_PERMISSIONS = PERMISSIONS.filter((permission): permission is ModulePermission => (
  permission.startsWith('module:')
))
export const ASSIGNABLE_MODULE_PERMISSIONS = [
  ...APP_MODULES.filter((module) => module.assignable).map((module) => module.key),
  ...APP_MODULES.flatMap((module) => module.children?.map((child) => child.key) ?? []),
] as ModulePermission[]

export const MODULE_CHILDREN_BY_PARENT: ReadonlyMap<ModulePermission, readonly ModulePermission[]> = new Map(
  APP_MODULES.map((module) => [module.key, module.children?.map((child) => child.key) ?? []])
)

export type InternalPermissionDefinition = {
  key: InternalPermission
  label: string
  description: string
  module: ModulePermission
}

export const INTERNAL_PERMISSIONS: InternalPermissionDefinition[] = [
  {
    key: 'action:print',
    label: 'ImpresiÃ³n operativa',
    description: 'EnvÃ­a etiquetas a la impresora configurada.',
    module: 'module:print',
  },
  {
    key: 'action:naming:manage',
    label: 'Administrar nomenclatura',
    description: 'Crea y administra reglas de nomenclatura.',
    module: 'module:configuration:nomenclature',
  },
  {
    key: SAP_CODE_MANAGEMENT_PERMISSION,
    label: 'Administrar códigos SAP',
    description: 'Crear, activar, inactivar y eliminar artículos SAP desde variantes.',
    module: 'module:engineering',
  },
]

export const PERMISSION_DEPENDENCIES: ReadonlyMap<Permission, readonly InternalPermission[]> = new Map([
  ['module:print', ['action:print']],
  ['module:configuration:nomenclature', ['action:naming:manage']],
  ['module:engineering:sap-code-creation', [SAP_CODE_MANAGEMENT_PERMISSION]],
])

export const ASSIGNABLE_PERMISSION_KEYS = [
  ...ASSIGNABLE_MODULE_PERMISSIONS,
  ...INTERNAL_PERMISSIONS.map((permission) => permission.key),
] as Permission[]

export type AppRoleRecord = {
  key: string
  label: string | null
  description?: string | null
  allowed_modules?: unknown
  active?: boolean | null
  is_system?: boolean | null
}

export type ResolvedRoleAccess = {
  role: UserRole
  roleLabel: string
  permissions: Permission[]
  modules: ModulePermission[]
  isAdmin: boolean
  isActive: boolean
  homePath: string
}

const DEFAULT_ROLE_MODULES: Record<string, ModulePermission[]> = {
  pending: [],
  admin: [...MODULE_PERMISSIONS],
  production: ['module:print', 'module:productive-modules'],
  designer: ['module:product-design'],
  engineering: ['module:engineering'],
}

const ROUTE_PERMISSION_PREFIXES: Array<{ prefix: string; permission: ModulePermission }> = [
  { prefix: '/pending', permission: 'module:pending' },
  { prefix: '/templates', permission: 'module:templates' },
  { prefix: '/datasets', permission: 'module:datasets' },
  { prefix: '/assets', permission: 'module:assets' },
  { prefix: '/generate', permission: 'module:generate' },
  { prefix: '/print', permission: 'module:print' },
  { prefix: '/product-design/sap-code-creation', permission: 'module:engineering:sap-code-creation' },
  { prefix: '/product-design/estimations', permission: 'module:product-design:estimations' },
  { prefix: '/product-design/bom', permission: 'module:product-design:bom' },
  { prefix: '/product-design/route-sheets', permission: 'module:product-design:route-sheets' },
  { prefix: '/product-design', permission: 'module:product-design' },
  { prefix: '/sales/estimations', permission: 'module:sales:estimations' },
  { prefix: '/sales', permission: 'module:sales' },
  { prefix: '/productive-modules/route-sheets', permission: 'module:productive-modules:route-sheets' },
  { prefix: '/productive-modules', permission: 'module:productive-modules' },
  { prefix: '/engineering/sap-operations/transfer-requests', permission: 'module:engineering:transfer-requests' },
  { prefix: '/engineering/sap-operations/sap-code-creation', permission: 'module:engineering:sap-code-creation' },
  { prefix: '/engineering/measurements', permission: 'module:engineering:measurements' },
  { prefix: '/engineering/sap-auditories', permission: 'module:engineering:sap-auditories' },
  { prefix: '/engineering/estimations', permission: 'module:engineering:estimations' },
  { prefix: '/engineering/sap-consulting', permission: 'module:consulta-sap' },
  { prefix: '/engineering', permission: 'module:engineering' },
  { prefix: '/configuration/families', permission: 'module:configuration:families' },
  { prefix: '/configuration/reference-editor', permission: 'module:configuration:references' },
  { prefix: '/configuration/version-editor', permission: 'module:configuration:versioning' },
  { prefix: '/configuration/sku-editor', permission: 'module:configuration:skus' },
  { prefix: '/configuration/glossary', permission: 'module:configuration:glossary' },
  { prefix: '/configuration/nomenclature', permission: 'module:configuration:nomenclature' },
  { prefix: '/configuration/versions', permission: 'module:configuration:versions' },
  { prefix: '/configuration/colors', permission: 'module:configuration:colors' },
  { prefix: '/configuration/clients', permission: 'module:configuration:clients' },
  { prefix: '/configuration', permission: 'module:configuration' },
  { prefix: '/rules/colors', permission: 'module:configuration:colors' },
  { prefix: '/rules', permission: 'module:configuration:nomenclature' },
  { prefix: '/consulta-sap', permission: 'module:consulta-sap' },
  { prefix: '/new', permission: 'module:dashboard' },
  { prefix: '/mass-import', permission: 'module:dashboard' },
  { prefix: '/families', permission: 'module:configuration:families' },
  { prefix: '/exceptions', permission: 'module:dashboard' },
]

const HOME_PRIORITY: ModulePermission[] = [
  'module:dashboard',
  'module:print',
  'module:product-design:estimations',
  'module:product-design:bom',
  'module:product-design:route-sheets',
  'module:sales:estimations',
  'module:productive-modules:route-sheets',
  'module:engineering:transfer-requests',
  'module:engineering:measurements',
  'module:engineering:sap-auditories',
  'module:engineering:estimations',
  'module:engineering:sap-code-creation',
  'module:consulta-sap',
  'module:generate',
  'module:templates',
  'module:datasets',
  'module:assets',
  'module:pending',
  'module:configuration:families',
  'module:configuration:references',
  'module:configuration:versioning',
  'module:configuration:skus',
  'module:configuration:glossary',
  'module:configuration:nomenclature',
  'module:configuration:versions',
  'module:configuration:colors',
  'module:configuration:clients',
]

const MODULE_HREF_BY_KEY = new Map([
  ...APP_MODULES.map((module) => [module.key, module.href] as const),
  ...APP_MODULES.flatMap((module) => module.children?.map((child) => [child.key, child.href] as const) ?? []),
])

export function normalizeUserRole(value: unknown): UserRole {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized || PENDING_ROLE
}

export function parseUserRole(value: unknown): UserRole | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return /^[a-z][a-z0-9_-]{1,31}$/.test(normalized) ? normalized : null
}

export function assertUserRole(value: unknown): UserRole {
  const role = parseUserRole(value)
  if (!role) {
    throw new Error('Rol de usuario inválido')
  }
  return role
}

export function getRoleLabel(role: UserRole, fallbackLabel?: string | null): string {
  return fallbackLabel?.trim() || USER_ROLE_LABELS[role] || role
}

export function isPermission(value: unknown): value is Permission {
  return PERMISSIONS.includes(value as Permission)
}

export function isModulePermission(value: unknown): value is ModulePermission {
  return MODULE_PERMISSIONS.includes(value as ModulePermission)
}

export function sanitizeAllowedPermissions(value: unknown, options: { assignableOnly?: boolean } = {}): Permission[] {
  const raw = Array.isArray(value) ? value : []
  const allowedSet = new Set(options.assignableOnly ? ASSIGNABLE_PERMISSION_KEYS : PERMISSIONS)
  return raw.filter((item): item is Permission => (
    isPermission(item) && allowedSet.has(item)
  ))
    .filter((item, index, list) => list.indexOf(item) === index)
}

export function sanitizeAllowedModules(value: unknown, options: { assignableOnly?: boolean } = {}): ModulePermission[] {
  return sanitizeAllowedPermissions(value, options).filter(isModulePermission)
}

export function getDefaultModulesForRole(role: UserRole): ModulePermission[] {
  return [...(DEFAULT_ROLE_MODULES[role] ?? [])]
}

export function permissionsFromModules(role: UserRole, configuredPermissions: Permission[]): Permission[] {
  if (role === ADMIN_ROLE) return [...PERMISSIONS]

  const permissions = new Set<Permission>(configuredPermissions)
  for (const [parent, children] of MODULE_CHILDREN_BY_PARENT) {
    if (permissions.has(parent)) {
      children.forEach((child) => permissions.add(child))
    }
  }
  for (const [permission, dependencies] of PERMISSION_DEPENDENCIES) {
    if (permissions.has(permission)) {
      dependencies.forEach((dependency) => permissions.add(dependency))
    }
  }

  return Array.from(permissions)
}

export function getDefaultPermissionsForRole(role: UserRole): Permission[] {
  return permissionsFromModules(role, getDefaultModulesForRole(role))
}

export function getRoleHomePath(role: UserRole, permissions: Permission[]): string {
  if (role === ADMIN_ROLE) return '/'

  for (const moduleKey of HOME_PRIORITY) {
    if (permissions.includes(moduleKey)) {
      return MODULE_HREF_BY_KEY.get(moduleKey) ?? '/'
    }
  }

  return '/access-pending'
}

export function resolveRoleAccess(
  roleValue: unknown,
  roleRecord: AppRoleRecord | null,
  options: { fallbackToDefaults?: boolean } = {}
): ResolvedRoleAccess {
  const role = normalizeUserRole(roleValue)
  const isAdmin = role === ADMIN_ROLE
  const hasDbRole = Boolean(roleRecord)
  const isActive = isAdmin || (hasDbRole ? roleRecord?.active !== false : false)

  const permissions = isAdmin
    ? [...PERMISSIONS]
    : hasDbRole
      ? (isActive ? permissionsFromModules(role, sanitizeAllowedPermissions(roleRecord?.allowed_modules)) : [])
      : options.fallbackToDefaults
        ? getDefaultPermissionsForRole(role)
        : []
  const modules = permissions.filter(isModulePermission)

  return {
    role,
    roleLabel: getRoleLabel(role, roleRecord?.label),
    permissions,
    modules,
    isAdmin,
    isActive,
    homePath: getRoleHomePath(role, permissions),
  }
}

export function hasPermission(permissions: Permission[], permission: Permission): boolean
export function hasPermission(role: UserRole, permission: Permission): boolean
export function hasPermission(accessOrRole: Permission[] | UserRole, permission: Permission): boolean {
  if (Array.isArray(accessOrRole)) {
    return accessOrRole.includes(permission)
  }

  return permissionsFromModules(accessOrRole, getDefaultModulesForRole(accessOrRole)).includes(permission)
}

/** A parent module is a navigational container when at least one child is allowed. */
export function hasModuleAccess(permissions: readonly Permission[], module: ModulePermission): boolean {
  if (permissions.includes(module)) return true
  return (MODULE_CHILDREN_BY_PARENT.get(module) ?? []).some((child) => permissions.includes(child))
}

export function isPendingLikeRole(role: UserRole): boolean {
  return role === PENDING_ROLE
}

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true
  }

  return PUBLIC_FILE_EXTENSIONS.some((extension) => pathname.endsWith(extension))
}

export const PUBLIC_ROUTE_PREFIXES = [
  '/login',
  '/auth',
  '/_next',
  '/downloads',
  '/favicon.ico',
  '/export-render',
]

export const PUBLIC_FILE_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.exe', '.zip', '.msi']

export const SYSTEM_SECRET_API_PREFIXES = ['/api/revalidate', '/api/naming/process-stale']

export function isSystemSecretApi(pathname: string): boolean {
  return SYSTEM_SECRET_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

const API_PERMISSION_PREFIXES: Array<{ prefix: string; permission: ModulePermission }> = [
  { prefix: '/api/print', permission: 'module:print' },
  { prefix: '/api/export', permission: 'module:generate' },
  { prefix: '/api/generate', permission: 'module:generate' },
  { prefix: '/api/assets', permission: 'module:assets' },
  { prefix: '/api/isometrics', permission: 'module:assets' },
  { prefix: '/api/mass-import', permission: 'module:dashboard' },
  { prefix: '/api/families', permission: 'module:configuration:families' },
  { prefix: '/api/rules/colors', permission: 'module:configuration:colors' },
  { prefix: '/api/rules', permission: 'module:configuration:nomenclature' },
  { prefix: '/api/product-design/sap-code-creation', permission: 'module:engineering:sap-code-creation' },
  { prefix: '/api/product-design/bom', permission: 'module:product-design:bom' },
  { prefix: '/api/product-design/color-audit', permission: 'module:engineering:sap-auditories' },
  { prefix: '/api/sap', permission: 'module:consulta-sap' },
  { prefix: '/api/engineering/sap-operations/transfer-requests', permission: 'module:engineering:transfer-requests' },
  { prefix: '/api/engineering/sap-operations/sap-code-creation', permission: 'module:engineering:sap-code-creation' },
  { prefix: '/api/engineering/sap-auditories', permission: 'module:engineering:sap-auditories' },
]

export function isAllowedUserApi(pathname: string, role: UserRole, permissions: Permission[] = []): boolean {
  if (role === ADMIN_ROLE) return pathname.startsWith('/api')

  const match = API_PERMISSION_PREFIXES.find(({ prefix }) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ))

  return match ? hasPermission(permissions, match.permission) : false
}

export function getRoutePermission(pathname: string): ModulePermission | null {
  if (pathname === '/') return 'module:dashboard'

  const match = ROUTE_PERMISSION_PREFIXES.find(({ prefix }) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ))

  return match?.permission ?? null
}
