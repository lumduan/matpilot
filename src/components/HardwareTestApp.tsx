'use client';

import { useState } from 'react';
import { useHardwareTest } from '@/hooks/useHardwareTest';
import { SUPPORT_STATEMENT } from '@/lib/compat';
import {
  compatibilityCell,
  deriveSteps,
  describeBrowser,
  describeOs,
  summarize,
  type StepResult,
  type StepStatus,
} from '@/lib/hwtest';
import { ProbeStatus } from './HubPanel';

const STEP_BADGES: Record<StepStatus, { text: string; symbol: string; className: string }> = {
  pass: { text: 'Pass', symbol: '✓', className: 'badge-pass' },
  fail: { text: 'Fail', symbol: '✗', className: 'badge-fail' },
  waiting: { text: 'To do', symbol: '…', className: 'badge-skipped' },
  'answer-needed': { text: 'Answer', symbol: '?', className: 'badge-warn' },
};

function StepBadge({ status }: { status: StepStatus }) {
  const { text, symbol, className } = STEP_BADGES[status];
  return (
    <span className={`badge ${className}`}>
      <span aria-hidden="true">{symbol}</span> {text}
    </span>
  );
}

type CopyState = 'idle' | 'copied' | 'failed';

/** Client-side root of /hardware-test. */
export function HardwareTestApp() {
  const test = useHardwareTest();
  const { session, probeState } = test;
  const summary = summarize(session);
  const steps = deriveSteps(session);
  const cell = compatibilityCell(session);
  const env = session.environment;
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const ready = session.compat?.ready === true;
  const busy = probeState.status === 'requesting';
  const linked = probeState.status === 'connecting' || probeState.status === 'connected';
  const currentStep = steps.find((step) => step.status !== 'pass')?.id;

  const onCopy = () => {
    void test.copyReport().then((copied) => setCopyState(copied ? 'copied' : 'failed'));
  };
  const onRestart = () => {
    setCopyState('idle');
    test.restart();
  };

  return (
    <>
      <section className="card" aria-labelledby="steps-heading" aria-busy={test.checking}>
        <div className="card-header">
          <h2 id="steps-heading">Test steps</h2>
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={test.recheck}
              disabled={test.checking}
            >
              Run checks again
            </button>
            {linked ? (
              <button type="button" className="button" onClick={test.disconnect}>
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                className="button button-primary"
                onClick={test.connect}
                disabled={!ready || busy}
              >
                Connect to hub
              </button>
            )}
          </div>
        </div>

        <p className="muted" data-testid="hwtest-environment">
          {env
            ? `${describeBrowser(env, true)} on ${describeOs(env)} · support policy: ${env.support}`
            : 'Detecting this browser…'}
        </p>

        {summary.mode === 'unsupported' && (
          <div className="notice notice-error" role="alert">
            <p>
              <strong>This browser or device cannot connect to a hub.</strong>
            </p>
            <p>{SUPPORT_STATEMENT}</p>
            <p>
              That is the expected result on an unsupported browser. The report below records it for
              the compatibility table.
            </p>
          </div>
        )}

        <ol className="steps" data-testid="hwtest-steps" data-mode={summary.mode}>
          {steps.map((step) => (
            <StepItem
              key={step.id}
              step={step}
              current={step.id === currentStep}
              onAnswer={test.answerPicker}
            />
          ))}
        </ol>

        {summary.mode !== 'unsupported' && (
          <div aria-live="polite" data-testid="hub-status" data-status={probeState.status}>
            <h3 className="subheading">Hub status</h3>
            <ProbeStatus state={probeState} />
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="report-heading">
        <div className="card-header">
          <h2 id="report-heading">Report</h2>
          <div className="button-row">
            <button type="button" className="button button-primary" onClick={onCopy}>
              Copy report
            </button>
            <button type="button" className="button" onClick={test.downloadReport}>
              Download .txt
            </button>
            <button type="button" className="button" onClick={onRestart}>
              Start over
            </button>
          </div>
        </div>

        <p
          data-testid="hwtest-summary"
          data-complete={summary.complete}
          data-passed={summary.passed}
        >
          {summary.mode === 'pending'
            ? 'Waiting for the compatibility checks…'
            : `${summary.passed} of ${summary.total} ${summary.total === 1 ? 'step' : 'steps'} passed${summary.complete ? '.' : ' so far.'}`}
        </p>
        {cell && (
          <p className="notice notice-ok" data-testid="hwtest-cell">
            Compatibility table entry: <code>{cell}</code>
          </p>
        )}
        {copyState === 'copied' && (
          <p className="notice notice-ok" role="status">
            Report copied. Paste it into your message.
          </p>
        )}
        {copyState === 'failed' && (
          <p className="notice notice-warn" role="status">
            This browser would not copy automatically. Select the text below and copy it by hand.
          </p>
        )}
        <textarea
          className="report-text"
          readOnly
          value={test.report}
          rows={14}
          aria-label="Hardware test report"
          data-testid="hwtest-report"
        />
        <p className="muted">
          The report includes your hub’s name. Remove it before you post the report anywhere public.
          Results are kept in this browser until you click Start over.
        </p>
      </section>
    </>
  );
}

function StepItem({
  step,
  current,
  onAnswer,
}: {
  step: StepResult;
  current: boolean;
  onAnswer: (answer: 'yes' | 'no') => void;
}) {
  return (
    <li
      className={`step${current ? ' step-current' : ''}`}
      data-step={step.id}
      data-status={step.status}
      aria-current={current ? 'step' : undefined}
    >
      <StepBadge status={step.status} />
      <div>
        <h3>
          {step.number}. {step.title}
        </h3>
        <p>{step.detail}</p>
        {step.id === 'picker' && step.status !== 'waiting' && (
          <div className="button-row">
            <button type="button" className="button" onClick={() => onAnswer('yes')}>
              Yes, only Pybricks hubs
            </button>
            <button type="button" className="button" onClick={() => onAnswer('no')}>
              No, other devices too
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
