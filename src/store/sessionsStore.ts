/**
 * Mantém o estado das sessões em memória: imagem original, lista de passos,
 * último preview em dataURL e metadados. Fornece helpers para CRUD de passos.
 */
import type { SessionData, Step } from '../types.js';

const SESSIONS = new Map<string, SessionData>();
let REQ_SEQ = 0;

export function nextReqId(): string {
  const rnd = Math.random().toString(16).slice(2, 6);
  return `${++REQ_SEQ}-${rnd}`;
}

export function createSession(sid: string, payload: Omit<SessionData, 'lastPreviewB64'> & { lastPreviewB64?: string | null }) {
  SESSIONS.set(sid, { ...payload, lastPreviewB64: payload.lastPreviewB64 ?? null });
}

export function getSession(sid: string): SessionData | undefined {
  return SESSIONS.get(sid);
}

export function setPreview(sid: string, b64: string) {
  const s = SESSIONS.get(sid);
  if (s) s.lastPreviewB64 = b64;
}

export function pushStep(sid: string, step: Step) {
  const s = SESSIONS.get(sid);
  if (s) s.steps.push(step);
}

export function replaceStep(sid: string, idx: number, step: Step) {
  const s = SESSIONS.get(sid);
  if (s) s.steps[idx] = step;
}

export function removeStep(sid: string, idx: number) {
  const s = SESSIONS.get(sid);
  if (s) s.steps.splice(idx, 1);
}
