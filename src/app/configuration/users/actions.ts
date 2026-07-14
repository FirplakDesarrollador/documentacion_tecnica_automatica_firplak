'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import type { User } from '@supabase/supabase-js'

import {
  ADMIN_ROLE,
  APP_MODULES,
  assertUserRole,
  getDefaultModulesForRole,
  getRoleLabel,
  normalizeUserRole,
  sanitizeAllowedModules,
  type UserRole,
} from '@/types/auth'
import { assertRole } from '@/utils/auth/access'
import { createSupabaseAdminClient } from '@/utils/supabase/admin'

import type { AdminRoleRow, AdminUserAuthStatus, AdminUserRow, InviteUserResult, SaveRoleInput } from './types'

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

type UserProfileRow = {
  id: string
  email: string | null
  role: string | null
  created_at: string | null
  updated_at: string | null
}

type AppRoleDbRow = {
  key: string
  label: string | null
  description: string | null
  allowed_modules: string[] | null
  is_system: boolean | null
  active: boolean | null
  created_at: string | null
  updated_at: string | null
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    throw new Error('Correo electrónico inválido')
  }
  return email
}

function readErrorMessage(error: { message?: string } | null | undefined) {
  return error?.message || 'Error de Supabase'
}

function normalizeRoleLabel(value: unknown) {
  const label = String(value ?? '').trim()
  if (!label) {
    throw new Error('El nombre visible del rol es obligatorio')
  }
  return label
}

function normalizeRoleDescription(value: unknown) {
  const description = String(value ?? '').trim()
  return description || null
}

function getAuthStatus(user: User): AdminUserAuthStatus {
  if (user.banned_until) return 'blocked'
  if (user.last_sign_in_at) return 'active'
  if (user.email_confirmed_at || user.confirmed_at) return 'confirmed'
  if (user.invited_at) return 'invited'
  return 'pending'
}

function toAdminUserRow(user: User, profile: UserProfileRow | null, currentUserId: string | null): AdminUserRow {
  return {
    id: user.id,
    email: user.email ?? profile?.email ?? '',
    role: normalizeUserRole(profile?.role),
    authStatus: getAuthStatus(user),
    createdAt: user.created_at ?? profile?.created_at ?? null,
    updatedAt: profile?.updated_at ?? user.updated_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? user.confirmed_at ?? null,
    invitedAt: user.invited_at ?? null,
    recoverySentAt: user.recovery_sent_at ?? null,
    hasProfile: Boolean(profile),
    isCurrentUser: user.id === currentUserId,
  }
}

function toAdminRoleRow(row: AppRoleDbRow, userCount: number): AdminRoleRow {
  const roleKey = normalizeUserRole(row.key)
  const modules = roleKey === ADMIN_ROLE
    ? sanitizeAllowedModules(APP_MODULES.map((module) => module.key))
    : sanitizeAllowedModules(row.allowed_modules)

  return {
    key: roleKey,
    label: getRoleLabel(roleKey, row.label),
    description: row.description ?? null,
    allowedModules: modules,
    isSystem: row.is_system === true,
    active: row.active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userCount,
  }
}

function toFallbackRoleRow(roleKey: string, userCount: number): AdminRoleRow {
  return {
    key: roleKey,
    label: getRoleLabel(roleKey),
    description: null,
    allowedModules: getDefaultModulesForRole(roleKey),
    isSystem: true,
    active: true,
    createdAt: null,
    updatedAt: null,
    userCount,
  }
}

async function fetchAllAuthUsers(admin: SupabaseAdminClient) {
  const perPage = 1000
  const users: User[] = []

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      throw new Error(`No se pudo listar usuarios de Supabase Auth: ${readErrorMessage(error)}`)
    }

    const batch = data.users ?? []
    users.push(...batch)
    if (batch.length < perPage) break
  }

  return users
}

async function fetchProfiles(admin: SupabaseAdminClient) {
  const { data, error } = await admin
    .from('user_profiles')
    .select('id,email,role,created_at,updated_at')

  if (error) {
    throw new Error(`No se pudo leer public.user_profiles: ${readErrorMessage(error)}`)
  }

  return (data ?? []) as UserProfileRow[]
}

async function fetchRoleRows(admin: SupabaseAdminClient) {
  const { data, error } = await admin
    .from('app_roles')
    .select('key,label,description,allowed_modules,is_system,active,created_at,updated_at')
    .order('is_system', { ascending: false })
    .order('label', { ascending: true })

  if (error) {
    throw new Error(`No se pudo leer public.app_roles: ${readErrorMessage(error)}`)
  }

  return (data ?? []) as AppRoleDbRow[]
}

async function fetchRoleByKey(admin: SupabaseAdminClient, role: UserRole) {
  const { data, error } = await admin
    .from('app_roles')
    .select('key,label,description,allowed_modules,is_system,active,created_at,updated_at')
    .eq('key', role)
    .maybeSingle()

  if (error) {
    throw new Error(`No se pudo leer public.app_roles: ${readErrorMessage(error)}`)
  }

  return data as AppRoleDbRow | null
}

