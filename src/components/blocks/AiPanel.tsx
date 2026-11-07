'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useAiHelper } from '@/hooks/useAiHelper';
import { useStoredState } from '@/hooks/useStoredState';
import { answerLines, inlinePieces, type AnswerLine } from '@/lib/ai/answer';
import { promptChecklist } from '@/lib/ai/checklist';
import { buildRequest, requestText } from '@/lib/ai/prompt';
import { providerById } from '@/lib/ai/providers';
import type { AiMode } from '@/lib/ai/usage';
import type { PythonFile } from '@/lib/blocks/generator';
import { AiSettingsDialog } from './AiSettingsDialog';

const MODES = ['explain', 'review'] as const;

const MODE_LABEL: Record<AiMode, string> = { explain: 'Explain', review: 'Review' };

const MODE_HELP: Record<AiMode, string> = {
  explain: 'The AI tells you what this tab’s program does, step by step.',
  review: 'The AI points at mistakes, with hints rather than answers, so you find the fix.',
};

const PLACEHOLDER: Record<AiMode, string> = {
  explain: 'For example: What does the repeat loop do? Explain it step by step.',
  review: 'For example: My robot should stop at the wall, but it keeps going. Why?',
};

/** How many characters a prompt may have. */
const PROMPT_MAX = 1000;

const number = (value: number) => value.toLocaleString('en');

/**
 * The AI helper (ADR 0015) beside the blocks: explain or review the open tab, with a prompt the
 * child writes, a checklist that teaches what makes a good prompt, the exact text the AI sees, the
 * answer (always marked as coming from an AI), and a journal of earlier prompts.
 */
