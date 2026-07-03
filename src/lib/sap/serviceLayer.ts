import 'server-only'

import { request as httpsRequest, type RequestOptions } from 'node:https'
import type { IncomingHttpHeaders } from 'node:http'
import { dbQuery } from '@/lib/supabase'

export type SapEntityPayload = Record<string, unknown>

type SapHttpMethod = 'GET' | 'POST' | 'PATCH'

type SapConfig = {
  loginUrl: URL
  baseUrl: string
  companyDb: string
  username: string
  password: string
  rejectUnauthorized: boolean
  timeoutMs: number
}

type SapHttpResponse = {
  statusCode: number
  headers: IncomingHttpHeaders
  bodyText: string
  json: unknown
}

type SapSession = {
  cookieHeader: string
  version: string | null
  sessionTimeoutMinutes: number
  expiresAtMs: number
}

type SapRequestOptions = {
  method?: SapHttpMethod
  body?: SapEntityPayload
  headers?: Record<string, string>
  retryOnUnauthorized?: boolean
}

type SapItemDuplicateInput = {
  sourceItemCode: string
  targetItemCode: string
  overrides?: SapEntityPayload
  omitFields?: string[]
}

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_SESSION_TIMEOUT_MINUTES = 30
const DEFAULT_ITEM_CLONE_OMIT_FIELDS = [
  'odata.metadata',
  'odata.etag',
]
const SAP_WRITES_SETTING_KEY = 'sap_writes_enabled'

let cachedSession: SapSession | null = null
let loginPromise: Promise<SapSession> | null = null

export class SapServiceLayerError extends Error {
  statusCode: number
  sapCode: string | number | null

  constructor(message: string, options?: { statusCode?: number; sapCode?: string | number | null }) {
    super(message)
    this.name = 'SapServiceLayerError'
    this.statusCode = options?.statusCode ?? 500
    this.sapCode = options?.sapCode ?? null
  }
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new SapServiceLayerError(`Missing required SAP environment variable: ${name}`, {
      statusCode: 500,
      sapCode: 'SAP_CONFIG_MISSING',
    })
  }
  return value
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase()
  if (!value) return fallback
  return value === 'true' || value === '1' || value === 'yes' || value === 'si'
}

function readBooleanSetting(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['true', '1', 'yes', 'si'].includes(value.trim().toLowerCase())
  return false
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizeLoginUrl(rawUrl: string): URL {
  const markdownTarget = rawUrl.match(/\((https?:\/\/[^)]+)\)/)?.[1]
    ?? rawUrl.match(/\[(https?:\/\/[^\]]+)\]/)?.[1]
  const normalized = (markdownTarget ?? rawUrl).trim().replace(/^<|>$/g, '')

  try {
    return new URL(normalized)
  } catch {
    throw new SapServiceLayerError('Invalid SAP_API_URL', {
      statusCode: 500,
      sapCode: 'SAP_CONFIG_INVALID_URL',
    })
  }
}

