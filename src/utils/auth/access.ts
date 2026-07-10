import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

import {
  hasPermission,
  isPermission,
  normalizeUserRole,
  resolveRoleAccess,
  type AppRoleRecord,
  type Permission,
  type UserRole,
} from '@/types/auth'
import { createClient } from '@/utils/supabase/server'

export class AuthorizationError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthorizationError'
    this.status = status
  }
}

export interface AccessContext {
  user: {
    id: string
    email: string | null
  } | null
  role: UserRole
  roleLabel: string
  permissions: Permission[]
  isAuthenticated: boolean
  isAdmin: boolean
  homePath: string
}

function createAnonymousAccessContext(): AccessContext {
  return {
    user: null,
    role: 'pending',
    roleLabel: 'Pendiente',
    permissions: [],
    isAuthenticated: false,
    isAdmin: false,
    homePath: '/login',
  }
}

const readAccessContext = cache(async (): Promise<AccessContext> => {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return createAnonymousAccessContext()
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('email, role')
    .eq('id', user.id)
    .maybeSingle()

  const role = normalizeUserRole(profile?.role)
  const { data: appRole, error: appRoleError } = await supabase
    .from('app_roles')
    .select('key,label,description,allowed_modules,active,is_system')
    .eq('key', role)
    .maybeSingle()

  const roleAccess = resolveRoleAccess(role, appRole as AppRoleRecord | null, {
    fallbackToDefaults: Boolean(appRoleError),
  })

  return {
    user: {
      id: user.id,
      email: profile?.email ?? user.email ?? null,
    },
    role: roleAccess.role,
    roleLabel: roleAccess.roleLabel,
    permissions: roleAccess.permissions,
    isAuthenticated: true,
    isAdmin: roleAccess.isAdmin,
    homePath: roleAccess.homePath,
  }
})

export async function getAccessContext(): Promise<AccessContext> {
  return readAccessContext()
}

export async function assertAuthenticated(): Promise<AccessContext> {
  const access = await getAccessContext()
  if (!access.user) {
    throw new AuthorizationError('Unauthorized', 401)
  }
  return access
}

export async function assertRole(...allowedRoles: UserRole[]): Promise<AccessContext> {
  const access = await assertAuthenticated()
  if (!allowedRoles.includes(access.role)) {
    throw new AuthorizationError('Forbidden', 403)
  }
  return access
}

export async function assertPermission(permission: Permission): Promise<AccessContext> {
  const access = await assertAuthenticated()
  if (!hasPermission(access.permissions, permission)) {
    throw new AuthorizationError('Forbidden', 403)
  }
  return access
}

export async function requirePageRole(...allowedRoles: UserRole[]): Promise<AccessContext> {
  const access = await getAccessContext()

  if (!access.user) {
    redirect('/login')
  }

  if (!allowedRoles.includes(access.role)) {
    redirect(access.homePath)
  }

  return access
}

export async function requirePagePermission(permission: Permission): Promise<AccessContext> {
  const access = await getAccessContext()

  if (!access.user) {
    redirect('/login')
  }

  if (!hasPermission(access.permissions, permission)) {
    redirect(access.homePath)
  }

  return access
}

export async function apiGuard(...allowedAccess: Array<UserRole | Permission>) {
  try {
    const access = await assertAuthenticated()
    const allowedRoles = allowedAccess.filter((item): item is UserRole => !isPermission(item))
    const allowedPermissions = allowedAccess.filter((item): item is Permission => isPermission(item))
    const allowedByRole = allowedRoles.includes(access.role)
    const allowedByPermission = allowedPermissions.some((permission) => hasPermission(access.permissions, permission))
    const allowedByPrintPermission = allowedRoles.includes('production')
      && hasPermission(access.permissions, 'module:print')

    if (!allowedByRole && !allowedByPermission && !allowedByPrintPermission) {
      throw new AuthorizationError('Forbidden', 403)
    }

    return { access, response: null as NextResponse | null }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return {
        access: null,
        response: NextResponse.json(
          { error: error.status === 401 ? 'Unauthorized' : 'Forbidden' },
          { status: error.status }
        ),
      }
    }

    return {
      access: null,
      response: NextResponse.json({ error: 'Authorization failed' }, { status: 500 }),
    }
  }
}
