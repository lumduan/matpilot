/**
 * Asking a provider (ADR 0015): one call for every provider, one answer shape back. Anthropic is
 * called through its official TypeScript SDK (@anthropic-ai/sdk), OpenAI and DeepSeek through
 * OpenAI's official SDK (`openai`) with the provider's address. Both SDKs are loaded only when a
 * question is asked or the models are listed, so the page does not download them otherwise.
 *
 * Both run in the browser with `dangerouslyAllowBrowser`: the key an adult entered goes straight
 * from this browser to the provider, and nowhere else. Anyone using this browser can read that
 * key, which is why the settings advise a separate key with a spending limit.
 */
import { MAX_ANSWER_TOKENS, type AiRequest } from './prompt';
import { providerById, type Provider, type ProviderId } from './providers';
import type { ChosenModel } from './settings';

export interface AiAnswer {
  readonly text: string;
  /** `cut`: the answer reached its length limit; `refused`: the model declined to answer. */
  readonly stop: 'done' | 'cut' | 'refused';
  /** The model that answered, as the provider reports it (a fallback model may answer). */
  readonly model: string;
  /** Every input token, cached or not. */
  readonly inputTokens: number;
  /** The input tokens read from the provider's prompt cache. */
  readonly cachedTokens: number;
  readonly outputTokens: number;
}

export interface ModelChoice {
  readonly id: string;
  readonly label: string;
  /** The provider can re-run a declined request on another model (see ChosenModel). */
  readonly fallbacks: boolean;
  /** The provider is retiring it. */
  readonly old: boolean;
}

export type AiErrorKind =
  'key' | 'permission' | 'credit' | 'rate' | 'model' | 'busy' | 'network' | 'cancelled' | 'other';

/** A failed call, with a message for the page. Never carries the key. */
export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export interface CallOptions {
  readonly signal?: AbortSignal;
  /** For tests: the SDKs call this instead of the browser's fetch. */
  readonly fetch?: typeof fetch;
}

/** How long one call may take; thinking models can take a while on a long program. */
const TIMEOUT_MS = 120_000;
/** The SDKs retry a busy or rate-limited call; once is enough for a child waiting at the page. */
const RETRIES = 1;
/**
 * Anthropic's server-side fallback: a declined request is re-run on the model Anthropic
 * recommends, inside the same call. Sent only for models whose own entry in Anthropic's model
 * list names fallback models.
 */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** OpenAI lists models that do not answer chat completions; these words mark them. */
const NOT_CHAT =
  /embedding|tts|whisper|dall-e|davinci|babbage|moderation|transcribe|realtime|audio|image|search|computer-use|sora|codex|deep-research|-pro(?:-|$)/;

interface SdkErrors {
  readonly APIError: abstract new (...args: never[]) => Error & { status?: number | undefined };
  readonly APIConnectionError: abstract new (...args: never[]) => Error;
  readonly APIUserAbortError: abstract new (...args: never[]) => Error;
}

function clip(text: string, length = 240): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function fromStatus(provider: Provider, status: number | null, detail: string): AiError {
  const name = provider.name;
  const text = detail.toLowerCase();
  if (status === 401) {
    return new AiError(
      'key',
      `${name} did not accept the key. An adult can check it in AI settings.`,
      status,
    );
  }
  if (status === 402 || /credit balance|insufficient|quota|billing|balance/.test(text)) {
    return new AiError(
      'credit',
      `The ${name} account has no credit left, or reached its spending limit. An adult can check it on ${name}’s website.`,
      status,
    );
  }
  if (status === 403) {
    return new AiError(
      'permission',
      `${name} does not let this key do that. Some accounts cannot be used from a web page at all. ${clip(detail, 160)}`,
      status,
    );
  }
  if (status === 404) {
    return new AiError(
      'model',
      `${name} does not know that model. An adult can choose another in AI settings.`,
      status,
    );
  }
  if (status === 429) {
    return new AiError(
      'rate',
      `Too many questions at once for ${name}. Wait a minute and try again.`,
      status,
    );
  }
  if (status !== null && status >= 500) {
    return new AiError('busy', `${name} is busy right now. Try again in a minute.`, status);
  }
  return new AiError('other', `${name} answered with an error: ${clip(detail)}`, status);
}

function toAiError(provider: Provider, error: unknown, errors: SdkErrors): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof errors.APIUserAbortError) return new AiError('cancelled', 'Stopped.');
  if (error instanceof errors.APIConnectionError) {
    return new AiError(
      'network',
      `Could not reach ${provider.name}. Check the internet connection and try again.`,
    );
  }
  if (error instanceof errors.APIError) {
    return fromStatus(provider, error.status ?? null, error.message);
  }
  return new AiError(
    'other',
    `Something went wrong: ${clip(error instanceof Error ? error.message : String(error))}`,
  );
}

const count = (value: unknown) => (typeof value === 'number' && value > 0 ? value : 0);

interface AnthropicReply {
  readonly content: readonly { readonly type: string; readonly text?: string }[];
  readonly stop_reason: string | null;
  readonly model: string;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly cache_creation_input_tokens?: number | null;
    readonly cache_read_input_tokens?: number | null;
  };
}

function fromAnthropic(reply: AnthropicReply): AiAnswer {
  const text = reply.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');
  const stop =
    reply.stop_reason === 'refusal'
      ? 'refused'
      : reply.stop_reason === 'max_tokens' || reply.stop_reason === 'model_context_window_exceeded'
        ? 'cut'
        : 'done';
  const cached = count(reply.usage.cache_read_input_tokens);
  return {
    text: text.trim(),
    stop,
    model: reply.model,
    inputTokens:
      count(reply.usage.input_tokens) + count(reply.usage.cache_creation_input_tokens) + cached,
    cachedTokens: cached,
    outputTokens: count(reply.usage.output_tokens),
  };
}

