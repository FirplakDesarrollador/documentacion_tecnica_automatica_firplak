#!/usr/bin/env node

import https from 'node:https'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const DEFAULT_TIMEOUT_MS = 60_000
const MAX_PREFIXES = 20
const MAX_PAGE_SIZE = 2_000
const WRITE_CONFIRMATION_PREFIX = 'CONFIRMAR SAP'

class SapMcpError extends Error {
  constructor(message, statusCode = 500, sapCode = null) {
    super(message)
    this.name = 'SapMcpError'
    this.statusCode = statusCode
    this.sapCode = sapCode
  }
}

let cachedSession = null
let loginPromise = null

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new SapMcpError(`Missing required SAP environment variable: ${name}`, 500, 'SAP_CONFIG_MISSING')
  return value
}

function booleanEnv(name, fallback) {
  const value = process.env[name]?.trim().toLowerCase()
  if (!value) return fallback
  return ['true', '1', 'yes', 'si'].includes(value)
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getConfig() {
  const loginUrl = new URL(requiredEnv('SAP_API_URL'))
  return {
    loginUrl,
    baseUrl: loginUrl.href.replace(/\/Login\/?$/i, ''),
    companyDb: requiredEnv('SAP_COMPANY_DB'),
    username: requiredEnv('SAP_USERNAME'),
    password: requiredEnv('SAP_PASSWORD'),
    rejectUnauthorized: booleanEnv('SAP_REJECT_UNAUTHORIZED', false),
    timeoutMs: numberEnv('SAP_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    writesEnabled: booleanEnv('SAP_WRITES_ENABLED', false),
  }
}

function parseJson(bodyText) {
  if (!bodyText.trim()) return null
  try {
    return JSON.parse(bodyText)
  } catch {
    return null
  }
}

function errorDetails(payload, fallback) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { message: fallback, code: null }
  const error = payload.error
  if (!error || typeof error !== 'object' || Array.isArray(error)) return { message: fallback, code: null }
  const code = typeof error.code === 'string' || typeof error.code === 'number' ? error.code : null
  const message = error.message
  if (message && typeof message === 'object' && typeof message.value === 'string') return { message: message.value, code }
  if (typeof message === 'string') return { message, code }
  return { message: fallback, code }
}

function cookieHeader(headers, sessionId) {
  const rawCookies = headers['set-cookie']
  const cookies = (Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [])
    .map(cookie => cookie.split(';')[0]?.trim())
    .filter(Boolean)
  if (cookies.length > 0) return cookies.join('; ')
  if (sessionId) return `B1SESSION=${sessionId}`
  throw new SapMcpError('SAP login succeeded without a session cookie', 502, 'SAP_SESSION_COOKIE_MISSING')
}

function httpRequest(url, options) {
  return new Promise((resolve, reject) => {
    const bodyText = options.body ? JSON.stringify(options.body) : null
    const request = https.request(url, {
      method: options.method ?? 'GET',
      rejectUnauthorized: options.rejectUnauthorized,
      headers: {
        Accept: 'application/json',
        ...(bodyText ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyText) } : {}),
        ...(options.headers ?? {}),
      },
    }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      response.on('end', () => resolve({
        statusCode: response.statusCode ?? 0,
        headers: response.headers,
        bodyText: Buffer.concat(chunks).toString('utf8'),
      }))
    })

    request.setTimeout(options.timeoutMs, () => request.destroy(new SapMcpError('SAP request timed out', 504, 'SAP_TIMEOUT')))
    request.on('error', reject)
    if (bodyText) request.write(bodyText)
    request.end()
  })
}

