import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

// ── 1. Run lint and collect unused eslint-disable directive warnings ──
let lintOut = ''
try {
  lintOut = execSync('npm run lint 2>&1', { encoding: 'utf8', shell: true })
} catch (e: any) {
  lintOut = e.stdout || ''
}

type Loc = { file: string; line: number }
const unusedDirectives: Loc[] = []
let currentFile = ''

for (const raw of lintOut.split('\n')) {
  const line = raw.replace(/\x1b\[[0-9;]*m/g, '')
  const fileMatch = line.match(/^([A-Z]:\\.+\\src\\(.+\.(ts|tsx)))$/)
  if (fileMatch) {
    currentFile = fileMatch[1]
    continue
  }
  const warnMatch = line.match(/^\s+(\d+):\d+\s+warning\s+Unused eslint-disable directive/)
  if (warnMatch && currentFile) {
    unusedDirectives.push({ file: currentFile, line: parseInt(warnMatch[1], 10) })
  }
}

// ── 2. Remove each unused comment line ──────────────────────────────
const byFile = new Map<string, number[]>()
for (const loc of unusedDirectives) {
  const arr = byFile.get(loc.file) || []
  arr.push(loc.line)
  byFile.set(loc.file, arr)
}

let totalRemoved = 0

for (const [filePath, lines] of byFile) {
  let content: string
  try {
    content = readFileSync(filePath, 'utf8')
  } catch {
    console.warn(`Cannot read: ${filePath}`)
    continue
  }

  const fileLines = content.split('\n')
  // Sort descending so we remove from bottom up
  const sorted = [...new Set(lines)].sort((a, b) => b - a)
  let removed = 0

  for (const targetLine of sorted) {
    const idx = targetLine - 1
    if (idx < 0 || idx >= fileLines.length) continue
    // Verify it's actually an eslint-disable line
    if (fileLines[idx].trim().startsWith('// eslint-disable')) {
      fileLines.splice(idx, 1)
      removed++
    }
  }

  if (removed > 0) {
    writeFileSync(filePath, fileLines.join('\n'), 'utf8')
    const relPath = filePath.replace(/^.*?src[\\/]/, '')
    console.log(`-${removed} in ${relPath}`)
    totalRemoved += removed
  }
}

console.log(`\nTotal: ${totalRemoved} unused eslint-disable comments removed`)
