export function normalizeHeader(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
}

export function firstNonEmpty(...vals: (unknown | null | undefined)[]): string {
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

