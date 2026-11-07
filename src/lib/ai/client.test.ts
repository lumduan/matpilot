import { describe, expect, it } from 'vitest';
import { AiError, ask, listModels } from './client';
import { buildRequest } from './prompt';

/** One request the fake provider received. */
interface Seen {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: Record<string, unknown> | null;
}

/** A fake provider: answers each request in turn and records what it received. */
function provider(...replies: readonly (readonly [number, unknown])[]) {
  const seen: Seen[] = [];
  let next = 0;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    seen.push({
      url: String(input instanceof Request ? input.url : input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body:
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    const [status, body] = replies[Math.min(next, replies.length - 1)]!;
    next += 1;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'request-id': 'req_test' },
    });
  };
  return { seen, fetch: fetch as typeof globalThis.fetch };
}

const request = buildRequest({
  mode: 'explain',
  files: [{ name: 'main.py', code: 'robot.straight(200)\n' }],
  openFile: 'main.py',
  tab: 'main',
  question: 'What does it do?',
  language: 'en',
  fallbackLanguage: 'en',
});

const claudeReply = (stop = 'end_turn', model = 'claude-haiku-5-5') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model,
  content: [
    { type: 'thinking', thinking: '', signature: 'x' },
    { type: 'text', text: 'It drives 200 mm forward. ' },
  ],
  stop_reason: stop,
  stop_sequence: null,
  usage: {
    input_tokens: 40,
    output_tokens: 12,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 3000,
  },
});

const chatReply = (finish = 'stop', usage: Record<string, unknown> = {}) => ({
  id: 'chat_1',
  object: 'chat.completion',
  created: 1,
  model: 'deepseek-chat',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Hi!', refusal: null },
      finish_reason: finish,
    },
  ],
  usage: { prompt_tokens: 3100, completion_tokens: 9, total_tokens: 3109, ...usage },
});

const haiku = { id: 'claude-haiku-5-5', fallbacks: false };

describe('asking Anthropic', () => {
  it('sends the key from the browser, the cached instructions and the question', async () => {
    const fake = provider([200, claudeReply()]);
    const answer = await ask('anthropic', 'sk-ant-test', haiku, request, { fetch: fake.fetch });
    expect(answer).toEqual({
      text: 'It drives 200 mm forward.',
      stop: 'done',
      model: 'claude-haiku-5-5',
      inputTokens: 3040,
      cachedTokens: 3000,
      outputTokens: 12,
    });
    const [sent] = fake.seen;
    expect(sent!.url).toBe('https://api.anthropic.com/v1/messages');
    // SDK 1.6.0 sends the key as a bearer token; the API takes it like x-api-key.
    expect(sent!.headers.get('authorization')).toBe('Bearer sk-ant-test');
    expect(sent!.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(sent!.headers.get('anthropic-beta')).toBeNull();
    expect(sent!.body).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 4096,
      system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: request.user }],
    });
    expect(sent!.body).not.toHaveProperty('fallbacks');
  });

  it('asks for a fallback model when the model list offers one, and drops it if refused', async () => {
    const opus = { id: 'claude-opus-5-5', fallbacks: true };
    const fake = provider(
      [
        400,
        {
          type: 'error',
          error: { type: 'invalid_request_error', message: 'fallbacks: not allowed' },
        },
      ],
      [200, claudeReply('end_turn', 'claude-opus-5-5')],
    );
    const answer = await ask('anthropic', 'k', opus, request, { fetch: fake.fetch });
    expect(answer.model).toBe('claude-opus-5-5');
    expect(fake.seen).toHaveLength(2);
    expect(fake.seen[0]!.headers.get('anthropic-beta')).toBe('server-side-fallback-2026-07-01');
    expect(fake.seen[0]!.body).toMatchObject({ fallbacks: 'default' });
    expect(fake.seen[1]!.headers.get('anthropic-beta')).toBeNull();
    expect(fake.seen[1]!.body).not.toHaveProperty('fallbacks');
  });

  it('says when the model declined or the answer was cut short', async () => {
    const refused = provider([200, { ...claudeReply('refusal'), content: [] }]);
    expect(await ask('anthropic', 'k', haiku, request, { fetch: refused.fetch })).toMatchObject({
      text: '',
      stop: 'refused',
    });
    const cut = provider([200, claudeReply('max_tokens')]);
    expect((await ask('anthropic', 'k', haiku, request, { fetch: cut.fetch })).stop).toBe('cut');
  });

  it('turns errors into messages for the page, without the key', async () => {
    const cases: [number, string, string][] = [
      [401, 'authentication_error', 'key'],
      [403, 'permission_error', 'permission'],
      [404, 'not_found_error', 'model'],
      [400, 'invalid_request_error', 'credit'],
    ];
    for (const [status, type, kind] of cases) {
      const message = kind === 'credit' ? 'Your credit balance is too low' : 'nope';
      const fake = provider([status, { type: 'error', error: { type, message } }]);
      const error = await ask('anthropic', 'sk-ant-secret', haiku, request, {
        fetch: fake.fetch,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AiError);
      expect((error as AiError).kind).toBe(kind);
      expect((error as AiError).message).not.toContain('sk-ant-secret');
    }
  });

  it('stops when the child presses Stop', async () => {
    const fake = provider([200, claudeReply()]);
    const controller = new AbortController();
    controller.abort();
    const error = await ask('anthropic', 'k', haiku, request, {
      fetch: fake.fetch,
      signal: controller.signal,
    }).catch((e: unknown) => e);
    expect((error as AiError).kind).toBe('cancelled');
  });

  it('lists the models from the provider, with their fallback option', async () => {
    const fake = provider([
      200,
      {
        data: [
          {
            type: 'model',
            id: 'claude-opus-5-5',
            display_name: 'Claude Opus 5.5',
            created_at: '2026-10-01T00:00:00Z',
            allowed_fallback_models: ['claude-opus-5'],
            lifecycle: 'active',
          },
          {
            type: 'model',
            id: 'claude-haiku-4-5',
            display_name: 'Claude Haiku 4.5',
            created_at: '2025-10-01T00:00:00Z',
            allowed_fallback_models: [],
            lifecycle: 'deprecated',
          },
        ],
        has_more: false,
        first_id: 'claude-opus-5-5',
        last_id: 'claude-haiku-4-5',
      },
    ]);
    expect(await listModels('anthropic', 'k', { fetch: fake.fetch })).toEqual([
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', fallbacks: true, old: false },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', fallbacks: false, old: true },
    ]);
    expect(fake.seen[0]!.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models\?limit=100/);
  });
});

