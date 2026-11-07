import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_ORIGINS, PROVIDERS, isProviderId, providerById } from './providers';

describe('the AI providers', () => {
  it('are the ones ADR 0015 decided: Anthropic, OpenAI and DeepSeek', () => {
    expect(PROVIDERS.map((provider) => provider.id)).toEqual(['anthropic', 'openai', 'deepseek']);
    expect(providerById('deepseek').api).toBe('openai-chat');
    expect(isProviderId('anthropic')).toBe(true);
    expect(isProviderId('google')).toBe(false);
  });

  it('call only https origins, each with no path', () => {
    for (const origin of AI_ORIGINS) expect(new URL(origin).origin).toBe(origin);
  });

  it('are exactly the AI origins scripts/verify-export.mjs allows in connect-src', () => {
    const script = readFileSync('scripts/verify-export.mjs', 'utf8');
    const block = /'connect-src': \[([^\]]*)\]/.exec(script)?.[1] ?? '';
    const allowed = [...block.matchAll(/'(https:\/\/[^']+)'/g)].map((match) => match[1]);
    expect(allowed).toEqual(['https://api.github.com', ...AI_ORIGINS]);
  });
});
