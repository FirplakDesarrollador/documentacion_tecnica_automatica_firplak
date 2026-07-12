#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const PART_CONCURRENCY = 2
const SAP_ENV_NAMES = [
  'SAP_API_URL',
  'SAP_COMPANY_DB',
  'SAP_USERNAME',
  'SAP_PASSWORD',
  'SAP_REJECT_UNAUTHORIZED',
  'SAP_TIMEOUT_MS',
]

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function colorCodeFromValue(value) {
  const segments = String(value ?? '').trim().split('-')
  return segments.at(-1)?.match(/^[A-Z0-9]{4}/i)?.[0]?.toUpperCase() ?? null
}

function materialCategory(itemName) {
  const normalized = String(itemName ?? '').trim().toUpperCase()
  if (normalized.includes('TABLERO')) return 'board'
  if (/^CANTO\s+PVC\b/.test(normalized)) return 'edge'
  return 'other'
}

function normalizeLine(line) {
  return {
    itemCode: String(line?.ItemCode ?? ''),
    itemName: String(line?.ItemName ?? ''),
    colorCode: colorCodeFromValue(line?.ItemCode),
    quantity: Number.isFinite(Number(line?.Quantity)) ? Number(line.Quantity) : 0,
    childNum: line?.ChildNum ?? null,
  }
}

function summarizeLines(lines) {
  const validLines = lines.filter(line => line.colorCode)
  const totalQuantity = validLines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0)
  const byColor = new Map()

  for (const line of validLines) {
    const current = byColor.get(line.colorCode) ?? {
      colorCode: line.colorCode,
      totalQuantity: 0,
      lineCount: 0,
      materialCodes: new Set(),
      materialNames: new Set(),
    }
    current.totalQuantity += Math.max(0, line.quantity)
    current.lineCount += 1
    current.materialCodes.add(line.itemCode)
    current.materialNames.add(line.itemName)
    byColor.set(line.colorCode, current)
  }

  return [...byColor.values()]
    .map(value => ({
      colorCode: value.colorCode,
      totalQuantity: round(value.totalQuantity),
      lineCount: value.lineCount,
      materialCodes: [...value.materialCodes].sort(),
      materialNames: [...value.materialNames].sort(),
      quantityShare: totalQuantity > 0 ? round(value.totalQuantity / totalQuantity) : 0,
    }))
    .sort((left, right) => right.totalQuantity - left.totalQuantity || left.colorCode.localeCompare(right.colorCode))
}

function classifyTree(tree) {
  const skuComplete = String(tree?.TreeCode ?? '').trim().toUpperCase()
  const allLines = Array.isArray(tree?.ProductTreeLines)
    ? tree.ProductTreeLines.map(normalizeLine)
    : []
  const boardLines = allLines.filter(line => materialCategory(line.itemName) === 'board')
  const edgeLines = allLines.filter(line => materialCategory(line.itemName) === 'edge')
  const boardConsumption = summarizeLines(boardLines)
  const edgeConsumption = summarizeLines(edgeLines)
  const boardColors = boardConsumption.map(item => item.colorCode)
  const edgeColors = edgeConsumption.map(item => item.colorCode)
  const boardPattern = boardColors.length === 0
    ? 'SIN_TABLERO'
    : boardColors.length === 1
      ? 'UNICOLOR'
      : boardColors.length === 2
        ? 'DUAL'
        : boardColors.length === 3
          ? 'BALANCE'
          : 'REVISAR_MAS_DE_TRES_COLORES'

  return {
    skuComplete,
    colorCode: colorCodeFromValue(skuComplete),
    boardPattern,
    edgePattern: edgeColors.length === 0 ? 'SIN_CANTO' : edgeColors.length === 1 ? 'UNIFORME' : 'CANTO_MIXTO',
    boardColors,
    edgeColors,
    totalBoardQuantity: round(boardLines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0)),
    totalEdgeQuantity: round(edgeLines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0)),
    boardConsumption,
    edgeConsumption,
    boardLines,
    edgeLines,
  }
}

function envForSapMcp() {
  return Object.fromEntries(
    SAP_ENV_NAMES
      .filter(name => process.env[name] !== undefined)
      .map(name => [name, process.env[name]]),
  )
}

function mcpClient() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['scripts/mcp-sap-server.mjs'],
    env: envForSapMcp(),
  })
  const client = new Client({ name: 'sap-color-report-runner', version: '1.0.0' })
  return { client, transport }
}

function toolPayload(result) {
  const text = result.content?.find(item => item.type === 'text')?.text ?? '{}'
  return JSON.parse(text)
}

async function readStdinJson() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function runPart(outputPath) {
  const input = await readStdinJson()
  const requested = Array.isArray(input) ? input : input.skus
  if (!Array.isArray(requested) || requested.length === 0) throw new Error('Input must contain a non-empty sku array')

  const { client, transport } = mcpClient()
  const details = []
  const missing = []
  let nextIndex = 0
  let completed = 0

  await client.connect(transport)

  async function worker() {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1
      if (currentIndex >= requested.length) return

      const sku = typeof requested[currentIndex] === 'string'
        ? { skuComplete: requested[currentIndex] }
        : requested[currentIndex]
      const treeCode = String(sku.skuComplete ?? sku.sku_complete ?? '').trim().toUpperCase()
      try {
        const result = await client.callTool({
          name: 'sap_get_product_tree',
          arguments: { treeCode },
        })
        const payload = toolPayload(result)
        if (payload.success && payload.data?.TreeCode) {
          details.push(classifyTree(payload.data))
        } else {
          missing.push(sku)
        }
      } catch {
        missing.push(sku)
      }

      completed += 1
      if (completed % 100 === 0) {
        console.error(JSON.stringify({ completed, total: requested.length, missing: missing.length }))
      }
    }
  }

  await Promise.all(Array.from({ length: PART_CONCURRENCY }, () => worker()))
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify({ requested, details, missing }, null, 2), 'utf8')
  await client.close()
  console.error(JSON.stringify({ completed: true, outputPath, requested: requested.length, details: details.length, missing: missing.length }))
}

