'use client';

import type { ReactNode } from 'react';
import type { ListedItem } from '@/lib/mats/path-edit';
import { PATH_LIMITS, type NewItemKind, type PathItem } from '@/lib/mats/path';

/** 24 × 24 line pictures for the bar. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="path-bar-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS = {
  toPoint: (
    <Icon>
      <circle cx="16" cy="7" r="3" />
      <path d="M16 10v3M7 20V9M3.5 12.5 7 9l3.5 3.5" />
    </Icon>
  ),
  backToPoint: (
    <Icon>
      <circle cx="16" cy="17" r="3" />
      <path d="M16 14v-3M7 4v11M3.5 11.5 7 15l3.5-3.5" />
    </Icon>
  ),
  forward: (
    <Icon>
      <path d="M12 20V5M6 10.5 12 4.5l6 6" />
    </Icon>
  ),
  backward: (
    <Icon>
      <path d="M12 4v15M6 13.5l6 6 6-6" />
    </Icon>
  ),
  turn: (
    <Icon>
      <path d="M5 13a7 7 0 1 0 2.3-5.2M7 3.5v4.5h4.5" />
    </Icon>
  ),
  wait: (
    <Icon>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 8.5V13l3 2M9.5 2.5h5" />
    </Icon>
  ),
  speed: (
    <Icon>
      <path d="M3.5 17a8.5 8.5 0 1 1 17 0" />
      <path d="M12 17l4.5-6" />
    </Icon>
  ),
  undo: (
    <Icon>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </Icon>
  ),
  clear: (
    <Icon>
      <path d="M4 7h16M9.5 7V4h5v3M6.5 7l1 13h9l1-13" />
    </Icon>
  ),
} as const;

function BarButton({
  icon,
  label,
  pressed,
  disabled,
  onClick,
  testId,
  title,
}: {
  icon: ReactNode;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId: string;
  title: string;
}) {
  return (
    <button
      type="button"
      className="path-bar-button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      title={title}
      data-testid={testId}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** A turn as a picture: a pie of the angle, and its arrow's way round. */
export function TurnPie({ degrees, size = 28 }: { degrees: number; size?: number }) {
  const turn = Math.max(-359.9, Math.min(359.9, degrees));
  const r = 10;
  // Seen from above, 0° is straight up; a right turn (positive) goes clockwise.
  const end = ((turn - 90) * Math.PI) / 180;
  const x = 12 + r * Math.cos(end);
  const y = 12 + r * Math.sin(end);
  const large = Math.abs(turn) > 180 ? 1 : 0;
  const sweep = turn > 0 ? 1 : 0;
  return (
    <svg
      className="turn-pie"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      data-degrees={degrees}
    >
      <circle className="turn-pie-dial" cx="12" cy="12" r={r} />
      <path
        className="turn-pie-slice"
        d={`M12 12 L12 ${12 - r} A${r} ${r} 0 ${large} ${sweep} ${x.toFixed(2)} ${y.toFixed(2)} Z`}
      />
      <path className="turn-pie-was" d={`M12 12 L12 ${12 - r}`} />
      <circle className="turn-pie-now" cx={x.toFixed(2)} cy={y.toFixed(2)} r="2.4" />
    </svg>
  );
}

const TURN_PRESETS: readonly { readonly degrees: number; readonly label: string }[] = [
  { degrees: -90, label: 'a quarter left' },
  { degrees: -45, label: 'an eighth left' },
  { degrees: 45, label: 'an eighth right' },
  { degrees: 90, label: 'a quarter right' },
  { degrees: 180, label: 'turn around' },
];

const turnWords = (degrees: number) => `${Math.abs(degrees)}° ${degrees < 0 ? 'left' : 'right'}`;

