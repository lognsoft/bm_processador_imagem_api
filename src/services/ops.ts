// ops.ts
/**
 * Implementa cada operador do pipeline (bw, bc, shadows, highlights, exposure,
 * levelsOut, normalize, denoise, sharpen, aiEnhance) utilizando Sharp.
 * Cada função recebe/retorna um Sharp encadeável.
 */
import sharp, { type Sharp } from 'sharp';
import type { MkLogger } from '../types.js';
import { clamp } from '../utils/strings.js';

// Helper de diagnóstico: média de R/G/B e diferenças entre canais
async function logRgbMeans(img: Sharp, log?: MkLogger, label = 'probe') {
  const s = await img.clone().removeAlpha().toColourspace('srgb').stats();
  const r = s.channels[0]?.mean ?? 0;
  const g = s.channels[1]?.mean ?? 0;
  const b = s.channels[2]?.mean ?? 0;
  log?.info?.(`[BW] ${label} means`, {
    r: r.toFixed(2),
    g: g.toFixed(2),
    b: b.toFixed(2),
  });
  const deltaRG = Math.abs(r - g);
  const deltaRB = Math.abs(r - b);
  const deltaGB = Math.abs(g - b);
  log?.info?.(`[BW] ${label} deltas`, {
    rg: deltaRG.toFixed(2),
    rb: deltaRB.toFixed(2),
    gb: deltaGB.toFixed(2),
  });
}

/**
 * Preto & Branco com mixer de canais + força (blend com neutro) + contraste.
 * r,y,g,c,b,m em 0..200   | strength 0..100 | contrast -50..50
 *
 * IMPORTANTE: esta versão sempre devolve uma imagem codificada (PNG),
 * evitando que etapas seguintes recebam buffer RAW e disparem
 * "Input buffer contains unsupported image format".
 */
export async function opBW(img: Sharp, params: any, log?: MkLogger) {
  const bwDefaults = {
    r: 100,
    y: 60,
    g: 40,
    c: 20,
    b: 20,
    m: 80,
    strength: 70,
    contrast: 0,
  };
  const bw = { ...bwDefaults, ...(params || {}) };

  const meta = await img.metadata();
  log?.debug?.('[BW] meta', meta);

  // separa alfa se existir
  let alphaBuf: Buffer | null = null;
  if (meta.hasAlpha) {
    alphaBuf = await img.clone().ensureAlpha().extractChannel('alpha').png().toBuffer();
  }

  // calcula pesos
  let wr = 0,
    wg = 0,
    wb = 0;
  wr += bw.r;
  wg += bw.g;
  wb += bw.b;
  wr += (bw.y || 0) * 0.5;
  wg += (bw.y || 0) * 0.5;
  wg += (bw.c || 0) * 0.5;
  wb += (bw.c || 0) * 0.5;
  wr += (bw.m || 0) * 0.5;
  wb += (bw.m || 0) * 0.5;

  const sum = wr + wg + wb || 1;
  wr /= sum;
  wg /= sum;
  wb /= sum;

  const t = Math.max(0, Math.min(1, Number(bw.strength ?? 70) / 100));
  const nr = 1 / 3,
    ng = 1 / 3,
    nb = 1 / 3;
  const mr = (1 - t) * nr + t * wr;
  const mg = (1 - t) * ng + t * wg;
  const mb = (1 - t) * nb + t * wb;

  log?.debug?.('[BW] mix', { wr, wg, wb, t, mr, mg, mb });
  await logRgbMeans(img, log, 'input');

  // pega dados brutos da imagem (sem alfa)
  const { data, info } = await img
    .clone()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);

  // aplica recombinação RGB manualmente
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const grayVal = mr * r + mg * g + mb * b;
    const clamped = Math.max(0, Math.min(255, grayVal));
    out[i] = clamped;
    out[i + 1] = clamped;
    out[i + 2] = clamped;
  }

  // cria imagem em escala de cinza a partir de RAW
  let gray = sharp(out, { raw: info }).toColourspace('srgb');

  // aplica contraste
  const cPct = Number(bw.contrast ?? 0);
  if (Number.isFinite(cPct) && cPct !== 0) {
    const a = 1 + Math.max(-0.5, Math.min(0.5, cPct / 100));
    const b = 128 * (1 - a);
    gray = gray.linear(a, b);
  }

  if (t >= 0.95) {
    try {
      gray = gray.normalize({ lower: 2, upper: 98 });
    } catch {
      // ignore
    }
  }

  await logRgbMeans(gray, log, 'after-bw');

  // *** PONTO CRÍTICO: sempre codificar para PNG antes de devolver ***
  if (alphaBuf) {
    // reanexa alfa e codifica para PNG
    const grayWithAlphaPng = await gray
      .joinChannel(alphaBuf)
      .toColourspace('srgb')
      .png()
      .toBuffer();

    // devolve um Sharp “normal” baseado em PNG
    return sharp(grayWithAlphaPng).toColourspace('srgb');
  } else {
    const grayPng = await gray.png().toBuffer();
    return sharp(grayPng).toColourspace('srgb');
  }
}

