// server.js — Sessões/Passos/Presets (ES Modules + persistência e publicação)
// Execução determinística dos passos NA ORDEM enviada pelo front.
// Suporta: bw, bc, shadows, highlights, exposure, levelsOut, normalize, denoise, sharpen, aiEnhance.
// Retorna logs completos e dataURL (quando accept=json). CORS liberado.

//curl command - 
// curl -X POST "http://localhost:3000/public/process?slug=<SEU-SLUG>&out=png" \ -F "file=@C:/Users/Bruno/Desktop/apiBM/imagem.png" \ -o resultado.png


import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ===============================
// Paths / Persistência
// ===============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PRESETS_PATH = path.join(DATA_DIR, 'presets.json');
const PUBLIC_PRESETS_PATH = path.join(DATA_DIR, 'public-presets.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(p, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

// ===============================
// Config / Log helpers
// ===============================
const LOG_LEVEL = (process.env.LOG_LEVEL || 'debug').toLowerCase(); // debug|info|warn|error|silent
const order = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const canLog = (level) => order[level] >= order[LOG_LEVEL];

let REQ_SEQ = 0;

function fmtBytes(n) {
  if (!Number.isFinite(n)) return `${n}`;
  const u = ['B','KB','MB','GB','TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${u[i]}`;
}
function nowNs() { return process.hrtime.bigint(); }
function elapsedMs(nsStart) { return Number(nowNs() - nsStart) / 1e6; }
function memSnapshot() {
  const m = process.memoryUsage();
  return { rss: fmtBytes(m.rss), heapUsed: fmtBytes(m.heapUsed), heapTotal: fmtBytes(m.heapTotal), ext: fmtBytes(m.external) };
}
function mkLogger(reqId) {
  const lines = [];
  const push = (lvl, msg, ...rest) => {
    const more = rest?.length ? ' ' + rest.map(v => { try { return typeof v === 'string' ? v : JSON.stringify(v, null, 2); } catch { return String(v); } }).join(' ') : '';
    const line = `[${reqId}] ${msg}${more}`;
    lines.push(line);
    if (canLog(lvl)) {
      const fn = lvl === 'error' ? console.error : (lvl === 'warn' ? console.warn : console.log);
      fn(line);
    }
  };
  const step = async (label, fn) => {
    const t0 = nowNs();
    push('info', `▶ ${label}...`);
    try {
      const r = await fn();
      push('info', `✔ ${label} (${elapsedMs(t0).toFixed(1)} ms)`);
      return r;
    } catch (e) {
      push('error', `✖ ${label} FAILED (${elapsedMs(t0).toFixed(1)} ms) :: ${e?.message || e}`);
      throw e;
    }
  };
  return {
    lines, step,
    debug: (...a) => push('debug', ...a),
    info:  (...a) => push('info',  ...a),
    warn:  (...a) => push('warn',  ...a),
    error: (...a) => push('error', ...a),
  };
}

// ===============================
// Utils
// ===============================
function clamp(v, min, max) {
  const n = Number(v);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}
function pickOutFormatFromName(name) {
  const ext = (name || '').toLowerCase();
  if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return 'jpeg';
  if (ext.endsWith('.png')) return 'png';
  if (ext.endsWith('.webp')) return 'webp';
  if (ext.endsWith('.tif') || ext.endsWith('.tiff')) return 'tiff';
  if (ext.endsWith('.avif')) return 'avif';
  return 'jpeg';
}
function decideOutFormat(meta, filename, mimetype) {
  const fromName = pickOutFormatFromName(filename);
  const hasAlpha = Boolean(meta?.hasAlpha);
  if (hasAlpha && fromName === 'jpeg') return 'png';
  if (/image\/png/i.test(mimetype))  return hasAlpha ? 'png' : (fromName || 'png');
  if (/image\/webp/i.test(mimetype)) return 'webp';
  if (/image\/tiff?/i.test(mimetype))return 'tiff';
  if (/image\/avif/i.test(mimetype)) return 'avif';
  if (/image\/jpe?g/i.test(mimetype))return hasAlpha ? 'png' : 'jpeg';
  return hasAlpha ? 'png' : fromName;
}
function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'').slice(0,64);
}

