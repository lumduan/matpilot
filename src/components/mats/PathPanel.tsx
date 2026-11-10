'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { PathDraft } from '@/lib/mats/path-edit';
import {
  MAX_PATH_ITEMS,
  PATH_LIMITS,
  stepText,
  type NewItemKind,
  type PathItem,
  type PathPlan,
} from '@/lib/mats/path';

const ADD: readonly { readonly kind: NewItemKind; readonly label: string }[] = [
  { kind: 'forward', label: 'Forward' },
  { kind: 'backward', label: 'Backward' },
  { kind: 'turn', label: 'Turn' },
  { kind: 'wait', label: 'Wait' },
  { kind: 'speed', label: 'Speed' },
];

/** A small picture for each kind of move. */
function MoveIcon({ item }: { item: PathItem }) {
  const shape = (() => {
    switch (item.kind) {
      case 'point':
        return (
          <>
            <circle cx="8" cy="7" r="3.2" />
            <path d="M8 10.5v4" />
          </>
        );
      case 'straight':
        return item.mm < 0 ? <path d="M8 2v11M4 9l4 4 4-4" /> : <path d="M8 14V3M4 7l4-4 4 4" />;
      case 'turn':
        return item.degrees < 0 ? (
          <path d="M12.5 12A5 5 0 1 0 4 5M4 1.5V5h3.5" />
        ) : (
          <path d="M3.5 12A5 5 0 1 1 12 5M12 1.5V5H8.5" />
        );
      case 'wait':
        return (
          <>
            <circle cx="8" cy="8" r="6" />
            <path d="M8 4.5V8l2.5 2" />
          </>
        );
      case 'speed':
        return (
          <>
            <path d="M2.5 12a5.5 5.5 0 1 1 11 0" />
            <path d="M8 12l3-4.5" />
          </>
        );
    }
  })();
  return (
    <svg className="path-item-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {shape}
    </svg>
  );
}

/** A number typed into a move: kept while typing, used when the box is left or Enter pressed. */
function MoveNumber({
  value,
  label,
  min,
  max,
  step,
  onCommit,
  testId,
}: {
  value: number;
  label: string;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
  testId: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const number = Number(text.replace(',', '.'));
    setText(null);
    if (text.trim() !== '' && Number.isFinite(number) && number !== value) onCommit(number);
  };
  return (
    <input
      className="field-input path-number"
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      aria-label={label}
      value={text ?? String(value)}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setText(null);
      }}
      data-testid={testId}
    />
  );
}

function Direction({
  backward,
  words,
  label,
  onChange,
  testId,
}: {
  backward: boolean;
  words: readonly [string, string];
  label: string;
  onChange: (backward: boolean) => void;
  testId: string;
}) {
  return (
    <select
      className="field-input path-choice"
      aria-label={label}
      value={backward ? 'back' : 'on'}
      onChange={(event) => onChange(event.target.value === 'back')}
      data-testid={testId}
    >
      <option value="on">{words[0]}</option>
      <option value="back">{words[1]}</option>
    </select>
  );
}

