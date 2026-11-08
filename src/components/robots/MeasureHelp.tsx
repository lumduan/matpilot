'use client';

import { createContext, useContext, useId, type ReactNode } from 'react';

/**
 * How to measure a robot, with pictures (asked for on 2026-11-08: an "i" by the measurements,
 * showing how to measure, and how to use a vernier caliper on a wheel, "it would help children a
 * lot"). Shown on the Robots page under each section's "i", and in the Docs.
 *
 * The SPIKE Prime wheel's size (56 mm across, 14 mm wide) is from its LDraw part, as
 * src/lib/ldraw/parts.ts reads and cites it. The axle track is what the Robots page and
 * DriveBase call it: from the middle of one wheel to the middle of the other.
 */

/** The arrowhead's id, one per help panel (ids must be unique on the page). */
const ArrowId = createContext('measure-arrow');

/** A line with an arrowhead at both ends. */
function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const arrow = useContext(ArrowId);
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      className="measure-dim"
      markerStart={`url(#${arrow})`}
      markerEnd={`url(#${arrow})`}
    />
  );
}

/** The arrowhead, drawn once per panel in a hidden SVG that the drawings point to. */
function Defs({ id }: { id: string }) {
  return (
    <svg className="measure-defs" aria-hidden="true" focusable="false">
      <marker
        id={id}
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0 0 L10 5 L0 10 z" className="measure-head" />
      </marker>
    </svg>
  );
}

function Figure({
  title,
  label,
  viewBox,
  children,
}: {
  title: string;
  label: string;
  viewBox: string;
  children: ReactNode;
}) {
  return (
    <figure className="measure-figure">
      <svg viewBox={viewBox} role="img" aria-label={label}>
        {children}
      </svg>
      <figcaption>{title}</figcaption>
    </figure>
  );
}

function BodyFromAbove() {
  return (
    <Figure
      title="From above"
      label="The robot from above: the width goes from the outside of one wheel to the outside of the other; the length from the back to the tip of the arm in front; the wheel axle is measured from the back."
      viewBox="0 0 300 235"
    >
      <text x="150" y="14" className="measure-note" textAnchor="middle">
        front ▲
      </text>
      <rect x="135" y="24" width="30" height="16" className="measure-part" />
      <rect x="90" y="40" width="120" height="150" rx="6" className="measure-body" />
      <rect x="72" y="110" width="18" height="40" rx="3" className="measure-wheel" />
      <rect x="210" y="110" width="18" height="40" rx="3" className="measure-wheel" />
      <line x1="72" y1="130" x2="228" y2="130" className="measure-guide" />
      <line x1="72" y1="150" x2="72" y2="205" className="measure-guide" />
      <line x1="228" y1="150" x2="228" y2="205" className="measure-guide" />
      <Arrow x1={72} y1={203} x2={228} y2={203} />
      <text x="150" y="224" className="measure-label" textAnchor="middle">
        width
      </text>
      <line x1="165" y1="24" x2="268" y2="24" className="measure-guide" />
      <line x1="210" y1="190" x2="268" y2="190" className="measure-guide" />
      <Arrow x1={262} y1={24} x2={262} y2={190} />
      <text x="276" y="110" className="measure-label" transform="rotate(90 276 110)">
        length
      </text>
      <line x1="40" y1="190" x2="90" y2="190" className="measure-guide" />
      <line x1="40" y1="130" x2="72" y2="130" className="measure-guide" />
      <Arrow x1={46} y1={130} x2={46} y2={190} />
      <text
        x="34"
        y="162"
        className="measure-label"
        transform="rotate(-90 34 162)"
        textAnchor="middle"
      >
        axle from back
      </text>
    </Figure>
  );
}

function BodyFromSide() {
  return (
    <Figure
      title="From the side"
      label="The robot from the side on a table: the height goes from the table to the highest point, here a sensor on top."
      viewBox="0 0 300 175"
    >
      <line x1="16" y1="150" x2="284" y2="150" className="measure-table" />
      <text x="24" y="166" className="measure-note">
        table
      </text>
      <rect x="80" y="62" width="140" height="62" rx="6" className="measure-body" />
      <rect x="172" y="40" width="22" height="22" className="measure-part" />
      <circle cx="122" cy="128" r="22" className="measure-wheel" />
      <circle cx="122" cy="128" r="4" className="measure-guide-dot" />
      <line x1="194" y1="40" x2="262" y2="40" className="measure-guide" />
      <Arrow x1={256} y1={40} x2={256} y2={150} />
      <text
        x="270"
        y="95"
        className="measure-label"
        transform="rotate(90 270 95)"
        textAnchor="middle"
      >
        height
      </text>
    </Figure>
  );
}

