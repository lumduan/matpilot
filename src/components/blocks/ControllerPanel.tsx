'use client';

import { useEffect, useState } from 'react';
import type { ControllerControl } from '@/lib/blocks/generator-context';
import { controllerProfile, type ControllerProfile } from '@/lib/controller/layout';
import type { ControllerSnapshot, ControllerValues, XboxButtonName } from '@/lib/controller/xbox';

/** No values for this long while connected: the program is not reading the controller. */
const STALE_MS = 1500;

const STATUS_TEXT: Record<ControllerSnapshot['status'], string> = {
  idle: 'Run the program: the controller moves here while it runs.',
  searching: 'Looking for the controller (the hub light blinks blue)…',
  connected: 'Connected (green light and a beep). Move a stick or press a button.',
  notfound:
    'No controller connected, so the program stopped. The Monitor says why. Turn the controller on with its Xbox button, or pair it, and press Run again.',
  lost: 'The controller was lost, so the program stopped and every motor stopped.',
  menu: 'Menu (☰) was pressed, so the program stopped.',
  ended: 'The program ended.',
};

/**
 * The controller as the running program reads it (ADR 0012): sticks, triggers and buttons move
 * on a drawing (the same layout as the block pickers), with the numbers, and a list of what each
 * control does in this program. The hub sends the values; the page only shows them.
 */
export function ControllerPanel({
  controller,
  profileId,
  controls,
}: {
  readonly controller: ControllerSnapshot;
  readonly profileId: string | null;
  readonly controls: readonly ControllerControl[];
}) {
  const profile = controllerProfile(profileId);
  const { status, values, valuesAt } = controller;
  const now = useNow(status === 'connected');
  const stale = status === 'connected' && (values === null || now - valuesAt > STALE_MS);
  const live = status === 'connected' && !stale;
  let statusText = STATUS_TEXT[status];
  if (status === 'connected' && stale) {
    statusText =
      'Connected, but the program is not reading the controller. Put the Controller blocks inside “repeat forever”.';
  } else if (status === 'searching') {
    statusText = `${statusText} ${profile.pairing}`;
  } else if (status === 'ended' && controller.endedFrom === 'connected' && values === null) {
    statusText =
      'The controller connected, then the program ended without reading it. Are the Controller blocks inside “repeat forever”, attached under “use the controller”? Faded blocks are not attached and do not run.';
  } else if (status === 'ended' && controller.endedFrom === 'searching') {
    statusText = 'The program ended while it was looking for the controller.';
  }

  return (
    <section
      className="pane controller-pane"
      aria-labelledby="controller-heading"
      data-testid="controller-pane"
    >
      <div className="card-header">
        <h2 id="controller-heading">Controller · {profile.short}</h2>
        <span className="controller-status" data-status={live ? 'live' : status}>
          {live ? 'live' : status === 'connected' ? 'waiting' : status}
        </span>
      </div>
      <p className="controller-message" role="status" data-testid="controller-message">
        {statusText}
      </p>
      <div className="controller-body" data-live={live}>
        <ControllerDrawing profile={profile} values={live ? values : null} />
        <div className="controller-side">
          <ControllerNumbers values={values} />
          {controls.length > 0 && (
            <div className="controller-controls" data-testid="controller-controls">
              <h3>Your controls</h3>
              <ul>
                {controls.map((control) => (
                  <li key={`${control.control}|${control.action}`}>
                    <strong>{control.control}</strong> {control.action}
                    {control.fingers.length > 0 && (
                      <span className="controller-finger"> · {control.fingers.join(', ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
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
  if (!values) return null;
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

/** The controller from its layout (src/lib/controller/layout.ts); lit parts follow the values. */
function ControllerDrawing({
  profile,
  values,
}: {
  readonly profile: ControllerProfile;
  readonly values: ControllerValues | null;
}) {
  const pressed = new Set<XboxButtonName>(values?.pressed ?? []);
  const lit = (name: XboxButtonName) => pressed.has(name);
  const stickValue = (side: 'left' | 'right') =>
    side === 'left'
      ? [values?.leftX ?? 0, values?.leftY ?? 0]
      : [values?.rightX ?? 0, values?.rightY ?? 0];
  const triggerValue = (side: 'left' | 'right') =>
    (side === 'left' ? values?.leftTrigger : values?.rightTrigger) ?? 0;
  return (
    <svg
      className="controller-drawing"
      viewBox="0 0 320 186"
      role="img"
      aria-label={`The ${profile.name}: sticks, triggers and buttons as the hub reads them`}
    >
      {profile.triggers.map((trigger) => (
        <g key={trigger.label}>
          <rect x={trigger.x} y={trigger.y} width="48" height="14" rx="5" className="pad-well" />
          <rect
            x={trigger.x}
            y={trigger.y}
            width={(48 * triggerValue(trigger.side)) / 100}
            height="14"
            rx="5"
            className="pad-fill"
          />
          <text x={trigger.x + 24} y={trigger.y + 11} className="pad-label">
            {trigger.label}
          </text>
        </g>
      ))}
      <path className="pad-body" d={profile.body} />
      {profile.sticks.map((stick) => {
        const [x, y] = stickValue(stick.side);
        return (
          <g key={stick.side}>
            <circle cx={stick.cx} cy={stick.cy} r="20" className="pad-well" />
            <circle
              cx={stick.cx + ((x ?? 0) / 100) * 12}
              cy={stick.cy - ((y ?? 0) / 100) * 12}
              r="12"
              className={lit(stick.click) ? 'pad-stick pad-lit' : 'pad-stick'}
            />
          </g>
        );
      })}
      {profile.keys.map((key) => {
        const on = lit(key.button);
        if (key.shape === 'face') {
          return (
            <g key={key.button}>
              <circle
                cx={key.x}
                cy={key.y}
                r="9.5"
                fill={on ? key.colour : 'transparent'}
                stroke={key.colour}
                strokeWidth="2.2"
              />
              <text
                x={key.x}
                y={key.y + 4.3}
                className="pad-face-label"
                fill={on ? '#fff' : key.colour}
              >
                {key.text}
              </text>
            </g>
          );
        }
        const className = on ? 'pad-key pad-lit' : 'pad-key';
        if (key.shape === 'bumper') {
          return (
            <g key={key.button}>
              <rect
                x={key.x - 26}
                y={key.y - 7}
                width="52"
                height="14"
                rx="7"
                className={className}
              />
              <text x={key.x} y={key.y + 3.6} className="pad-label">
                {key.text}
              </text>
            </g>
          );
        }
        if (key.shape === 'dpad') {
          return (
            <rect
              key={key.button}
              x={key.x - 7.5}
              y={key.y - 7.5}
              width="15"
              height="15"
              rx="3"
              className={className}
            />
          );
        }
        return (
          <circle
            key={key.button}
            cx={key.x}
            cy={key.y}
            r={key.button === 'GUIDE' ? 8 : 6.5}
            className={className}
          />
        );
      })}
    </svg>
  );
}
