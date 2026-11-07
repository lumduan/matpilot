'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ask as askProvider, listModels as listProviderModels } from '@/lib/ai/client';
import type { AiAnswer, ModelChoice } from '@/lib/ai/client';
import type { AiRequest } from '@/lib/ai/prompt';
import type { ProviderId } from '@/lib/ai/providers';
import {
  DEFAULT_AI_SETTINGS,
  parseAiSettings,
  parseKeys,
  type AiKeys,
  type AiSettings,
  type ChosenModel,
} from '@/lib/ai/settings';
import {
  addEntry,
  addUsage,
  localDate,
  markHelped as markEntry,
  parseJournal,
  parseUsage,
  type DayUsage,
  type JournalEntry,
} from '@/lib/ai/usage';

/**
 * The AI helper (ADR 0015): its settings, the keys, today's usage and the prompt journal, all in
 * this browser, and asking the provider. The keys are kept apart from everything else: in this
 * browser tab only (sessionStorage) unless an adult ticks "Remember", and never in program files,
 * GitHub saves, the journal or the page's logs.
 */

const SETTINGS_KEY = 'matpilot.ai.v1';
const KEYS_KEY = 'matpilot.ai.keys.v1';
const USAGE_KEY = 'matpilot.ai.usage.v1';
const JOURNAL_KEY = 'matpilot.ai.journal.v1';

type Area = 'local' | 'session';

function storage(area: Area): Storage {
  return area === 'local' ? window.localStorage : window.sessionStorage;
}