async function anthropicClient(key: string, options: CallOptions) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: key,
    dangerouslyAllowBrowser: true,
    maxRetries: RETRIES,
    timeout: TIMEOUT_MS,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return { Anthropic, client };
}

async function openAiClient(provider: Provider, key: string, options: CallOptions) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    apiKey: key,
    ...(provider.baseURL ? { baseURL: provider.baseURL } : {}),
    dangerouslyAllowBrowser: true,
    maxRetries: RETRIES,
    timeout: TIMEOUT_MS,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return { OpenAI, client };
}

async function askAnthropic(
  provider: Provider,
  key: string,
  model: ChosenModel,
  request: AiRequest,
  options: CallOptions,
): Promise<AiAnswer> {
  const { Anthropic, client } = await anthropicClient(key, options);
  const params = {
    model: model.id,
    max_tokens: MAX_ANSWER_TOKENS,
    // The fixed instructions come first and never change, so they can be cached.
    system: [
      {
        type: 'text' as const,
        text: request.system,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages: [{ role: 'user' as const, content: request.user }],
  };
  const call = async (fallbacks: boolean): Promise<AnthropicReply> =>
    fallbacks
      ? client.beta.messages.create(
          { ...params, betas: [FALLBACK_BETA], fallbacks: 'default' },
          { signal: options.signal },
        )
      : client.messages.create(params, { signal: options.signal });
  try {
    try {
      return fromAnthropic(await call(model.fallbacks));
    } catch (error) {
      // An account or model that does not take the fallback option answers 400: ask once more
      // without it rather than fail the child's question.
      if (model.fallbacks && error instanceof Anthropic.BadRequestError) {
        return fromAnthropic(await call(false));
      }
      throw error;
    }
  } catch (error) {
    throw toAiError(provider, error, Anthropic);
  }
}

async function askOpenAiStyle(
  provider: Provider,
  key: string,
  model: ChosenModel,
  request: AiRequest,
  options: CallOptions,
): Promise<AiAnswer> {
  const { OpenAI, client } = await openAiClient(provider, key, options);
  const limit =
    provider.tokenLimit === 'max_completion_tokens'
      ? { max_completion_tokens: MAX_ANSWER_TOKENS }
      : { max_tokens: MAX_ANSWER_TOKENS };
  try {
    const completion = await client.chat.completions.create(
      {
        model: model.id,
        // The fixed instructions come first and never change, so the provider can cache them.
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        ...limit,
      },
      { signal: options.signal },
    );
    const choice = completion.choices[0];
    const usage = completion.usage;
    // DeepSeek reports its cache hits in a field of its own.
    const cached =
      count(usage?.prompt_tokens_details?.cached_tokens) ||
      count((usage as Record<string, unknown> | undefined)?.prompt_cache_hit_tokens);
    const refused =
      (choice?.message.refusal ?? null) !== null || choice?.finish_reason === 'content_filter';
    return {
      text: (choice?.message.content ?? '').trim(),
      stop: refused ? 'refused' : choice?.finish_reason === 'length' ? 'cut' : 'done',
      model: completion.model || model.id,
      inputTokens: count(usage?.prompt_tokens),
      cachedTokens: cached,
      outputTokens: count(usage?.completion_tokens),
    };
  } catch (error) {
    throw toAiError(provider, error, OpenAI);
  }
}

/** Sends one request to the provider and gives its answer. Throws AiError. */
export async function ask(
  providerId: ProviderId,
  key: string,
  model: ChosenModel,
  request: AiRequest,
  options: CallOptions = {},
): Promise<AiAnswer> {
  const provider = providerById(providerId);
  return provider.api === 'anthropic'
    ? askAnthropic(provider, key, model, request, options)
    : askOpenAiStyle(provider, key, model, request, options);
}

/**
 * The models this key may use, from the provider's own list, so MatPilot carries no model names
 * that go out of date. Also the check that a key works. Throws AiError.
 */
export async function listModels(
  providerId: ProviderId,
  key: string,
  options: CallOptions = {},
): Promise<ModelChoice[]> {
  const provider = providerById(providerId);
  const models: ModelChoice[] = [];
  if (provider.api === 'anthropic') {
    const { Anthropic, client } = await anthropicClient(key, options);
    try {
      for await (const info of client.beta.models.list(
        { limit: 100 },
        { signal: options.signal },
      )) {
        models.push({
          id: info.id,
          label: info.display_name || info.id,
          fallbacks: (info.allowed_fallback_models?.length ?? 0) > 0,
          old: info.lifecycle === 'deprecated',
        });
      }
    } catch (error) {
      throw toAiError(provider, error, Anthropic);
    }
    return models;
  }
  const { OpenAI, client } = await openAiClient(provider, key, options);
  const found: { id: string; created: number }[] = [];
  try {
    for await (const info of client.models.list({ signal: options.signal })) {
      if (provider.id === 'openai' && NOT_CHAT.test(info.id)) continue;
      found.push({ id: info.id, created: count(info.created) });
    }
  } catch (error) {
    throw toAiError(provider, error, OpenAI);
  }
  found.sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
  return found.map(({ id }) => ({ id, label: id, fallbacks: false, old: false }));
}
