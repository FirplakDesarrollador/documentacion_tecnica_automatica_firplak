export type ActivityEventKind = 'product' | 'asset' | 'sap' | 'estimation'

export type ActivityEvent = {
  kind: ActivityEventKind
  action: string
  title: string
  subtitle: string
  occurredAt: string
  href: string | null
}

const CREATED_THRESHOLD_MS = 1_000

export function normalizeActivityTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || Number.isNaN(Date.parse(normalized))) return null
  return normalized
}

export function isCreatedActivity(createdAt: string | null, updatedAt: string | null): boolean {
  if (!createdAt || !updatedAt) return false
  return Math.abs(Date.parse(createdAt) - Date.parse(updatedAt)) <= CREATED_THRESHOLD_MS
}

export function mergeActivityEvents(events: ActivityEvent[], limit = 6): ActivityEvent[] {
  return [...events]
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, limit)
}

export function formatActivityRelativeTime(value: string, now = Date.now()): string {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return 'Fecha no disponible'

  const differenceSeconds = Math.round((timestamp - now) / 1_000)
  const absoluteSeconds = Math.abs(differenceSeconds)
  const [amount, unit] = absoluteSeconds < 60
    ? [differenceSeconds, 'second']
    : absoluteSeconds < 3_600
      ? [Math.round(differenceSeconds / 60), 'minute']
      : absoluteSeconds < 86_400
        ? [Math.round(differenceSeconds / 3_600), 'hour']
        : [Math.round(differenceSeconds / 86_400), 'day']

  return new Intl.RelativeTimeFormat('es', { numeric: 'auto' }).format(amount, unit as Intl.RelativeTimeFormatUnit)
}