function readStorage(area: Area, key: string): string | null {
  try {
    return storage(area).getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(area: Area, key: string, value: string | null): boolean {
  try {
    if (value === null) storage(area).removeItem(key);
    else storage(area).setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** What could not be stored (storage blocked), kept in this page's memory instead. */
const memory = new Map<string, string | null>();

function read(key: string, area: Area = 'local'): string | null {
  return memory.has(key) ? (memory.get(key) ?? null) : readStorage(area, key);
}

function write(key: string, value: string | null): void {
  if (writeStorage('local', key, value)) memory.delete(key);
  else memory.set(key, value);
}

function readKeysRaw(): string | null {
  if (memory.has(KEYS_KEY)) return memory.get(KEYS_KEY) ?? null;
  return readStorage('session', KEYS_KEY) ?? readStorage('local', KEYS_KEY);
}

/** Keeps the keys in one place: this computer when remembered, otherwise this browser tab. */
function writeKeys(keys: AiKeys, remember: boolean): void {
  const raw = Object.keys(keys).length > 0 ? JSON.stringify(keys) : null;
  writeStorage('local', KEYS_KEY, null);
  writeStorage('session', KEYS_KEY, null);
  memory.delete(KEYS_KEY);
  if (raw !== null && !writeStorage(remember ? 'local' : 'session', KEYS_KEY, raw)) {
    memory.set(KEYS_KEY, raw);
  }
}

interface Snapshot {
  readonly settings: AiSettings;
  readonly keys: AiKeys;
  readonly usage: DayUsage;
  readonly journal: readonly JournalEntry[];
}

const SERVER_SNAPSHOT: Snapshot = {
  settings: DEFAULT_AI_SETTINGS,
  keys: {},
  usage: { date: '', questions: 0, inputTokens: 0, outputTokens: 0 },
  journal: [],
};

const listeners = new Set<() => void>();
let cache: { raw: string; snapshot: Snapshot } | null = null;

function getSnapshot(): Snapshot {
  const date = localDate(new Date());
  const parts = [read(SETTINGS_KEY), readKeysRaw(), read(USAGE_KEY), read(JOURNAL_KEY)] as const;
  const raw = JSON.stringify([date, ...parts]);
  if (cache?.raw !== raw) {
    cache = {
      raw,
      snapshot: {
        settings: parseAiSettings(parts[0]),
        keys: parseKeys(parts[1]),
        usage: parseUsage(parts[2], date),
        journal: parseJournal(parts[3]),
      },
    };
  }
  return cache.snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

export type AskState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'asking'; readonly mode: AiRequest['mode'] }
  | {
      readonly kind: 'answered';
      readonly entry: JournalEntry;
      readonly answer: AiAnswer;
    }
  | { readonly kind: 'error'; readonly message: string };

/** A key change when saving: a new key, `null` to forget it, or absent to keep it. */
export type KeyChanges = Readonly<Partial<Record<ProviderId, string | null>>>;

export interface AiHelper {
  readonly settings: AiSettings;
  /** Which providers have a key in this browser (never the keys themselves). */
  readonly keyFor: Readonly<Record<ProviderId, boolean>>;
  /** The chosen provider's model, if one is chosen. */
  readonly model: ChosenModel | null;
  /** On, with a key and a model: questions can be asked. */
  readonly ready: boolean;
  readonly usage: DayUsage;
  /** Questions left today. */
  readonly left: number;
  readonly journal: readonly JournalEntry[];
  readonly state: AskState;
  readonly save: (settings: AiSettings, keys: KeyChanges) => void;
  readonly forgetKeys: () => void;
  /** The provider's models, with the key typed (or the stored one when none is typed). */
  readonly listModels: (provider: ProviderId, typedKey: string) => Promise<ModelChoice[]>;
  readonly ask: (request: AiRequest, about: { tab: string; prompt: string }) => Promise<void>;
  readonly stop: () => void;
  readonly dismiss: () => void;
  readonly markHelped: (id: string, helped: boolean | null) => void;
  readonly clearJournal: () => void;
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function useAiHelper(): AiHelper {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  const { settings, keys, usage, journal } = snapshot;
  const [state, setState] = useState<AskState>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);

  // A question still on its way when the panel closes is stopped.
  useEffect(() => () => controller.current?.abort(), []);

  const keyFor = useMemo(
    () => ({
      anthropic: keys.anthropic !== undefined,
      openai: keys.openai !== undefined,
      deepseek: keys.deepseek !== undefined,
    }),
    [keys],
  );
  const model = settings.models[settings.provider] ?? null;
  const ready = settings.enabled && keyFor[settings.provider] && model !== null;
  const left = Math.max(0, settings.dailyLimit - usage.questions);

  const save = useCallback((next: AiSettings, changes: KeyChanges) => {
    const current = getSnapshot().keys;
    const merged: Partial<Record<ProviderId, string>> = { ...current };
    for (const [provider, key] of Object.entries(changes) as [ProviderId, string | null][]) {
      if (key === null || key.trim() === '') delete merged[provider];
      else merged[provider] = key.trim();
    }
    write(SETTINGS_KEY, JSON.stringify(next));
    writeKeys(merged, next.rememberKeys);
    notify();
  }, []);

  const forgetKeys = useCallback(() => {
    writeKeys({}, false);
    notify();
  }, []);

  const listModels = useCallback(async (provider: ProviderId, typedKey: string) => {
    const key = typedKey.trim() || getSnapshot().keys[provider];
    if (!key) throw new Error('Enter the key first.');
    return listProviderModels(provider, key);
  }, []);

  const ask = useCallback(async (request: AiRequest, about: { tab: string; prompt: string }) => {
    const now = getSnapshot();
    const provider = now.settings.provider;
    const key = now.keys[provider];
    const chosen = now.settings.models[provider];
    if (!now.settings.enabled || !key || !chosen) return;
    if (now.usage.questions >= now.settings.dailyLimit) {
      setState({
        kind: 'error',
        message: 'That was the last question for today. Ask an adult, or try again tomorrow.',
      });
      return;
    }
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setState({ kind: 'asking', mode: request.mode });
    try {
      const answer = await askProvider(provider, key, chosen, request, { signal: ctl.signal });
      if (ctl.signal.aborted) return;
      const entry: JournalEntry = {
        id: newId(),
        time: Date.now(),
        mode: request.mode,
        tab: about.tab,
        prompt: about.prompt.trim(),
        answer: answer.text,
        provider,
        model: answer.model,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
        helped: null,
      };
      const latest = getSnapshot();
      write(
        USAGE_KEY,
        JSON.stringify(addUsage(latest.usage, answer.inputTokens, answer.outputTokens)),
      );
      if (answer.text !== '') write(JOURNAL_KEY, JSON.stringify(addEntry(latest.journal, entry)));
      notify();
      setState({ kind: 'answered', entry, answer });
    } catch (error) {
      if (ctl.signal.aborted) {
        setState({ kind: 'idle' });
        return;
      }
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (controller.current === ctl) controller.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ kind: 'idle' });
  }, []);

  const dismiss = useCallback(() => setState({ kind: 'idle' }), []);

  const markHelped = useCallback((id: string, helped: boolean | null) => {
    write(JOURNAL_KEY, JSON.stringify(markEntry(getSnapshot().journal, id, helped)));
    notify();
    setState((current) =>
      current.kind === 'answered' && current.entry.id === id
        ? { ...current, entry: { ...current.entry, helped } }
        : current,
    );
  }, []);

  const clearJournal = useCallback(() => {
    write(JOURNAL_KEY, null);
    notify();
  }, []);

  return {
    settings,
    keyFor,
    model,
    ready,
    usage,
    left,
    journal,
    state,
    save,
    forgetKeys,
    listModels,
    ask,
    stop,
    dismiss,
    markHelped,
    clearJournal,
  };
}
