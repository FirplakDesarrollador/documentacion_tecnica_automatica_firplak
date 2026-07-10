import UsersClient from './UsersClient'
import { getRolesAction, getUsersAction } from './actions'
import type { AdminRoleRow, AdminUserRow } from './types'

export const dynamic = 'force-dynamic'

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'No se pudo cargar la administracion de usuarios.'
}

export default async function UsersPage() {
  let initialUsers: AdminUserRow[] = []
  let initialRoles: AdminRoleRow[] = []
  let initialError: string | null = null

  try {
    const [users, roles] = await Promise.all([
      getUsersAction(),
      getRolesAction(),
    ])
    initialUsers = users
    initialRoles = roles
  } catch (error) {
    initialError = getErrorMessage(error)
  }

  return (
    <div className="container mx-auto py-10">
      <UsersClient initialUsers={initialUsers} initialRoles={initialRoles} initialError={initialError} />
    </div>
  )
}