// ===============================
// Operadores (passos)
// ===============================
async function opBW(img, params, log) {
  const bwDefaults = { r:100, y:60, g:40, c:20, b:20, m:80 };
  const bw = { ...bwDefaults, ...(params || {}) };

  const meta = await img.metadata();
  let alphaBuf = null;
  if (meta.hasAlpha) alphaBuf = await img.ensureAlpha().extractChannel('alpha').toBuffer();

  let wr = 0, wg = 0, wb = 0;
  wr += bw.r; wg += bw.g; wb += bw.b;
  wr += (bw.y || 0) * 0.5; wg += (bw.y || 0) * 0.5;
  wg += (bw.c || 0) * 0.5; wb += (bw.c || 0) * 0.5;
  wr += (bw.m || 0) * 0.5; wb += (bw.m || 0) * 0.5;
  const sum = wr + wg + wb || 1;
  wr /= sum; wg /= sum; wb /= sum;
  log?.debug?.('  [BW] Pesos (R,G,B):', [wr.toFixed(3), wg.toFixed(3), wb.toFixed(3)]);

  let base = img.toColourspace('srgb')
    .recomb([[wr,wg,wb],[wr,wg,wb],[wr,wg,wb]])
    .toColourspace('b-w')
    .toColourspace('srgb');

  if (alphaBuf) base = sharp(await base.toBuffer()).joinChannel(alphaBuf).toColourspace('srgb');
  return base;
}

function opBC(img, params) {
  const brightnessPct = clamp(params?.b ?? 0, -150, 150);
  const contrastPct   = clamp(params?.c ?? 0, -150, 150);
  const br = 1 + (brightnessPct / 100);
  const a  = 1 + (contrastPct / 100);
  const b  = 128 * (1 - a);
  return img.modulate({ brightness: br }).linear(a, b);
}

async function opShadows(img, params) {
  const intensity = clamp(params?.intensity ?? 0, 0, 100);
  const width     = clamp(params?.width ?? 50, 1, 100);
  const radius    = clamp(params?.radius ?? 30, 1, 200);

  const gammaMask = width >= 50
    ? 1.0 + (width - 50) / 50 * 0.6
    : 1.0 / (1.0 + (50 - width) / 50 * 0.6);

  const mask = await img.clone()
    .removeAlpha().toColourspace('b-w').gamma(gammaMask)
    .negate()
    .blur(Math.max(0.3, radius / 3))
    .toBuffer();

  const lift = 1.0 + (intensity / 100) * 0.6;
  const top  = await img.clone().modulate({ brightness: lift }).toBuffer();
  const comp = await sharp(top).joinChannel(mask).toColourspace('srgb').toBuffer();
  return img.composite([{ input: comp }]);
}

async function opHighlights(img, params) {
  const intensity = clamp(params?.intensity ?? 0, 0, 100);
  const width     = clamp(params?.width ?? 50, 1, 100);
  const radius    = clamp(params?.radius ?? 30, 1, 200);

  const gammaMask = width >= 50
    ? 1.0 + (width - 50) / 50 * 0.6
    : 1.0 / (1.0 + (50 - width) / 50 * 0.6);

  const mask = await img.clone()
    .removeAlpha().toColourspace('b-w').gamma(gammaMask)
    .blur(Math.max(0.3, radius / 3))
    .toBuffer();

  const cut = Math.max(0.4, 1.0 - (intensity / 100) * 0.4);
  const top = await img.clone().modulate({ brightness: cut }).toBuffer();
  const comp= await sharp(top).joinChannel(mask).toColourspace('srgb').toBuffer();
  return img.composite([{ input: comp }]);
}

function opExposure(img, params, log) {
  const ev     = Number(params?.ev ?? 0);
  const offset = Number(params?.offset ?? 0);
  const gamma  = Number(params?.gamma ?? 1);

  const gain = Math.pow(2, ev);
  const add  = offset * 255;
  let t = img.linear(gain, add);

  if (Number.isFinite(gamma) && gamma !== 1) {
    if (gamma >= 1.0 && gamma <= 3.0) {
      t = t.gamma(gamma);
    } else if (gamma < 1.0) {
      const k  = Math.max(0, Math.min(0.5, 1 - gamma));
      const br = 1 + k * 0.12;
      const a1 = 1 - k * 0.60;
      const b1 = 128 * (1 - a1);
      log?.warn?.(`[Exposure] gamma=${gamma} < 1; usando aproximação (k=${k.toFixed(3)})`);
      t = t.modulate({ brightness: br }).linear(a1, b1);
    } else {
      t = t.gamma(3.0);
    }
  }
  return t;
}

