// src/routes/sessions.ts
/**
 * Rotas administrativas de sessão: cria sessão com upload,
 * adiciona/edita/remove passos, exporta resultado e salva preset (com publicação opcional).
 * Mantém estado da edição inteiramente em memória.
 */
import { Router } from 'express';
import crypto from 'crypto';
import sharp from 'sharp';
import { mkLogger, banner, memSnapshot } from '../utils/logger.js';
import { decideOutFormat } from '../utils/mime.js';
import { nowNs, elapsedMs } from '../utils/time.js';
import {
  createSession,
  getSession,
  pushStep,
  replaceStep,
  removeStep,
  setPreview,
  nextReqId,
} from '../store/sessionsStore.js';
import { runPipeline } from '../services/pipeline.js';
import { publishPreset, publicSlugExists } from '../store/presetsStore.js';
import { slugify } from '../utils/strings.js';

export default function sessionRoutes(upload: any) {
  const router = Router();

  // cria sessão em POST /sessions
  router.post('/', upload.single('file'), async (req, res) => {
    const reqId = nextReqId();
    const log = mkLogger(reqId);
    const t0 = nowNs();
    banner(reqId);
    log.info('Memória inicial:', memSnapshot());

    try {
      if (!req.file) {
        return res
          .status(400)
          .json({
            ok: false,
            error: 'Envie "file".',
            log: log.lines.join('\n'),
          });
      }

      const mimeOk = /^image\/(jpeg|png|webp|tiff|heic|avif)$/i.test(
        req.file.mimetype || ''
      );
      const probe = await sharp(req.file.buffer, { failOn: 'none' }).metadata();
      if (
        !mimeOk &&
        !['jpeg', 'png', 'webp', 'tiff', 'heic', 'avif'].includes(
          probe.format || ''
        )
      ) {
        return res
          .status(415)
          .json({
            ok: false,
            error: 'Formato não suportado.',
            log: log.lines.join('\n'),
          });
      }

      const sid = crypto.randomBytes(6).toString('hex');
      createSession(sid, {
        original: req.file.buffer,
        steps: [],
        meta: probe,
      });

      const format = decideOutFormat(
        probe,
        req.file.originalname || '',
        req.file.mimetype || ''
      );
      const previewBuf = await sharp(req.file.buffer)
        .toFormat(format, format === 'png' ? { compressionLevel: 9 } : { quality: 90 })
        .toBuffer();
      const b64 =
        `data:image/${format};base64,` + previewBuf.toString('base64');
      setPreview(sid, b64);

      log.info('Sessão criada:', {
        sid,
        width: probe.width,
        height: probe.height,
        format: probe.format,
      });
      log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);
      return res.json({
        ok: true,
        sid,
        meta: {
          width: probe.width,
          height: probe.height,
          format: (probe.format || '').toUpperCase(),
        },
        preview: b64,
        log: log.lines.join('\n'),
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          ok: false,
          error: err?.message || String(err),
          log: log.lines.join('\n'),
        });
    }
  });

  // alias legado /sessions/docs
  router.post('/docs', upload.single('file'), async (req, res) => {
    const reqId = nextReqId();
    const log = mkLogger(reqId);
    const t0 = nowNs();
    banner(reqId);
    log.info('Memória inicial:', memSnapshot());

    try {
      if (!req.file) {
        return res
          .status(400)
          .json({
            ok: false,
            error: 'Envie "file".',
            log: log.lines.join('\n'),
          });
      }

      const mimeOk = /^image\/(jpeg|png|webp|tiff|heic|avif)$/i.test(
        req.file.mimetype || ''
      );
      const probe = await sharp(req.file.buffer, { failOn: 'none' }).metadata();
      if (
        !mimeOk &&
        !['jpeg', 'png', 'webp', 'tiff', 'heic', 'avif'].includes(
          probe.format || ''
        )
      ) {
        return res
          .status(415)
          .json({
            ok: false,
            error: 'Formato não suportado.',
            log: log.lines.join('\n'),
          });
      }

      const sid = crypto.randomBytes(6).toString('hex');
      createSession(sid, {
        original: req.file.buffer,
        steps: [],
        meta: probe,
      });

      const format = decideOutFormat(
        probe,
        req.file.originalname || '',
        req.file.mimetype || ''
      );
      const previewBuf = await sharp(req.file.buffer)
        .toFormat(format, format === 'png' ? { compressionLevel: 9 } : { quality: 90 })
        .toBuffer();
      const b64 =
        `data:image/${format};base64,` + previewBuf.toString('base64');
      setPreview(sid, b64);

      log.info('Sessão criada:', {
        sid,
        width: probe.width,
        height: probe.height,
        format: probe.format,
      });
      log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);
      return res.json({
        ok: true,
        sid,
        meta: {
          width: probe.width,
          height: probe.height,
          format: (probe.format || '').toUpperCase(),
        },
        preview: b64,
        log: log.lines.join('\n'),
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          ok: false,
          error: err?.message || String(err),
          log: log.lines.join('\n'),
        });
    }
  });

  router.get('/:sid', (req, res) => {
    const s = getSession(req.params.sid);
    if (!s)
      return res
        .status(404)
        .json({ ok: false, error: 'Sessão não encontrada' });
    res.json({ ok: true, steps: s.steps, meta: s.meta });
  });

  router.post('/:sid/steps', async (req, res) => {
    const reqId = nextReqId();
    const log = mkLogger(reqId);
    const t0 = nowNs();

    try {
      const s = getSession(req.params.sid);
      if (!s)
        return res
          .status(404)
          .json({ ok: false, error: 'Sessão não encontrada' });

      const { op, params } = req.body || {};
      if (!op)
        return res
          .status(400)
          .json({ ok: false, error: 'Campo "op" é obrigatório' });

      pushStep(req.params.sid, { op, params: params || {} });

      const img = await runPipeline(s.original, s.steps, log);
      const outProbe = await img.metadata();

      const allowedFormats = ['png', 'jpeg', 'webp', 'avif', 'tiff'] as const;
      type OutFmt = (typeof allowedFormats)[number];

      let outFormat = decideOutFormat(
        outProbe,
        'in.png',
        `image/${outProbe.format || 'png'}`
      ) as OutFmt;

      const out = await log.step(`Encode preview (${outFormat})`, async () =>
        img
          .toFormat(
            outFormat,
            outFormat === 'png'
              ? { compressionLevel: 9 }
              : { quality: 90 }
          )
          .toBuffer()
      );

      const b64 =
        `data:image/${outFormat};base64,` + out.toString('base64');
      setPreview(req.params.sid, b64);

      const meta = {
        width: outProbe.width,
        height: outProbe.height,
        format: outFormat.toUpperCase(),
        hasAlpha: outProbe.hasAlpha,
      };
      log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);
      return res.json({
        ok: true,
        stepIndex: s.steps.length - 1,
        steps: s.steps,
        preview: b64,
        meta,
        log: log.lines.join('\n'),
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          ok: false,
          error: err?.message || String(err),
          log: log.lines.join('\n'),
        });
    }
  });

  router.put('/:sid/steps/:idx', async (req, res) => {
    const reqId = nextReqId();
    const log = mkLogger(reqId);
    const t0 = nowNs();

    try {
      const s = getSession(req.params.sid);
      if (!s)
        return res
          .status(404)
          .json({ ok: false, error: 'Sessão não encontrada' });

      const i = Number(req.params.idx);
      if (!Number.isFinite(i) || i < 0 || i >= s.steps.length) {
        return res
          .status(400)
          .json({ ok: false, error: 'Índice inválido' });
      }

      const { op, params } = req.body || {};
      if (!op)
        return res
          .status(400)
          .json({ ok: false, error: 'Campo "op" é obrigatório' });

      replaceStep(req.params.sid, i, { op, params: params || {} });

      const img = await runPipeline(s.original, s.steps, log);
      const outProbe = await img.metadata();

      const allowedFormats = ['png', 'jpeg', 'webp', 'avif', 'tiff'] as const;
      type OutFmt = (typeof allowedFormats)[number];

      let outFormat = decideOutFormat(
        outProbe,
        'in.png',
        `image/${outProbe.format || 'png'}`
      ) as OutFmt;

      const out = await log.step(`Encode preview (${outFormat})`, async () =>
        img
          .toFormat(
            outFormat,
            outFormat === 'png'
              ? { compressionLevel: 9 }
              : { quality: 90 }
          )
          .toBuffer()
      );

      const b64 =
        `data:image/${outFormat};base64,` + out.toString('base64');
      setPreview(req.params.sid, b64);

      const meta = {
        width: outProbe.width,
        height: outProbe.height,
        format: outFormat.toUpperCase(),
        hasAlpha: outProbe.hasAlpha,
      };
      log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);
      return res.json({
        ok: true,
        steps: s.steps,
        preview: b64,
        meta,
        log: log.lines.join('\n'),
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          ok: false,
          error: err?.message || String(err),
          log: log.lines.join('\n'),
        });
    }
  });

  router.delete('/:sid/steps/:idx', async (req, res) => {
    const reqId = nextReqId();
    const log = mkLogger(reqId);
    const t0 = nowNs();

    try {
      const s = getSession(req.params.sid);
      if (!s)
        return res
          .status(404)
          .json({ ok: false, error: 'Sessão não encontrada' });

      const i = Number(req.params.idx);
      if (!Number.isFinite(i) || i < 0 || i >= s.steps.length) {
        return res
          .status(400)
          .json({ ok: false, error: 'Índice inválido' });
      }

      removeStep(req.params.sid, i);

      const img = await runPipeline(s.original, s.steps, log);
      const outProbe = await img.metadata();

      const allowedFormats = ['png', 'jpeg', 'webp', 'avif', 'tiff'] as const;
      type OutFmt = (typeof allowedFormats)[number];

      let outFormat = decideOutFormat(
        outProbe,
        'in.png',
        `image/${outProbe.format || 'png'}`
      ) as OutFmt;

      const out = await log.step(`Encode preview (${outFormat})`, async () =>
        img
          .toFormat(
            outFormat,
            outFormat === 'png'
              ? { compressionLevel: 9 }
              : { quality: 90 }
          )
          .toBuffer()
      );

      const b64 =
        `data:image/${outFormat};base64,` + out.toString('base64');
      setPreview(req.params.sid, b64);

      const meta = {
        width: outProbe.width,
        height: outProbe.height,
        format: outFormat.toUpperCase(),
        hasAlpha: outProbe.hasAlpha,
      };

      log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);
      return res.json({
        ok: true,
        steps: s.steps,
        preview: b64,
        meta,
        log: log.lines.join('\n'),
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          ok: false,
          error: err?.message || String(err),
          log: log.lines.join('\n'),
        });
    }
  });

  // aplica um preset existente na sessão atual
  router.post('/:sid/applyPreset', async (req, res) => {
    const reqId = nextReqId();
    const log = mkLogger(reqId);
    const t0 = nowNs();

    try {
      const sid = String(req.params.sid);
      const { presetId } = req.body || {};

      if (!presetId) {
        return res
          .status(400)
          .json({ ok: false, error: 'presetId é obrigatório' });
      }

      const s = getSession(sid);
      if (!s) {
        return res
          .status(404)
          .json({ ok: false, error: 'Sessão não encontrada' });
      }

      const { getPreset } = await import('../store/presetsStore.js');
      const preset = getPreset(String(presetId));

      if (!preset || !Array.isArray(preset.steps)) {
        return res
          .status(404)
          .json({ ok: false, error: 'Preset não encontrado' });
      }

      // substitui os passos da sessão pelos passos do preset
      s.steps = preset.steps.map((x: any) => ({ ...x }));

      const img = await runPipeline(s.original, s.steps, log);
      const outProbe = await img.metadata();

      const allowedFormats = ['png', 'jpeg', 'webp', 'avif', 'tiff'] as const;
      type OutFmt = (typeof allowedFormats)[number];

      let outFormat = decideOutFormat(
        outProbe,
        'in.png',
        `image/${outProbe.format || 'png'}`
      ) as OutFmt;

      const out = await log.step(`Encode preview (${outFormat})`, async () =>
        img
          .toFormat(
            outFormat,
            outFormat === 'png'
              ? { compressionLevel: 9 }
              : { quality: 90 }
          )
          .toBuffer()
      );

      const b64 =
        `data:image/${outFormat};base64,` + out.toString('base64');
      setPreview(sid, b64);

      const meta = {
        width: outProbe.width,
        height: outProbe.height,
        format: outFormat.toUpperCase(),
        hasAlpha: outProbe.hasAlpha,
      };

      log.info('Tempo total:', `${elapsedMs(t0).toFixed(1)} ms`);

      return res.json({
        ok: true,
        steps: s.steps,
        preview: b64,
        meta,
        log: log.lines.join('\n'),
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || String(err),
        log: log.lines.join('\n'),
      });
    }
  });

  router.post('/:sid/export', async (req, res) => {
    const reqId = nextReqId();
    const log = mkLogger(reqId);
    const t0 = nowNs();
    const wantsJson =
      String(req.query.accept || 'json').toLowerCase() === 'json';

    try {
      const s = getSession(req.params.sid);
      if (!s)
        return res
          .status(404)
          .json({ ok: false, error: 'Sessão não encontrada' });

      const img = await runPipeline(s.original, s.steps, log);
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
      return res.send(out);
    } catch (err: any) {
      return res
        .status(500)
        .json({
          ok: false,
          error: err?.message || String(err),
          log: log.lines.join('\n'),
        });
    }
  });

  router.post('/:sid/savePreset', async (req, res) => {
    const s = getSession(req.params.sid);
    if (!s)
      return res
        .status(404)
        .json({ ok: false, error: 'Sessão não encontrada' });

    const name = String(req.body?.name || '').trim();
    if (!name)
      return res
        .status(400)
        .json({ ok: false, error: 'Informe "name"' });

    const { createFromSteps } = await import('../store/presetsStore.js');
    const { presetId, presetObj } = createFromSteps(name, s.steps);

    const { publish, slug: rawSlug, allowOverwrite } = req.body || {};
    let published: { slug: string } | null = null;

    if (publish) {
      const slug = (rawSlug ? String(rawSlug) : slugify(name || `preset-${presetId}`)).toLowerCase();
      if (!/^[a-z0-9-]{3,64}$/.test(slug)) {
        return res.status(400).json({
          ok: false,
          error:
            'Slug inválido. Use letras, números e hífens (3–64 chars).',
        });
      }
      const exists = publicSlugExists(slug);
      if (exists && !allowOverwrite) {
        return res.status(409).json({
          ok: false,
          error: `Slug já existe: ${slug}. Envie allowOverwrite:true para substituir.`,
        });
      }
      publishPreset(presetId, slug, name);
      published = { slug };
    }

    return res.json({
      ok: true,
      presetId,
      name: presetObj.name,
      stepsCount: s.steps.length,
      published,
    });
  });

  return router;
}
