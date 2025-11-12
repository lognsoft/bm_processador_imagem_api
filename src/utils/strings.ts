//strings.ts
/**
 * Helpers de string usados ao longo do projeto: slugify para URLs públicas
 * e clamp para normalizar valores num intervalo.
 */
export function slugify(s: string): string {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 64);
}

export function clamp(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}
