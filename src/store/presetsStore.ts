//presetsStore.ts
/**
 * Gerencia presets em memória e em disco (data/), permitindo criar,
 * listar, atualizar, excluir e publicar/despublicar por slug público.
 */
import crypto from 'crypto';
import { PRESETS_PATH, PUBLIC_PRESETS_PATH } from '../config.js';
import { readJson, writeJson } from '../utils/json-file.js';
import type { Preset, PublicPresetMeta, Step } from '../types.js';

const PRESETS = new Map<string, Preset>();

// Inicializa carregando do disco
(function load() {
  const persisted = readJson<{ presets: Record<string, Preset> }>(PRESETS_PATH, { presets: {} });
  Object.entries(persisted.presets || {}).forEach(([id, p]) => PRESETS.set(id, p));
})();

function persist() {
  writeJson(PRESETS_PATH, { presets: Object.fromEntries(PRESETS.entries()) });
}

export function listPresets() {
  return [...PRESETS.entries()];
}

export function getPreset(id: string) {
  return PRESETS.get(id);
}

export function createFromSteps(name: string, steps: Step[]) {
  const presetId = crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();
  const presetObj: Preset = { name, steps: JSON.parse(JSON.stringify(steps)), createdAt: now, updatedAt: now };
  PRESETS.set(presetId, presetObj);
  persist();
  return { presetId, presetObj };
}

export function updatePresetMeta(id: string, name?: string) {
  const p = PRESETS.get(id);
  if (!p) return false;
  if (name && name.trim()) p.name = name.trim();
  p.updatedAt = new Date().toISOString();
  PRESETS.set(id, p);
  persist();
  return true;
}

export function deletePreset(id: string) {
  const pub = readJson<Record<string, PublicPresetMeta>>(PUBLIC_PRESETS_PATH, {});
  for (const key of Object.keys(pub)) {
    if (pub[key].presetId === id) delete pub[key];
  }
  writeJson(PUBLIC_PRESETS_PATH, pub);
  const ok = PRESETS.delete(id);
  persist();
  return ok;
}

export function listPublicPresets(): PublicPresetMeta[] {
  const pub = readJson<Record<string, PublicPresetMeta>>(PUBLIC_PRESETS_PATH, {});
  return Object.values(pub);
}

export function getPublicBySlug(slug: string): { meta: PublicPresetMeta; preset?: Preset } | null {
  const pub = readJson<Record<string, PublicPresetMeta>>(PUBLIC_PRESETS_PATH, {});
  const item = pub[slug];
  if (!item) return null;
  const preset = PRESETS.get(item.presetId);
  return preset ? { meta: item, preset } : null;
}

export function publishPreset(id: string, slug: string, name?: string) {
  const pub = readJson<Record<string, PublicPresetMeta>>(PUBLIC_PRESETS_PATH, {});
  const now = new Date().toISOString();

  // Remover publicações antigas desse id
  for (const key of Object.keys(pub)) if (pub[key].presetId === id) delete pub[key];

  const p = PRESETS.get(id);
  if (!p) throw new Error('Preset não encontrado');
  const finalName = name || p.name || slug;

  pub[slug] = { presetId: id, slug, name: finalName, createdAt: pub[slug]?.createdAt || now, updatedAt: now };
  writeJson(PUBLIC_PRESETS_PATH, pub);
}

export function unpublishSlug(slug: string) {
  const pub = readJson<Record<string, PublicPresetMeta>>(PUBLIC_PRESETS_PATH, {});
  if (!pub[slug]) return false;
  delete pub[slug];
  writeJson(PUBLIC_PRESETS_PATH, pub);
  return true;
}

export function publicSlugExists(slug: string) {
  const pub = readJson<Record<string, PublicPresetMeta>>(PUBLIC_PRESETS_PATH, {});
  return Boolean(pub[slug]);
}
