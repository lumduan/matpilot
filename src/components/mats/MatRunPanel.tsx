'use client';

import { memo, useRef, useState } from 'react';
import type { MatRun, RunState } from '@/hooks/useMatRun';
import type { RunReview } from '@/lib/sim/review';
import type { SimEnd } from '@/lib/sim/runner';

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const round = (value: number) => Math.round(value);

function endMessage(end: SimEnd, timeMs: number, limitS: number): string {
  switch (end.reason) {
    case 'finished':
      return `The program ended after ${seconds(timeMs)}.`;
    case 'time':
      return `Stopped at the time limit, ${limitS} s.`;
    case 'unsupported':
      return `The program uses ${end.what}, which the mat cannot run yet. The run stops there, after ${seconds(timeMs)}.`;
    case 'error':
      return `Python stopped with an error${end.file ? ` in ${end.file}${end.line ? `, line ${end.line}` : ''}` : ''}: ${end.message}`;
    case 'busy':
      return 'The program kept the computer busy without waiting or moving (a loop with nothing in it?), so it was stopped.';
  }
}

function Checks({ review }: { review: RunReview }) {
  const items: { ok: boolean; text: string }[] = [
    review.leftMatAt === null
      ? { ok: true, text: 'Stayed on the mat' }
      : { ok: false, text: `Left the mat at ${seconds(review.leftMatAt)}` },
    ...review.touched.map((each) => ({
      ok: false,
      text: `Touched “${each.name}” at ${seconds(each.at)}`,
    })),
    ...(review.targets > 0
      ? [
          review.endedIn.length > 0
            ? {
                ok: true,
                text: `Ended inside ${review.endedIn.map((name) => `“${name}”`).join(', ')}`,
              }
            : { ok: false, text: 'Ended outside every target' },
        ]
      : []),
  ];
  return (
    <ul className="robot-checks" data-testid="run-checks">
      {items.map((item) => (
        <li key={item.text} data-ok={String(item.ok)}>
          <span className="robot-check-mark" aria-hidden="true">
            {item.ok ? '✓' : '✗'}
          </span>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Run a program on the mat (ADR 0016, step 7c): which program, Run, how it ended, what the run
 * shows, and what it printed. Playback is on the mat itself.
 */
export function MatRunPanel({ run }: { run: MatRun }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const state = run.state;
  return (
    <section className="mats-section" aria-label="Run a program" data-testid="run-panel">
      <h2 className="mats-heading">Run a program on the mat</h2>
      <label className="field">
        <span className="field-label">Program</span>
        <select
          className="field-input"
          value={run.source.kind}
          onChange={(event) => {
            if (event.target.value === 'blocks') run.setSource({ kind: 'blocks' });
          }}
          data-testid="run-source"
        >
          <option value="blocks">
            {run.handoff
              ? `On the Blocks page: ${run.handoff.name}`
              : 'On the Blocks page (none yet)'}
          </option>
          {run.source.kind === 'file' && <option value="file">File: {run.source.name}</option>}
        </select>
      </label>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        tabIndex={-1}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setFileError(run.loadFile(await file.text(), file.name));
        }}
        data-testid="run-file-input"
      />
      <button type="button" className="link-button" onClick={() => fileInput.current?.click()}>
        Load a program file…
      </button>
      {fileError && <p className="notice notice-error">{fileError}</p>}
      <p className="field-hint">
        It runs the program’s own Python for at most {run.seconds} s, starting where the robot
        stands. The robot moves exactly as told: no slipping, no bumping into things. Sensors do not
        read the mat yet.
      </p>
      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          disabled={Boolean(run.blocked) || state.kind === 'running'}
          onClick={() => void run.run()}
          data-testid="run-start"
        >
          {state.kind === 'running' ? 'Running…' : '▶ Run on the mat'}
        </button>
        {state.kind === 'done' && (
          <button type="button" className="button" onClick={run.reset} data-testid="run-reset">
            Back to the start
          </button>
        )}
      </div>
      {run.blocked && (
        <p className="field-hint" data-testid="run-blocked">
          {run.blocked}
        </p>
      )}
      {state.kind === 'error' && (
        <p className="notice notice-error" role="alert" data-testid="run-error">
          {state.message}
        </p>
      )}
      {state.kind === 'done' && <RunResult state={state} limitS={run.seconds} />}
    </section>
  );
}

/** Play, pause, the time, and the speed, over the mat while a run is shown. */
export function PlaybackBar({ run }: { run: MatRun }) {
  if (run.state.kind !== 'done') return null;
  return (
    <div
      className="mat-playback"
      role="group"
      aria-label="Play back the run"
      data-testid="playback"
    >
      <button
        type="button"
        className="button button-small"
        onClick={run.playing ? run.pause : run.play}
        data-testid="playback-play"
      >
        {run.playing ? '⏸ Pause' : '▶ Play'}
      </button>
      <input
        type="range"
        min={0}
        max={run.end}
        step={20}
        value={run.time}
        onChange={(event) => run.seek(Number(event.target.value))}
        aria-label="Time"
        data-testid="playback-time"
      />
      <span className="mat-playback-time" data-testid="playback-text">
        {seconds(run.time)} / {seconds(run.end)}
      </span>
      <select
        className="mat-playback-speed"
        value={run.speed}
        onChange={(event) => run.setSpeed(Number(event.target.value))}
        aria-label="Speed"
      >
        {[1, 2, 4, 8].map((speed) => (
          <option key={speed} value={speed}>
            {speed}×
          </option>
        ))}
      </select>
    </div>
  );
}

/** How the run ended and what it showed: the same for the whole playback, so it is drawn once. */
const RunResult = memo(function RunResult({
  state,
  limitS,
}: {
  state: Extract<RunState, { kind: 'done' }>;
  limitS: number;
}) {
  return (
    <div className="run-result" data-testid="run-result">
      <p
        className={
          state.result.end.reason === 'error' || state.result.end.reason === 'busy'
            ? 'notice notice-error'
            : 'notice notice-ok'
        }
        data-testid="run-end"
      >
        {endMessage(state.result.end, state.result.timeMs, limitS)}
      </p>
      <Checks review={state.review} />
      <p className="mats-size" data-testid="run-final">
        Ends at x {round(state.review.final.xMm)}, y {round(state.review.final.yMm)} mm, facing{' '}
        {round(state.review.final.headingDeg)}°
      </p>
      {state.review.differences.length > 0 && (
        <div className="notice notice-warn" data-testid="run-differences">
          <ul>
            {state.review.differences.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      )}
      {state.result.sensorsRead.length > 0 && (
        <p className="field-hint" data-testid="run-sensors">
          Read but not simulated yet: {state.result.sensorsRead.join(', ')}. They read nothing (no
          colour, nothing in range, no press).
        </p>
      )}
      {state.result.events.length > 0 && (
        <details className="run-output" open>
          <summary>What the program printed and showed ({state.result.events.length})</summary>
          <ol data-testid="run-output">
            {state.result.events.slice(0, 300).map((event, index) => (
              <li key={index} data-kind={event.kind}>
                <span className="run-time">{seconds(event.t)}</span>{' '}
                {event.kind === 'print' ? event.text : `${event.kind}: ${event.text}`}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
});