function getSapConfig(): SapConfig {
  const loginUrl = normalizeLoginUrl(readRequiredEnv('SAP_API_URL'))
  const baseUrl = loginUrl.href.replace(/\/Login\/?$/i, '')

  return {
    loginUrl,
    baseUrl,
    companyDb: readRequiredEnv('SAP_COMPANY_DB'),
    username: readRequiredEnv('SAP_USERNAME'),
    password: readRequiredEnv('SAP_PASSWORD'),
    rejectUnauthorized: readBooleanEnv('SAP_REJECT_UNAUTHORIZED', false),
    timeoutMs: readNumberEnv('SAP_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(text: string): unknown {
  if (!text.trim()) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function readStringField(value: unknown, field: string): string | null {
  if (!isRecord(value)) return null
  const candidate = value[field]
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

function readNumberField(value: unknown, field: string): number | null {
  if (!isRecord(value)) return null
  const candidate = value[field]
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null
}

function getSapErrorMessage(json: unknown, fallback: string): { message: string; code: string | number | null } {
  if (!isRecord(json)) return { message: fallback, code: null }
  const error = json.error
  if (!isRecord(error)) return { message: fallback, code: null }

  const code = typeof error.code === 'string' || typeof error.code === 'number' ? error.code : null
  const messageContainer = error.message
  if (isRecord(messageContainer) && typeof messageContainer.value === 'string') {
    return { message: messageContainer.value, code }
  }

  if (typeof messageContainer === 'string') {
    return { message: messageContainer, code }
  }

  return { message: fallback, code }
}

function getCookieHeader(headers: IncomingHttpHeaders, fallbackSessionId: string | null): string {
  const rawCookies = headers['set-cookie']
  const cookieParts = (Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [])
    .map(cookie => cookie.split(';')[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))

  if (cookieParts.length > 0) return cookieParts.join('; ')
  if (fallbackSessionId) return `B1SESSION=${fallbackSessionId}`

  throw new SapServiceLayerError('SAP login succeeded but did not return a session cookie', {
    statusCode: 502,
    sapCode: 'SAP_SESSION_COOKIE_MISSING',
  })
}

function buildSapUrl(path: string): URL {
  if (/^https?:\/\//i.test(path)) return new URL(path)

  const config = getSapConfig()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return new URL(`${config.baseUrl}${normalizedPath}`)
}

function encodeODataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function buildSelectQuery(select?: string[]): string {
  if (!select || select.length === 0) return ''
  const fields = select.map(field => field.trim()).filter(Boolean)
  if (fields.length === 0) return ''
  return `?$select=${encodeURIComponent(fields.join(','))}`
}

async function sapHttpRequest(
  url: URL,
  options: {
    method: SapHttpMethod
    body?: SapEntityPayload
    headers?: Record<string, string>
    timeoutMs?: number
  }
): Promise<SapHttpResponse> {
  const config = getSapConfig()
  const bodyText = options.body ? JSON.stringify(options.body) : undefined
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  }

  if (bodyText) {
    headers['Content-Type'] = 'application/json'
    headers['Content-Length'] = String(Buffer.byteLength(bodyText))
  }

  const requestOptions: RequestOptions = {
    method: options.method,
    rejectUnauthorized: config.rejectUnauthorized,
    headers,
  }

  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, requestOptions, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8')
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          bodyText: responseBody,
          json: parseJson(responseBody),
        })
      })
    })

    req.setTimeout(options.timeoutMs ?? config.timeoutMs, () => {
      req.destroy(new SapServiceLayerError('SAP Service Layer request timed out', {
        statusCode: 504,
        sapCode: 'SAP_TIMEOUT',
      }))
    })
    req.on('error', reject)
    if (bodyText) req.write(bodyText)
    req.end()
  })
}

function assertSapSuccess(response: SapHttpResponse, fallbackMessage: string): void {
  if (response.statusCode >= 200 && response.statusCode < 300) return

  const { message, code } = getSapErrorMessage(response.json, fallbackMessage)
  throw new SapServiceLayerError(message, {
    statusCode: response.statusCode || 502,
    sapCode: code,
  })
}

async function loginToSapServiceLayer(): Promise<SapSession> {
  const config = getSapConfig()
  const response = await sapHttpRequest(config.loginUrl, {
    method: 'POST',
    body: {
      CompanyDB: config.companyDb,
      UserName: config.username,
      Password: config.password,
    },
  })

  assertSapSuccess(response, 'SAP login failed')

  const sessionTimeoutMinutes =
    readNumberField(response.json, 'SessionTimeout') ?? DEFAULT_SESSION_TIMEOUT_MINUTES
  const sessionId = readStringField(response.json, 'SessionId')
  const version = readStringField(response.json, 'Version')
  const cookieHeader = getCookieHeader(response.headers, sessionId)

  return {
    cookieHeader,
    version,
    sessionTimeoutMinutes,
    expiresAtMs: Date.now() + Math.max(1, sessionTimeoutMinutes - 1) * 60_000,
  }
}

async function getSapSession(forceRefresh = false): Promise<SapSession> {
  if (!forceRefresh && cachedSession && cachedSession.expiresAtMs > Date.now()) {
    return cachedSession
  }

  if (!loginPromise) {
    loginPromise = loginToSapServiceLayer()
      .then(session => {
        cachedSession = session
        return session
      })
      .finally(() => {
        loginPromise = null
      })
  }

  return loginPromise
}