function opLevelsOut(img, params) {
  const lo = clamp(params?.lo ?? 0, 0, 255);
  const hi = clamp(params?.hi ?? 255, 0, 255);
  const a = (hi - lo) / 255;
  const b = lo;
  return img.linear(a, b);
}

function opNormalize(img, params) {
  const black = Math.max(0, Number(params?.black ?? 0));
  const white = Math.max(0, Number(params?.white ?? 0));
  if (black === 0 && white === 0) return img;
  const lower = black;
  const upper = 100 - white;
  try {
    return img.normalize({ lower, upper });
  } catch {
    return img.normalize();
  }
}

function opDenoise(img, params) {
  const level = clamp(params?.level ?? 0, 0, 10);
  if (level <= 0) return img;
  let t = img.median(3);
  if (level >= 2) t = t.blur(0.6);
  if (level >= 4) t = t.blur(1.0);
  if (level >= 7) t = t.blur(1.5);
  return t;
}

function opSharpen(img, params) {
  const amount = clamp(params?.amount ?? 0, 0, 5);
  if (amount <= 0) return img;
  const sigma = Math.min(2.5, 0.8 + amount);
  return img.sharpen(sigma, 1.2, 1.0);
}

async function opAIEnhance(img, enabled, meta0, log) {
  if (!enabled) return img;
  if (!meta0?.width || !meta0?.height) return img;
  const MAX_W = 6000, MAX_H = 6000, MAX_PIXELS = 16e6;
  const curPixels = meta0.width * meta0.height;
  if (curPixels > MAX_PIXELS) { log?.warn?.('AI Enhance ignorado por orçamento de pixels:', curPixels); return img; }
  const targetW = Math.min(meta0.width * 2, MAX_W);
  const targetH = Math.min(meta0.height * 2, MAX_H);
  log?.info?.('AI Enhance (resize 2x limitado):', { targetW, targetH });
  return img.resize({ width: targetW, height: targetH, kernel: sharp.kernel.lanczos3 });
}

// ===============================
// Execução do pipeline
// ===============================
async function runPipeline(originalBuffer, steps, log) {
  let img = sharp(originalBuffer, { failOn: 'none' }).rotate().withMetadata().toColourspace('srgb');
  const meta0 = await img.metadata();

  for (let i = 0; i < steps.length; i++) {
    const { op, params } = steps[i] || {};
    switch (op) {
      case 'bw':         img = await log.step(`Passo ${i+1} - bw`, async () => opBW(img, params, log)); break;
      case 'bc':         img = await log.step(`Passo ${i+1} - bc (${params?.b},${params?.c})`, async () => opBC(img, params)); break;
      case 'shadows':    img = await log.step(`Passo ${i+1} - shadows (${params?.intensity},${params?.width},${params?.radius})`, async () => opShadows(img, params)); break;
      case 'highlights': img = await log.step(`Passo ${i+1} - highlights (${params?.intensity},${params?.width},${params?.radius})`, async () => opHighlights(img, params)); break;
      case 'exposure':   img = await log.step(`Passo ${i+1} - exposure (ev=${params?.ev},off=${params?.offset},gam=${params?.gamma})`, async () => opExposure(img, params, log)); break;
      case 'levelsOut':  img = await log.step(`Passo ${i+1} - levelsOut (${params?.lo},${params?.hi})`, async () => opLevelsOut(img, params)); break;
      case 'normalize':  img = await log.step(`Passo ${i+1} - normalize (${params?.black},${params?.white})`, async () => opNormalize(img, params)); break;
      case 'denoise':    img = await log.step(`Passo ${i+1} - denoise (${params?.level})`, async () => opDenoise(img, params)); break;
      case 'sharpen':    img = await log.step(`Passo ${i+1} - sharpen (${params?.amount})`, async () => opSharpen(img, params)); break;
      case 'aiEnhance':  img = await log.step(`Passo ${i+1} - aiEnhance (${params?.enabled})`, async () => opAIEnhance(img, !!params?.enabled, meta0, log)); break;
      default:           log.warn(`Passo ${i+1} - op desconhecida:`, op);
    }
  }
  return img;
}