async function assertActiveRole(admin: SupabaseAdminClient, roleValue: unknown) {
  const role = assertUserRole(roleValue)
  const row = await fetchRoleByKey(admin, role)

  if (!row || row.active === false) {
    throw new Error('El rol no existe o está inactivo')
  }

  return role
}

async function upsertUserProfile(
  admin: SupabaseAdminClient,
  input: { userId: string; email: string | null; role: UserRole }
) {
  const { data, error } = await admin
    .from('user_profiles')
    .upsert(
      {
        id: input.userId,
        email: input.email,
        role: input.role,
      },
      { onConflict: 'id' }
    )
    .select('id,email,role,created_at,updated_at')
    .single()

  if (error) {
    throw new Error(`No se pudo guardar el rol en public.user_profiles: ${readErrorMessage(error)}`)
  }

  return data as UserProfileRow
}

async function findAuthUserByEmail(admin: SupabaseAdminClient, email: string) {
  const users = await fetchAllAuthUsers(admin)
  return users.find((user) => (user.email ?? '').toLowerCase() === email) ?? null
}

async function fetchAuthUserById(admin: SupabaseAdminClient, userId: string) {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error) {
    throw new Error(`No se pudo leer el usuario en Supabase Auth: ${readErrorMessage(error)}`)
  }

  if (!data.user) {
    throw new Error('Usuario no encontrado en Supabase Auth')
  }

  return data.user
}

async function countUserQuotations(admin: SupabaseAdminClient, userId: string) {
  const { count, error } = await admin
    .from('cot_cotizaciones')
    .select('id', { count: 'exact', head: true })
    .eq('creado_por', userId)

  if (error) {
    throw new Error(`No se pudo validar las cotizaciones del usuario: ${readErrorMessage(error)}`)
  }

  return count ?? 0
}

async function getAuthRedirectTo(destination: 'callback' | 'accept-invite') {
  const headerStore = await headers()
  const origin = headerStore.get('origin')
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host')
  const protocol = headerStore.get('x-forwarded-proto') ?? 'https'
  const baseUrl = origin ?? (host ? `${protocol}://${host}` : null)

  if (!baseUrl) {
    throw new Error('No se pudo resolver el origen de la aplicacion para el enlace de autenticacion.')
  }

  if (destination === 'accept-invite') {
    return `${baseUrl}/auth/accept-invite`
  }

  return `${baseUrl}/auth/callback?next=${encodeURIComponent('/auth/update-password')}`
}

function revalidateUsers() {
  revalidatePath('/configuration')
  revalidatePath('/configuration/users')
}

export async function getUsersAction(): Promise<AdminUserRow[]> {
  const access = await assertRole('admin')
  const admin = createSupabaseAdminClient()
  const [users, profiles] = await Promise.all([
    fetchAllAuthUsers(admin),
    fetchProfiles(admin),
  ])
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))

  return users
    .map((user) => toAdminUserRow(user, profilesById.get(user.id) ?? null, access.user?.id ?? null))
    .sort((a, b) => a.email.localeCompare(b.email))
}

export async function getRolesAction(): Promise<AdminRoleRow[]> {
  await assertRole('admin')
  const admin = createSupabaseAdminClient()
  const [roles, profiles] = await Promise.all([
    fetchRoleRows(admin),
    fetchProfiles(admin),
  ])
  const counts = profiles.reduce<Map<string, number>>((acc, profile) => {
    const role = normalizeUserRole(profile.role)
    acc.set(role, (acc.get(role) ?? 0) + 1)
    return acc
  }, new Map<string, number>())

  const rows = roles.map((role) => toAdminRoleRow(role, counts.get(normalizeUserRole(role.key)) ?? 0))
  for (const [role, count] of counts.entries()) {
    if (!rows.some((row) => row.key === role)) {
      rows.push(toFallbackRoleRow(role, count))
    }
  }

  return rows.sort((a, b) => {
    if (a.key === ADMIN_ROLE) return -1
    if (b.key === ADMIN_ROLE) return 1
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
    return a.label.localeCompare(b.label)
  })
}

export async function inviteUserAction(input: { email: string; role: UserRole }): Promise<InviteUserResult> {
  const access = await assertRole('admin')
  const email = normalizeEmail(input.email)
  const admin = createSupabaseAdminClient()
  const role = await assertActiveRole(admin, input.role)

  let authUser = await findAuthUserByEmail(admin, email)
  let status: InviteUserResult['status'] = 'existing'

  if (!authUser) {
    const redirectTo = await getAuthRedirectTo('accept-invite')
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { app_role: role },
    })

    if (error) {
      throw new Error(`No se pudo enviar la invitación: ${readErrorMessage(error)}`)
    }

    if (!data.user) {
      throw new Error('Supabase no retorno el usuario invitado.')
    }

    authUser = data.user
    status = 'invited'
  }

  const profile = await upsertUserProfile(admin, {
    userId: authUser.id,
    email: authUser.email ?? email,
    role,
  })

  revalidateUsers()

  return {
    status,
    user: toAdminUserRow(authUser, profile, access.user?.id ?? null),
  }
}

