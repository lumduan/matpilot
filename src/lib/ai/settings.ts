/**
 * The AI helper's settings (ADR 0015), which an adult sets: on or off, the provider, the model
 * for each provider, the language of the answers, how many questions a day, and whether the keys
 * are remembered on this computer. The keys themselves are kept apart from these settings
 * (src/hooks/useAiHelper.ts) and never go into program files, GitHub saves or the journal.
 */
import { isProviderId, type ProviderId } from './providers';

export type AnswerLanguage = 'auto' | 'th' | 'en';

export const ANSWER_LANGUAGES: readonly {
  readonly value: AnswerLanguage;
  readonly label: string;
}[] = [
  { value: 'auto', label: 'The language of the question' },
  { value: 'th', label: 'Thai' },
  { value: 'en', label: 'English' },
];

/** A model chosen for a provider. */
export interface ChosenModel {
  readonly id: string;
  /**
   * The provider may re-run a declined request on another model (Anthropic's server-side
   * fallback). Known only from the provider's own model list, so a typed model id has `false`.
   */
  readonly fallbacks: boolean;
}

export interface AiSettings {
  /** The helper is on. Off by default; an adult turns it on. */
  readonly enabled: boolean;
  readonly provider: ProviderId;
  readonly models: Readonly<Partial<Record<ProviderId, ChosenModel>>>;
  readonly language: AnswerLanguage;
  /** Questions a day, in this browser. */
  readonly dailyLimit: number;
  /** Keep the keys on this computer; otherwise they last until this browser tab closes. */
  readonly rememberKeys: boolean;
}

export const DAILY_LIMIT_MIN = 1;
export const DAILY_LIMIT_MAX = 500;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: 'anthropic',
  models: {},
  language: 'auto',
  dailyLimit: 20,
  rememberKeys: false,
};

export function clampDailyLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AI_SETTINGS.dailyLimit;
  return Math.min(DAILY_LIMIT_MAX, Math.max(DAILY_LIMIT_MIN, Math.round(value)));
}

function parseModel(value: unknown): ChosenModel | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, fallbacks } = value as Record<string, unknown>;
  if (typeof id !== 'string' || id.trim() === '') return null;
  return { id: id.trim(), fallbacks: fallbacks === true };
}

/** Settings as stored; anything missing or unreadable takes its default. */
export function parseAiSettings(raw: string | null): AiSettings {
  if (raw === null) return DEFAULT_AI_SETTINGS;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const models: Partial<Record<ProviderId, ChosenModel>> = {};
    if (typeof data.models === 'object' && data.models !== null) {
      for (const [provider, value] of Object.entries(data.models)) {
        const model = parseModel(value);
        if (isProviderId(provider) && model) models[provider] = model;
      }
    }
    return {
      enabled: data.enabled === true,
      provider: isProviderId(data.provider) ? data.provider : DEFAULT_AI_SETTINGS.provider,
      models,
      language:
        data.language === 'th' || data.language === 'en' || data.language === 'auto'
          ? data.language
          : DEFAULT_AI_SETTINGS.language,
      dailyLimit:
        typeof data.dailyLimit === 'number'
          ? clampDailyLimit(data.dailyLimit)
          : DEFAULT_AI_SETTINGS.dailyLimit,
      rememberKeys: data.rememberKeys === true,
    };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

/** The keys, one per provider, as stored. */
export type AiKeys = Readonly<Partial<Record<ProviderId, string>>>;

export function parseKeys(raw: string | null): AiKeys {
  if (raw === null) return {};
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const keys: Partial<Record<ProviderId, string>> = {};
    for (const [provider, key] of Object.entries(data)) {
      if (isProviderId(provider) && typeof key === 'string' && key.trim() !== '') {
        keys[provider] = key.trim();
      }
    }
    return keys;
  } catch {
    return {};
  }
}
