export const USER_ROLES = [
  'pending',
  'admin',
  'production',
  'designer',
  'engineering',
] as const

export type UserRole = (typeof USER_ROLES)[number]

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  pending: 'Pendiente',
  admin: 'Admin',
  production: 'Produccion',
  designer: 'Diseno',
  engineering: 'Ingenieria',
}

export const PERMISSIONS = [
  'module:dashboard',
  'module:pending',
  'module:templates',
  'module:datasets',
  'module:assets',
  'module:generate',
  'module:print',
  'module:configuration',
  'action:print',
  'action:naming:manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  pending: [],
  admin: [...PERMISSIONS],
  production: ['module:print', 'action:print'],
  designer: [],
  engineering: [],
}

export const ROLE_HOME_PATH: Record<UserRole, string> = {
  pending: '/access-pending',
  admin: '/',
  production: '/print',
  designer: '/access-pending',
  engineering: '/access-pending',
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

export const USER_ALLOWED_API_PREFIXES: Record<UserRole, string[]> = {
  pending: [],
  admin: ['/api'],
  production: ['/api/print'],
  designer: [],
  engineering: [],
}

export function normalizeUserRole(value: unknown): UserRole {
  const normalized = String(value ?? '').trim().toLowerCase()
  return USER_ROLES.includes(normalized as UserRole) ? (normalized as UserRole) : 'pending'
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function isPendingLikeRole(role: UserRole): boolean {
  return role === 'pending' || role === 'designer' || role === 'engineering'
}

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true
  }

  return PUBLIC_FILE_EXTENSIONS.some((extension) => pathname.endsWith(extension))
}

export function isSystemSecretApi(pathname: string): boolean {
  return SYSTEM_SECRET_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function isAllowedUserApi(pathname: string, role: UserRole): boolean {
  return USER_ALLOWED_API_PREFIXES[role].some((prefix) => pathname.startsWith(prefix))
}