async function login() {
  if (cachedSession && cachedSession.expiresAt > Date.now()) return cachedSession
  if (loginPromise) return loginPromise

  loginPromise = (async () => {
    const config = getConfig()
    const response = await httpRequest(config.loginUrl, {
      method: 'POST',
      body: {
        CompanyDB: config.companyDb,
        UserName: config.username,
        Password: config.password,
      },
      rejectUnauthorized: config.rejectUnauthorized,
      timeoutMs: config.timeoutMs,
    })
    const payload = parseJson(response.bodyText)
    if (response.statusCode < 200 || response.statusCode >= 300) {
      const details = errorDetails(payload, 'SAP login failed')
      throw new SapMcpError(details.message, response.statusCode || 502, details.code)
    }

    const sessionTimeout = typeof payload?.SessionTimeout === 'number' ? payload.SessionTimeout : 30
    const sessionId = typeof payload?.SessionId === 'string' ? payload.SessionId : null
    cachedSession = {
      cookie: cookieHeader(response.headers, sessionId),
      version: typeof payload?.Version === 'string' ? payload.Version : null,
      sessionTimeoutMinutes: sessionTimeout,
      expiresAt: Date.now() + Math.max(1, sessionTimeout - 1) * 60_000,
    }
    return cachedSession
  })()

  try {
    return await loginPromise
  } finally {
    loginPromise = null
  }
}

function encodeODataString(value) {
  return `'${value.replace(/'/g, "''")}'`
}

function collectionQuery({ filter, top, skip, select, expand }) {
  const params = []
  if (select?.length) params.push(`$select=${encodeURIComponent(select.join(','))}`)
  if (expand?.length) params.push(`$expand=${encodeURIComponent(expand.join(','))}`)
  if (filter) params.push(`$filter=${encodeURIComponent(filter)}`)
  if (Number.isInteger(top)) params.push(`$top=${top}`)
  if (Number.isInteger(skip)) params.push(`$skip=${skip}`)
  return params.length ? `?${params.join('&')}` : ''
}

async function sapRequest(path, options = {}, retry = true) {
  const config = getConfig()
  const session = await login()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const response = await httpRequest(new URL(`${config.baseUrl}${normalizedPath}`), {
    method: options.method ?? 'GET',
    body: options.body,
    headers: { Cookie: session.cookie },
    rejectUnauthorized: config.rejectUnauthorized,
    timeoutMs: config.timeoutMs,
  })
  const payload = parseJson(response.bodyText)
  if ((response.statusCode === 401 || response.statusCode === 403) && retry) {
    cachedSession = null
    return sapRequest(path, options, false)
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const details = errorDetails(payload, `SAP request failed: ${path}`)
    throw new SapMcpError(details.message, response.statusCode || 502, details.code)
  }
  return payload
}

function assertWriteRequest({ dryRun, confirmation, targetCode }) {
  if (dryRun) return
  const expected = `${WRITE_CONFIRMATION_PREFIX} ${targetCode}`
  if (confirmation?.trim() !== expected) {
    throw new SapMcpError(`Escribe exactamente: ${expected}`, 400, 'SAP_WRITE_CONFIRMATION_REQUIRED')
  }
  if (!getConfig().writesEnabled) {
    throw new SapMcpError('SAP_WRITES_ENABLED no está activo para el MCP', 403, 'SAP_WRITES_DISABLED')
  }
}

async function getExisting(path) {
  try {
    return await sapRequest(path)
  } catch (error) {
    if (error instanceof SapMcpError && error.statusCode === 404) return null
    throw error
  }
}

function textResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

function toolError(error) {
  const message = error instanceof Error ? error.message : String(error)
  const details = error instanceof SapMcpError ? { statusCode: error.statusCode, sapCode: error.sapCode } : {}
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ success: false, error: message, ...details }, null, 2) }],
  }
}

async function withToolErrors(callback) {
  try {
    return textResult({ success: true, data: await callback() })
  } catch (error) {
    return toolError(error)
  }
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
}

const server = new McpServer({
  name: 'sap-business-one-service-layer',
  version: '1.0.0',
})

server.registerTool('sap_config_status', {
  title: 'SAP configuration status',
  description: 'Checks whether the SAP connection variables exist without exposing their values.',
  annotations: readOnlyAnnotations,
}, async () => {
  const names = ['SAP_API_URL', 'SAP_COMPANY_DB', 'SAP_USERNAME', 'SAP_PASSWORD']
  return textResult({
    success: true,
    configured: Object.fromEntries(names.map(name => [name, Boolean(process.env[name]?.trim())])),
    optional: {
      SAP_REJECT_UNAUTHORIZED: Boolean(process.env.SAP_REJECT_UNAUTHORIZED?.trim()),
      SAP_TIMEOUT_MS: Boolean(process.env.SAP_TIMEOUT_MS?.trim()),
      SAP_WRITES_ENABLED: booleanEnv('SAP_WRITES_ENABLED', false),
    },
  })
})

