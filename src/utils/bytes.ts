/**
 * Converte valores em bytes para representação humana (B/KB/MB/GB/TB),
 * facilitando logs e diagnósticos de uso de memória/arquivos.
 */
export function fmtBytes(n: number | undefined | null): string {
  if (!Number.isFinite(n as number)) return `${n}`;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${u[i]}`;
}