function WheelDiameter() {
  return (
    <Figure
      title="Wheel diameter: the outer jaws, across the middle"
      label="A caliper's two outer jaws touch the top and the bottom of the tyre, through the middle of the wheel."
      viewBox="0 0 300 200"
    >
      <circle cx="120" cy="100" r="60" className="measure-wheel" />
      <circle cx="120" cy="100" r="36" className="measure-body" />
      <circle cx="120" cy="100" r="5" className="measure-guide-dot" />
      <line x1="120" y1="40" x2="120" y2="160" className="measure-guide" />
      <rect x="228" y="8" width="16" height="184" rx="2" className="measure-tool" />
      <rect x="104" y="28" width="140" height="12" rx="2" className="measure-tool" />
      <rect x="104" y="160" width="140" height="12" rx="2" className="measure-tool" />
      <Arrow x1={214} y1={40} x2={214} y2={160} />
      <text
        x="202"
        y="100"
        className="measure-label"
        textAnchor="middle"
        transform="rotate(-90 202 100)"
      >
        diameter
      </text>
    </Figure>
  );
}

function WheelWidth() {
  return (
    <Figure
      title="Wheel width: the tyre from side to side"
      label="The tyre seen from the front, between the caliper's two outer jaws."
      viewBox="0 0 300 160"
    >
      <rect x="128" y="18" width="44" height="104" rx="10" className="measure-wheel" />
      <rect x="44" y="130" width="212" height="14" rx="2" className="measure-tool" />
      <rect x="116" y="56" width="12" height="80" rx="2" className="measure-tool" />
      <rect x="172" y="56" width="12" height="80" rx="2" className="measure-tool" />
      <Arrow x1={128} y1={40} x2={172} y2={40} />
      <text x="190" y="44" className="measure-label">
        width
      </text>
    </Figure>
  );
}

function AxleTrack() {
  return (
    <Figure
      title="Axle track: middle to middle = (A + B) ÷ 2"
      label="Two wheels from above. A goes from the outside of one wheel to the outside of the other, B from inside to inside; the track, middle to middle, is A plus B, divided by 2."
      viewBox="0 0 300 175"
    >
      <rect x="70" y="52" width="160" height="50" rx="4" className="measure-body measure-faint" />
      <rect x="40" y="40" width="28" height="74" rx="4" className="measure-wheel" />
      <rect x="232" y="40" width="28" height="74" rx="4" className="measure-wheel" />
      <line x1="54" y1="30" x2="54" y2="124" className="measure-guide" />
      <line x1="246" y1="30" x2="246" y2="124" className="measure-guide" />
      <Arrow x1={68} y1={22} x2={232} y2={22} />
      <text x="150" y="16" className="measure-label" textAnchor="middle">
        B: inside to inside
      </text>
      <Arrow x1={54} y1={77} x2={246} y2={77} />
      <text x="150" y="72" className="measure-label measure-strong" textAnchor="middle">
        track
      </text>
      <line x1="40" y1="114" x2="40" y2="140" className="measure-guide" />
      <line x1="260" y1="114" x2="260" y2="140" className="measure-guide" />
      <Arrow x1={40} y1={136} x2={260} y2={136} />
      <text x="150" y="160" className="measure-label" textAnchor="middle">
        A: outside to outside
      </text>
    </Figure>
  );
}

/** Millimetres on the drawn main scale, and where they are drawn. */
const MAIN_FROM = 54;
const MAIN_TO = 66;
const PX_PER_MM = 20;
const mainX = (mm: number) => 30 + (mm - MAIN_FROM) * PX_PER_MM;
/** The reading shown: 56.4 mm, so the vernier's line 4 meets the main scale's 60. */
const VERNIER_ZERO = 56.4;
const vernierX = (line: number) => mainX(VERNIER_ZERO) + line * 0.9 * PX_PER_MM;