server.registerTool('sap_health', {
  title: 'SAP health check',
  description: 'Logs in to SAP Business One Service Layer and returns connection metadata without secrets.',
  annotations: readOnlyAnnotations,
}, async () => withToolErrors(async () => {
  const session = await login()
  return {
    connected: true,
    version: session.version,
    sessionTimeoutMinutes: session.sessionTimeoutMinutes,
  }
}))

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
}

const jsonObjectSchema = z.record(z.string(), z.unknown())

server.registerTool('sap_create_item', {
  title: 'Create SAP item',
  description: 'Dry-run by default. Creates one SAP Item only after explicit confirmation and SAP_WRITES_ENABLED=true.',
  inputSchema: {
    itemCode: z.string().trim().min(1).max(100),
    payload: jsonObjectSchema,
    dryRun: z.boolean().optional(),
    confirmation: z.string().optional(),
  },
  annotations: writeAnnotations,
}, async ({ itemCode, payload, dryRun = true, confirmation }) => withToolErrors(async () => {
  const targetCode = itemCode.trim()
  if (payload.ItemCode !== undefined && payload.ItemCode !== targetCode) {
    throw new SapMcpError('payload.ItemCode debe coincidir con itemCode', 400, 'SAP_PAYLOAD_MISMATCH')
  }
  const createPayload = { ...payload, ItemCode: targetCode }
  const existing = await getExisting(`/Items(${encodeODataString(targetCode)})`)
  if (existing) throw new SapMcpError(`El artículo ya existe: ${targetCode}`, 409, 'SAP_ITEM_ALREADY_EXISTS')
  assertWriteRequest({ dryRun, confirmation, targetCode })
  if (dryRun) return { dryRun: true, targetCode, createPayload }
  const created = await sapRequest('/Items', { method: 'POST', body: createPayload })
  const verified = await sapRequest(`/Items(${encodeODataString(targetCode)})`)
  return { dryRun: false, targetCode, created, verified }
}))

server.registerTool('sap_create_product_tree', {
  title: 'Create SAP product tree',
  description: 'Dry-run by default. Creates a production BOM assigned to an existing ItemCode.',
  inputSchema: {
    treeCode: z.string().trim().min(1).max(100),
    payload: jsonObjectSchema,
    dryRun: z.boolean().optional(),
    confirmation: z.string().optional(),
  },
  annotations: writeAnnotations,
}, async ({ treeCode, payload, dryRun = true, confirmation }) => withToolErrors(async () => {
  const targetCode = treeCode.trim()
  if (payload.TreeCode !== undefined && payload.TreeCode !== targetCode) {
    throw new SapMcpError('payload.TreeCode debe coincidir con treeCode', 400, 'SAP_PAYLOAD_MISMATCH')
  }
  const item = await getExisting(`/Items(${encodeODataString(targetCode)})`)
  if (!item) throw new SapMcpError(`El artículo no existe: ${targetCode}`, 409, 'SAP_ITEM_REQUIRED_FIRST')
  const existingTree = await getExisting(`/ProductTrees(${encodeODataString(targetCode)})`)
  if (existingTree) throw new SapMcpError(`La ProductTree ya existe: ${targetCode}`, 409, 'SAP_PRODUCT_TREE_ALREADY_EXISTS')
  const createPayload = { TreeCode: targetCode, TreeType: 'iProductionTree', Quantity: 1, ...payload }
  assertWriteRequest({ dryRun, confirmation, targetCode })
  if (dryRun) return { dryRun: true, targetCode, createPayload }
  const created = await sapRequest('/ProductTrees', { method: 'POST', body: createPayload })
  const verified = await sapRequest(`/ProductTrees(${encodeODataString(targetCode)})`)
  return { dryRun: false, targetCode, created, verified }
}))

