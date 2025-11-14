// src/routes/public.ts
/**
 * Rotas públicas: listam presets publicados, retornam detalhes por slug
 * e processam imagens usando um preset público sem acesso ao painel admin.
 */
import { Router } from 'express';
import sharp from 'sharp';
import { listPublicPresets, getPublicBySlug, unpublishSlug } from '../store/presetsStore.js';
import { decideOutFormat } from '../utils/mime.js';
import { mkLogger, memSnapshot } from '../utils/logger.js';
import { nowNs, elapsedMs } from '../utils/time.js';

export default function publicRoutes(upload: any) {
  const router = Router();

  router.get('/presets', (_req, res) => {
    const list = listPublicPresets().map(p => ({
      slug: p.slug,
      name: p.name,
      presetId: p.presetId,
      updatedAt: p.updatedAt,
    }));
    res.json({ ok: true, presets: list });
  });

  router.get('/presets/:slug', (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    const item = getPublicBySlug(slug);
    if (!item) return res.status(404).json({ ok: false, error: 'Slug não encontrado' });
    const { meta, preset } = item;
    if (!preset) return res.status(404).json({ ok: false, error: 'PresetId não encontrado' });
    res.json({
      ok: true,
      slug: meta.slug,
      name: meta.name,
      presetId: meta.presetId,
      steps: preset.steps,
    });
  });

  router.post('/process', upload.single('file'), async (req, res) => {
    const reqId = Math.random().toString(16).slice(2, 8);
    const log = mkLogger(reqId);
    const t0 = nowNs();
    const wantsJson = String(req.query.accept || '').toLowerCase() === 'json';

    try {
      const slug = String(req.query.slug || '').toLowerCase();
      if (!slug) {
        return res.status(400).json({ ok: false, error: 'Informe ?slug=...' });
      }

      if (!req.file) {
        const msg = { error: 'Envie "file".' };
        return res.status(400).json({ ok: false, ...msg, log: log.lines.join('\n') });
      }

      const item = getPublicBySlug(slug);
      if (!item) return res.status(404).json({ ok: false, error: 'Preset público não encontrado' });
      const { preset, meta } = item;
      if (!preset) return res.status(404).json({ ok: false, error: 'PresetId inválido' });

      const { runPipeline } = await import('../services/pipeline.js');
      const img = await runPipeline(req.file.buffer, preset.steps, log);
      const probe = await img.metadata();

      const allowedFormats = ['png', 'jpeg', 'webp', 'avif', 'tiff'] as const;
      type OutFmt = (typeof allowedFormats)[number];

      let outFormat = decideOutFormat(
        probe,
        'out.png',
        `image/${probe.format || 'png'}`
      ) as OutFmt;

      const outParamRaw = String(req.query.out || '').toLowerCase();
      if (allowedFormats.includes(outParamRaw as OutFmt)) {
        outFormat = outParamRaw as OutFmt;
      }

      const fmtOpts =
        outFormat === 'jpeg'
          ? { quality: 90, mozjpeg: true }
          : outFormat === 'webp'
          ? { quality: 90 }
          : outFormat === 'png'
          ? { compressionLevel: 9 }
          : outFormat === 'avif'
          ? { quality: 45 }
          : {};

      const out = await log.step(`Encode (${outFormat})`, async () =>
        img.toFormat(outFormat, fmtOpts).toBuffer()
      );

      const finMeta = await sharp(out).metadata();

      log.info('Memória final:', memSnapshot());
      log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);

      if (wantsJson) {
        const b64 =
          `data:image/${outFormat};base64,` + out.toString('base64');
        return res.json({
          ok: true,
          preset: {
            slug: meta.slug,
            name: preset.name,
            presetId: meta.presetId,
          },
          meta: {
            width: finMeta.width,
            height: finMeta.height,
            format: outFormat,
            hasAlpha: finMeta.hasAlpha,
            bytes: out.length,
          },
          image: b64,
          log: log.lines.join('\n'),
        });
      }

      res.setHeader('Content-Type', `image/${outFormat}`);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="resultado.${outFormat}"`
      );
      return res.end(out);
    } catch (err: any) {
      return res
        .status(500)
        .json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.delete('/presets/:slug', (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    const ok = unpublishSlug(slug);
    if (!ok)
      return res
        .status(404)
        .json({ ok: false, error: 'Slug não encontrado.' });
    res.json({ ok: true, slug });
  });

  return router;
}