/** What the highlighted move is, and the pictures that change it. */
function MoveControls({
  current,
  number,
  onChange,
  onSlide,
}: {
  current: ListedItem | null;
  number: number;
  onChange: (item: PathItem) => void;
  /** A change while the speed lever is dragged; `done` when it is let go. */
  onSlide: (item: PathItem, done: boolean) => void;
}) {
  const item = current?.item;
  if (!item) {
    return (
      <p className="path-bar-hint" data-testid="path-bar-hint">
        Tap on the mat where the robot should go, or add a move with the bar.
      </p>
    );
  }
  switch (item.kind) {
    case 'point':
      return (
        <div className="path-controls" data-testid="path-controls" data-kind="point">
          <span className="path-controls-what">{number}. Drive to this point:</span>
          <div className="segmented">
            {[false, true].map((backward) => (
              <button
                key={String(backward)}
                type="button"
                className="segmented-option"
                aria-pressed={Boolean(item.backward) === backward}
                onClick={() => onChange({ ...item, backward })}
                data-testid={backward ? 'path-point-backward' : 'path-point-forward'}
              >
                {backward ? 'backing up' : 'forward'}
              </button>
            ))}
          </div>
          <span className="path-bar-hint">Drag its number on the mat to move it.</span>
        </div>
      );
    case 'turn':
      return (
        <div className="path-controls" data-testid="path-controls" data-kind="turn">
          <span className="path-controls-what">
            {number}. Turn <TurnPie degrees={item.degrees} size={30} />
            <strong data-testid="path-turn-readout">{turnWords(item.degrees)}</strong>
          </span>
          <div className="path-presets" role="group" aria-label="Turn by">
            {TURN_PRESETS.map((preset) => (
              <button
                key={preset.degrees}
                type="button"
                className="path-preset"
                aria-pressed={item.degrees === preset.degrees}
                aria-label={`${preset.label}: ${turnWords(preset.degrees)}`}
                title={`${preset.label}: ${turnWords(preset.degrees)}`}
                onClick={() => onChange({ kind: 'turn', degrees: preset.degrees })}
                data-testid={`path-turn-${preset.degrees}`}
              >
                <TurnPie degrees={preset.degrees} />
                <span>{turnWords(preset.degrees)}</span>
              </button>
            ))}
          </div>
          <span className="path-bar-hint">Or drag the round handle around the robot.</span>
        </div>
      );
    case 'straight': {
      const { min, max } = PATH_LIMITS.straightMm;
      const size = Math.abs(item.mm);
      const sign = item.mm < 0 ? -1 : 1;
      const set = (mm: number) =>
        onChange({ kind: 'straight', mm: sign * Math.min(max, Math.max(min, mm)) });
      return (
        <div className="path-controls" data-testid="path-controls" data-kind="straight">
          <span className="path-controls-what">
            {number}. {item.mm < 0 ? ICONS.backward : ICONS.forward}
            <strong data-testid="path-straight-readout">
              {size} mm {item.mm < 0 ? 'backward' : 'forward'}
            </strong>
          </span>
          <div className="button-row">
            <button
              type="button"
              className="button button-small"
              onClick={() => set(size - 10)}
              disabled={size <= min}
              data-testid="path-straight-less"
            >
              − 10 mm
            </button>
            <button
              type="button"
              className="button button-small"
              onClick={() => set(size + 10)}
              disabled={size >= max}
              data-testid="path-straight-more"
            >
              + 10 mm
            </button>
          </div>
          <span className="path-bar-hint">Or drag the handle at the robot’s end.</span>
        </div>
      );
    }
    case 'wait': {
      const set = (seconds: number) =>
        onChange({ kind: 'wait', seconds: Math.max(0.5, Math.min(60, seconds)) });
      return (
        <div className="path-controls" data-testid="path-controls" data-kind="wait">
          <span className="path-controls-what">
            {number}. {ICONS.wait}
            <strong data-testid="path-wait-readout">wait {item.seconds} s</strong>
          </span>
          <div className="button-row">
            <button
              type="button"
              className="button button-small"
              onClick={() => set(item.seconds - 0.5)}
              disabled={item.seconds <= 0.5}
              aria-label="Half a second less"
              data-testid="path-wait-less"
            >
              − ½ s
            </button>
            <button
              type="button"
              className="button button-small"
              onClick={() => set(item.seconds + 0.5)}
              disabled={item.seconds >= 60}
              aria-label="Half a second more"
              data-testid="path-wait-more"
            >
              + ½ s
            </button>
          </div>
        </div>
      );
    }
    case 'speed': {
      const { min, max } = PATH_LIMITS.speedPercent;
      return (
        <div className="path-controls" data-testid="path-controls" data-kind="speed">
          <span className="path-controls-what">
            {number}. {ICONS.speed}
            <strong data-testid="path-speed-readout">{item.percent} %</strong>
          </span>
          <label className="path-speed">
            <span aria-hidden="true" title="slow">
              🐢
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={5}
              value={item.percent}
              aria-label="Speed, from slow to fast (a share of the top speed)"
              aria-valuetext={`${item.percent} %`}
              onChange={(event) =>
                onSlide({ kind: 'speed', percent: Number(event.target.value) }, false)
              }
              onPointerUp={() => onSlide(item, true)}
              onKeyUp={() => onSlide(item, true)}
              onBlur={() => onSlide(item, true)}
              data-testid="path-speed-lever"
            />
            <span aria-hidden="true" title="fast">
              🐇
            </span>
          </label>
          <span className="path-bar-hint">The moves after it go at this speed.</span>
        </div>
      );
    }
  }
}

