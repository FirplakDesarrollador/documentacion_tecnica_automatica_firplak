import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ADMIN_ROLE,
  getRoleHomePath,
  hasModuleAccess,
  hasPermission,
  isAllowedUserApi,
  permissionsFromModules,
  resolveRoleAccess,
} from './auth'

test('un permiso padre conserva el acceso completo a todos sus submodulos', () => {
  const permissions = permissionsFromModules('engineering', ['module:engineering'])

  assert.equal(hasPermission(permissions, 'module:engineering:measurements'), true)
  assert.equal(hasPermission(permissions, 'module:engineering:sap-code-creation'), true)
  assert.equal(hasPermission(permissions, 'action:sap-code:manage'), true)
})

test('un rol parcial solo obtiene los submodulos seleccionados y su contenedor', () => {
  const permissions = permissionsFromModules('engineering', ['module:engineering:measurements'])

  assert.equal(hasPermission(permissions, 'module:engineering:measurements'), true)
  assert.equal(hasPermission(permissions, 'module:engineering:sap-auditories'), false)
  assert.equal(hasModuleAccess(permissions, 'module:engineering'), true)
  assert.equal(getRoleHomePath('engineering', permissions), '/engineering/measurements')
})

test('un rol inactivo no conserva permisos y admin mantiene acceso total', () => {
  const inactive = resolveRoleAccess('engineering', {
    key: 'engineering',
    label: 'Ingenieria',
    active: false,
    allowed_modules: ['module:engineering'],
  })
  const admin = resolveRoleAccess(ADMIN_ROLE, null)

  assert.deepEqual(inactive.permissions, [])
  assert.equal(hasPermission(admin.permissions, 'module:configuration:clients'), true)
  assert.equal(hasPermission(admin.permissions, 'action:naming:manage'), true)
})

test('una API de otro submodulo no queda autorizada por el contenedor', () => {
  const permissions = permissionsFromModules('engineering', ['module:engineering:measurements'])

  assert.equal(
    isAllowedUserApi('/api/engineering/sap-operations/transfer-requests/history', 'engineering', permissions),
    false
  )
})

test('Compras muestra el contenedor y define inicio para un acceso parcial a proveedores', () => {
  const permissions = permissionsFromModules('purchasing', ['module:compras:proveedores'])

  assert.equal(hasPermission(permissions, 'module:compras:proveedores'), true)
  assert.equal(hasModuleAccess(permissions, 'module:compras'), true)
  assert.equal(getRoleHomePath('purchasing', permissions), '/compras/proveedores')
  assert.equal(isAllowedUserApi('/api/compras/proveedores', 'purchasing', permissions), true)
})
