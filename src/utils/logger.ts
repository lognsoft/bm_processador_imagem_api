// src/utils/logger.ts
import fs from 'fs';
import path from 'path';

// Usa o tipo oficial definido em src/types.ts
import type { MkLogger } from '../types.js';
export type { MkLogger } from '../types.js';

// Níveis possíveis
const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];

// Lê LOG_LEVEL e DATA_DIR do ambiente, com defaults
const GLOBAL_LOG_LEVEL: Level =
  (process.env.LOG_LEVEL as Level) || 'debug';

const GLOBAL_DATA_DIR =
  process.env.DATA_DIR || path.resolve('data');

// Cria o diretório de log se não existir
function ensureDir(dir: string) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {
    // não deixa o logger derrubar o processo
  }
}

/**
 * Factory principal de logger.
 * Pode ser usada diretamente pelo server:
 *   const log = makeLogger('debug', dataDir, 'server');
 */
export function makeLogger(
  logLevel: string,
  dataDir: string,
  scope?: string
): MkLogger {
  ensureDir(dataDir);
  const minIndex = LEVELS.indexOf((logLevel as Level) || 'debug');
  const logFile = path.join(dataDir, 'server.log');

  // buffer de linhas para devolver na API (log.lines.join('\n'))
  const lines: string[] = [];

  function shouldLog(level: Level) {
    return LEVELS.indexOf(level) >= minIndex;
  }

  function writeToFile(msg: string) {
    try {
      fs.appendFileSync(logFile, msg + '\n', 'utf8');
    } catch {
      // ignora erro de IO
    }
  }

  function push(level: Level, ...args: unknown[]) {
    if (!shouldLog(level)) return;

    const ts = new Date().toISOString();
    const prefixScope = scope ? ` [${scope}]` : '';

    const msg = `[${ts}] [${level.toUpperCase()}]${prefixScope} ${args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ')}`;

    // guarda a linha para resposta JSON
    lines.push(msg);

    console.log(msg);
    writeToFile(msg);
  }

  // -------------------------------------------------------------------
  // Correção do TS2556: wrapper variádico genérico para não esbarrar
  // em tuples inferidas pelo TS.
  // -------------------------------------------------------------------
  const pushAny = (...args: any[]) => {
    const [lvl, ...rest] = args;
    push(lvl as Level, ...rest);
  };

  // Implementação do step, usada nas rotas:
  //   const out = await log.step('Encode', async () => { ... });
  async function step<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
    const start = Date.now();
    pushAny('debug', `${label} - START`);
    try {
      const result = await fn();
      const elapsed = Date.now() - start;
      pushAny('debug', `${label} - OK (${elapsed}ms)`);
      return result;
    } catch (err) {
      const elapsed = Date.now() - start;
      pushAny('error', `${label} - ERROR (${elapsed}ms)`, err instanceof Error ? err.message : err);
      throw err;
    }
  }

  const logger: MkLogger = {
    // buffer de linhas acessado em public.ts / sessions.ts
    lines,

    debug: (...a: any[]) => pushAny('debug', ...a),
    info:  (...a: any[]) => pushAny('info',  ...a),
    warn:  (...a: any[]) => pushAny('warn',  ...a),
    error: (...a: any[]) => pushAny('error', ...a),

    step,
  };

  return logger;
}

/**
 * Atalho usado pelas rotas:
 *
 *   import { mkLogger } from '../utils/logger.js';
 *   const log = mkLogger('public');
 */
export function mkLogger(scope: string): MkLogger {
  return makeLogger(GLOBAL_LOG_LEVEL, GLOBAL_DATA_DIR, scope);
}

/**
 * Helper para gerar um banner de texto bonito de log,
 * usado como:
 *
 *   log.info(banner('Iniciando processamento'));
 */
export function banner(title: string): string {
  const line = '='.repeat(title.length + 8);
  return `${line}\n===  ${title}  ===\n${line}`;
}

/**
 * Snapshot simples de memória, usado em rotas:
 *
 *   import { memSnapshot } from '../utils/logger.js';
 *   const mem = memSnapshot();
 */
export function memSnapshot(): NodeJS.MemoryUsage {
  return process.memoryUsage();
}