export function AiPanel({
  files,
  openFile,
  tab,
  onShowLine,
  onClose,
}: {
  files: readonly PythonFile[];
  /** The open tab's file, whose lines "Line N" in an answer means. */
  openFile: string;
  tab: string;
  onShowLine: (line: number) => void;
  onClose: () => void;
}) {
  const ai = useAiHelper();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useStoredState<AiMode>('matpilot.ai.mode.v1', 'explain', MODES);
  const [question, setQuestion] = useState('');
  const provider = providerById(ai.settings.provider);
  const code = files.find((file) => file.name === openFile)?.code ?? '';
  const lineCount = code.replace(/\n$/, '').split('\n').length;
  const fallbackLanguage = navigator.language.toLowerCase().startsWith('th') ? 'th' : 'en';

  const request = useMemo(
    () =>
      buildRequest({
        mode,
        files: files.map((file) => ({ name: file.name, code: file.code })),
        openFile,
        tab,
        question,
        language: ai.settings.language,
        fallbackLanguage,
      }),
    [mode, files, openFile, tab, question, ai.settings.language, fallbackLanguage],
  );
  const checklist = useMemo(() => promptChecklist(question, mode, code), [question, mode, code]);
  const asking = ai.state.kind === 'asking';

  return (
    <aside className="studio-side ai-side" aria-labelledby="ai-side-heading" data-testid="ai-panel">
      <div className="studio-panel-header">
        <h2 id="ai-side-heading">AI helper</h2>
        <button
          type="button"
          className="icon-button"
          onClick={() => setSettingsOpen(true)}
          title="AI helper settings (for adults)"
          data-testid="ai-open-settings"
        >
          <GearIcon />
          <span className="visually-hidden">AI helper settings (for adults)</span>
        </button>
        <button type="button" className="icon-button" onClick={onClose} title="Close the AI helper">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path
              d="M4 4l8 8M12 4l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <span className="visually-hidden">Close the AI helper</span>
        </button>
      </div>

      <div className="ai-body">
        {!ai.ready ? (
          <div className="ai-setup" data-testid="ai-setup">
            <p>
              An AI can explain your program, or point at mistakes with hints. It is a computer
              program, not a person, and it can be wrong.
            </p>
            <p className="muted">
              {ai.settings.enabled && !ai.keyFor[ai.settings.provider]
                ? 'The key was forgotten when the browser tab closed. An adult can enter it again.'
                : ai.settings.enabled
                  ? 'An adult needs to choose a model in the settings.'
                  : 'An adult turns it on first, with a key from an AI company (Anthropic, OpenAI or DeepSeek). Nothing is sent until then.'}
            </p>
            <button
              type="button"
              className="button button-primary"
              onClick={() => setSettingsOpen(true)}
              data-testid="ai-set-up"
            >
              Set up (for adults)
            </button>
          </div>
        ) : (
          <>
            <div className="segmented" role="group" aria-label="What the AI does">
              {MODES.map((each) => (
                <button
                  key={each}
                  type="button"
                  className="segmented-option"
                  aria-pressed={mode === each}
                  onClick={() => setMode(each)}
                  data-testid={`ai-mode-${each}`}
                >
                  {MODE_LABEL[each]}
                </button>
              ))}
            </div>
            <p className="ai-help">{MODE_HELP[mode]}</p>

            <label className="field">
              <span className="field-label">Your prompt for “{tab}” (you can leave it empty)</span>
              <textarea
                className="field-input ai-prompt"
                value={question}
                maxLength={PROMPT_MAX}
                rows={3}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !asking) {
                    event.preventDefault();
                    void ai.ask(request, { tab, prompt: question });
                  }
                }}
                placeholder={PLACEHOLDER[mode]}
                data-testid="ai-prompt"
              />
            </label>

            <div className="ai-checklist" data-testid="ai-checklist">
              <p className="ai-checklist-title">A good prompt:</p>
              <ul>
                {checklist.map((item) => (
                  <li key={item.id} data-ok={item.ok}>
                    <span className="ai-check" aria-hidden="true">
                      {item.ok ? '✓' : '○'}
                    </span>
                    <span>
                      {item.label}
                      <span className="visually-hidden">{item.ok ? ' (done)' : ' (not yet)'}</span>
                      <span className="ai-example"> “{item.example}”</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="button-row ai-ask-row">
              {asking ? (
                <button
                  type="button"
                  className="button button-stop"
                  onClick={ai.stop}
                  data-testid="ai-stop"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void ai.ask(request, { tab, prompt: question })}
                  disabled={ai.left === 0 || files.length === 0}
                  data-testid="ai-ask"
                >
                  Ask the AI
                </button>
              )}
              <span className="muted" data-testid="ai-left">
                {ai.left} of {ai.settings.dailyLimit} questions left today
              </span>
            </div>

            <details className="ai-sees">
              <summary>What the AI sees</summary>
              <p className="muted">
                This exact text goes to {provider.name} when you press Ask: first the fixed
                instructions, then your program and your prompt.
              </p>
              <pre data-testid="ai-sees">{requestText(request)}</pre>
            </details>

            {asking && (
              <p className="muted ai-thinking" role="status" data-testid="ai-thinking">
                The AI is thinking…
              </p>
            )}
            {ai.state.kind === 'error' && (
              <p className="notice notice-error" role="alert" data-testid="ai-error">
                {ai.state.message}
              </p>
            )}
            {ai.state.kind === 'answered' && (
              <section className="ai-answer" aria-label="The AI’s answer" data-testid="ai-answer">
                <p className="ai-label">
                  <span className="ai-badge" aria-hidden="true">
                    AI
                  </span>
                  Answer from an AI · {provider.name} · {ai.state.answer.model}
                </p>
                {ai.state.answer.stop === 'refused' && (
                  <p className="notice notice-warn" data-testid="ai-refused">
                    The AI did not answer this. Ask about the robot program instead.
                  </p>
                )}
                {ai.state.answer.stop === 'cut' && (
                  <p className="notice notice-warn">The answer was too long and was cut short.</p>
                )}
                <AnswerText
                  text={ai.state.answer.text}
                  lineCount={lineCount}
                  onShowLine={onShowLine}
                />
                <p className="ai-meta" data-testid="ai-tokens">
                  {number(ai.state.answer.inputTokens)} tokens in
                  {ai.state.answer.cachedTokens > 0 &&
                    ` (${number(ai.state.answer.cachedTokens)} from the cache)`}
                  , {number(ai.state.answer.outputTokens)} out. AI can be wrong: try it on the
                  robot.
                </p>
                {ai.state.answer.text !== '' && (
                  <div className="ai-helped" role="group" aria-label="Did this help?">
                    <span>Did this help?</span>
                    {([true, false] as const).map((value) => {
                      const entry = ai.state.kind === 'answered' ? ai.state.entry : null;
                      return (
                        <button
                          key={String(value)}
                          type="button"
                          className="button button-small"
                          aria-pressed={entry?.helped === value}
                          onClick={() =>
                            entry && ai.markHelped(entry.id, entry.helped === value ? null : value)
                          }
                          data-testid={value ? 'ai-helped-yes' : 'ai-helped-no'}
                        >
                          {value ? 'Yes' : 'Not yet'}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {ai.journal.length > 0 && (
              <details className="ai-journal" data-testid="ai-journal">
                <summary>Your earlier prompts ({ai.journal.length})</summary>
                <p className="muted">
                  Compare them: which prompt got the most helpful answer? Kept in this browser.
                </p>
                <ol>
                  {ai.journal.map((entry) => (
                    <li key={entry.id}>
                      <details>
                        <summary>
                          <span className="ai-journal-mode">{MODE_LABEL[entry.mode]}</span>{' '}
                          {entry.prompt || '(no prompt)'}
                          {entry.helped !== null && (
                            <span className="muted">
                              {entry.helped ? ' · helped' : ' · did not help yet'}
                            </span>
                          )}
                        </summary>
                        <p className="ai-journal-answer">{entry.answer}</p>
                        <p className="muted">
                          {new Date(entry.time).toLocaleString()} · {entry.tab} · {entry.model} ·{' '}
                          {number(entry.inputTokens + entry.outputTokens)} tokens
                        </p>
                        <button
                          type="button"
                          className="button button-small"
                          onClick={() => {
                            setMode(entry.mode);
                            setQuestion(entry.prompt);
                          }}
                        >
                          Use this prompt again
                        </button>
                      </details>
                    </li>
                  ))}
                </ol>
                <button type="button" className="button button-small" onClick={ai.clearJournal}>
                  Clear the list
                </button>
              </details>
            )}

            <p className="ai-footnote">
              Answers come from an AI ({provider.name}), not from a person. Today:{' '}
              {number(ai.usage.inputTokens + ai.usage.outputTokens)} tokens.
            </p>
          </>
        )}
      </div>
      {settingsOpen && <AiSettingsDialog ai={ai} onClose={() => setSettingsOpen(false)} />}
    </aside>
  );
}

/** The answer's text: paragraphs and bullets, with "Line N" as a link to that line. */
function AnswerText({
  text,
  lineCount,
  onShowLine,
}: {
  text: string;
  lineCount: number;
  onShowLine: (line: number) => void;
}) {
  const blocks: ReactNode[] = [];
  let bullets: { line: AnswerLine; key: number }[] = [];
  const content = (line: AnswerLine) => (
    <>
      {line.line !== null && (
        <>
          <button
            type="button"
            className="ai-line-link"
            onClick={() => onShowLine(line.line!)}
            title="Show this line in the Python"
            data-testid="ai-line-link"
          >
            Line {line.line}
          </button>{' '}
        </>
      )}
      {inlinePieces(line.text).map((piece, i) =>
        piece.kind === 'strong' ? (
          <strong key={i}>{piece.text}</strong>
        ) : piece.kind === 'code' ? (
          <code key={i}>{piece.text}</code>
        ) : (
          piece.text
        ),
      )}
    </>
  );
  const flush = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`list-${bullets[0]!.key}`}>
        {bullets.map(({ line, key }) => (
          <li key={key}>{content(line)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  answerLines(text, lineCount).forEach((line, key) => {
    if (line.bullet) {
      bullets.push({ line, key });
      return;
    }
    flush();
    if (line.text !== '' || line.line !== null) blocks.push(<p key={key}>{content(line)}</p>);
  });
  flush();
  return (
    <div className="ai-text" data-testid="ai-text">
      {blocks}
    </div>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