function clearSapSession() {
  cachedSession = null
  loginPromise = null
}

async function sapServiceLayerRequest<T = unknown>(
  path: string,
  options: SapRequestOptions = {}
): Promise<T> {
  const retryOnUnauthorized = options.retryOnUnauthorized ?? true
  const session = await getSapSession()
  const response = await sapHttpRequest(buildSapUrl(path), {
    method: options.method ?? 'GET',
    body: options.body,
    headers: {
      Cookie: session.cookieHeader,
      ...options.headers,
    },
  })

  if (response.statusCode === 401 && retryOnUnauthorized) {
    clearSapSession()
    return sapServiceLayerRequest<T>(path, { ...options, retryOnUnauthorized: false })
  }

  assertSapSuccess(response, 'SAP Service Layer request failed')
  return response.json as T
}

function clonePayload(payload: SapEntityPayload): SapEntityPayload {
  return JSON.parse(JSON.stringify(payload)) as SapEntityPayload
}

function pruneSapItemForCreate(item: SapEntityPayload, omitFields: string[] = []): SapEntityPayload {
  const payload = clonePayload(item)
  for (const field of [...DEFAULT_ITEM_CLONE_OMIT_FIELDS, ...omitFields]) {
    delete payload[field]
  }
  return payload
}

function normalizeRequiredCode(value: string, fieldName: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new SapServiceLayerError(`${fieldName} is required`, {
      statusCode: 400,
      sapCode: 'SAP_VALIDATION_ERROR',
    })
  }
  return normalized
}

export async function sapWritesEnabled(): Promise<boolean> {
  const rows = await dbQuery(
    `SELECT value
     FROM public.app_settings
     WHERE key = $1
     LIMIT 1`,
    [SAP_WRITES_SETTING_KEY]
  )
  return readBooleanSetting(rows?.[0]?.value)
}

export async function assertSapWritesEnabled(): Promise<void> {
  if (await sapWritesEnabled()) return

  throw new SapServiceLayerError('SAP write operations are disabled in Configuracion del Sistema.', {
    statusCode: 403,
    sapCode: 'SAP_WRITES_DISABLED_BY_APP_SETTINGS',
  })
}

export async function checkSapServiceLayerHealth(): Promise<{
  connected: boolean
  version: string | null
  sessionTimeoutMinutes: number
  authenticatedReadStatus: number
}> {
  const session = await getSapSession(true)
  const response = await sapHttpRequest(buildSapUrl('/Items?$top=1&$select=ItemCode'), {
    method: 'GET',
    headers: {
      Cookie: session.cookieHeader,
      Accept: 'application/json',
    },
  })

  assertSapSuccess(response, 'SAP authenticated read failed')

  return {
    connected: true,
    version: session.version,
    sessionTimeoutMinutes: session.sessionTimeoutMinutes,
    authenticatedReadStatus: response.statusCode,
  }
}

export async function getSapItem(itemCode: string, select?: string[]): Promise<SapEntityPayload> {
  const normalizedCode = normalizeRequiredCode(itemCode, 'itemCode')
  const query = buildSelectQuery(select)
  const item = await sapServiceLayerRequest<unknown>(`/Items(${encodeODataString(normalizedCode)})${query}`)

  if (!isRecord(item)) {
    throw new SapServiceLayerError('SAP returned an invalid item payload', {
      statusCode: 502,
      sapCode: 'SAP_INVALID_ITEM_PAYLOAD',
    })
  }

  return item
}

export function buildSapItemDuplicatePayload(input: SapItemDuplicateInput & { sourceItem: SapEntityPayload }): SapEntityPayload {
  const targetItemCode = normalizeRequiredCode(input.targetItemCode, 'targetItemCode')
  const payload = pruneSapItemForCreate(input.sourceItem, input.omitFields)

  if (input.overrides) {
    for (const [field, value] of Object.entries(input.overrides)) {
      if (value === undefined) {
        delete payload[field]
      } else {
        payload[field] = value
      }
    }
  }

  payload.ItemCode = targetItemCode
  return payload
}

