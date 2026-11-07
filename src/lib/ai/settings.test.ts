import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, clampDailyLimit, parseAiSettings, parseKeys } from './settings';

describe('the AI settings', () => {
  it('start off, with no model and no remembered key', () => {
    expect(parseAiSettings(null)).toEqual(DEFAULT_AI_SETTINGS);
    expect(DEFAULT_AI_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_AI_SETTINGS.rememberKeys).toBe(false);
  });

  it('read back what was stored, and drop what they do not know', () => {
    const settings = parseAiSettings(
      JSON.stringify({
        enabled: true,
        provider: 'deepseek',
        models: {
          deepseek: { id: ' deepseek-chat ', fallbacks: false },
          anthropic: { id: 'claude-opus-5-5', fallbacks: true },
          google: { id: 'gemini' },
          openai: { id: '' },
        },
        language: 'th',
        dailyLimit: 9999,
        rememberKeys: true,
      }),
    );
    expect(settings).toEqual({
      enabled: true,
      provider: 'deepseek',
      models: {
        deepseek: { id: 'deepseek-chat', fallbacks: false },
        anthropic: { id: 'claude-opus-5-5', fallbacks: true },
      },
      language: 'th',
      dailyLimit: 500,
      rememberKeys: true,
    });
  });

  it('fall back to the defaults when the stored text is broken', () => {
    expect(parseAiSettings('{not json')).toEqual(DEFAULT_AI_SETTINGS);
    expect(parseAiSettings(JSON.stringify({ provider: 'google', language: 'fr' }))).toEqual(
      DEFAULT_AI_SETTINGS,
    );
  });

  it('keep the daily limit between 1 and 500 questions', () => {
    expect(clampDailyLimit(0)).toBe(1);
    expect(clampDailyLimit(12.6)).toBe(13);
    expect(clampDailyLimit(Number.NaN)).toBe(20);
  });

  it('keep one key per provider', () => {
    expect(
      parseKeys(JSON.stringify({ anthropic: ' sk-ant-x ', deepseek: '', google: 'k' })),
    ).toEqual({ anthropic: 'sk-ant-x' });
    expect(parseKeys('nope')).toEqual({});
  });
});