function Vernier() {
  const mains = Array.from({ length: MAIN_TO - MAIN_FROM + 1 }, (_, i) => MAIN_FROM + i);
  const lines = Array.from({ length: 11 }, (_, i) => i);
  return (
    <Figure
      title="Reading a vernier caliper: 56 + 0.4 = 56.4 mm"
      label="The main scale and the sliding vernier scale. The vernier's 0 is just past 56 on the main scale, and its line 4 lines up exactly with a line above, so the reading is 56.4 millimetres."
      viewBox="0 0 300 160"
    >
      <text x="6" y="12" className="measure-note">
        main scale (mm)
      </text>
      <line x1={mainX(MAIN_FROM)} y1="56" x2={mainX(MAIN_TO)} y2="56" className="measure-scale" />
      {mains.map((mm) => (
        <g key={mm}>
          <line
            x1={mainX(mm)}
            y1={mm % 5 === 0 ? 34 : 42}
            x2={mainX(mm)}
            y2="56"
            className={mm === 60 ? 'measure-scale measure-hit' : 'measure-scale'}
          />
          {mm % 5 === 0 && (
            <text x={mainX(mm)} y="30" className="measure-note" textAnchor="middle">
              {mm}
            </text>
          )}
        </g>
      ))}
      <line x1={vernierX(0)} y1="58" x2={vernierX(10)} y2="58" className="measure-scale" />
      {lines.map((line) => (
        <g key={line}>
          <line
            x1={vernierX(line)}
            y1="58"
            x2={vernierX(line)}
            y2={line % 5 === 0 ? 78 : 70}
            className={line === 4 ? 'measure-scale measure-hit' : 'measure-scale'}
          />
          {line % 5 === 0 && (
            <text x={vernierX(line)} y="90" className="measure-note" textAnchor="middle">
              {line}
            </text>
          )}
        </g>
      ))}
      <circle cx={vernierX(4)} cy="57" r="5" className="measure-ring" />
      <text x={vernierX(0)} y="108" className="measure-label" textAnchor="middle">
        ↑ 0 is past 56
      </text>
      <text x={vernierX(4)} y="126" className="measure-label measure-strong" textAnchor="middle">
        ↑ line 4 lines up: 0.4
      </text>
      <text x="6" y="152" className="measure-note">
        vernier scale (slides)
      </text>
    </Figure>
  );
}

export type MeasureTopic = 'body' | 'wheels';

/** The help for one part of the Robots page. */
export function MeasureHelp({ topic }: { topic: MeasureTopic }) {
  const arrow = `measure-arrow-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <ArrowId.Provider value={arrow}>
      <Defs id={arrow} />
      {topic === 'body' ? <BodyHelp /> : <WheelsHelp />}
    </ArrowId.Provider>
  );
}

function BodyHelp() {
  return (
    <div className="measure-help" data-testid="measure-help-body">
      <div className="measure-figures">
        <BodyFromAbove />
        <BodyFromSide />
      </div>
      <ol className="doc-numbered">
        <li>
          Put the robot on a flat table, with everything on it: wheels, arms and sensors that stick
          out count too.
        </li>
        <li>
          <strong>Width and length:</strong> stand a book upright against each side of the robot,
          then measure between the two books with a ruler. Do the same at the back and the front.
        </li>
        <li>
          <strong>Height:</strong> from the table to the highest point. A book laid flat on top
          helps.
        </li>
        <li>
          <strong>Wheel axle from the back:</strong> from the robot’s back edge to the middle of a
          drive wheel, where its axle goes through. The robot turns around this line.
        </li>
        <li>Write millimetres: 1 cm is 10 mm, so 16 cm is 160.</li>
      </ol>
    </div>
  );
}

function WheelsHelp() {
  return (
    <div className="measure-help" data-testid="measure-help-wheels">
      <div className="measure-figures">
        <WheelDiameter />
        <WheelWidth />
        <AxleTrack />
        <Vernier />
      </div>
      <ol className="doc-numbered">
        <li>
          <strong>Close the caliper first:</strong> with the jaws together it must read 0 (on a
          digital caliper, press its zero button).
        </li>
        <li>
          <strong>Wheel diameter:</strong> hold the wheel between the big outer jaws, across its
          middle, and slide them closed until they just touch the tyre. Do not squeeze: a soft tyre
          gets smaller. The SPIKE Prime wheel is 56 mm across.
        </li>
        <li>
          <strong>Wheel width:</strong> the tyre from one side to the other, between the same jaws.
          The SPIKE Prime wheel is 14 mm wide.
        </li>
        <li>
          <strong>Axle track:</strong> from the middle of one wheel to the middle of the other. It
          is easier to measure A, outside to outside, and B, inside to inside, then work out (A + B)
          ÷ 2. For example (126 + 98) ÷ 2 = 112 mm.
        </li>
        <li>
          <strong>Reading a vernier:</strong> the whole millimetres are on the main scale, just
          before the vernier’s 0 (56). Then find the one vernier line that lines up exactly with a
          line above it (4): that is the tenths, 0.4. Add them: 56.4 mm. Some calipers show 0.05 mm
          or 0.02 mm steps; the number printed on the vernier says which.
        </li>
        <li>
          A ruler and a caliper are close, not exact. <strong>Measure on the floor</strong>, below,
          lets the robot drive and turn, and corrects the wheel size and the track.
        </li>
      </ol>
    </div>
  );
}
