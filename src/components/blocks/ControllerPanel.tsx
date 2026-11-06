'use client';

import { useEffect, useState } from 'react';
import type { ControllerSnapshot, ControllerValues, XboxButtonName } from '@/lib/controller/xbox';

/** No values for this long while connected: the program is not reading the controller. */
const STALE_MS = 1500;

const STATUS_TEXT: Record<ControllerSnapshot['status'], string> = {
  idle: 'Run a program with Controller blocks: the controller shows here while it runs.',
  searching:
    'Looking for the controller… Turn it on and hold its pair button until the Xbox button flashes fast.',
  connected: 'Connected. Move a stick or press a button.',
  notfound:
    'No controller was found, so the program stopped. Turn it on, hold its pair button, and press Run again.',
  lost: 'The controller was lost, so the program stopped and every motor stopped.',
  menu: 'Menu (☰) was pressed, so the program stopped.',
  ended: 'The program ended.',
};

const FACE: readonly { name: XboxButtonName; x: number; y: number; fill: string }[] = [
  { name: 'Y', x: 232, y: 60, fill: '#e2ad00' },
  { name: 'X', x: 215, y: 77, fill: '#2f6fd6' },
  { name: 'B', x: 249, y: 77, fill: '#d83b3b' },
  { name: 'A', x: 232, y: 94, fill: '#2e9e44' },
];

/**
 * The Xbox controller as the running program reads it (ADR 0012): sticks, triggers and buttons
 * move on a drawing, with the numbers below. The hub sends them; the page only shows them.
 */
export function ControllerPanel({ controller }: { readonly controller: ControllerSnapshot }) {
  const { status, values, valuesAt } = controller;
  const now = useNow(status === 'connected');
  const stale = status === 'connected' && (values === null || now - valuesAt > STALE_MS);
  const live = status === 'connected' && !stale;
  const statusText =
    status === 'connected' && stale
      ? 'Connected, but the program is not reading the controller. Put the Controller blocks inside “repeat forever”.'
      : STATUS_TEXT[status];

  return (
    <section
      className="pane controller-pane"
      aria-labelledby="controller-heading"
      data-testid="controller-pane"
    >
      <div className="card-header">
        <h2 id="controller-heading">Controller</h2>
        <span className="controller-status" data-status={live ? 'live' : status}>
          {live ? 'live' : status === 'connected' ? 'waiting' : status}
        </span>
      </div>
      <p className="controller-message" role="status" data-testid="controller-message">
        {statusText}
      </p>
      <div className="controller-body" data-live={live}>
        <ControllerDrawing values={live ? values : null} />
        <ControllerNumbers values={values} />
      </div>
    </section>
  );
}

/** The current time, every 500 ms while `active`, so stale values are noticed. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function ControllerNumbers({ values }: { readonly values: ControllerValues | null }) {
  if (!values) return <p className="controller-numbers muted">No values yet.</p>;
  const pressed = values.pressed.length > 0 ? values.pressed.join(', ') : 'none';
  return (
    <dl className="controller-numbers" data-testid="controller-numbers">
      <div>
        <dt>Left stick</dt>
        <dd>
          ↕ {values.leftY} ↔ {values.leftX}
        </dd>
      </div>
      <div>
        <dt>Right stick</dt>
        <dd>
          ↕ {values.rightY} ↔ {values.rightX}
        </dd>
      </div>
      <div>
        <dt>Triggers</dt>
        <dd>
          LT {values.leftTrigger} RT {values.rightTrigger}
        </dd>
      </div>
      <div>
        <dt>Pressed</dt>
        <dd>{pressed}</dd>
      </div>
    </dl>
  );
}

/** A generic gamepad drawn for MatPilot; lit parts follow the values. */
function ControllerDrawing({ values }: { readonly values: ControllerValues | null }) {
  const pressed = new Set(values?.pressed ?? []);
  const lit = (name: XboxButtonName) => pressed.has(name);
  const stick = (cx: number, cy: number, x: number, y: number, click: XboxButtonName) => (
    <g>
      <circle cx={cx} cy={cy} r="19" className="pad-well" />
      <circle
        cx={cx + (x / 100) * 12}
        cy={cy - (y / 100) * 12}
        r="11"
        className={lit(click) ? 'pad-stick pad-lit' : 'pad-stick'}
      />
    </g>
  );
  const trigger = (x: number, value: number, label: string) => (
    <g>
      <rect x={x} y="6" width="48" height="12" rx="4" className="pad-well" />
      <rect x={x} y="6" width={(48 * value) / 100} height="12" rx="4" className="pad-fill" />
      <text x={x + 24} y="15.5" className="pad-label">
        {label}
      </text>
    </g>
  );
  const dpad = (name: XboxButtonName, d: string) => (
    <path d={d} className={lit(name) ? 'pad-key pad-lit' : 'pad-key'} />
  );
  const cx = 128;
  const cy = 112;
  return (
    <svg
      className="controller-drawing"
      viewBox="0 0 320 186"
      role="img"
      aria-label="The controller: sticks, triggers and buttons as the hub reads them"
    >
      {trigger(66, values?.leftTrigger ?? 0, 'LT')}
      {trigger(206, values?.rightTrigger ?? 0, 'RT')}
      <rect
        x="64"
        y="24"
        width="52"
        height="12"
        rx="6"
        className={lit('LB') ? 'pad-key pad-lit' : 'pad-key'}
      />
      <rect
        x="204"
        y="24"
        width="52"
        height="12"
        rx="6"
        className={lit('RB') ? 'pad-key pad-lit' : 'pad-key'}
      />
      <text x="90" y="33.5" className="pad-label">
        LB
      </text>
      <text x="230" y="33.5" className="pad-label">
        RB
      </text>
      <path
        className="pad-body"
        d="M92 40h136c34 0 58 20 64 54l10 54c3 22-20 32-35 17l-27-27H80l-27 27c-15 15-38 5-35-17l10-54c6-34 30-54 64-54z"
      />
      {stick(92, 78, values?.leftX ?? 0, values?.leftY ?? 0, 'LJ')}
      {stick(192, 112, values?.rightX ?? 0, values?.rightY ?? 0, 'RJ')}
      {dpad('UP', `M${cx - 6} ${cy - 22}h12v14h-12z`)}
      {dpad('DOWN', `M${cx - 6} ${cy + 8}h12v14h-12z`)}
      {dpad('LEFT', `M${cx - 22} ${cy - 6}h14v12h-14z`)}
      {dpad('RIGHT', `M${cx + 8} ${cy - 6}h14v12h-14z`)}
      <circle cx="141" cy="66" r="6" className={lit('VIEW') ? 'pad-key pad-lit' : 'pad-key'} />
      <circle cx="179" cy="66" r="6" className={lit('MENU') ? 'pad-key pad-lit' : 'pad-key'} />
      <circle cx="160" cy="52" r="8" className={lit('GUIDE') ? 'pad-key pad-lit' : 'pad-key'} />
      {FACE.map((button) => (
        <g key={button.name}>
          <circle
            cx={button.x}
            cy={button.y}
            r="9"
            fill={lit(button.name) ? button.fill : 'transparent'}
            stroke={button.fill}
            strokeWidth="2.2"
          />
          <text
            x={button.x}
            y={button.y + 4}
            className="pad-face-label"
            fill={lit(button.name) ? '#fff' : button.fill}
          >
            {button.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