/**
 * The bar over the mat on the Path tab (asked for on 2026-11-10: "make everything pictures, so
 * children see what it does"): how a tap on the mat drives, the moves to add, Undo and Clear; and
 * under it, the highlighted move with pictures that change it (a turn's pie and its ready-made
 * turns, a drive's length, a wait's seconds, a speed lever). The list on the Path tab edits the
 * same moves with numbers.
 */
export function PathBar({
  ready,
  clickBackward,
  canUndo,
  canClear,
  full,
  current,
  number,
  onClickBackward,
  onAdd,
  onUndo,
  onClear,
  onChange,
  onSlide,
}: {
  /** A robot stands on the mat. */
  ready: boolean;
  clickBackward: boolean;
  canUndo: boolean;
  canClear: boolean;
  /** No more moves fit. */
  full: boolean;
  current: ListedItem | null;
  /** The highlighted move's number in the list. */
  number: number;
  onClickBackward: (backward: boolean) => void;
  onAdd: (kind: NewItemKind) => void;
  onUndo: () => void;
  onClear: () => void;
  onChange: (item: PathItem) => void;
  onSlide: (item: PathItem, done: boolean) => void;
}) {
  return (
    <div className="path-bar" role="region" aria-label="Path tools" data-testid="path-bar">
      <div className="path-bar-row">
        <div className="path-bar-group" role="group" aria-label="A tap on the mat">
          <BarButton
            icon={ICONS.toPoint}
            label="Drive to"
            pressed={!clickBackward}
            onClick={() => onClickBackward(false)}
            title="A tap on the mat: the robot turns to face it and drives there"
            testId="path-bar-to-point"
          />
          <BarButton
            icon={ICONS.backToPoint}
            label="Back up to"
            pressed={clickBackward}
            onClick={() => onClickBackward(true)}
            title="A tap on the mat: the robot turns its back to it and reverses there"
            testId="path-bar-back-to-point"
          />
        </div>
        <div className="path-bar-group" role="group" aria-label="Add a move">
          {(
            [
              ['forward', 'Forward', 'Drive forward'],
              ['backward', 'Backward', 'Drive backward'],
              ['turn', 'Turn', 'Turn on the spot'],
              ['wait', 'Wait', 'Stop and wait'],
              ['speed', 'Speed', 'Faster or slower'],
            ] as const
          ).map(([kind, label, title]) => (
            <BarButton
              key={kind}
              icon={ICONS[kind]}
              label={label}
              disabled={!ready || full}
              onClick={() => onAdd(kind)}
              title={`${title}: added after the highlighted move`}
              testId={`path-bar-add-${kind}`}
            />
          ))}
        </div>
        <div className="path-bar-group" role="group" aria-label="Change back">
          <BarButton
            icon={ICONS.undo}
            label="Undo"
            disabled={!canUndo}
            onClick={onUndo}
            title="Take the last change back"
            testId="path-bar-undo"
          />
          <BarButton
            icon={ICONS.clear}
            label="Clear"
            disabled={!canClear}
            onClick={onClear}
            title="Take every move away (Undo brings them back)"
            testId="path-bar-clear"
          />
        </div>
      </div>
      {ready ? (
        <MoveControls current={current} number={number} onChange={onChange} onSlide={onSlide} />
      ) : (
        <p className="path-bar-hint">Choose a robot and place it on the Mat tab first.</p>
      )}
    </div>
  );
}
