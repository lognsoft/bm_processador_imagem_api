// pipeline.ts
/**
 * Orquestra a execução do pipeline: aplica os passos na ordem recebida,
 * preserva metadados e retorna a instância Sharp resultante para encode.
 */
import sharp from 'sharp';
import type { MkLogger, Step } from '../types.js';
import {
  opAIEnhance,
  opBC,
  opBW,
  opDenoise,
  opExposure,
  opHighlights,
  opLevelsOut,
  opNormalize,
  opSepia,
  opShadows,
  opSharpen,
} from './ops.js';

export async function runPipeline(originalBuffer: Buffer, steps: Step[], log: MkLogger) {
  let img = sharp(originalBuffer, { failOn: 'none' })
    .rotate()
    .withMetadata()
    .toColourspace('srgb');

  const meta0 = await img.metadata();

  for (let i = 0; i < steps.length; i++) {
    const { op, params } = steps[i] || {};
    switch (op) {
      case 'bw':
        img = await log.step(
          `Passo ${i+1} - bw`,
          async () => opBW(img, params, log),
        );
        break;

      case 'sepia':
        img = await log.step(
          `Passo ${i+1} - sepia (${(params as any)?.amount})`,
          async () => opSepia(img, params, log),
        );
        break;

      case 'bc':
        img = await log.step(
          `Passo ${i+1} - bc (${(params as any)?.b},${(params as any)?.c})`,
          async () => opBC(img, params),
        );
        break;

      case 'shadows':
        img = await log.step(
          `Passo ${i+1} - shadows (${(params as any)?.intensity},${(params as any)?.width},${(params as any)?.radius})`,
          async () => opShadows(img, params),
        );
        break;

      case 'highlights':
        img = await log.step(
          `Passo ${i+1} - highlights (${(params as any)?.intensity},${(params as any)?.width},${(params as any)?.radius})`,
          async () => opHighlights(img, params),
        );
        break;

      case 'exposure':
        img = await log.step(
          `Passo ${i+1} - exposure (ev=${(params as any)?.ev},off=${(params as any)?.offset},gam=${(params as any)?.gamma})`,
          async () => opExposure(img, params, log),
        );
        break;

      case 'levelsOut':
        img = await log.step(
          `Passo ${i+1} - levelsOut (${(params as any)?.lo},${(params as any)?.hi})`,
          async () => opLevelsOut(img, params),
        );
        break;

      case 'normalize':
        img = await log.step(
          `Passo ${i+1} - normalize (${(params as any)?.black},${(params as any)?.white})`,
          async () => opNormalize(img, params),
        );
        break;

      case 'denoise':
        img = await log.step(
          `Passo ${i+1} - denoise (${(params as any)?.level})`,
          async () => opDenoise(img, params),
        );
        break;

      case 'sharpen':
        img = await log.step(
          `Passo ${i+1} - sharpen (${(params as any)?.amount})`,
          async () => opSharpen(img, params),
        );
        break;

      case 'aiEnhance':
        img = await log.step(
          `Passo ${i+1} - aiEnhance (${(params as any)?.enabled})`,
          async () => opAIEnhance(img, !!(params as any)?.enabled, meta0, log),
        );
        break;

      default:
        log.warn(`Passo ${i+1} - op desconhecida:`, op);
    }
  }

  return img;
}
