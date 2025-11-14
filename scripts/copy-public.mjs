// scripts/copy-public.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.resolve(__dirname, '../src/public');
const destDir = path.resolve(__dirname, '../dist/public');

if (!fs.existsSync(srcDir)) {
  console.log('[copy-public] src/public não existe, nada para copiar.');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

if (fs.cpSync) {
  // Node 16+ tem fs.cpSync
  fs.cpSync(srcDir, destDir, { recursive: true });
} else {
  // fallback simples (quase certeza que você não vai cair aqui com Node 24)
  const copyRecursive = (from, to) => {
    const stats = fs.statSync(from);
    if (stats.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      for (const entry of fs.readdirSync(from)) {
        copyRecursive(path.join(from, entry), path.join(to, entry));
      }
    } else {
      fs.copyFileSync(from, to);
    }
  };
  copyRecursive(srcDir, destDir);
}

console.log('[copy-public] Copiado src/public -> dist/public');