// ===============================
// Estado em memória + carga de disco
// ===============================
const SESSIONS = new Map(); // sid -> { original, steps: [], lastPreviewB64, meta }
const PRESETS  = new Map(); // presetId -> { name, steps, createdAt, updatedAt }

// carrega presets persistidos
(function loadPresetsFromDisk() {
  const persisted = readJson(PRESETS_PATH, { presets: {} });
  Object.entries(persisted.presets || {}).forEach(([id, p]) => {
    PRESETS.set(id, p);
  });
})();

function persistPresetsToDisk() {
  const obj = { presets: Object.fromEntries(PRESETS.entries()) };
  writeJson(PRESETS_PATH, obj);
}

// ===============================
// App / Rotas
// ===============================
const app = express();
app.use(express.json({ limit: '2mb' }));

// CORS permissivo p/ dev
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(jpeg|png|webp|tiff|heic|avif)/i.test(file.mimetype || '');
    cb(ok ? null : new Error('Mimetype não suportado'), ok);
  }
});

app.get('/', (_req, res) => {
  res.type('text').send(
`PS Macro API
POST /sessions                (multipart: file)
POST /sessions/:sid/steps     { op, params }  -> adiciona passo
PUT  /sessions/:sid/steps/:i  { op, params }  -> edita passo i
DEL  /sessions/:sid/steps/:i                 -> remove passo i
GET  /sessions/:sid                                -> info da sessão (steps, meta)
POST /sessions/:sid/export?out=png&accept=json -> exporta imagem final
POST /sessions/:sid/savePreset { name, publish?, slug?, allowOverwrite? } -> salva preset (e publica opcionalmente)
GET  /presets                                    -> lista presets (admin)
GET  /public/presets                              -> lista presets públicos (slug, nome)
GET  /public/presets/:slug                        -> detalhes de um preset público
POST /public/process?slug=...&out=png&accept=json -> aplica preset público em uma imagem (multipart: file)

Quando ?accept=json, respostas incluem { image:dataURL, log } para exibir no modal.
`
  );
});

// cria sessão com imagem original
app.post('/sessions', upload.single('file'), async (req, res) => {
  const reqId = `${++REQ_SEQ}-${crypto.randomBytes(2).toString('hex')}`;
  const log = mkLogger(reqId);
  const t0 = nowNs();
  const wantsJson = String(req.query.accept || '').toLowerCase() === 'json';

  try {
    if (canLog('info')) console.log(`\n[${reqId}] ================== NOVA REQUISIÇÃO ==================`);
    log.info('Host:', os.hostname(), '| PID:', process.pid);
    log.info('Memória inicial:', memSnapshot());

    if (!req.file) {
      const msg = { error: 'Envie "file".' };
      return wantsJson ? res.status(400).json({ ok:false, ...msg, log: log.lines.join('\n') })
                       : res.status(400).json(msg);
    }

    const mimeOk = /^image\/(jpeg|png|webp|tiff|heic|avif)$/i.test(req.file.mimetype || '');
    const probe  = await sharp(req.file.buffer, { failOn: 'none' }).metadata();
    if (!mimeOk && !['jpeg','png','webp','tiff','heic','avif'].includes(probe.format || '')) {
      const msg = { error: 'Formato não suportado.' };
      return wantsJson ? res.status(415).json({ ok:false, ...msg, log: log.lines.join('\n') })
                       : res.status(415).json(msg);
    }

    const sid = crypto.randomBytes(6).toString('hex');
    SESSIONS.set(sid, { original: req.file.buffer, steps: [], lastPreviewB64: null, meta: probe });

    // preview = original (dataURL)
    const format = decideOutFormat(probe, req.file.originalname || '', req.file.mimetype || '');
    const previewBuf = await sharp(req.file.buffer).toFormat(format, format==='png'?{compressionLevel:9}:{quality:90}).toBuffer();
    const b64 = `data:image/${format};base64,` + previewBuf.toString('base64');

    log.info('Sessão criada:', { sid, width: probe.width, height: probe.height, format: probe.format });
    log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);
    if (canLog('info')) console.log(`[${reqId}] ================== _ ==================\n`);

    return res.json({
      ok: true,
      sid,
      meta: { width: probe.width, height: probe.height, format: (probe.format||'').toUpperCase() },
      preview: b64,
      log: log.lines.join('\n'),
    });
  } catch (err) {
    if (canLog('error')) console.error(`[${reqId}] ERRO`, err);
    return res.status(500).json({ ok:false, error: err?.message || String(err), log: log.lines.join('\n') });
  }
});

