export const PRINT_SETTINGS_KEY = 'samiGen-print-settings'

export type PrintColorMode = 'normal' | 'inverted'

export interface PrintSettings {
  colorMode: PrintColorMode
}

export const defaultPrintSettings: PrintSettings = {
  colorMode: 'normal',
}

export function normalizePrintColorMode(value: unknown): PrintColorMode {
  return value === 'inverted' ? 'inverted' : 'normal'
}
