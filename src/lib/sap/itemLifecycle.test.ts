import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifySapDeletionBlockReason,
  isSapLifecycleState,
  readSapItemLifecycleState,
  sapPayloadForTargetStatus,
} from './itemLifecycle'

test('reads SAP active and frozen flags into the lifecycle state', () => {
  const state = readSapItemLifecycleState({
    ItemCode: ' sku-001-0001 ',
    ItemName: 'Producto piloto',
    Valid: 'tYES',
    Frozen: 'tNO',
  })

  assert.deepEqual(state, {
    itemCode: 'SKU-001-0001',
    itemName: 'Producto piloto',
    valid: true,
    frozen: false,
  })
  assert.equal(isSapLifecycleState(state, 'ACTIVO'), true)
  assert.equal(isSapLifecycleState(state, 'INACTIVO'), false)
})

test('builds the exact status payloads required by SAP', () => {
  assert.deepEqual(sapPayloadForTargetStatus('ACTIVO'), { Valid: 'tYES', Frozen: 'tNO' })
  assert.deepEqual(sapPayloadForTargetStatus('INACTIVO'), { Valid: 'tNO', Frozen: 'tYES' })
})

test('classifies deletion blocks from SAP association messages', () => {
  assert.equal(classifySapDeletionBlockReason('Associated to a superior ProductTree'), 'SUPERIOR_BOM')
  assert.equal(classifySapDeletionBlockReason('The item is linked to a production order'), 'PRODUCTION_ORDER')
  assert.equal(classifySapDeletionBlockReason('The item has document movements'), 'DOCUMENT_ASSOCIATION')
  assert.equal(classifySapDeletionBlockReason('SAP rejected the operation'), 'UNKNOWN')
})
