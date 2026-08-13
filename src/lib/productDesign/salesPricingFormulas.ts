export const SALES_PRICING_FORMULAS_SETTING_KEY = 'sales_estimation_pricing_formulas'

export type SalesPricingFormulaConfig = {
  minimumPrice: string
  maximumPrice: string
  pvp: string
}

export type SalesPricingInputs = {
  materialCost: number
  expandedCost: number
  mcPct: number
  discountPct: number
}

export type SalesPricingResult = {
  minimumPrice: number
  maximumPrice: number
  pvp: number
}

export const DEFAULT_SALES_PRICING_FORMULAS: SalesPricingFormulaConfig = {
  minimumPrice: 'costo_materia_prima / (1 - mc_pct)',
  maximumPrice: 'precio_minimo / (1 - descuento_pct)',
  pvp: '(precio_minimo / 0.75) * 1.19',
}

type Token = { type: 'number'; value: number } | { type: 'identifier'; value: string } | { type: 'operator'; value: '+' | '-' | '*' | '/' | '(' | ')' }

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u
const allowedBaseIdentifiers = new Set(['costo_materia_prima', 'costo_ampliado', 'mc_pct', 'descuento_pct'])

function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < expression.length) {
    const character = expression[index]
    if (/\s/u.test(character)) { index += 1; continue }
    if ('+-*/()'.includes(character)) { tokens.push({ type: 'operator', value: character as Token['value'] & ('+' | '-' | '*' | '/' | '(' | ')') }); index += 1; continue }
    const numberMatch = expression.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/u)
    if (numberMatch) { tokens.push({ type: 'number', value: Number(numberMatch[0]) }); index += numberMatch[0].length; continue }
    const identifierMatch = expression.slice(index).match(/^[a-z_][a-z0-9_]*/iu)
    if (identifierMatch) { tokens.push({ type: 'identifier', value: identifierMatch[0].toLowerCase() }); index += identifierMatch[0].length; continue }
    throw new Error(`Carácter no permitido en fórmula: ${character}`)
  }
  if (tokens.length === 0) throw new Error('La fórmula no puede estar vacía.')
  return tokens
}

function evaluateExpression(expression: string, variables: Record<string, number>, allowedIdentifiers: Set<string>): number {
  const tokens = tokenize(expression)
  let index = 0
  const peek = () => tokens[index]
  const consume = () => tokens[index++]

  const parseFactor = (): number => {
    const token = consume()
    if (!token) throw new Error('La fórmula termina de forma incompleta.')
    if (token.type === 'number') return token.value
    if (token.type === 'identifier') {
      if (!IDENTIFIER.test(token.value) || !allowedIdentifiers.has(token.value)) throw new Error(`Variable no permitida: ${token.value}`)
      const value = variables[token.value]
      if (!Number.isFinite(value)) throw new Error(`Variable sin valor: ${token.value}`)
      return value
    }
    if (token.type === 'operator' && token.value === '(') {
      const value = parseSum()
      const closing = consume()
      if (!closing || closing.type !== 'operator' || closing.value !== ')') throw new Error('Falta cerrar un paréntesis.')
      return value
    }
    if (token.type === 'operator' && token.value === '-') return -parseFactor()
    throw new Error('Se esperaba un número, variable o paréntesis.')
  }
  const parseProduct = (): number => {
    let value = parseFactor()
    while (peek()?.type === 'operator' && (peek() as Extract<Token, { type: 'operator' }>).value !== '(' && (peek() as Extract<Token, { type: 'operator' }>).value !== ')' && ['*', '/'].includes((peek() as Extract<Token, { type: 'operator' }>).value)) {
      const operator = (consume() as Extract<Token, { type: 'operator' }>).value
      const right = parseFactor()
      if (operator === '/' && right === 0) throw new Error('La fórmula intenta dividir por cero.')
      value = operator === '*' ? value * right : value / right
    }
    return value
  }
  const parseSum = (): number => {
    let value = parseProduct()
    while (peek()?.type === 'operator' && ['+', '-'].includes((peek() as Extract<Token, { type: 'operator' }>).value)) {
      const operator = (consume() as Extract<Token, { type: 'operator' }>).value
      const right = parseProduct()
      value = operator === '+' ? value + right : value - right
    }
    return value
  }
  const result = parseSum()
  if (index !== tokens.length) throw new Error('La fórmula contiene una secuencia no válida.')
  if (!Number.isFinite(result) || result < 0) throw new Error('La fórmula debe producir un resultado numérico no negativo.')
  return result
}

export function normalizeSalesPercentage(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value >= 100) throw new Error('MC % y descuento % deben estar entre 0 y menor que 100.')
  return value / 100
}

export function evaluateSalesPricing(formulas: SalesPricingFormulaConfig, inputs: SalesPricingInputs): SalesPricingResult {
  const baseVariables = {
    costo_materia_prima: inputs.materialCost,
    costo_ampliado: inputs.expandedCost,
    mc_pct: inputs.mcPct,
    descuento_pct: inputs.discountPct,
  }
  const minimumPrice = evaluateExpression(formulas.minimumPrice, baseVariables, allowedBaseIdentifiers)
  const maximumPrice = evaluateExpression(formulas.maximumPrice, { ...baseVariables, precio_minimo: minimumPrice }, new Set([...allowedBaseIdentifiers, 'precio_minimo']))
  const pvp = evaluateExpression(formulas.pvp, { ...baseVariables, precio_minimo: minimumPrice, precio_maximo: maximumPrice }, new Set([...allowedBaseIdentifiers, 'precio_minimo', 'precio_maximo']))
  return { minimumPrice, maximumPrice, pvp }
}

export function normalizeSalesPricingFormulaConfig(value: unknown): SalesPricingFormulaConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_SALES_PRICING_FORMULAS
  const record = value as Record<string, unknown>
  const minimumPrice = typeof record.minimumPrice === 'string' ? record.minimumPrice.trim() : ''
  const maximumPrice = typeof record.maximumPrice === 'string' ? record.maximumPrice.trim() : ''
  const pvp = typeof record.pvp === 'string' ? record.pvp.trim() : ''
  const config = { minimumPrice, maximumPrice, pvp }
  evaluateSalesPricing(config, { materialCost: 100, expandedCost: 100, mcPct: 0.4, discountPct: 0.1 })
  return config
}
