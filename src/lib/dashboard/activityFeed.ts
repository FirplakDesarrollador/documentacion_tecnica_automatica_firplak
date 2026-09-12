import { dbQuery } from '@/lib/supabase'
import { buildPublicDocumentUrl } from '@/lib/documentLinks'
import { hasModuleAccess, type ModulePermission, type Permission } from '@/types/auth'
import {
  isCreatedActivity,
  mergeActivityEvents,
  normalizeActivityTimestamp,
  type ActivityEvent,
} from './activityFeedUtils'

type ActivityPermissions = readonly Permission[]
type ActivityRow = Record<string, unknown>

const SOURCE_LIMIT = 6
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function rowId(row: ActivityRow): string | null {
  return text(row.id)
}

function moduleAllowed(permissions: ActivityPermissions, module: ModulePermission): boolean {
  return hasModuleAccess(permissions, module)
}

function productEvents(rows: ActivityRow[], permissions: ActivityPermissions): ActivityEvent[] {
  if (!moduleAllowed(permissions, 'module:generate')) return []

  return rows.flatMap((row) => {
    const id = rowId(row)
    const occurredAt = normalizeActivityTimestamp(row.updated_at) ?? normalizeActivityTimestamp(row.created_at)
    const code = text(row.sku_complete)
    if (!id || !occurredAt || !code) return []

    const createdAt = normalizeActivityTimestamp(row.created_at)
    const updatedAt = normalizeActivityTimestamp(row.updated_at)
    const action = isCreatedActivity(createdAt, updatedAt) ? 'Producto creado' : 'Producto editado'
    const name = text(row.final_complete_name_es)

    return [{
      kind: 'product' as const,
      action,
      title: code,
      subtitle: name ?? 'Sin nombre configurado',
      occurredAt,
      href: `/generate/${encodeURIComponent(id)}`,
    }]
  })
}

function assetEvents(rows: ActivityRow[], permissions: ActivityPermissions): ActivityEvent[] {
  if (!moduleAllowed(permissions, 'module:assets')) return []

  return rows.flatMap((row) => {
    const id = rowId(row)
    const occurredAt = normalizeActivityTimestamp(row.updated_at) ?? normalizeActivityTimestamp(row.created_at)
    const label = text(row.document_label) ?? text(row.asset_name)
    if (!id || !occurredAt || !label) return []

    const publicSlug = text(row.public_slug)
    const isPublic = row.is_public === true && text(row.status) === 'approved' && publicSlug
    const href = isPublic ? buildPublicDocumentUrl(publicSlug) : '/assets'
    const action = isCreatedActivity(normalizeActivityTimestamp(row.created_at), normalizeActivityTimestamp(row.updated_at))
      ? 'Recurso relacionado'
      : 'Recurso actualizado'

    return [{
      kind: 'asset' as const,
      action,
      title: label,
      subtitle: text(row.sku_complete) ?? text(row.version_label) ?? 'Documento o recurso de producto',
      occurredAt,
      href: href || '/assets',
    }]
  })
}

type SapActivityRoute = {
  action: string
  module: ModulePermission
  href: string | null
}

function sapActivityRoute(row: ActivityRow): SapActivityRoute | null {
  const operationType = text(row.operation_type)
  const itemCode = text(row.item_code)
  if (!operationType) return null

  if (operationType === 'inventory_transfer_request_create' || operationType === 'inventory_transfer_request_update') {
    return {
      action: operationType.endsWith('_create') ? 'Solicitud SAP creada' : 'Solicitud SAP actualizada',
      module: 'module:engineering:transfer-requests',
      href: '/engineering/sap-operations/transfer-requests',
    }
  }

  if (operationType === 'item_status_update' || operationType.startsWith('sap_code_')) {
    return {
      action: 'Código SAP actualizado',
      module: 'module:engineering:sap-code-creation',
      href: itemCode ? `/engineering/sap-operations/sap-code-creation?itemCode=${encodeURIComponent(itemCode)}` : '/engineering/sap-operations/sap-code-creation',
    }
  }

  if (operationType.startsWith('product_tree_') || operationType === 'reference_bom_read') {
    return {
      action: 'BOM SAP actualizada',
      module: 'module:product-design:bom',
      href: '/product-design/bom',
    }
  }

  if (operationType.startsWith('color_')) {
    return {
      action: 'Auditoría SAP registrada',
      module: 'module:engineering:sap-auditories',
      href: '/product-design/color-audit',
    }
  }

  return null
}