describe('asking an OpenAI-style provider', () => {
  it('calls DeepSeek at its own address, with max_tokens, and reads its cache hits', async () => {
    const fake = provider([200, chatReply('stop', { prompt_cache_hit_tokens: 3072 })]);
    const answer = await ask(
      'deepseek',
      'sk-ds',
      { id: 'deepseek-chat', fallbacks: false },
      request,
      {
        fetch: fake.fetch,
      },
    );
    expect(answer).toEqual({
      text: 'Hi!',
      stop: 'done',
      model: 'deepseek-chat',
      inputTokens: 3100,
      cachedTokens: 3072,
      outputTokens: 9,
    });
    const [sent] = fake.seen;
    expect(sent!.url).toBe('https://api.deepseek.com/chat/completions');
    expect(sent!.headers.get('authorization')).toBe('Bearer sk-ds');
    expect(sent!.body).toMatchObject({
      model: 'deepseek-chat',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
    });
  });

  it('calls OpenAI with max_completion_tokens', async () => {
    const fake = provider([
      200,
      chatReply('length', { prompt_tokens_details: { cached_tokens: 2048 } }),
    ]);
    const answer = await ask('openai', 'sk-oa', { id: 'gpt-5', fallbacks: false }, request, {
      fetch: fake.fetch,
    });
    expect(answer).toMatchObject({ stop: 'cut', cachedTokens: 2048 });
    expect(fake.seen[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(fake.seen[0]!.body).toMatchObject({ max_completion_tokens: 4096 });
    expect(fake.seen[0]!.body).not.toHaveProperty('max_tokens');
  });

  it('reports a provider with no credit left', async () => {
    const fake = provider([
      402,
      { error: { message: 'Insufficient Balance', type: 'unknown_error' } },
    ]);
    const error = await ask('deepseek', 'k', { id: 'deepseek-chat', fallbacks: false }, request, {
      fetch: fake.fetch,
    }).catch((e: unknown) => e);
    expect((error as AiError).kind).toBe('credit');
    expect((error as AiError).message).toContain('DeepSeek');
  });

  it('lists only chat models, newest first', async () => {
    const fake = provider([
      200,
      {
        object: 'list',
        data: [
          { id: 'gpt-4o', object: 'model', created: 2, owned_by: 'openai' },
          { id: 'text-embedding-3-small', object: 'model', created: 9, owned_by: 'openai' },
          { id: 'gpt-5', object: 'model', created: 3, owned_by: 'openai' },
          { id: 'gpt-4o-realtime-preview', object: 'model', created: 4, owned_by: 'openai' },
        ],
      },
    ]);
    const models = await listModels('openai', 'k', { fetch: fake.fetch });
    expect(models.map((model) => model.id)).toEqual(['gpt-5', 'gpt-4o']);
  });
});