// info da sessão
app.get('/sessions/:sid', async (req, res) => {
  const s = SESSIONS.get(req.params.sid);
  if (!s) return res.status(404).json({ ok:false, error:'Sessão não encontrada' });
  res.json({ ok:true, steps: s.steps, meta: s.meta });
});

// adiciona passo
app.post('/sessions/:sid/steps', async (req, res) => {
  const reqId = `${++REQ_SEQ}-${crypto.randomBytes(2).toString('hex')}`;
  const log = mkLogger(reqId);
  const t0 = nowNs();

  try {
    const s = SESSIONS.get(req.params.sid);
    if (!s) return res.status(404).json({ ok:false, error:'Sessão não encontrada' });

    const { op, params } = req.body || {};
    if (!op) return res.status(400).json({ ok:false, error:'Campo "op" é obrigatório' });

    s.steps.push({ op, params: params || {} });

    const img = await runPipeline(s.original, s.steps, log);
    const outProbe = await img.metadata();

    let outFormat = decideOutFormat(outProbe, 'in.png', `image/${outProbe.format||'png'}`);
    const out = await log.step(`Encode preview (${outFormat})`, async () =>
      img.toFormat(outFormat, outFormat==='png'?{compressionLevel:9}:{quality:90}).toBuffer()
    );

    const b64 = `data:image/${outFormat};base64,` + out.toString('base64');
    s.lastPreviewB64 = b64;

    const meta = { width: outProbe.width, height: outProbe.height, format: outFormat.toUpperCase(), hasAlpha: outProbe.hasAlpha };

    log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);
    return res.json({ ok:true, stepIndex: s.steps.length-1, steps: s.steps, preview: b64, meta, log: log.lines.join('\n') });
  } catch (err) {
    if (canLog('error')) console.error(`[${reqId}] ERRO`, err);
    return res.status(500).json({ ok:false, error: err?.message || String(err), log: log.lines.join('\n') });
  }
});

// edita passo i
app.put('/sessions/:sid/steps/:idx', async (req, res) => {
  const reqId = `${++REQ_SEQ}-${crypto.randomBytes(2).toString('hex')}`;
  const log = mkLogger(reqId);
  const t0 = nowNs();

  try {
    const s = SESSIONS.get(req.params.sid);
    if (!s) return res.status(404).json({ ok:false, error:'Sessão não encontrada' });

    const i = Number(req.params.idx);
    if (!Number.isFinite(i) || i<0 || i>=s.steps.length) return res.status(400).json({ ok:false, error:'Índice inválido' });

    const { op, params } = req.body || {};
    if (!op) return res.status(400).json({ ok:false, error:'Campo "op" é obrigatório' });

    s.steps[i] = { op, params: params || {} };

    const img = await runPipeline(s.original, s.steps, log);
    const outProbe = await img.metadata();
    let outFormat = decideOutFormat(outProbe, 'in.png', `image/${outProbe.format||'png'}`);
    const out = await log.step(`Encode preview (${outFormat})`, async () =>
      img.toFormat(outFormat, outFormat==='png'?{compressionLevel:9}:{quality:90}).toBuffer()
    );

    const b64 = `data:image/${outFormat};base64,` + out.toString('base64');
    s.lastPreviewB64 = b64;

    const meta = { width: outProbe.width, height: outProbe.height, format: outFormat.toUpperCase(), hasAlpha: outProbe.hasAlpha };
    log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);
    return res.json({ ok:true, steps: s.steps, preview: b64, meta, log: log.lines.join('\n') });
  } catch (err) {
    if (canLog('error')) console.error(`[${reqId}] ERRO`, err);
    return res.status(500).json({ ok:false, error: err?.message || String(err), log: log.lines.join('\n') });
  }
});

