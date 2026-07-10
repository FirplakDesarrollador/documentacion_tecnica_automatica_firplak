'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  MailPlus,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserCog,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ADMIN_ROLE,
  APP_MODULES,
  getRoleLabel,
  type ModulePermission,
  type UserRole,
} from '@/types/auth'

import {
  createRoleAction,
  getRolesAction,
  getUsersAction,
  inviteUserAction,
  sendUserRecoveryAction,
  updateRoleAction,
  updateUserRoleAction,
} from './actions'
import type { AdminRoleRow, AdminUserAuthStatus, AdminUserRow, SaveRoleInput } from './types'

type RoleFormState = {
  isNew: boolean
  key: string
  label: string
  description: string
  active: boolean
  allowedModules: ModulePermission[]
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Error desconocido'
}

function formatDate(value: string | null) {
  if (!value) return 'Sin registro'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin registro'
  return date.toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusLabel(status: AdminUserAuthStatus) {
  if (status === 'active') return 'Activo'
  if (status === 'confirmed') return 'Confirmado'
  if (status === 'invited') return 'Invitado'
  if (status === 'blocked') return 'Bloqueado'
  return 'Pendiente'
}

function getStatusClass(status: AdminUserAuthStatus) {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'confirmed') return 'border-indigo-200 bg-indigo-50 text-indigo-700'
  if (status === 'invited') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'blocked') return 'border-red-200 bg-red-50 text-red-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function syncUser(users: AdminUserRow[], user: AdminUserRow) {
  const next = [...users]
  const index = next.findIndex((item) => item.id === user.id)
  if (index >= 0) next[index] = user
  else next.unshift(user)
  return next.sort((a, b) => a.email.localeCompare(b.email))
}

function syncRole(roles: AdminRoleRow[], role: AdminRoleRow) {
  const next = [...roles]
  const index = next.findIndex((item) => item.key === role.key)
  const withCount = index >= 0 ? { ...role, userCount: roles[index].userCount } : role
  if (index >= 0) next[index] = withCount
  else next.push(withCount)

  return next.sort((a, b) => {
    if (a.key === ADMIN_ROLE) return -1
    if (b.key === ADMIN_ROLE) return 1
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
    return a.label.localeCompare(b.label)
  })
}

function getDefaultInviteRole(roles: AdminRoleRow[]) {
  const pending = roles.find((role) => role.key === 'pending' && role.active)
  if (pending) return pending.key
  return roles.find((role) => role.active && role.key !== ADMIN_ROLE)?.key ?? 'pending'
}

function toRoleForm(role: AdminRoleRow | null): RoleFormState {
  if (!role) {
    return {
      isNew: true,
      key: '',
      label: '',
      description: '',
      active: true,
      allowedModules: [],
    }
  }

  return {
    isNew: false,
    key: role.key,
    label: role.label,
    description: role.description ?? '',
    active: role.active,
    allowedModules: [...role.allowedModules],
  }
}

function buildRoleInput(form: RoleFormState): SaveRoleInput {
  return {
    key: form.key.trim().toLowerCase(),
    label: form.label.trim(),
    description: form.description.trim() || null,
    active: form.active,
    allowedModules: form.allowedModules,
  }
}

