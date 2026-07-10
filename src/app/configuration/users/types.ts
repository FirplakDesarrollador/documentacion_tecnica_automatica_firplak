import type { ModulePermission, UserRole } from '@/types/auth'

export type AdminUserAuthStatus = 'active' | 'confirmed' | 'invited' | 'pending' | 'blocked'

export type AdminUserRow = {
  id: string
  email: string
  role: UserRole
  authStatus: AdminUserAuthStatus
  createdAt: string | null
  updatedAt: string | null
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  invitedAt: string | null
  recoverySentAt: string | null
  hasProfile: boolean
  isCurrentUser: boolean
}

export type InviteUserResult = {
  status: 'invited' | 'existing'
  user: AdminUserRow
}

export type AdminRoleRow = {
  key: UserRole
  label: string
  description: string | null
  allowedModules: ModulePermission[]
  isSystem: boolean
  active: boolean
  createdAt: string | null
  updatedAt: string | null
  userCount: number
}

export type SaveRoleInput = {
  key: string
  label: string
  description?: string | null
  allowedModules: ModulePermission[]
  active: boolean
}
