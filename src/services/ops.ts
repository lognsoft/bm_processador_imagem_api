/**
 * Implementa cada operador do pipeline (bw, bc, shadows, highlights, exposure,
 * levelsOut, normalize, denoise, sharpen, aiEnhance) utilizando Sharp.
 * Cada função recebe/retorna um Sharp encadeável.
 */
import sharp, { type Sharp } from 'sharp';
import type { MkLogger } from '../types.js';
import { clamp } from '../utils/strings.js';

export async function opBW(img: Sharp, params: any, log?: MkLogger) {
  const bwDefaults = { r:100, y:60, g:40, c:20, b:20, m:80 };
  const bw = { ...bwDefaults, ...(params || {}) };

  const meta = await img.metadata();
  let alphaBuf: Buffer | null = null;
  if (meta.hasAlpha) alphaBuf = await img.ensureAlpha().extractChannel('alpha').toBuffer();

  let wr = 0, wg = 0, wb = 0;
  wr += bw.r; wg += bw.g; wb += bw.b;
  wr += (bw.y || 0) * 0.5; wg += (bw.y || 0) * 0.5;
  wg += (bw.c || 0) * 0.5; wb += (bw.c || 0) * 0.5;
  wr += (bw.m || 0) * 0.5; wb += (bw.m || 0) * 0.5;
  const sum = wr + wg + wb || 1;
  wr /= sum; wg /= sum; wb /= sum;
  log?.debug('  [BW] Pesos (R,G,B):', [wr.toFixed(3), wg.toFixed(3), wb.toFixed(3)]);

  let base = img.toColourspace('srgb')
    .recomb([[wr,wg,wb],[wr,wg,wb],[wr,wg,wb]])
    .toColourspace('b-w')
    .toColourspace('srgb');

  if (alphaBuf) base = sharp(await base.toBuffer()).joinChannel(alphaBuf).toColourspace('srgb');
  return base;
}

export function opBC(img: Sharp, params: any) {
  const brightnessPct = clamp(params?.b ?? 0, -150, 150);
  const contrastPct   = clamp(params?.c ?? 0, -150, 150);
  const br = 1 + (brightnessPct / 100);
  const a  = 1 + (contrastPct / 100);
  const b  = 128 * (1 - a);
  return img.modulate({ brightness: br }).linear(a, b);
}

export async function opShadows(img: Sharp, params: any) {
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

export async function opHighlights(img: Sharp, params: any) {
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

export function opExposure(img: Sharp, params: any, log?: MkLogger) {
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

export async function opAIEnhance(img: Sharp, enabled: boolean, meta0: any, log?: MkLogger) {
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
