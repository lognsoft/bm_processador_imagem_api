/**
 * Utilidades de alta resolução para medir tempo de execução
 * de etapas do pipeline e gerar métricas de performance.
 */
export function nowNs(): bigint {
  return process.hrtime.bigint();
}
export function elapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6;
}