export async function updateUserRoleAction(input: { userId: string; role: UserRole }): Promise<AdminUserRow> {
  const access = await assertRole('admin')
  const userId = String(input.userId ?? '').trim()
  const admin = createSupabaseAdminClient()
  const role = await assertActiveRole(admin, input.role)

  if (!userId) {
    throw new Error('userId requerido')
  }

  if (userId === access.user?.id && role !== 'admin') {
    throw new Error('No puedes quitarte tu propio rol admin.')
  }

  const authUser = await fetchAuthUserById(admin, userId)
  const profile = await upsertUserProfile(admin, {
    userId: authUser.id,
    email: authUser.email ?? null,
    role,
  })

  revalidateUsers()

  return toAdminUserRow(authUser, profile, access.user?.id ?? null)
}

export async function sendUserRecoveryAction(input: { userId: string }) {
  await assertRole('admin')
  const userId = String(input.userId ?? '').trim()

  if (!userId) {
    throw new Error('userId requerido')
  }

  const admin = createSupabaseAdminClient()
  const authUser = await fetchAuthUserById(admin, userId)
  const email = normalizeEmail(authUser.email)
  const redirectTo = await getAuthRedirectTo('callback')
  const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) {
    throw new Error(`No se pudo enviar el correo de recuperación: ${readErrorMessage(error)}`)
  }

  return { success: true }
}

export async function deleteUserAction(input: { userId: string }) {
  const access = await assertRole('admin')
  const userId = String(input.userId ?? '').trim()

  if (!userId) {
    throw new Error('userId requerido')
  }

  if (userId === access.user?.id) {
    throw new Error('No puedes eliminar tu propio usuario.')
  }

  const admin = createSupabaseAdminClient()
  const authUser = await fetchAuthUserById(admin, userId)
  const quotationCount = await countUserQuotations(admin, userId)

  if (quotationCount > 0) {
    const quotationDescription = quotationCount === 1
      ? 'una cotización creada'
      : `${quotationCount} cotizaciones creadas`
    throw new Error(
      `No se puede eliminar ${authUser.email ?? 'este usuario'} porque tiene ${quotationDescription}.`
    )
  }

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    throw new Error(`No se pudo eliminar el usuario: ${readErrorMessage(error)}`)
  }

  revalidateUsers()
  return { id: userId }
}

export async function createRoleAction(input: SaveRoleInput): Promise<AdminRoleRow> {
  await assertRole('admin')
  const key = assertUserRole(input.key)
  if (key === ADMIN_ROLE) {
    throw new Error('El rol admin es fijo y no se puede crear manualmente.')
  }

  const label = normalizeRoleLabel(input.label)
  const description = normalizeRoleDescription(input.description)
  const allowedModules = sanitizeAllowedModules(input.allowedModules, { assignableOnly: true })
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('app_roles')
    .insert({
      key,
      label,
      description,
      allowed_modules: allowedModules,
      is_system: false,
      active: input.active !== false,
    })
    .select('key,label,description,allowed_modules,is_system,active,created_at,updated_at')
    .single()

  if (error) {
    throw new Error(`No se pudo crear el rol: ${readErrorMessage(error)}`)
  }

  revalidateUsers()

  return toAdminRoleRow(data as AppRoleDbRow, 0)
}

export async function updateRoleAction(input: SaveRoleInput): Promise<AdminRoleRow> {
  await assertRole('admin')
  const key = assertUserRole(input.key)
  if (key === ADMIN_ROLE) {
    throw new Error('El rol admin es fijo y conserva acceso total.')
  }

  const label = normalizeRoleLabel(input.label)
  const description = normalizeRoleDescription(input.description)
  const allowedModules = sanitizeAllowedModules(input.allowedModules, { assignableOnly: true })
  const admin = createSupabaseAdminClient()
  const current = await fetchRoleByKey(admin, key)
  if (!current) {
    throw new Error('Rol no encontrado')
  }

  const { data, error } = await admin
    .from('app_roles')
    .update({
      label,
      description,
      allowed_modules: allowedModules,
      active: input.active !== false,
    })
    .eq('key', key)
    .select('key,label,description,allowed_modules,is_system,active,created_at,updated_at')
    .single()

  if (error) {
    throw new Error(`No se pudo actualizar el rol: ${readErrorMessage(error)}`)
  }

  revalidateUsers()

  return toAdminRoleRow(data as AppRoleDbRow, 0)
}
