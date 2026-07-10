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
  production: 'Produccion',
  designer: 'Diseno',
  engineering: 'Ingenieria',
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
  'module:productive-modules',
  'module:configuration',
  'module:consulta-sap',
  'action:print',
  'action:naming:manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]
export type ModulePermission = Extract<Permission, `module:${string}`>

export type AppModuleDefinition = {
  key: ModulePermission
  label: string
  href: string
  assignable: boolean
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
    label: 'Impresion',
    href: '/print',
    assignable: true,
  },
  {
    key: 'module:product-design',
    label: 'Diseno de producto',
    href: '/product-design',
    assignable: true,
  },
  {
    key: 'module:productive-modules',
    label: 'Modulos productivos',
    href: '/productive-modules',
    assignable: true,
  },
  {
    key: 'module:configuration',
    label: 'Configuracion',
    href: '/configuration',
    assignable: true,
  },
  {
    key: 'module:consulta-sap',
    label: 'Consulta SAP',
    href: '/consulta-sap',
    assignable: true,
  },
]

export const MODULE_PERMISSIONS = APP_MODULES.map((module) => module.key) as ModulePermission[]
export const ASSIGNABLE_MODULE_PERMISSIONS = APP_MODULES
  .filter((module) => module.assignable)
  .map((module) => module.key) as ModulePermission[]

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
  engineering: [],
}

const ROUTE_PERMISSION_PREFIXES: Array<{ prefix: string; permission: ModulePermission }> = [
  { prefix: '/pending', permission: 'module:pending' },
  { prefix: '/templates', permission: 'module:templates' },
  { prefix: '/datasets', permission: 'module:datasets' },
  { prefix: '/assets', permission: 'module:assets' },
  { prefix: '/generate', permission: 'module:generate' },
  { prefix: '/print', permission: 'module:print' },
  { prefix: '/product-design', permission: 'module:product-design' },
  { prefix: '/productive-modules', permission: 'module:productive-modules' },
  { prefix: '/configuration', permission: 'module:configuration' },
  { prefix: '/rules', permission: 'module:configuration' },
  { prefix: '/consulta-sap', permission: 'module:consulta-sap' },
  { prefix: '/new', permission: 'module:dashboard' },
  { prefix: '/mass-import', permission: 'module:dashboard' },
  { prefix: '/families', permission: 'module:configuration' },
  { prefix: '/exceptions', permission: 'module:dashboard' },
]

const HOME_PRIORITY: ModulePermission[] = [
  'module:dashboard',
  'module:print',
  'module:product-design',
  'module:productive-modules',
  'module:generate',
  'module:templates',
  'module:datasets',
  'module:assets',
  'module:pending',
  'module:configuration',
  'module:consulta-sap',
]

const MODULE_HREF_BY_KEY = new Map(APP_MODULES.map((module) => [module.key, module.href]))

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
    throw new Error('Rol de usuario invalido')
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

export function sanitizeAllowedModules(value: unknown, options: { assignableOnly?: boolean } = {}): ModulePermission[] {
  const raw = Array.isArray(value) ? value : []
  const allowedSet = new Set(options.assignableOnly ? ASSIGNABLE_MODULE_PERMISSIONS : MODULE_PERMISSIONS)
  const modules = raw.filter((item): item is ModulePermission => (
    isModulePermission(item) && allowedSet.has(item)
  ))

  return Array.from(new Set(modules))
}

export function getDefaultModulesForRole(role: UserRole): ModulePermission[] {
  return [...(DEFAULT_ROLE_MODULES[role] ?? [])]
}

export function permissionsFromModules(role: UserRole, modules: ModulePermission[]): Permission[] {
  if (role === ADMIN_ROLE) return [...PERMISSIONS]

  const permissions = new Set<Permission>(modules)
  if (permissions.has('module:print')) permissions.add('action:print')

  return Array.from(permissions)
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

  const modules = isAdmin
    ? [...MODULE_PERMISSIONS]
    : hasDbRole
      ? (isActive ? sanitizeAllowedModules(roleRecord?.allowed_modules) : [])
      : options.fallbackToDefaults
        ? getDefaultModulesForRole(role)
        : []

  const permissions = permissionsFromModules(role, modules)

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

export function isPendingLikeRole(role: UserRole): boolean {
  return role === PENDING_ROLE || role === 'engineering'
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
  { prefix: '/api/families', permission: 'module:configuration' },
  { prefix: '/api/rules', permission: 'module:configuration' },
  { prefix: '/api/sap', permission: 'module:consulta-sap' },
]

export function isAllowedUserApi(pathname: string, role: UserRole, permissions: Permission[] = []): boolean {
  if (role === ADMIN_ROLE) return pathname.startsWith('/api')

  const match = API_PERMISSION_PREFIXES.find(({ prefix }) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ))

  return match ? permissions.includes(match.permission) : false
}

export function getRoutePermission(pathname: string): ModulePermission | null {
  if (pathname === '/') return 'module:dashboard'

  const match = ROUTE_PERMISSION_PREFIXES.find(({ prefix }) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ))

  return match?.permission ?? null
}