// remove passo i
app.delete('/sessions/:sid/steps/:idx', async (req, res) => {
  const reqId = `${++REQ_SEQ}-${crypto.randomBytes(2).toString('hex')}`;
  const log = mkLogger(reqId);
  const t0 = nowNs();

  try {
    const s = SESSIONS.get(req.params.sid);
    if (!s) return res.status(404).json({ ok:false, error:'Sessão não encontrada' });
    const i = Number(req.params.idx);
    if (!Number.isFinite(i) || i<0 || i>=s.steps.length) return res.status(400).json({ ok:false, error:'Índice inválido' });

    s.steps.splice(i, 1);

    const img = await runPipeline(s.original, s.steps, log);
    const outProbe = await img.metadata();
    let outFormat = decideOutFormat(outProbe, 'in.png', `image/${outProbe.format||'png'}`);
    const out = await log.step(`Encode preview (${outFormat})`, async () =>
      img.toFormat(outFormat, outFormat==='png'?{compressionLevel:9}:{quality:90}).toBuffer()
    );
    const b64 = `data:image/${outFormat};base64,` + out.toString('base64');
    s.lastPreviewB64 = b64;
    const meta = { width: outProbe.width, height: outProbe.height, format: outFormat.toUpperCase(), hasAlpha: outProbe.hasAlpha };

    log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);
    return res.json({ ok:true, steps: s.steps, preview: b64, meta, log: log.lines.join('\n') });
  } catch (err) {
    if (canLog('error')) console.error(`[${reqId}] ERRO`, err);
    return res.status(500).json({ ok:false, error: err?.message || String(err), log: log.lines.join('\n') });
  }
});

// export final da sessão
app.post('/sessions/:sid/export', async (req, res) => {
  const reqId = `${++REQ_SEQ}-${crypto.randomBytes(2).toString('hex')}`;
  const log = mkLogger(reqId);
  const t0 = nowNs();
  const wantsJson = String(req.query.accept || 'json').toLowerCase() === 'json';

  try {
    const s = SESSIONS.get(req.params.sid);
    if (!s) return res.status(404).json({ ok:false, error:'Sessão não encontrada' });

    const img = await runPipeline(s.original, s.steps, log);
    const probe = await img.metadata();

    let outFormat = decideOutFormat(probe, 'out.png', `image/${probe.format||'png'}`);
    const outParam = String(req.query.out || '').toLowerCase();
    if (['png','jpeg','webp','avif','tiff'].includes(outParam)) outFormat = outParam;

    const fmtOpts = outFormat === 'jpeg' ? { quality: 90, mozjpeg: true }
                  : outFormat === 'webp' ? { quality: 90 }
                  : outFormat === 'png'  ? { compressionLevel: 9 }
                  : outFormat === 'avif' ? { quality: 45 }
                  : {};

    const out = await log.step(`Encode (${outFormat})`, async () =>
      img.toFormat(outFormat, fmtOpts).toBuffer()
    );

    const finMeta = await sharp(out).metadata();

    log.info('Memória final:', memSnapshot());
    log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);
    if (canLog('info')) console.log(`[${reqId}] ================== _ ==================\n`);

    if (wantsJson) {
      const b64 = `data:image/${outFormat};base64,` + out.toString('base64');
      return res.json({
        ok: true,
        meta: { width: finMeta.width, height: finMeta.height, format: outFormat, hasAlpha: finMeta.hasAlpha, bytes: out.length },
        image: b64,
        log: log.lines.join('\n'),
      });
    }
    res.setHeader('Content-Type', `image/${outFormat}`);
    return res.send(out);
  } catch (err) {
    if (canLog('error')) console.error(`[${reqId}] ERRO`, err);
    return res.status(500).json({ ok:false, error: err?.message || String(err), log: log.lines.join('\n') });
  }
});

