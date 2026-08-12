import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveEstimationFamilyCode,
  deriveEstimationSalesItemPrefix,
  EstimationReferenceProposalError,
  proposeEstimationReference,
} from './estimationReferenceProposal'

test('preserva U_Prefijo y propone la siguiente referencia desde códigos SAP con color y sufijos', () => {
  const proposal = proposeEstimationReference({
    sapPrefix: 'BAN29',
    salesItemPrefix: 'VBAN29',
    existingCodes: [
      'VBAN29-0001-000-0100',
      'VBAN29-0007-000-0494',
      'VBAN29-0012-003-0000',
      'VBAN29-0012',
    ],
  })

  assert.deepEqual(proposal, {
    sapPrefix: 'BAN29',
    salesItemPrefix: 'VBAN29',
    familyCode: 'BAN29',
    referenceCode: '0013',
    referenceKey: 'BAN29-0013',
    sequence: 13,
    isReserved: false,
  })
})

test('solo acepta el patrón U_Prefijo-consecutivo y descarta códigos parecidos o consecutivos no numéricos', () => {
  const proposal = proposeEstimationReference({
    sapPrefix: 'BAN29',
    salesItemPrefix: 'VBAN29',
    existingCodes: [
      'VBAN29-0004-000-0100',
      'VBAN290-9999-000-0100',
      'BAN29-9999',
      'VBAN29-0008A-000-0100',
      'VBAN29-A008-000-0100',
      'OTRO-9999-000-0100',
    ],
  })

  assert.equal(proposal.referenceCode, '0005')
})

test('solo retira una V inicial al derivar la familia y conserva C/P', () => {
  assert.equal(deriveEstimationFamilyCode('VBAN29'), 'BAN29')
  assert.equal(deriveEstimationFamilyCode('CBAN29'), 'CBAN29')
  assert.equal(deriveEstimationFamilyCode('PBAN29'), 'PBAN29')
  assert.equal(deriveEstimationFamilyCode('VVBAN29'), 'VBAN29')
})

test('deriva el prefijo comercial exacto del homólogo y valida su U_Prefijo', () => {
  assert.equal(
    deriveEstimationSalesItemPrefix('VROP03-0019-000-0100', 'ROP03'),
    'VROP03',
  )
  assert.equal(
    deriveEstimationSalesItemPrefix('VBAN29-0001-000-0100', 'VBAN29'),
    'VBAN29',
  )

  assert.throws(
    () => deriveEstimationSalesItemPrefix('VROP03-0019-000-0100', 'ROP01'),
    (error: unknown) => error instanceof EstimationReferenceProposalError
      && error.code === 'inconsistent_sales_item_prefix',
  )
})

test('lee las referencias VROP03 aunque SAP entregue U_Prefijo ROP03', () => {
  const proposal = proposeEstimationReference({
    sapPrefix: 'ROP03',
    salesItemPrefix: 'VROP03',
    existingCodes: [
      'VROP03-0001-000-0100',
      'VROP03-0019-000-0100',
      'ROP03-9999-000-0000',
    ],
  })

  assert.equal(proposal.familyCode, 'ROP03')
  assert.equal(proposal.salesItemPrefix, 'VROP03')
  assert.equal(proposal.referenceCode, '0020')
})

test('normaliza entradas SAP y usa al menos cuatro dígitos para el primer consecutivo', () => {
  const proposal = proposeEstimationReference({
    sapPrefix: '  ban29 ',
    salesItemPrefix: ' vban29 ',
    existingCodes: [],
  })

  assert.equal(proposal.sapPrefix, 'BAN29')
  assert.equal(proposal.salesItemPrefix, 'VBAN29')
  assert.equal(proposal.referenceCode, '0001')
})

test('valida formato de U_Prefijo antes de proponer una referencia', () => {
  assert.throws(
    () => proposeEstimationReference({ sapPrefix: 'V-BAN29', salesItemPrefix: 'VBAN29', existingCodes: [] }),
    (error: unknown) => error instanceof EstimationReferenceProposalError && error.code === 'invalid_u_prefix',
  )

  assert.throws(
    () => deriveEstimationFamilyCode('V'),
    (error: unknown) => error instanceof EstimationReferenceProposalError && error.code === 'invalid_family_code',
  )
})

test('bloquea el desborde antes de devolver una referencia fuera del rango aprobado', () => {
  assert.throws(
    () => proposeEstimationReference({
      sapPrefix: 'BAN29',
      salesItemPrefix: 'VBAN29',
      existingCodes: ['VBAN29-9999-000-0100'],
    }),
    (error: unknown) => error instanceof EstimationReferenceProposalError && error.code === 'reference_sequence_overflow',
  )

  assert.throws(
    () => proposeEstimationReference({
      sapPrefix: 'BAN29',
      salesItemPrefix: 'VBAN29',
      existingCodes: ['VBAN29-10000-000-0100'],
    }),
    (error: unknown) => error instanceof EstimationReferenceProposalError && error.code === 'reference_sequence_overflow',
  )
})

test('permite ampliar el máximo de forma explícita y mantiene el mínimo de cuatro dígitos', () => {
  const proposal = proposeEstimationReference({
    sapPrefix: 'BAN29',
    salesItemPrefix: 'VBAN29',
    existingCodes: ['VBAN29-9999-000-0100'],
    maxSequence: 10_000,
  })

  assert.equal(proposal.referenceCode, '10000')
  assert.equal(proposal.referenceKey, 'BAN29-10000')
})
