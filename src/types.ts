/**
 * Define os tipos centrais do sistema: passos do pipeline, sessões,
 * presets (privados e públicos) e a interface do logger com steps.
 * Fornece IntelliSense e consistência entre módulos.
 */
export type StepOp =
  | 'bw' | 'bc' | 'shadows' | 'highlights' | 'exposure'
  | 'levelsOut' | 'normalize' | 'denoise' | 'sharpen' | 'aiEnhance';

export interface Step {
  op: StepOp;
  params?: Record<string, unknown>;
}

export interface SessionData {
  original: Buffer;
  steps: Step[];
  lastPreviewB64: string | null;
  meta: {
    width?: number;
    height?: number;
    format?: string;
    hasAlpha?: boolean;
  };
}

export interface Preset {
  name: string;
  steps: Step[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicPresetMeta {
  presetId: string;
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface MkLogger {
  lines: string[];
  step<T>(label: string, fn: () => Promise<T>): Promise<T>;
  debug: (...a: any[]) => void;
  info:  (...a: any[]) => void;
  warn:  (...a: any[]) => void;
  error: (...a: any[]) => void;
}