/**
 * Filtro SEPIA clássico (fotografia antiga).
 *
 * amount: 0..100  (força do efeito)
 *
 * Implementação:
 *  R' = 0.393R + 0.769G + 0.189B
 *  G' = 0.349R + 0.686G + 0.168B
 *  B' = 0.272R + 0.534G + 0.131B
 *
 * IMPORTANTE: assim como o opBW, esta função sempre devolve PNG sRGB,
 * evitando buffers RAW soltos no pipeline.
 */
export async function opSepia(img: Sharp, params: any, log?: MkLogger) {
  const amountPct = clamp(params?.amount ?? 100, 0, 100);
  const amount = amountPct / 100; // 0..1

  log?.debug?.('[SEPIA] params', { amountPct });

  const meta = await img.metadata();

  // separa alfa se existir
  let alphaBuf: Buffer | null = null;
  if (meta.hasAlpha) {
    alphaBuf = await img
      .clone()
      .ensureAlpha()
      .extractChannel('alpha')
      .png()
      .toBuffer();
  }

  // pega dados brutos da imagem (sem alfa)
  const { data, info } = await img
    .clone()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);

  // matriz clássica de sépia
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const sr = 0.393 * r + 0.769 * g + 0.189 * b;
    const sg = 0.349 * r + 0.686 * g + 0.168 * b;
    const sb = 0.272 * r + 0.534 * g + 0.131 * b;

    // clamp
    const rr = Math.max(0, Math.min(255, sr));
    const gg = Math.max(0, Math.min(255, sg));
    const bb = Math.max(0, Math.min(255, sb));

    // blend: 0 = original, 1 = sépia total
    out[i]     = rr * amount + r * (1 - amount);
    out[i + 1] = gg * amount + g * (1 - amount);
    out[i + 2] = bb * amount + b * (1 - amount);
  }

  let color = sharp(out, { raw: info }).toColourspace('srgb');

  // *** SEMPRE codificar para PNG antes de devolver ***
  if (alphaBuf) {
    const pngBuf = await color
      .joinChannel(alphaBuf)
      .toColourspace('srgb')
      .png()
      .toBuffer();
    return sharp(pngBuf).toColourspace('srgb');
  } else {
    const pngBuf = await color
      .toColourspace('srgb')
      .png()
      .toBuffer();
    return sharp(pngBuf).toColourspace('srgb');
  }
}

export function opBC(img: Sharp, params: any) {
  const brightnessPct = clamp(params?.b ?? 0, -150, 150);
  const contrastPct = clamp(params?.c ?? 0, -150, 150);
  const br = 1 + brightnessPct / 100;
  const a = 1 + contrastPct / 100;
  const b = 128 * (1 - a);
  return img.modulate({ brightness: br }).linear(a, b);
}

export async function opShadows(img: Sharp, params: any) {
  const intensity = clamp(params?.intensity ?? 0, 0, 100);
  const width = clamp(params?.width ?? 50, 1, 100);
  const radius = clamp(params?.radius ?? 30, 1, 200);

  const gammaMask =
    width >= 50
      ? 1.0 + ((width - 50) / 50) * 0.6
      : 1.0 / (1.0 + ((50 - width) / 50) * 0.6);

  // máscara sempre codificada (PNG)
  const mask = await img
    .clone()
    .removeAlpha()
    .toColourspace('b-w')
    .gamma(gammaMask)
    .negate()
    .blur(Math.max(0.3, radius / 3))
    .png()
    .toBuffer();

  const lift = 1.0 + (intensity / 100) * 0.6;

  // top sempre codificado (PNG)
  const top = await img
    .clone()
    .modulate({ brightness: lift })
    .png()
    .toBuffer();

  const comp = await sharp(top)
    .joinChannel(mask)
    .toColourspace('srgb')
    .png()
    .toBuffer();

  return img.composite([{ input: comp }]);
}