server.registerTool('sap_update_product_tree', {
  title: 'Update SAP product tree',
  description: 'Dry-run by default. PATCHes a complete or partial ProductTree payload after explicit confirmation.',
  inputSchema: {
    treeCode: z.string().trim().min(1).max(100),
    payload: jsonObjectSchema,
    dryRun: z.boolean().optional(),
    confirmation: z.string().optional(),
  },
  annotations: writeAnnotations,
}, async ({ treeCode, payload, dryRun = true, confirmation }) => withToolErrors(async () => {
  const targetCode = treeCode.trim()
  const current = await getExisting(`/ProductTrees(${encodeODataString(targetCode)})`)
  if (!current) throw new SapMcpError(`La ProductTree no existe: ${targetCode}`, 404, 'SAP_PRODUCT_TREE_NOT_FOUND')
  assertWriteRequest({ dryRun, confirmation, targetCode })
  if (dryRun) return { dryRun: true, targetCode, current, updatePayload: payload }
  const updated = await sapRequest(`/ProductTrees(${encodeODataString(targetCode)})`, { method: 'PATCH', body: payload })
  const verified = await sapRequest(`/ProductTrees(${encodeODataString(targetCode)})`)
  return { dryRun: false, targetCode, updated, verified }
}))

server.registerTool('sap_get_item', {
  title: 'Get SAP item',
  description: 'Reads one SAP Business One item by ItemCode.',
  inputSchema: {
    itemCode: z.string().trim().min(1).max(100),
  },
  annotations: readOnlyAnnotations,
}, async ({ itemCode }) => withToolErrors(() => sapRequest(`/Items(${encodeODataString(itemCode.trim())})`)))

server.registerTool('sap_get_product_tree', {
  title: 'Get SAP product tree',
  description: 'Reads one SAP ProductTree including its ProductTreeLines.',
  inputSchema: {
    treeCode: z.string().trim().min(1).max(100),
  },
  annotations: readOnlyAnnotations,
}, async ({ treeCode }) => withToolErrors(() => sapRequest(`/ProductTrees(${encodeODataString(treeCode.trim())})`)))

server.registerTool('sap_search_product_trees', {
  title: 'Search SAP product trees',
  description: 'Reads SAP ProductTrees whose TreeCode starts with one of the supplied prefixes.',
  inputSchema: {
    prefixes: z.array(z.string().trim().min(1).max(100)).min(1).max(MAX_PREFIXES),
    top: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    skip: z.number().int().min(0).optional(),
    includeLines: z.boolean().optional(),
  },
  annotations: readOnlyAnnotations,
}, async ({ prefixes, top = 200, skip = 0, includeLines = true }) => withToolErrors(async () => {
  const filter = [...new Set(prefixes.map(prefix => prefix.trim()).filter(Boolean))]
    .map(prefix => `startswith(TreeCode, ${encodeODataString(prefix)})`)
    .join(' or ')
  const expand = includeLines ? ['ProductTreeLines'] : undefined
  return sapRequest(`/ProductTrees${collectionQuery({
    filter,
    top: Math.min(top, MAX_PAGE_SIZE),
    skip,
    expand,
  })}`)
}))

server.registerTool('sap_search_items_by_prefix', {
  title: 'Search SAP items by prefix',
  description: 'Reads SAP Items whose ItemCode starts with the supplied prefix.',
  inputSchema: {
    prefix: z.string().trim().min(1).max(100),
    top: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    skip: z.number().int().min(0).optional(),
  },
  annotations: readOnlyAnnotations,
}, async ({ prefix, top = 200, skip = 0 }) => withToolErrors(() => sapRequest(`/Items${collectionQuery({
  filter: `startswith(ItemCode, ${encodeODataString(prefix.trim())})`,
  top: Math.min(top, MAX_PAGE_SIZE),
  skip,
})}`)))

const transport = new StdioServerTransport()
server.connect(transport).catch(error => {
  console.error('SAP MCP server failed to start:', error)
  process.exitCode = 1
})
