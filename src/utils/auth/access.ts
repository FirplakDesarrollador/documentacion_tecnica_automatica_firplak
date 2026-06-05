import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

import {
  ROLE_HOME_PATH,
  ROLE_PERMISSIONS,
  hasPermission,
  normalizeUserRole,
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
  permissions: Permission[]
  isAuthenticated: boolean
  isAdmin: boolean
  homePath: string
}

function createAnonymousAccessContext(): AccessContext {
  return {
    user: null,
    role: 'pending',
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

  return {
    user: {
      id: user.id,
      email: profile?.email ?? user.email ?? null,
    },
    role,
    permissions: [...ROLE_PERMISSIONS[role]],
    isAuthenticated: true,
    isAdmin: role === 'admin',
    homePath: ROLE_HOME_PATH[role],
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
  if (!hasPermission(access.role, permission)) {
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

  if (!hasPermission(access.role, permission)) {
    redirect(access.homePath)
  }

  return access
}

export async function apiGuard(...allowedRoles: UserRole[]) {
  try {
    const access = await assertRole(...allowedRoles)
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