function aggregateConsumption(results, category) {
  const byColor = new Map()
  for (const result of results) {
    const summaries = category === 'board' ? result.boardConsumption : result.edgeConsumption
    for (const summary of summaries) {
      const current = byColor.get(summary.colorCode) ?? {
        colorCode: summary.colorCode,
        totalQuantity: 0,
        lineCount: 0,
        skuCount: 0,
        materialCodes: new Set(),
        materialNames: new Set(),
      }
      current.totalQuantity += summary.totalQuantity
      current.lineCount += summary.lineCount
      current.skuCount += 1
      for (const code of summary.materialCodes) current.materialCodes.add(code)
      for (const name of summary.materialNames) current.materialNames.add(name)
      byColor.set(summary.colorCode, current)
    }
  }

  const totalQuantity = [...byColor.values()].reduce((sum, value) => sum + value.totalQuantity, 0)
  return [...byColor.values()]
    .map(value => ({
      colorCode: value.colorCode,
      totalQuantity: round(value.totalQuantity),
      lineCount: value.lineCount,
      skuCount: value.skuCount,
      materialCodes: [...value.materialCodes].sort(),
      materialNames: [...value.materialNames].sort(),
      quantityShare: totalQuantity > 0 ? round(value.totalQuantity / totalQuantity) : 0,
    }))
    .sort((left, right) => right.totalQuantity - left.totalQuantity || left.colorCode.localeCompare(right.colorCode))
}

function aggregateColors(details) {
  const byColor = new Map()
  for (const result of details) {
    const current = byColor.get(result.colorCode) ?? {
      colorCode: result.colorCode,
      skuCount: 0,
      boardPatterns: {},
      edgePatterns: {},
      boardResults: [],
      edgeResults: [],
      combinations: new Map(),
    }
    current.skuCount += 1
    current.boardPatterns[result.boardPattern] = (current.boardPatterns[result.boardPattern] ?? 0) + 1
    current.edgePatterns[result.edgePattern] = (current.edgePatterns[result.edgePattern] ?? 0) + 1
    current.boardResults.push(result)
    current.edgeResults.push(result)

    const key = `${result.boardColors.join(',')}|${result.edgeColors.join(',')}`
    const combination = current.combinations.get(key) ?? {
      boardColors: result.boardColors,
      edgeColors: result.edgeColors,
      skuCount: 0,
      skuExamples: [],
    }
    combination.skuCount += 1
    if (combination.skuExamples.length < 20) combination.skuExamples.push(result.skuComplete)
    current.combinations.set(key, combination)
    byColor.set(result.colorCode, current)
  }

  return [...byColor.values()]
    .map(value => ({
      colorCode: value.colorCode,
      skuCount: value.skuCount,
      boardPatterns: value.boardPatterns,
      edgePatterns: value.edgePatterns,
      observedBoardColors: [...new Set(value.boardResults.flatMap(result => result.boardColors))].sort(),
      observedEdgeColors: [...new Set(value.edgeResults.flatMap(result => result.edgeColors))].sort(),
      boardConsumption: aggregateConsumption(value.boardResults, 'board'),
      edgeConsumption: aggregateConsumption(value.edgeResults, 'edge'),
      combinations: [...value.combinations.values()].sort((left, right) => right.skuCount - left.skuCount),
    }))
    .sort((left, right) => left.colorCode.localeCompare(right.colorCode))
}

function aggregateParts(partsDirectory, outputPath) {
  const partFiles = fs.readdirSync(partsDirectory)
    .filter(file => file.endsWith('.json'))
    .sort()
  const parts = partFiles.map(file => JSON.parse(fs.readFileSync(path.join(partsDirectory, file), 'utf8')))
  const requested = parts.flatMap(part => part.requested ?? [])
  const missing = parts.flatMap(part => part.missing ?? [])
  const details = [...new Map(parts.flatMap(part => part.details ?? []).map(detail => [detail.skuComplete, detail])).values()]
  const colors = aggregateColors(details)
  const report = {
    success: true,
    reportType: 'sap_mcp_furniture_color_analysis',
    source: {
      productType: 'MUEBLE',
      expectedSkuCount: requested.length,
      analyzedSkuCount: details.length,
      edgeClassifier: 'CANTO PVC only; excludes descriptions that merely mention CANTO',
    },
    coverage: {
      expectedSkuCount: requested.length,
      sapFoundSkuCount: details.length,
      sapMissingSkuCount: missing.length,
      skuWithoutBoardCount: details.filter(detail => detail.boardPattern === 'SIN_TABLERO').length,
      skuWithoutEdgeCount: details.filter(detail => detail.edgePattern === 'SIN_CANTO').length,
    },
    missingSkus: missing,
    colors,
    skuDetails: details,
  }
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ outputPath, requested: requested.length, details: details.length, missing: missing.length, colors: colors.length }))
}

const mode = process.argv[2]
if (mode === 'part') {
  await runPart(process.argv[3])
} else if (mode === 'aggregate') {
  aggregateParts(process.argv[3], process.argv[4])
} else {
  console.error('Usage: mcp-sap-color-report-runner.mjs part <output.json> | aggregate <parts-dir> <output.json>')
  process.exitCode = 2
}