export async function opHighlights(img: Sharp, params: any) {
  const intensity = clamp(params?.intensity ?? 0, 0, 100);
  const width = clamp(params?.width ?? 50, 1, 100);
  const radius = clamp(params?.radius ?? 30, 1, 200);

  const gammaMask =
    width >= 50
      ? 1.0 + ((width - 50) / 50) * 0.6
      : 1.0 / (1.0 + ((50 - width) / 50) * 0.6);

  // máscara sempre codificada (PNG)
  const mask = await img
    .clone()
    .removeAlpha()
    .toColourspace('b-w')
    .gamma(gammaMask)
    .blur(Math.max(0.3, radius / 3))
    .png()
    .toBuffer();

  const cut = Math.max(0.4, 1.0 - (intensity / 100) * 0.4);

  // top sempre codificado (PNG)
  const top = await img
    .clone()
    .modulate({ brightness: cut })
    .png()
    .toBuffer();

  const comp = await sharp(top)
    .joinChannel(mask)
    .toColourspace('srgb')
    .png()
    .toBuffer();

  return img.composite([{ input: comp }]);
}

export function opExposure(img: Sharp, params: any, log?: MkLogger) {
  const ev = Number(params?.ev ?? 0);
  const offset = Number(params?.offset ?? 0);
  const gamma = Number(params?.gamma ?? 1);

  const gain = Math.pow(2, ev);
  const add = offset * 255;
  let t = img.linear(gain, add);

  if (Number.isFinite(gamma) && gamma !== 1) {
    if (gamma >= 1.0 && gamma <= 3.0) {
      t = t.gamma(gamma);
    } else if (gamma < 1.0) {
      const k = Math.max(0, Math.min(0.5, 1 - gamma));
      const br = 1 + k * 0.12;
      const a1 = 1 - k * 0.6;
      const b1 = 128 * (1 - a1);
      log?.warn?.(
        `[Exposure] gamma=${gamma} < 1; usando aproximação (k=${k.toFixed(3)})`,
      );
      t = t.modulate({ brightness: br }).linear(a1, b1);
    } else {
      t = t.gamma(3.0);
    }
  }
  return t;
}

export function opLevelsOut(img: Sharp, params: any) {
  const lo = clamp(params?.lo ?? 0, 0, 255);
  const hi = clamp(params?.hi ?? 255, 0, 255);
  const a = (hi - lo) / 255;
  const b = lo;
  return img.linear(a, b);
}

export function opNormalize(img: Sharp, params: any) {
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

export function opDenoise(img: Sharp, params: any) {
  const level = clamp(params?.level ?? 0, 0, 10);
  if (level <= 0) return img;
  let t = img.median(3);
  if (level >= 2) t = t.blur(0.6);
  if (level >= 4) t = t.blur(1.0);
  if (level >= 7) t = t.blur(1.5);
  return t;
}

export function opSharpen(img: Sharp, params: any) {
  const amount = clamp(params?.amount ?? 0, 0, 5);
  if (amount <= 0) return img;
  const sigma = Math.min(2.5, 0.8 + amount);
  return img.sharpen(sigma, 1.2, 1.0);
}

export async function opAIEnhance(
  img: Sharp,
  enabled: boolean,
  meta0: any,
  log?: MkLogger,
) {
  if (!enabled) return img;
  if (!meta0?.width || !meta0?.height) return img;
  const MAX_W = 6000,
    MAX_H = 6000,
    MAX_PIXELS = 16e6;
  const curPixels = meta0.width * meta0.height;
  if (curPixels > MAX_PIXELS) {
    log?.warn?.('AI Enhance ignorado por orçamento de pixels:', curPixels);
    return img;
  }
  const targetW = Math.min(meta0.width * 2, MAX_W);
  const targetH = Math.min(meta0.height * 2, MAX_H);
  log?.info?.('AI Enhance (resize 2x limitado):', { targetW, targetH });
  return img.resize({
    width: targetW,
    height: targetH,
    kernel: sharp.kernel.lanczos3,
  });
}
