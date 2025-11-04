/**
 * Logger por requisição com suporte a etapas (step profiling),
 * buffer interno para retorno via API e snapshots de memória.
 */
import os from 'os';
import type { MkLogger } from '../types.js';
import { LOG_LEVEL } from '../config.js';
import { fmtBytes } from './bytes.js';
import { nowNs, elapsedMs } from './time.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const canLog = (lvl: LogLevel) => order[lvl] >= order[LOG_LEVEL as LogLevel];

export function memSnapshot() {
  const m = process.memoryUsage();
  return { rss: fmtBytes(m.rss), heapUsed: fmtBytes(m.heapUsed), heapTotal: fmtBytes(m.heapTotal), ext: fmtBytes(m.external) };
}

export function mkLogger(reqId: string): MkLogger {
  const lines: string[] = [];

  const push = (lvl: LogLevel, msg: string, ...rest: unknown[]) => {
    const more = rest?.length
      ? ' ' + rest.map(v => { try { return typeof v === 'string' ? v : JSON.stringify(v, null, 2); } catch { return String(v); } }).join(' ')
      : '';
    const line = `[${reqId}] ${msg}${more}`;
    lines.push(line);
    if (canLog(lvl)) {
      const fn = lvl === 'error' ? console.error : (lvl === 'warn' ? console.warn : console.log);
      fn(line);
    }
  };

  const step = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = nowNs();
    push('info', `▶ ${label}...`);
    try {
      const r = await fn();
      push('info', `✔ ${label} (${elapsedMs(t0).toFixed(1)} ms)`);
      return r;
    } catch (e: any) {
      push('error', `✖ ${label} FAILED (${elapsedMs(t0).toFixed(1)} ms) :: ${e?.message || e}`);
      throw e;
    }
  };

  return {
    lines, step,
    debug: (...a: any[]) => push('debug', ...a),
    info:  (...a: any[]) => push('info',  ...a),
    warn:  (...a: any[]) => push('warn',  ...a),
    error: (...a: any[]) => push('error', ...a),
  };
}

export function banner(reqId: string) {
  if (canLog('info')) {
    console.log(`\n[${reqId}] ================== NOVA REQUISIÇÃO ==================`);
    console.log(`[${reqId}] Host:`, os.hostname(), '| PID:', process.pid);
  }
}
