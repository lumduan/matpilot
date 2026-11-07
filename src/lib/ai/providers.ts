/**
 * The AI providers the helper can use (ADR 0015, decision D2): Anthropic through its Messages API,
 * and OpenAI and DeepSeek through the OpenAI-style chat completions route. Each origin is written
 * into the page's Content Security Policy by name (src/app/layout.tsx), and
 * scripts/verify-export.mjs allows exactly these; a static policy cannot follow an address someone
 * types, so there is no free-form endpoint.
 *
 * Checked on 2026-11-07 with CORS preflights from the preview's origin, sending the headers the
 * official SDKs send: each endpoint below answers 200 and allows them, so a browser may call it.
 */

export type ProviderId = 'anthropic' | 'openai' | 'deepseek';

/** Which client talks to the provider: Anthropic's SDK, or OpenAI's (for its own API and others). */
export type ProviderApi = 'anthropic' | 'openai-chat';

export interface Provider {
  readonly id: ProviderId;
  /** As the settings show it. */
  readonly name: string;
  readonly api: ProviderApi;
  /** The origin the page calls, for the Content Security Policy. */
  readonly origin: string;
  /** The API's address for the OpenAI SDK; `null`: the SDK's own default. */
  readonly baseURL: string | null;
  /** The request field that caps the answer's length on this provider's chat route. */
  readonly tokenLimit: 'max_completion_tokens' | 'max_tokens';
  /** What a key looks like, for the key field. */
  readonly keyPlaceholder: string;
  /** The provider's console, where an adult makes a key and sets a spending limit. */
  readonly console: string;
}

export const PROVIDERS: readonly Provider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    api: 'anthropic',
    origin: 'https://api.anthropic.com',
    baseURL: null,
    tokenLimit: 'max_tokens',
    keyPlaceholder: 'sk-ant-…',
    console: 'https://platform.claude.com/',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    api: 'openai-chat',
    origin: 'https://api.openai.com',
    baseURL: null,
    // OpenAI's newer models refuse max_tokens on chat completions and take this instead.
    tokenLimit: 'max_completion_tokens',
    keyPlaceholder: 'sk-…',
    console: 'https://platform.openai.com/',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    api: 'openai-chat',
    origin: 'https://api.deepseek.com',
    baseURL: 'https://api.deepseek.com',
    tokenLimit: 'max_tokens',
    keyPlaceholder: 'sk-…',
    console: 'https://platform.deepseek.com/',
  },
];

export const PROVIDER_IDS: readonly ProviderId[] = PROVIDERS.map((provider) => provider.id);

/** Every origin the helper may call, in the order of PROVIDERS (for the CSP). */
export const AI_ORIGINS: readonly string[] = PROVIDERS.map((provider) => provider.origin);

export function providerById(id: ProviderId): Provider {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0]!;
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}