export async function createSapItem(payload: SapEntityPayload): Promise<unknown> {
  await assertSapWritesEnabled()
  return sapServiceLayerRequest('/Items', {
    method: 'POST',
    body: payload,
  })
}

export async function duplicateSapItem(input: SapItemDuplicateInput): Promise<{
  sourceItem: SapEntityPayload
  createPayload: SapEntityPayload
}> {
  const sourceItemCode = normalizeRequiredCode(input.sourceItemCode, 'sourceItemCode')
  const sourceItem = await getSapItem(sourceItemCode)
  const createPayload = buildSapItemDuplicatePayload({
    ...input,
    sourceItem,
  })

  return {
    sourceItem,
    createPayload,
  }
}

export type BomLine = {
  ItemCode: string
  ItemName: string
  Quantity: number
  Price: number
  Currency: string
  IssueMethod: string
  InventoryUOM: string | null
  ChildNum: number
  ParentItem: string
  Warehouse: string | null
  Comment: string | null
}

export type BomNode = {
  itemCode: string
  itemName: string
  quantity: number
  level: number
  lines: BomNode[]
  loaded: boolean
}

function isBomLine(value: unknown): value is BomLine {
  if (!isRecord(value)) return false
  return typeof value.ItemCode === 'string'
}

function parseBomLines(lines: unknown): BomLine[] {
  if (!Array.isArray(lines)) return []
  return lines.filter(isBomLine)
}

export async function getSapItemBom(itemCode: string): Promise<{
  treeCode: string
  productDescription: string | null
  treeType: string | null
  quantity: number
  lines: BomLine[]
} | null> {
  const normalizedCode = normalizeRequiredCode(itemCode, 'itemCode')
  try {
    const tree = await sapServiceLayerRequest<Record<string, unknown>>(
      `/ProductTrees(${encodeODataString(normalizedCode)})`
    )
    if (!isRecord(tree)) return null
    return {
      treeCode: String(tree.TreeCode ?? ''),
      productDescription: tree.ProductDescription != null ? String(tree.ProductDescription) : null,
      treeType: tree.TreeType != null ? String(tree.TreeType) : null,
      quantity: typeof tree.Quantity === 'number' ? tree.Quantity : 1,
      lines: parseBomLines(tree.ProductTreeLines),
    }
  } catch (error) {
    if (error instanceof SapServiceLayerError && error.statusCode === 404) {
      return null
    }
    throw error
  }
}

export async function getSapItemBomTree(
  itemCode: string
): Promise<{ tree: BomNode | null; error: string | null }> {
  try {
    const top = await getSapItemBom(itemCode)
    if (!top) return { tree: null, error: null }

    const root: BomNode = {
      itemCode: top.treeCode,
      itemName: top.productDescription ?? '',
      quantity: top.quantity,
      level: 0,
      lines: top.lines.map(l => ({
        itemCode: l.ItemCode,
        itemName: l.ItemName || '',
        quantity: l.Quantity,
        level: 1,
        lines: [],
        loaded: false,
      })),
      loaded: true,
    }

    return { tree: root, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'BOM query failed'
    return { tree: null, error: message }
  }
}

export async function getSapItemBomChildren(
  itemCode: string
): Promise<{ lines: BomNode[]; error: string | null }> {
  try {
    const bom = await getSapItemBom(itemCode)
    if (!bom) return { lines: [], error: null }

    const lines = bom.lines.map(l => ({
      itemCode: l.ItemCode,
      itemName: l.ItemName || '',
      quantity: l.Quantity,
      level: 0,
      lines: [],
      loaded: false,
    }))

    return { lines, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'BOM children query failed'
    return { lines: [], error: message }
  }
}

export async function updateSapItem(itemCode: string, fields: SapEntityPayload): Promise<unknown> {
  await assertSapWritesEnabled()
  const normalizedCode = normalizeRequiredCode(itemCode, 'itemCode')
  return sapServiceLayerRequest(`/Items(${encodeODataString(normalizedCode)})`, {
    method: 'PATCH',
    body: fields,
  })
}
