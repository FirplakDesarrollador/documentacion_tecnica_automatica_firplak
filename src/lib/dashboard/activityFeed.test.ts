import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatActivityRelativeTime,
  isCreatedActivity,
  mergeActivityEvents,
  normalizeActivityTimestamp,
  type ActivityEvent,
} from './activityFeedUtils'

const now = Date.parse('2026-09-12T12:00:00.000Z')

function event(occurredAt: string, title: string): ActivityEvent {
  return {
    kind: 'product',
    action: 'Producto editado',
    title,
    subtitle: 'Producto',
    occurredAt,
    href: null,
  }
}

test('normalizes only valid activity timestamps', () => {
  assert.equal(normalizeActivityTimestamp('2026-09-12T12:00:00.000Z'), '2026-09-12T12:00:00.000Z')
  assert.equal(normalizeActivityTimestamp(''), null)
  assert.equal(normalizeActivityTimestamp('not-a-date'), null)
  assert.equal(normalizeActivityTimestamp(123), null)
})

test('classifies product creation only when timestamps are effectively equal', () => {
  assert.equal(isCreatedActivity('2026-09-12T12:00:00.000Z', '2026-09-12T12:00:00.999Z'), true)
  assert.equal(isCreatedActivity('2026-09-12T12:00:00.000Z', '2026-09-12T12:00:02.000Z'), false)
  assert.equal(isCreatedActivity(null, '2026-09-12T12:00:00.000Z'), false)
})

test('sorts activity by real date and applies the global limit', () => {
  const events = [
    event('2026-09-10T12:00:00.000Z', 'old'),
    event('2026-09-12T11:00:00.000Z', 'new'),
    event('2026-09-11T12:00:00.000Z', 'middle'),
  ]
  assert.deepEqual(mergeActivityEvents(events, 2).map(item => item.title), ['new', 'middle'])
})

test('formats relative activity time in Spanish', () => {
  assert.equal(formatActivityRelativeTime('2026-09-12T11:59:00.000Z', now), 'hace 1 minuto')
  assert.equal(formatActivityRelativeTime('2026-09-12T12:00:00.000Z', now), 'ahora')
  assert.equal(formatActivityRelativeTime('invalid', now), 'Fecha no disponible')
})
