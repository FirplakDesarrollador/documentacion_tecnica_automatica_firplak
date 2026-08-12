import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyInventoryEntryPurpose } from './inventoryEntryPurpose'

test('clasifica una entrada ligada a orden de producción sin depender del texto', () => {
  const result = classifyInventoryEntryPurpose({ quantity: 10, baseType: 202, comments: 'entrada normal' })
  assert.equal(result.purpose, 'production')
})

test('excluye reclasificaciones y compensaciones detectables en el comentario', () => {
  assert.equal(
    classifyInventoryEntryPurpose({ quantity: 5, baseType: -1, comments: 'Cambio de referencia basado en salida de mercancías 94643.' }).purpose,
    'reclassification',
  )
  assert.equal(
    classifyInventoryEntryPurpose({ quantity: 5, baseType: -1, comments: 'Cruza con salida #64895' }).purpose,
    'compensation',
  )
})

test('excluye muestras aun cuando la evidencia use tildes', () => {
  const result = classifyInventoryEntryPurpose({ quantity: 3, baseType: -1, comments: 'Muestra técnica de proveedor' })
  assert.equal(result.purpose, 'sample')
})

test('deja una entrada positiva sin señal excluyente como candidato temporal', () => {
  const result = classifyInventoryEntryPurpose({ quantity: 240, baseType: -1, comments: 'Andercol remisión 9107182172' })
  assert.equal(result.purpose, 'purchase_like')
})

test('no habilita una entrada sin cantidad positiva', () => {
  const result = classifyInventoryEntryPurpose({ quantity: 0, baseType: -1 })
  assert.equal(result.purpose, 'unknown')
})