/** One move in the list, with what can be changed about it. */
function MoveRow({
  item,
  number,
  blocks,
  onChange,
}: {
  item: PathItem;
  number: number;
  /** A point's blocks, worked out from where the robot is; null while no robot stands there. */
  blocks: readonly string[] | null;
  onChange: (item: PathItem) => void;
}) {
  switch (item.kind) {
    case 'point':
      return (
        <>
          <span className="path-item-words">
            drive{' '}
            <Direction
              backward={Boolean(item.backward)}
              words={['forward', 'backward']}
              label={`Move ${number}: drive to the point forward or backward`}
              onChange={(backward) => onChange({ ...item, backward })}
              testId="path-point-direction"
            />{' '}
            to point {number}
          </span>
          <span className="path-item-blocks" data-testid="path-point-blocks">
            {blocks === null
              ? `x ${Math.round(item.xMm)}, y ${Math.round(item.yMm)} mm`
              : blocks.length === 0
                ? 'it is there already: no blocks'
                : blocks.join(' · ')}
          </span>
        </>
      );
    case 'straight':
      return (
        <span className="path-item-words">
          move{' '}
          <Direction
            backward={item.mm < 0}
            words={['forward', 'backward']}
            label={`Move ${number}: forward or backward`}
            onChange={(backward) =>
              onChange({ kind: 'straight', mm: Math.abs(item.mm) * (backward ? -1 : 1) })
            }
            testId="path-straight-direction"
          />{' '}
          <MoveNumber
            value={Math.abs(item.mm)}
            label={`Move ${number}: how far, in millimetres`}
            {...PATH_LIMITS.straightMm}
            step={10}
            onCommit={(mm) => onChange({ kind: 'straight', mm: item.mm < 0 ? -mm : mm })}
            testId="path-straight-mm"
          />{' '}
          mm
        </span>
      );
    case 'turn':
      return (
        <span className="path-item-words">
          turn{' '}
          <Direction
            backward={item.degrees < 0}
            words={['right', 'left']}
            label={`Move ${number}: turn right or left`}
            onChange={(left) =>
              onChange({ kind: 'turn', degrees: Math.abs(item.degrees) * (left ? -1 : 1) })
            }
            testId="path-turn-direction"
          />{' '}
          <MoveNumber
            value={Math.abs(item.degrees)}
            label={`Move ${number}: how far to turn, in degrees`}
            {...PATH_LIMITS.turnDegrees}
            step={5}
            onCommit={(degrees) =>
              onChange({ kind: 'turn', degrees: item.degrees < 0 ? -degrees : degrees })
            }
            testId="path-turn-degrees"
          />
          °
        </span>
      );
    case 'wait':
      return (
        <span className="path-item-words">
          wait{' '}
          <MoveNumber
            value={item.seconds}
            label={`Move ${number}: how long to wait, in seconds`}
            {...PATH_LIMITS.waitSeconds}
            step={0.5}
            onCommit={(seconds) => onChange({ kind: 'wait', seconds })}
            testId="path-wait-seconds"
          />{' '}
          seconds
        </span>
      );
    case 'speed':
      return (
        <span className="path-item-words">
          set movement speed to{' '}
          <MoveNumber
            value={item.percent}
            label={`Move ${number}: the speed, as a share of the top speed`}
            {...PATH_LIMITS.speedPercent}
            step={5}
            onCommit={(percent) => onChange({ kind: 'speed', percent })}
            testId="path-speed-percent"
          />{' '}
          %
        </span>
      );
  }
}

/**
 * The Mats page's Path tab (ADR 0016; its own tab and more moves since 2026-11-10): the list of
 * moves, made by tapping points on the mat (forward or backward) and by adding moves of its own
 * (forward, backward, turn, wait, speed), with exact numbers to type (the bar over the mat,
 * ./PathBar.tsx, changes the same moves with pictures), and what to do with them: run them on the
 * mat, or send them to the Blocks page as blocks.
 */