// salvar preset da sessão (com publicação automática opcional)
app.post('/sessions/:sid/savePreset', async (req, res) => {
  const s = SESSIONS.get(req.params.sid);
  if (!s) return res.status(404).json({ ok:false, error:'Sessão não encontrada' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ ok:false, error:'Informe "name"' });

  // cria/atualiza preset em memória
  const presetId = crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();
  const presetObj = { name, steps: JSON.parse(JSON.stringify(s.steps)), createdAt: now, updatedAt: now };
  PRESETS.set(presetId, presetObj);

  // persiste em disco
  persistPresetsToDisk();

  const { publish, slug: rawSlug, allowOverwrite } = req.body || {};
  let published = null;

  if (publish) {
    const slug = (rawSlug ? String(rawSlug) : slugify(name || `preset-${presetId}`)).toLowerCase();
    if (!/^[a-z0-9-]{3,64}$/.test(slug)) {
      return res.status(400).json({ ok:false, error: 'Slug inválido. Use letras, números e hífens (3–64 chars).' });
    }

    const pub = readJson(PUBLIC_PRESETS_PATH, {});
    const existsConflict = pub[slug] && pub[slug].presetId !== presetId;
    if (existsConflict && !allowOverwrite) {
      return res.status(409).json({ ok:false, error: `Slug já existe: ${slug}. Envie allowOverwrite:true para substituir.` });
    }

    pub[slug] = {
      presetId,
      slug,
      name: name || slug,
      updatedAt: now,
      createdAt: pub[slug]?.createdAt || now
    };
    writeJson(PUBLIC_PRESETS_PATH, pub);
    published = { slug };
  }

  return res.json({ ok:true, presetId, name, stepsCount: s.steps.length, published });
});

// listar presets (admin)
app.get('/presets', (_req, res) => {
  const pub = readJson(PUBLIC_PRESETS_PATH, {});
  const slugById = {};
  for (const k of Object.keys(pub)) slugById[ pub[k].presetId ] = pub[k].slug;

  const all = [...PRESETS.entries()].map(([id, p]) => ({
    id,
    name: p.name,
    steps: p.steps,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    published: Boolean(slugById[id]),
    slug: slugById[id] || null,
  }));
  res.json({ ok:true, presets: all });
});

// UPDATE preset (renomear e opcionalmente publicar/despublicar)
app.put('/presets/:id', (req, res) => {
  const id = String(req.params.id);
  const p = PRESETS.get(id);
  if (!p) return res.status(404).json({ ok:false, error:'Preset não encontrado' });

  const { name, slug, published } = req.body || {};
  const now = new Date().toISOString();

  if (typeof name === 'string' && name.trim()) {
    p.name = name.trim();
    p.updatedAt = now;
  }
  persistPresetsToDisk();

  // Publicar / despublicar se solicitado
  if (typeof published === 'boolean') {
    const pub = readJson(PUBLIC_PRESETS_PATH, {});
    // remove publicações anteriores deste preset
    for (const key of Object.keys(pub)) {
      if (pub[key].presetId === id) delete pub[key];
    }
    if (published) {
      const s = (slug && /^[a-z0-9-]{3,64}$/.test(slug)) ? slug.toLowerCase() : slugify(p.name || `preset-${id}`);
      pub[s] = { presetId: id, slug: s, name: p.name || s, createdAt: pub[s]?.createdAt || now, updatedAt: now };
    }
    writeJson(PUBLIC_PRESETS_PATH, pub);
  }

  return res.json({ ok:true, id, name: p.name, updatedAt: p.updatedAt });
});

// DELETE preset (também remove publicação pública, se existir)
app.delete('/presets/:id', (req, res) => {
  const id = String(req.params.id);
  if (!PRESETS.has(id)) return res.status(404).json({ ok:false, error:'Preset não encontrado' });

  // remove publicação
  const pub = readJson(PUBLIC_PRESETS_PATH, {});
  for (const key of Object.keys(pub)) {
    if (pub[key].presetId === id) delete pub[key];
  }
  writeJson(PUBLIC_PRESETS_PATH, pub);

  // remove do mapa e persiste
  PRESETS.delete(id);
  persistPresetsToDisk();

  return res.json({ ok:true, id });
});

// ===============================
// Endpoints PÚBLICOS (usuário comum)
// ===============================

// lista presets públicos
app.get('/public/presets', (_req, res) => {
  const pub = readJson(PUBLIC_PRESETS_PATH, {});
  const list = Object.values(pub).map(p => ({ slug: p.slug, name: p.name, presetId: p.presetId, updatedAt: p.updatedAt }));
  res.json({ ok:true, presets: list });
});

