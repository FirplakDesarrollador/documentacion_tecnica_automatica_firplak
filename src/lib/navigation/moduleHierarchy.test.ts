import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getNavigationHref,
  isModuleNavigationNodeActive,
  resolveModuleNavigationTree,
  type ResolvedModuleNavigationNode,
} from './moduleHierarchy'
import type { Permission } from '@/types/auth'

function resolve(permissions: Permission[], isAdmin = false) {
  return resolveModuleNavigationTree(permissions, isAdmin)
}

function findNode(
  nodes: readonly ResolvedModuleNavigationNode[],
  nodeId: string
): ResolvedModuleNavigationNode {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    const descendant = node.children.length > 0
      ? findNodeOrNull(node.children, nodeId)
      : null
    if (descendant) return descendant
  }

  throw new Error(`No se encontró el nodo ${nodeId}`)
}

function findNodeOrNull(
  nodes: readonly ResolvedModuleNavigationNode[],
  nodeId: string
): ResolvedModuleNavigationNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    const descendant = findNodeOrNull(node.children, nodeId)
    if (descendant) return descendant
  }

  return null
}

test('keeps documentation-only access inside a virtual product-design branch', () => {
  const tree = resolve(['module:generate'])
  const productDesign = findNode(tree, 'product-design')
  const documentation = findNode(tree, 'technical-documentation')
  const generate = findNode(tree, 'generate')

  assert.equal(productDesign.canNavigate, false)
  assert.equal(documentation.canNavigate, false)
  assert.equal(generate.canNavigate, true)
  assert.equal(getNavigationHref(generate, '/generate?family=chairs'), '/generate?family=chairs')
})

test('keeps print-only access inside productive modules without granting its overview', () => {
  const tree = resolve(['module:print'])
  const productiveModules = findNode(tree, 'productive-modules')
  const print = findNode(tree, 'print')

  assert.equal(productiveModules.canNavigate, false)
  assert.equal(print.canNavigate, true)
  assert.equal(getNavigationHref(print), '/print')
  assert.equal(isModuleNavigationNodeActive(productiveModules, '/print'), true)
})

test('keeps productive-only access without exposing print', () => {
  const tree = resolve(['module:productive-modules'])
  const productiveModules = findNode(tree, 'productive-modules')

  assert.equal(productiveModules.canNavigate, true)
  assert.ok(findNodeOrNull(tree, 'productive-route-sheets'))
  assert.equal(findNodeOrNull(tree, 'print'), null)
})

test('keeps Consulta SAP inside a virtual engineering branch for a partial role', () => {
  const tree = resolve(['module:consulta-sap'])
  const engineering = findNode(tree, 'engineering')
  const consultation = findNode(tree, 'sap-consulting')

  assert.equal(engineering.canNavigate, false)
  assert.equal(consultation.canNavigate, true)
  assert.equal(getNavigationHref(consultation), '/engineering/sap-consulting')
})

test('keeps Sales as a module overview with its shared quotations child', () => {
  const tree = resolve(['module:sales'])
  const sales = findNode(tree, 'sales')
  const estimations = findNode(tree, 'sales-estimations')

  assert.equal(sales.canNavigate, true)
  assert.equal(getNavigationHref(sales), '/sales')
  assert.equal(getNavigationHref(estimations), '/sales/estimations')
})

test('shows users and roles only for administrators', () => {
  const configurationTree = resolve(['module:configuration'])
  assert.equal(findNodeOrNull(configurationTree, 'configuration-users'), null)

  const adminTree = resolve(['module:configuration'], true)
  assert.equal(findNode(adminTree, 'configuration-users').canNavigate, true)
})

test('shows the full hierarchy for an administrator', () => {
  const tree = resolve([
    'module:dashboard',
    'module:product-design',
    'module:generate',
    'module:assets',
    'module:datasets',
    'module:templates',
    'module:pending',
    'module:sales',
    'module:productive-modules',
    'module:print',
    'module:engineering',
    'module:consulta-sap',
    'module:configuration',
  ], true)

  assert.deepEqual(tree.map((node) => node.id), [
    'dashboard',
    'product-design',
    'sales',
    'productive-modules',
    'engineering',
    'configuration',
  ])
  assert.ok(findNodeOrNull(tree, 'technical-documentation'))
  assert.ok(findNodeOrNull(tree, 'configuration-users'))
})
