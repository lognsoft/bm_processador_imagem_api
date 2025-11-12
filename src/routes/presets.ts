import { Router } from 'express';
import { listPresets, updatePresetMeta, deletePreset, publishPreset, unpublishSlug } from '../store/presetsStore.js';
import { slugify } from '../utils/strings.js';

const router = Router();

// ✅ novo: lista em /presets (o HTML espera isso)
router.get('/', (_req, res) => {
  const all = listPresets().map(([id, p]) => ({ id, ...p }));
  res.json({ ok:true, presets: all });
});

// (mantém /docs como alias, se quiser)
router.get('/docs', (_req, res) => {
  const all = listPresets().map(([id, p]) => ({ id, ...p }));
  res.json({ ok:true, presets: all });
});

router.put('/:id', (req, res) => {
  const id = String(req.params.id);
  const { name, slug, published } = req.body || {};

  if (name || name === '') {
    const ok = updatePresetMeta(id, name);
    if (!ok) return res.status(404).json({ ok:false, error:'Preset não encontrado' });
  }

  if (typeof published === 'boolean') {
    if (published) {
      const finalSlug = (slug && /^[a-z0-9-]{3,64}$/.test(slug)) ? slug.toLowerCase() : slugify(name || `preset-${id}`);
      publishPreset(id, finalSlug, name);
      return res.json({ ok:true, id, published: true, slug: finalSlug });
    } else {
      if (slug) unpublishSlug(slug.toLowerCase());
      return res.json({ ok:true, id, published: false });
    }
  }

  return res.json({ ok:true, id, name });
});

router.delete('/:id', (req, res) => {
  const id = String(req.params.id);
  const ok = deletePreset(id);
  if (!ok) return res.status(404).json({ ok:false, error:'Preset não encontrado' });
  return res.json({ ok:true, id });
});

export default router;