export default function UsersClient({
  initialUsers,
  initialRoles,
  initialError,
}: {
  initialUsers: AdminUserRow[]
  initialRoles: AdminRoleRow[]
  initialError: string | null
}) {
  const [users, setUsers] = useState<AdminUserRow[]>(initialUsers)
  const [roles, setRoles] = useState<AdminRoleRow[]>(initialRoles)
  const [searchTerm, setSearchTerm] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>(() => getDefaultInviteRole(initialRoles))
  const [roleFormOpen, setRoleFormOpen] = useState(false)
  const [roleForm, setRoleForm] = useState<RoleFormState>(() => toRoleForm(null))
  const [isInviting, setIsInviting] = useState(false)
  const [isSavingRole, setIsSavingRole] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const roleByKey = useMemo(() => new Map(roles.map((role) => [role.key, role])), [roles])
  const activeRoles = useMemo(() => roles.filter((role) => role.active), [roles])

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return users

    return users.filter((user) => {
      const roleLabel = roleByKey.get(user.role)?.label ?? getRoleLabel(user.role)
      return user.email.toLowerCase().includes(query)
        || user.id.toLowerCase().includes(query)
        || user.role.toLowerCase().includes(query)
        || roleLabel.toLowerCase().includes(query)
    })
  }, [roleByKey, searchTerm, users])

  const refreshUsersAndRoles = async () => {
    setIsRefreshing(true)
    try {
      const [nextUsers, nextRoles] = await Promise.all([
        getUsersAction(),
        getRolesAction(),
      ])
      setUsers(nextUsers)
      setRoles(nextRoles)
      setInviteRole((current) => (
        nextRoles.some((role) => role.key === current && role.active) ? current : getDefaultInviteRole(nextRoles)
      ))
      toast.success('Usuarios y roles actualizados.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsRefreshing(false)
    }
  }

  const openNewRole = () => {
    setRoleForm(toRoleForm(null))
    setRoleFormOpen(true)
  }

  const openEditRole = (role: AdminRoleRow) => {
    setRoleForm(toRoleForm(role))
    setRoleFormOpen(true)
  }

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsInviting(true)
    try {
      const result = await inviteUserAction({ email: inviteEmail, role: inviteRole })
      setUsers((current) => syncUser(current, result.user))
      await refreshUsersAndRoles()
      setInviteEmail('')
      setInviteOpen(false)
      toast.success(result.status === 'invited'
        ? 'Invitacion enviada correctamente.'
        : 'El usuario ya existia; se actualizo su rol.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsInviting(false)
    }
  }

  const handleRoleChange = async (user: AdminUserRow, role: UserRole) => {
    if (role === user.role) return

    setBusyKey(`role:${user.id}`)
    try {
      const updated = await updateUserRoleAction({ userId: user.id, role })
      setUsers((current) => syncUser(current, updated))
      await refreshUsersAndRoles()
      toast.success('Rol actualizado.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusyKey(null)
    }
  }

  const handleRecovery = async (user: AdminUserRow) => {
    setBusyKey(`recovery:${user.id}`)
    try {
      await sendUserRecoveryAction({ userId: user.id })
      toast.success('Correo de acceso enviado.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusyKey(null)
    }
  }

  const toggleRoleModule = (moduleKey: ModulePermission) => {
    setRoleForm((current) => {
      const exists = current.allowedModules.includes(moduleKey)
      return {
        ...current,
        allowedModules: exists
          ? current.allowedModules.filter((item) => item !== moduleKey)
          : [...current.allowedModules, moduleKey],
      }
    })
  }

  const handleSaveRole = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSavingRole(true)
    try {
      const input = buildRoleInput(roleForm)
      const saved = roleForm.isNew
        ? await createRoleAction(input)
        : await updateRoleAction(input)
      setRoles((current) => syncRole(current, saved))
      setRoleFormOpen(false)
      toast.success(roleForm.isNew ? 'Rol creado.' : 'Rol actualizado.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsSavingRole(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-2">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/configuration">
            <Button variant="outline" size="icon" className="border-slate-200 text-slate-700 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Usuarios y roles</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Administra cuentas de Supabase Auth y roles RBAC desde public.app_roles.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="border-slate-200"
            onClick={refreshUsersAndRoles}
            disabled={isRefreshing}
          >
            {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Actualizar
          </Button>
          <Button onClick={openNewRole} variant="outline" className="border-slate-200">
            <PlusCircle className="mr-2 h-4 w-4" />
            Nuevo rol
          </Button>
          <Button onClick={() => setInviteOpen(true)} className="bg-slate-900 text-white hover:bg-slate-800">
            <MailPlus className="mr-2 h-4 w-4" />
            Invitar usuario
          </Button>
        </div>
      </div>

      {initialError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          {initialError}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Roles y accesos por modulo</h2>
            <p className="text-sm text-slate-500">
              Elige exactamente que modulos puede abrir cada rol. Admin conserva acceso total.
            </p>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {roles.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
              No hay roles cargados. Aplica la migracion local de app_roles en Supabase I+D para habilitar esta seccion.
            </div>
          ) : roles.map((role) => (
            <div key={role.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-900">{role.label}</h3>
                    <Badge variant={role.active ? 'secondary' : 'outline'}>{role.active ? 'Activo' : 'Inactivo'}</Badge>
                    {role.isSystem ? <Badge variant="outline">Sistema</Badge> : null}
                    {role.key === ADMIN_ROLE ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Fijo</Badge> : null}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-400">{role.key}</div>
                  <p className="mt-2 text-sm text-slate-600">{role.description || 'Sin descripcion.'}</p>
                  <p className="mt-2 text-xs font-medium text-slate-500">Usuarios asignados: {role.userCount}</p>
                </div>
                <Button
                  variant="outline"
                  className="border-slate-200"
                  onClick={() => openEditRole(role)}
                  disabled={role.key === ADMIN_ROLE}
                  title={role.key === ADMIN_ROLE ? 'Admin conserva acceso total y no se edita.' : undefined}
                >
                  {role.key === ADMIN_ROLE ? <Lock className="mr-2 h-4 w-4" /> : <UserCog className="mr-2 h-4 w-4" />}
                  {role.key === ADMIN_ROLE ? 'Bloqueado' : 'Editar'}
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {APP_MODULES.map((module) => {
                  const enabled = role.key === ADMIN_ROLE || role.allowedModules.includes(module.key)
                  return (
                    <span
                      key={`${role.key}:${module.key}`}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${
                        enabled
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-400'
                      }`}
                    >
                      {module.label}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/60 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex w-full items-center gap-2 md:max-w-lg">
            <Search className="h-4 w-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por correo, id o rol..."
              className="bg-white"
            />
          </div>
          <div className="text-xs font-medium text-slate-500">
            Total: <span className="font-bold text-slate-700">{users.length}</span>
            {searchTerm.trim() ? (
              <> | Filtrados: <span className="font-bold text-slate-700">{filteredUsers.length}</span></>
            ) : null}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Ultimo ingreso</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                  No hay usuarios para mostrar.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => {
                const roleBusy = busyKey === `role:${user.id}`
                const recoveryBusy = busyKey === `recovery:${user.id}`
                const roleDisabled = user.isCurrentUser || roleBusy
                const currentRole = roleByKey.get(user.role)
                const roleOptions = activeRoles.some((role) => role.key === user.role)
                  ? activeRoles
                  : currentRole
                    ? [currentRole, ...activeRoles]
                    : activeRoles

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 font-semibold text-slate-900">
                          {user.email || 'Sin correo'}
                          {user.isCurrentUser ? (
                            <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700">Tu usuario</Badge>
                          ) : null}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">{user.id}</div>
                        {!user.hasProfile ? (
                          <div className="text-xs font-medium text-amber-700">Sin perfil RBAC; se normaliza como pendiente.</div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <select
                          value={user.role}
                          disabled={roleDisabled || roleOptions.length === 0}
                          onChange={(event) => handleRoleChange(user, event.target.value)}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          title={user.isCurrentUser ? 'No puedes cambiar tu propio rol admin desde aqui.' : undefined}
                        >
                          {roleOptions.map((role) => (
                            <option key={role.key} value={role.key}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                        {roleBusy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-bold ${getStatusClass(user.authStatus)}`}>
                          {getStatusLabel(user.authStatus)}
                        </span>
                        <span className="text-xs text-slate-400">Creado: {formatDate(user.createdAt)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-slate-700">{formatDate(user.lastSignInAt)}</div>
                      <div className="text-xs text-slate-400">Actualizado: {formatDate(user.updatedAt)}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        className="border-slate-200"
                        onClick={() => handleRecovery(user)}
                        disabled={recoveryBusy || !user.email}
                      >
                        {recoveryBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                        Enviar acceso
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <UserCog className="h-5 w-5 text-slate-700" />
              Invitar usuario
            </DialogTitle>
            <DialogDescription>
              Supabase enviara el correo de invitacion. La app guardara el rol inicial en public.user_profiles.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInvite} className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-xs font-bold uppercase text-slate-700">Correo</Label>
              <Input
                type="email"
                required
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="usuario@firplak.com"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs font-bold uppercase text-slate-700">Rol inicial</Label>
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              >
                {activeRoles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs leading-relaxed text-indigo-800">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>No se muestra ni se copia ningun token de invitacion. El correo sale directamente desde Supabase Auth.</span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" className="border-slate-200" onClick={() => setInviteOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isInviting || activeRoles.length === 0} className="bg-slate-900 text-white hover:bg-slate-800">
                {isInviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Enviar invitacion
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={roleFormOpen} onOpenChange={setRoleFormOpen}>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 p-0 sm:max-w-[680px]">
          <DialogHeader className="border-b border-slate-100 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <UserCog className="h-5 w-5 text-slate-700" />
              {roleForm.isNew ? 'Nuevo rol' : 'Editar rol'}
            </DialogTitle>
            <DialogDescription>
              Los permisos se configuran por modulo. Admin conserva acceso total y no se edita desde esta pantalla.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveRole} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-bold uppercase text-slate-700">Key</Label>
                  <Input
                    value={roleForm.key}
                    onChange={(event) => setRoleForm((current) => ({ ...current, key: event.target.value.toLowerCase() }))}
                    disabled={!roleForm.isNew}
                    placeholder="ej: calidad"
                    pattern="[a-z][a-z0-9_-]{1,31}"
                    required
                    className="h-9"
                  />
                  <p className="text-xs text-slate-400">Minusculas, numeros, guion y guion bajo.</p>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-bold uppercase text-slate-700">Nombre visible</Label>
                  <Input
                    value={roleForm.label}
                    onChange={(event) => setRoleForm((current) => ({ ...current, label: event.target.value }))}
                    placeholder="Ej: Calidad"
                    required
                    className="h-9"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs font-bold uppercase text-slate-700">Descripcion</Label>
                <Input
                  value={roleForm.description}
                  onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Uso esperado del rol"
                  className="h-9"
                />
              </div>

              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={roleForm.active}
                  onChange={(event) => setRoleForm((current) => ({ ...current, active: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Rol activo
              </label>

              <div className="grid gap-2">
                <Label className="text-xs font-bold uppercase text-slate-700">Modulos permitidos</Label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {APP_MODULES.map((module) => {
                    const checked = roleForm.allowedModules.includes(module.key)
                    const disabled = !module.assignable
                    return (
                      <label
                        key={module.key}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${
                          disabled
                            ? 'border-slate-200 bg-slate-50 text-slate-400'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleRoleModule(module.key)}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 disabled:opacity-50"
                        />
                        <span className="min-w-0 truncate font-semibold">
                          {module.label}
                          {disabled ? <Lock className="ml-1 inline h-3 w-3 shrink-0" /> : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 px-5 py-3">
              <Button type="button" variant="outline" className="border-slate-200" onClick={() => setRoleFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSavingRole} className="bg-slate-900 text-white hover:bg-slate-800">
                {isSavingRole ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar rol
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
