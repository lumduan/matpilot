'use client';

import { useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import type { AiHelper } from '@/hooks/useAiHelper';
import type { ModelChoice } from '@/lib/ai/client';
import { PROVIDERS, providerById, type ProviderId } from '@/lib/ai/providers';
import {
  ANSWER_LANGUAGES,
  DAILY_LIMIT_MAX,
  DAILY_LIMIT_MIN,
  clampDailyLimit,
  type AnswerLanguage,
} from '@/lib/ai/settings';

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'ok'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

/**
 * The AI helper's settings, for an adult (ADR 0015): on or off, the provider and its key, the
 * model from the provider's own list, the language of the answers, the questions a day, and
 * whether the keys are remembered on this computer.
 */
export function AiSettingsDialog({ ai, onClose }: { ai: AiHelper; onClose: () => void }) {
  const stored = ai.settings;
  const [enabled, setEnabled] = useState(stored.enabled);
  const [provider, setProvider] = useState<ProviderId>(stored.provider);
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [models, setModels] = useState<Partial<Record<ProviderId, ModelChoice[]>>>({});
  const [chosen, setChosen] = useState<Partial<Record<ProviderId, string>>>(() =>
    Object.fromEntries(Object.entries(stored.models).map(([id, model]) => [id, model?.id ?? ''])),
  );
  const [language, setLanguage] = useState<AnswerLanguage>(stored.language);
  const [dailyLimit, setDailyLimit] = useState(String(stored.dailyLimit));
  const [remember, setRemember] = useState(stored.rememberKeys);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const info = providerById(provider);
  const typedKey = keys[provider] ?? '';
  const hasKey = ai.keyFor[provider] || typedKey.trim() !== '';
  const list = models[provider] ?? [];
  const modelId = chosen[provider] ?? '';

  const loadModels = async () => {
    setStatus({ kind: 'checking' });
    try {
      const found = await ai.listModels(provider, typedKey);
      setModels((current) => ({ ...current, [provider]: found }));
      if (!found.some((model) => model.id === modelId) && found[0]) {
        setChosen((current) => ({ ...current, [provider]: found[0]!.id }));
      }
      setStatus({
        kind: 'ok',
        message:
          found.length > 0
            ? `${info.name} accepted the key and offers ${found.length} model${found.length === 1 ? '' : 's'}. Choose one, then save.`
            : `${info.name} accepted the key but listed no models. Type a model name.`,
      });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = modelId.trim();
    if (enabled && !hasKey) {
      setStatus({ kind: 'error', message: `Enter a key for ${info.name} to turn the helper on.` });
      return;
    }
    if (enabled && id === '') {
      setStatus({ kind: 'error', message: 'Choose a model to turn the helper on.' });
      return;
    }
    const nextModels = { ...stored.models };
    for (const each of PROVIDERS) {
      const typed = (chosen[each.id] ?? '').trim();
      if (typed === '') {
        delete nextModels[each.id];
        continue;
      }
      const listed = models[each.id]?.find((model) => model.id === typed);
      const before = stored.models[each.id];
      nextModels[each.id] = {
        id: typed,
        // Known from the provider's list; a model typed by hand keeps what was known before.
        fallbacks: listed ? listed.fallbacks : before?.id === typed ? before.fallbacks : false,
      };
    }
    ai.save(
      {
        enabled,
        provider,
        models: nextModels,
        language,
        dailyLimit: clampDailyLimit(Number(dailyLimit)),
        rememberKeys: remember,
      },
      keys,
    );
    setKeys({});
    setStatus({
      kind: 'ok',
      message: enabled
        ? `Saved. The AI helper uses ${info.name}, ${id}.`
        : 'Saved. The AI helper is off.',
    });
  };

  return (
    <Dialog title="AI helper settings (for adults)" onClose={onClose} testId="ai-settings">
      <form className="dialog-form" onSubmit={submit}>
        <p className="field-hint ai-privacy" data-testid="ai-privacy">
          When a child presses <strong>Ask</strong>, the program’s Python and the question go to the
          provider chosen here, with your key. Nothing is sent before that, and nothing else. The
          provider’s own terms apply, including who may use it: check them before turning this on
          for a child.
        </p>
        <label className="field-check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            data-testid="ai-enabled"
          />
          <span>Turn the AI helper on</span>
        </label>

        <fieldset className="field ai-providers">
          <legend className="field-label">Provider</legend>
          {PROVIDERS.map((each) => (
            <label key={each.id} className="field-check">
              <input
                type="radio"
                name="ai-provider"
                value={each.id}
                checked={provider === each.id}
                onChange={() => {
                  setProvider(each.id);
                  setStatus({ kind: 'idle' });
                }}
                data-testid={`ai-provider-${each.id}`}
              />
              <span>
                {each.name}
                {ai.keyFor[each.id] && <span className="muted"> · key saved</span>}
              </span>
            </label>
          ))}
        </fieldset>

        <label className="field">
          <span className="field-label">{info.name} key</span>
          <input
            className="field-input"
            type="password"
            value={typedKey}
            onChange={(event) =>
              setKeys((current) => ({ ...current, [provider]: event.target.value }))
            }
            placeholder={
              ai.keyFor[provider] ? 'A key is saved; type to replace it' : info.keyPlaceholder
            }
            autoComplete="off"
            spellCheck={false}
            data-testid="ai-key"
          />
        </label>

        <div className="button-row">
          <button
            type="button"
            className="button"
            onClick={() => void loadModels()}
            disabled={!hasKey || status.kind === 'checking'}
            data-testid="ai-load-models"
          >
            {status.kind === 'checking' ? 'Checking…' : 'Check the key and list models'}
          </button>
        </div>

        <label className="field">
          <span className="field-label">Model</span>
          {list.length > 0 ? (
            <select
              className="field-input"
              value={modelId}
              onChange={(event) =>
                setChosen((current) => ({ ...current, [provider]: event.target.value }))
              }
              data-testid="ai-model"
            >
              {!list.some((model) => model.id === modelId) && modelId !== '' && (
                <option value={modelId}>{modelId}</option>
              )}
              {list.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label === model.id ? model.id : `${model.label} (${model.id})`}
                  {model.old ? ' · being retired' : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="field-input"
              value={modelId}
              onChange={(event) =>
                setChosen((current) => ({ ...current, [provider]: event.target.value }))
              }
              placeholder="Check the key to list the models, or type one"
              autoComplete="off"
              spellCheck={false}
              data-testid="ai-model"
            />
          )}
          <span className="field-hint">
            A small, low-priced model is enough to explain a child’s program. Each answer shows the
            tokens it used.
          </span>
        </label>

        <label className="field">
          <span className="field-label">Answers in</span>
          <select
            className="field-input"
            value={language}
            onChange={(event) => setLanguage(event.target.value as AnswerLanguage)}
            data-testid="ai-language"
          >
            {ANSWER_LANGUAGES.map((each) => (
              <option key={each.value} value={each.value}>
                {each.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Questions a day</span>
          <input
            className="field-input ai-limit"
            type="number"
            min={DAILY_LIMIT_MIN}
            max={DAILY_LIMIT_MAX}
            value={dailyLimit}
            onChange={(event) => setDailyLimit(event.target.value)}
            data-testid="ai-limit"
          />
          <span className="field-hint">
            Counted in this browser. Today: {ai.usage.questions} asked.
          </span>
        </label>

        <label className="field-check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            data-testid="ai-remember"
          />
          <span>
            Remember the keys on this computer. Otherwise they are forgotten when this browser tab
            closes.
          </span>
        </label>

        <div className="button-row">
          <button type="submit" className="button button-primary" data-testid="ai-save">
            Save
          </button>
          {(ai.keyFor.anthropic || ai.keyFor.openai || ai.keyFor.deepseek) && (
            <button
              type="button"
              className="button"
              onClick={() => {
                ai.forgetKeys();
                setStatus({ kind: 'ok', message: 'The keys are forgotten in this browser.' });
              }}
              data-testid="ai-forget"
            >
              Forget the keys
            </button>
          )}
        </div>
        {status.kind === 'ok' && (
          <p className="notice notice-ok" role="status" data-testid="ai-settings-result">
            {status.message}
          </p>
        )}
        {status.kind === 'error' && (
          <p className="notice notice-error" role="alert" data-testid="ai-settings-result">
            {status.message}
          </p>
        )}
      </form>

      <details className="dialog-help">
        <summary>How to get a key, safely</summary>
        <ol>
          <li>
            Sign in at{' '}
            <a href={info.console} target="_blank" rel="noreferrer">
              {info.name}’s console
            </a>{' '}
            with an adult’s account.
          </li>
          <li>Make an API key just for MatPilot, so you can delete it on its own.</li>
          <li>
            Set a monthly spending limit there. It is the real protection: anyone who uses this
            browser can read a key stored in it.
          </li>
          <li>
            Paste the key above, press <strong>Check the key and list models</strong>, choose a
            model, tick <strong>Turn the AI helper on</strong>, and save.
          </li>
        </ol>
        <p>
          The key goes from this browser straight to {info.name}; MatPilot has no server. It is
          never put in program files or GitHub saves.
        </p>
      </details>
    </Dialog>
  );
}