export function PathPanel({
  plan,
  draft,
  ready,
  clickBackward,
  canUndo,
  sent,
  running,
  onClickBackward,
  onSelect,
  onAdd,
  onChange,
  onMove,
  onRemove,
  onUndo,
  onClear,
  onRun,
  onSend,
  onShowMat,
  children,
}: {
  plan: PathPlan | null;
  draft: PathDraft;
  /** A robot stands on the mat, so the path has a start. */
  ready: boolean;
  /** Clicks on the mat add points the robot drives to backward. */
  clickBackward: boolean;
  canUndo: boolean;
  /** The path was sent to the Blocks page. */
  sent: 'ok' | 'failed' | null;
  /** A run is going. */
  running: boolean;
  onClickBackward: (backward: boolean) => void;
  onSelect: (id: string | null) => void;
  onAdd: (kind: NewItemKind) => void;
  onChange: (id: string, item: PathItem) => void;
  onMove: (id: string, by: -1 | 1) => void;
  onRemove: (id: string) => void;
  onUndo: () => void;
  onClear: () => void;
  onRun: () => void;
  onSend: () => void;
  /** Opens the Mat tab, to choose and place the robot. */
  onShowMat: () => void;
  /** The run's result, when the path was run. */
  children?: ReactNode;
}) {
  const steps = plan?.steps ?? [];
  const items = draft.items;
  const selectedIndex = items.findIndex((each) => each.id === draft.selected);
  const full = items.length >= MAX_PATH_ITEMS;
  return (
    <section className="mats-section path-panel" aria-label="Path" data-testid="path-panel">
      <h2 className="mats-heading">Path</h2>
      {!ready ? (
        <p className="field-hint" data-testid="path-not-ready">
          The path starts where the robot stands: choose a robot and place it on the{' '}
          <button type="button" className="link-button" onClick={onShowMat}>
            Mat
          </button>{' '}
          tab.
        </p>
      ) : (
        <p className="field-hint" data-testid="path-hint">
          Tap on the mat where the robot should drive, point by point, and add moves with the bar
          over the mat. This list shows every move in order: type exact numbers here.
        </p>
      )}
      <div className="path-click" role="group" aria-label="How a click on the mat drives">
        <span className="field-label">A click on the mat drives</span>
        <div className="segmented">
          {[false, true].map((backward) => (
            <button
              key={String(backward)}
              type="button"
              className="segmented-option"
              aria-pressed={clickBackward === backward}
              onClick={() => onClickBackward(backward)}
              data-testid={backward ? 'path-click-backward' : 'path-click-forward'}
            >
              {backward ? 'Backward' : 'Forward'}
            </button>
          ))}
        </div>
      </div>

      {items.length > 0 && (
        <ol className="path-items" data-testid="path-items">
          {items.map((each, index) => {
            const selected = each.id === draft.selected;
            const blocks = plan ? (plan.items[index]?.steps ?? []).map(stepText) : null;
            return (
              <li
                key={each.id}
                className="path-item"
                data-kind={each.item.kind}
                data-selected={selected}
                onFocus={(event) => {
                  // Changing a move highlights it (the number button toggles it itself).
                  const tag = (event.target as HTMLElement).tagName;
                  if (!selected && (tag === 'INPUT' || tag === 'SELECT')) onSelect(each.id);
                }}
                data-testid="path-item"
              >
                <button
                  type="button"
                  className="path-item-number"
                  aria-pressed={selected}
                  aria-label={`Move ${index + 1}${selected ? ', highlighted: new moves go after it' : ': highlight it'}`}
                  onClick={() => onSelect(selected ? null : each.id)}
                  data-testid="path-item-number"
                >
                  {index + 1}
                </button>
                <MoveIcon item={each.item} />
                <span className="path-item-body">
                  <MoveRow
                    item={each.item}
                    number={index + 1}
                    blocks={blocks}
                    onChange={(item) => onChange(each.id, item)}
                  />
                </span>
                {selected && (
                  <span className="path-item-tools">
                    <button
                      type="button"
                      className="icon-button"
                      disabled={index === 0}
                      onClick={() => onMove(each.id, -1)}
                      aria-label={`Move ${index + 1} up`}
                      data-testid="path-item-up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={index === items.length - 1}
                      onClick={() => onMove(each.id, 1)}
                      aria-label={`Move ${index + 1} down`}
                      data-testid="path-item-down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onRemove(each.id)}
                      aria-label={`Remove move ${index + 1}`}
                      data-testid="path-item-remove"
                    >
                      ✕
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="path-add" role="group" aria-label="Add a move">
        <span className="field-label">
          Add a move{' '}
          <span className="muted">
            {selectedIndex === -1 || selectedIndex === items.length - 1
              ? 'at the end'
              : `after move ${selectedIndex + 1}`}
          </span>
        </span>
        <div className="button-row">
          {ADD.map((each) => (
            <button
              key={each.kind}
              type="button"
              className="button button-small"
              disabled={full}
              onClick={() => onAdd(each.kind)}
              data-testid={`path-add-${each.kind}`}
            >
              + {each.label}
            </button>
          ))}
        </div>
        {full && <p className="field-hint">A path holds at most {MAX_PATH_ITEMS} moves.</p>}
      </div>

      {items.length > 0 && (
        <p className="field-hint" data-testid="path-length">
          {steps.length} block{steps.length === 1 ? '' : 's'}, {Math.round(plan?.lengthMm ?? 0)} mm
          of driving.
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button button-small"
          disabled={!canUndo}
          onClick={onUndo}
          data-testid="path-undo"
        >
          Undo
        </button>
        <button
          type="button"
          className="button button-small"
          disabled={items.length === 0}
          onClick={onClear}
          data-testid="path-clear"
        >
          Clear
        </button>
        <button
          type="button"
          className="button button-small"
          disabled={steps.length === 0 || running}
          onClick={onRun}
          data-testid="path-run"
        >
          {running ? 'Running…' : 'Run it on the mat'}
        </button>
        <button
          type="button"
          className="button button-small button-primary"
          disabled={steps.length === 0}
          onClick={onSend}
          data-testid="path-send"
        >
          Send to Blocks
        </button>
      </div>
      {sent === 'ok' && (
        <p className="notice notice-ok" role="status" data-testid="path-sent">
          Sent. Open <Link href="/blocks">Blocks</Link>, choose the tab they go in, and press{' '}
          <strong>Add at the end of …</strong> there.
        </p>
      )}
      {sent === 'failed' && (
        <p className="notice notice-error" role="alert">
          This browser would not keep the path for the Blocks page (its storage is blocked).
        </p>
      )}
      {children}
    </section>
  );
}
