/**
 * Centraliza a decisão do formato de saída considerando alpha, mimetype
 * e extensão do arquivo de entrada, garantindo compatibilidade.
 */
import type { Metadata } from 'sharp';

export function pickOutFormatFromName(name?: string): 'jpeg'|'png'|'webp'|'tiff'|'avif' {
  const ext = (name || '').toLowerCase();
  if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return 'jpeg';
  if (ext.endsWith('.png')) return 'png';
  if (ext.endsWith('.webp')) return 'webp';
  if (ext.endsWith('.tif') || ext.endsWith('.tiff')) return 'tiff';
  if (ext.endsWith('.avif')) return 'avif';
  return 'jpeg';
}

export function decideOutFormat(meta: Metadata | undefined, filename: string, mimetype: string) {
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