function sapEvents(rows: ActivityRow[], permissions: ActivityPermissions): ActivityEvent[] {
  return rows.flatMap((row) => {
    const route = sapActivityRoute(row)
    const id = rowId(row)
    const occurredAt = normalizeActivityTimestamp(row.created_at)
    const relatedItem = text(row.item_code) ?? text(row.subject_key) ?? text(row.operation_type)
    if (!route || !id || !occurredAt || !relatedItem || !moduleAllowed(permissions, route.module)) return []

    const status = text(row.operation_status) ?? (row.success === true ? 'verificada' : 'registrada')
    return [{
      kind: 'sap' as const,
      action: route.action,
      title: relatedItem,
      subtitle: `Estado: ${status}`,
      occurredAt,
      href: route.href,
    }]
  })
}

function estimationEvents(rows: ActivityRow[], permissions: ActivityPermissions): ActivityEvent[] {
  if (!moduleAllowed(permissions, 'module:product-design:estimations')) return []

  return rows.flatMap((row) => {
    const id = rowId(row)
    const occurredAt = normalizeActivityTimestamp(row.updated_at) ?? normalizeActivityTimestamp(row.created_at)
    const title = text(row.provisional_name) ?? text(row.proposed_reference_code)
    if (!id || !occurredAt || !title) return []

    return [{
      kind: 'estimation' as const,
      action: 'Cotización actualizada',
      title,
      subtitle: text(row.status) ? `Estado: ${text(row.status)}` : 'Cotización de producto',
      occurredAt,
      href: `/product-design/estimations/${encodeURIComponent(id)}`,
    }]
  })
}

async function queryActivitySources(permissions: ActivityPermissions): Promise<[ActivityRow[], ActivityRow[], ActivityRow[], ActivityRow[]]> {
  const queries = [
    moduleAllowed(permissions, 'module:generate')
      ? dbQuery(`SELECT s.id, s.sku_complete, s.final_complete_name_es, s.created_at, s.updated_at FROM public.product_skus s ORDER BY s.updated_at DESC, s.id DESC LIMIT ${SOURCE_LIMIT}`)
      : Promise.resolve([]),
    moduleAllowed(permissions, 'module:assets')
      ? dbQuery(`SELECT pal.id, pal.document_label, pal.public_slug, pal.is_public, pal.status, pal.created_at, pal.updated_at, a.name AS asset_name, s.sku_complete, v.version_label FROM public.product_asset_links pal JOIN public.assets a ON a.id = pal.asset_id LEFT JOIN public.product_skus s ON s.id = pal.sku_id LEFT JOIN public.product_versions v ON v.id = pal.version_id ORDER BY pal.updated_at DESC, pal.id DESC LIMIT ${SOURCE_LIMIT}`)
      : Promise.resolve([]),
    dbQuery(`SELECT id, operation_type, item_code, subject_key, operation_status, success, created_at FROM public.sap_operation_logs ORDER BY created_at DESC, id DESC LIMIT ${SOURCE_LIMIT}`),
    moduleAllowed(permissions, 'module:product-design:estimations')
      ? dbQuery(`SELECT id, provisional_name, proposed_reference_code, status, created_at, updated_at FROM public.product_design_estimations ORDER BY updated_at DESC, id DESC LIMIT ${SOURCE_LIMIT}`)
      : Promise.resolve([]),
  ]

  const results = await Promise.allSettled(queries)
  return results.map((result) => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value as ActivityRow[] : []) as [ActivityRow[], ActivityRow[], ActivityRow[], ActivityRow[]]
}

export async function getDashboardActivityFeed(permissions: ActivityPermissions): Promise<ActivityEvent[]> {
  const [products, assets, sap, estimations] = await queryActivitySources(permissions)
  return mergeActivityEvents([
    ...productEvents(products, permissions),
    ...assetEvents(assets, permissions),
    ...sapEvents(sap, permissions),
    ...estimationEvents(estimations, permissions),
  ])
}