// detalhes de um preset público
app.get('/public/presets/:slug', (req, res) => {
  const pub = readJson(PUBLIC_PRESETS_PATH, {});
  const item = pub[req.params.slug?.toLowerCase()];
  if (!item) return res.status(404).json({ ok:false, error:'Slug não encontrado' });
  const preset = PRESETS.get(item.presetId);
  if (!preset) return res.status(404).json({ ok:false, error:'PresetId não encontrado' });
  res.json({ ok:true, slug: item.slug, name: item.name, presetId: item.presetId, steps: preset.steps });
});

// processa imagem com preset público (upload + retorno imagem final)
app.post('/public/process', upload.single('file'), async (req, res) => {
  const reqId = `${++REQ_SEQ}-${crypto.randomBytes(2).toString('hex')}`;
  const log = mkLogger(reqId);
  const t0 = nowNs();

  // ✅ Padrão agora é binário; só JSON se ?accept=json
  const wantsJson = String(req.query.accept || '').toLowerCase() === 'json';

  try {
    const slug = String(req.query.slug || '').toLowerCase();
    if (!slug) return res.status(400).json({ ok:false, error: 'Informe ?slug=...' });

    if (!req.file) {
      const msg = { error: 'Envie "file".' };
      return res.status(400).json({ ok:false, ...msg, log: log.lines.join('\n') });
    }

    const pub = readJson(PUBLIC_PRESETS_PATH, {});
    const item = pub[slug];
    if (!item) return res.status(404).json({ ok:false, error:'Preset público não encontrado' });

    const preset = PRESETS.get(item.presetId);
    if (!preset) return res.status(404).json({ ok:false, error:'PresetId inválido' });

    // Roda pipeline com os steps do preset
    const img = await runPipeline(req.file.buffer, preset.steps, log);
    const probe = await img.metadata();

    let outFormat = decideOutFormat(probe, 'out.png', `image/${probe.format || 'png'}`);
    const outParam = String(req.query.out || '').toLowerCase();
    if (['png','jpeg','webp','avif','tiff'].includes(outParam)) outFormat = outParam;

    const fmtOpts = outFormat === 'jpeg' ? { quality: 90, mozjpeg: true }
                  : outFormat === 'webp' ? { quality: 90 }
                  : outFormat === 'png'  ? { compressionLevel: 9 }
                  : outFormat === 'avif' ? { quality: 45 }
                  : {};
    const out = await log.step(`Encode (${outFormat})`, async () =>
      img.toFormat(outFormat, fmtOpts).toBuffer()
    );

    const finMeta = await sharp(out).metadata();

    log.info('Memória final:', memSnapshot());
    log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);

    if (wantsJson) {
      const b64 = `data:image/${outFormat};base64,` + out.toString('base64');
      return res.json({
        ok: true,
        preset: { slug: item.slug, name: preset.name, presetId: item.presetId },
        meta: { width: finMeta.width, height: finMeta.height, format: outFormat, hasAlpha: finMeta.hasAlpha, bytes: out.length },
        image: b64,
        log: log.lines.join('\n'),
      });
    }

    // ✅ Retorno binário correto (sem JSON)
    res.setHeader('Content-Type', `image/${outFormat}`);
    res.setHeader('Content-Disposition', `inline; filename="resultado.${outFormat}"`);
    return res.end(out); // envia bytes como estão
  } catch (err) {
    if (canLog('error')) console.error(`[${reqId}] ERRO`, err);
    return res.status(500).json({ ok:false, error: err?.message || String(err) });
  }
});

// despublicar (opcional)
app.delete('/public/presets/:slug', (req, res) => {
  const pub = readJson(PUBLIC_PRESETS_PATH, {});
  const slug = String(req.params.slug || '').toLowerCase();
  if (!pub[slug]) return res.status(404).json({ ok:false, error: 'Slug não encontrado.' });
  delete pub[slug];
  writeJson(PUBLIC_PRESETS_PATH, pub);
  res.json({ ok:true, slug });
});

// ================== Boot ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Image server ON  ->  http://localhost:${PORT}`);
  console.log(`Node ${process.version} | Sharp ${sharp.versions?.sharp || '??'} | LOG_LEVEL=${LOG_LEVEL}`);
  console.log(`Data dir: ${DATA_DIR}`);
});
