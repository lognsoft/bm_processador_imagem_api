/**
 * Centraliza configurações globais: níveis de log, diretório de dados
 * e caminhos de persistência (presets e public-presets). Garante que
 * o diretório data/ exista antes do uso.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const LOG_LEVEL = (process.env.LOG_LEVEL || 'debug').toLowerCase();
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

export const PRESETS_PATH = path.join(DATA_DIR, 'presets.json');
export const PUBLIC_PRESETS_PATH = path.join(DATA_DIR, 'public-presets.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
