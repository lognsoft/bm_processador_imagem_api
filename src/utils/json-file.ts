//json-file.ts
/**
 * Abstrai leitura e escrita de JSON com fallback seguro.
 * Usado para persistir presets e publicações em disco (data/).
 */
import fs from 'fs';

export function readJson<T = any>(filePath: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

export function writeJson(filePath: string, obj: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}
