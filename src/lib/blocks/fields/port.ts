/**
 * Port pickers that show the hub: tap the port a device is plugged into. With a hub connected,
 * each port also says what is plugged into it (./hints.ts).
 *
 * The drawing follows the port letters printed on a SPIKE Prime hub, seen from the front with the
 * light matrix on top: A, C, E on the left, B, D, F on the right.
 */
import * as Blockly from 'blockly/core';
import { PORTS, type PortName } from '../pybricks';
import { button, closePicker, htmlEl, openPicker, svgEl } from './common';
import { getPortHints, type HintKind, type PortHints } from './hints';

const SIDE: Readonly<Record<PortName, { left: boolean; row: number }>> = {
  A: { left: true, row: 0 },
  B: { left: false, row: 0 },
  C: { left: true, row: 1 },
  D: { left: false, row: 1 },
  E: { left: true, row: 2 },
  F: { left: false, row: 2 },
};

const KIND_LABEL: Readonly<Record<HintKind, string>> = {
  motor: 'motor',
  color: 'colour sensor',
  distance: 'distance sensor',
  force: 'touch sensor',
  other: 'device',
};

interface HubLayout {
  readonly width: number;
  readonly height: number;
  /** Left edge of the hub body. */
  readonly hubX: number;
}

const HUB_WIDTH = 92;
const HUB_TOP = 12;
const HUB_HEIGHT = 196;
const TAB_WIDTH = 24;
const TAB_HEIGHT = 34;
const rowY = (row: number) => HUB_TOP + 44 + row * 56;

/** Where a port's tab is, and where a cable plugs into it. */
function portGeometry(layout: HubLayout, port: PortName) {
  const { left, row } = SIDE[port];
  const x = left ? layout.hubX - TAB_WIDTH : layout.hubX + HUB_WIDTH;
  const y = rowY(row);
  return { x, y, plugX: left ? x : x + TAB_WIDTH, plugY: y + TAB_HEIGHT / 2, left };
}

function shorten(text: string, max = 15): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function hintText(hints: PortHints, port: PortName): string | null {
  const hint = hints[port];
  if (hint === undefined) return null;
  return hint === null ? 'empty' : shorten(hint.name);
}

interface HubDrawing {
  readonly tabs: ReadonlyMap<PortName, SVGGElement>;
  /** Re-applies the selection. Elements are updated in place, never replaced, so focus stays. */
  readonly refresh: () => void;
}

/** Draws the hub with clickable ports into `svg`. */
function drawHub(
  svg: SVGSVGElement,
  layout: HubLayout,
  options: {
    readonly hints: PortHints;
    readonly want: HintKind | null;
    readonly label: (port: PortName) => string;
    readonly isSelected: (port: PortName) => boolean;
    readonly onPick: (port: PortName) => void;
  },
): HubDrawing {
  const { hubX } = layout;
  svgEl(
    'rect',
    {
      x: hubX,
      y: HUB_TOP,
      width: HUB_WIDTH,
      height: HUB_HEIGHT,
      rx: 16,
      fill: '#f4f5f7',
      stroke: 'rgba(0,0,0,0.35)',
      'stroke-width': 1.5,
    },
    svg,
  );
  // The 5×5 lights and the centre button, so it reads as the hub.
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      svgEl(
        'rect',
        {
          x: hubX + 21 + column * 10.5,
          y: HUB_TOP + 26 + row * 10.5,
          width: 7,
          height: 7,
          rx: 1.5,
          fill: '#c9ced6',
        },
        svg,
      );
    }
  }
  svgEl(
    'circle',
    {
      cx: hubX + HUB_WIDTH / 2,
      cy: HUB_TOP + 150,
      r: 15,
      fill: '#fff',
      stroke: '#9aa3ad',
      'stroke-width': 2,
    },
    svg,
  );

  const tabs = new Map<PortName, SVGGElement>();
  const updates: (() => void)[] = [];
  for (const port of PORTS) {
    const { x, y, left } = portGeometry(layout, port);
    const hint = options.hints[port];
    const matches = options.want !== null && hint?.kind === options.want;
    const group = svgEl(
      'g',
      { class: 'mp-port', role: 'button', tabindex: 0, 'data-port': port },
      svg,
    );
    const tab = svgEl(
      'rect',
      {
        class: 'mp-port-tab',
        x,
        y,
        width: TAB_WIDTH,
        height: TAB_HEIGHT,
        rx: 6,
        'stroke-width': 1.5,
      },
      group,
    );
    const letter = svgEl(
      'text',
      {
        x: x + TAB_WIDTH / 2,
        y: y + TAB_HEIGHT / 2 + 5.5,
        'text-anchor': 'middle',
        'font-size': 16,
        'font-weight': 700,
      },
      group,
    );
    letter.textContent = port;
    const text = hintText(options.hints, port);
    if (text !== null) {
      const caption = svgEl(
        'text',
        {
          class: 'mp-port-caption',
          x: left ? x - 6 : x + TAB_WIDTH + 6,
          y: y + TAB_HEIGHT / 2 + 4,
          'text-anchor': left ? 'end' : 'start',
          'font-size': 11.5,
          'font-weight': matches ? 700 : 400,
          fill: '#fff',
          opacity: hint === null ? 0.7 : 1,
        },
        group,
      );
      caption.textContent = matches ? `● ${text}` : text;
    }
    // A wide invisible target, so a small finger hits the port.
    svgEl(
      'rect',
      {
        x: left ? x - 8 : x,
        y: y - 6,
        width: TAB_WIDTH + 8,
        height: TAB_HEIGHT + 12,
        fill: 'transparent',
      },
      group,
    );
    const pick = () => options.onPick(port);
    group.addEventListener('click', pick);
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        pick();
      }
    });
    updates.push(() => {
      const selected = options.isSelected(port);
      tab.setAttribute('fill', selected ? '#fff' : 'rgba(0,0,0,0.38)');
      tab.setAttribute('stroke', selected ? '#fff' : 'rgba(255,255,255,0.75)');
      letter.setAttribute('fill', selected ? '#15181c' : '#fff');
      group.setAttribute('aria-pressed', String(selected));
      group.setAttribute('aria-label', options.label(port));
    });
    tabs.set(port, group);
  }
  const refresh = () => updates.forEach((update) => update());
  refresh();
  return { tabs, refresh };
}

function hintSentence(hints: PortHints, want: HintKind | null): string {
  const known = PORTS.some((port) => hints[port] !== undefined);
  if (!known) return 'Connect the hub to see what is plugged into each port.';
  return want ? `● marks a port with a ${KIND_LABEL[want]} plugged in.` : 'What the hub sees now.';
}

function describePort(hints: PortHints, port: PortName): string {
  const hint = hints[port];
  if (hint === undefined) return `Port ${port}`;
  return `Port ${port}, ${hint === null ? 'empty' : hint.name}`;
}

const PORT_OPTIONS: [string, string][] = PORTS.map((port) => [port, port]);

/** One port, A to F. JSON: `{ type: 'field_mp_port', name, value: 'A', kind: 'motor' }`. */
export class FieldPort extends Blockly.FieldDropdown {
  /** What should be plugged in, to mark matching ports. */
  private readonly want: HintKind | null;

  constructor(value: string = 'A', want: HintKind | null = null) {
    super(PORT_OPTIONS);
    this.want = want;
    this.setValue(value);
  }

  static override fromJson(options: Blockly.FieldDropdownFromJsonConfig & Record<string, unknown>) {
    const want = typeof options.kind === 'string' ? (options.kind as HintKind) : null;
    return new FieldPort(typeof options.value === 'string' ? options.value : 'A', want);
  }

  protected override showEditor_(): void {
    const hints = getPortHints();
    const root = htmlEl('div', { class: 'mp-picker mp-port-picker' });
    htmlEl('p', { class: 'mp-picker-title' }, root, 'Which port is it plugged into?');
    const layout: HubLayout = { width: 380, height: 220, hubX: 144 };
    const svg = svgEl('svg', {
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      width: layout.width,
      height: layout.height,
    });
    root.appendChild(svg);
    const { tabs } = drawHub(svg, layout, {
      hints,
      want: this.want,
      label: (port) => describePort(hints, port),
      isSelected: (port) => port === this.getValue(),
      onPick: (port) => {
        this.setValue(port);
        closePicker(this);
      },
    });
    htmlEl('p', { class: 'mp-picker-note' }, root, hintSentence(hints, this.want));
    openPicker(this, root);
    tabs.get((this.getValue() as PortName | null) ?? 'A')?.focus();
  }
}

/** Every ordered pair of two different ports: "AB" is left A, right B. */
const PAIR_OPTIONS: [string, string][] = PORTS.flatMap((left) =>
  PORTS.filter((right) => right !== left).map(
    (right) => [`${left} + ${right}`, `${left}${right}`] as [string, string],
  ),
);

export function splitPair(value: string): [PortName, PortName] {
  return [value[0] as PortName, value[1] as PortName];
}

/**
 * The two drive motors: left wheel, then right wheel. JSON:
 * `{ type: 'field_mp_port_pair', name, value: 'AB' }`.
 */
export class FieldPortPair extends Blockly.FieldDropdown {
  constructor(value: string = 'AB') {
    super(PAIR_OPTIONS);
    this.setValue(value);
  }

  static override fromJson(options: Blockly.FieldDropdownFromJsonConfig & Record<string, unknown>) {
    return new FieldPortPair(typeof options.value === 'string' ? options.value : 'AB');
  }

  protected override showEditor_(): void {
    let [left, right] = splitPair(this.getValue() ?? 'AB');
    let active: 'left' | 'right' = 'left';
    const hints = getPortHints();
    const root = htmlEl('div', { class: 'mp-picker mp-pair-picker' });
    const title = htmlEl('p', { class: 'mp-picker-title' }, root);
    const layout: HubLayout = { width: 470, height: 220, hubX: 189 };
    const svg = svgEl('svg', {
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      width: layout.width,
      height: layout.height,
    });
    root.appendChild(svg);
    const summary = htmlEl('p', { class: 'mp-picker-readout' }, root);
    const row = htmlEl('div', { class: 'mp-picker-row' }, root);
    button(row, 'Swap left and right', () => {
      [left, right] = [right, left];
      commit();
    });
    button(row, 'Done', () => closePicker(this));
    htmlEl('p', { class: 'mp-picker-note' }, root, hintSentence(hints, 'motor'));

    const commit = () => {
      this.setValue(`${left}${right}`);
      update();
    };

    // Cables from each wheel to its port, under everything else.
    const cables = [0, 1].map(() =>
      svgEl('path', { fill: 'none', stroke: '#fff', opacity: 0.9 }, svg),
    );
    const wheelUpdates: (() => void)[] = [];
    for (const side of ['left', 'right'] as const) {
      const x = side === 'left' ? 8 : layout.width - 40;
      const group = svgEl('g', { class: 'mp-port', role: 'button', tabindex: 0 }, svg);
      const body = svgEl(
        'rect',
        {
          class: 'mp-port-tab',
          x,
          y: 72,
          width: 32,
          height: 76,
          rx: 12,
          stroke: '#fff',
          'stroke-width': 1.5,
        },
        group,
      );
      const treads = Array.from({ length: 5 }, (_, tread) =>
        svgEl(
          'path',
          { d: `M${x + 7} ${84 + tread * 13}h18`, 'stroke-width': 2, opacity: 0.5 },
          group,
        ),
      );
      const label = svgEl(
        'text',
        {
          x: x + 16,
          y: 64,
          'text-anchor': 'middle',
          'font-size': 12,
          'font-weight': 700,
          fill: '#fff',
        },
        group,
      );
      label.textContent = side;
      const choose = () => {
        active = side;
        update();
      };
      group.addEventListener('click', choose);
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          choose();
        }
      });
      wheelUpdates.push(() => {
        const on = side === active;
        body.setAttribute('fill', on ? '#fff' : 'rgba(0,0,0,0.45)');
        for (const tread of treads) tread.setAttribute('stroke', on ? '#15181c' : '#fff');
        group.setAttribute('aria-pressed', String(on));
        group.setAttribute('aria-label', `${side} wheel, port ${side === 'left' ? left : right}`);
      });
    }
    const hub = drawHub(svg, layout, {
      hints,
      want: 'motor',
      label: (port) =>
        `${describePort(hints, port)}${port === left ? ', left wheel' : ''}${port === right ? ', right wheel' : ''}`,
      isSelected: (port) => port === left || port === right,
      onPick: (port) => {
        if (active === 'left') {
          if (port === right) right = left;
          left = port;
          active = 'right';
        } else {
          if (port === left) left = right;
          right = port;
          active = 'left';
        }
        commit();
      },
    });
    const update = () => {
      title.textContent =
        active === 'left' ? 'Tap the port of the LEFT wheel' : 'Tap the port of the RIGHT wheel';
      summary.textContent = `left ${left} · right ${right}`;
      (['left', 'right'] as const).forEach((side, index) => {
        const port = side === 'left' ? left : right;
        const { plugX, plugY } = portGeometry(layout, port);
        const wheelX = side === 'left' ? 40 : layout.width - 40;
        const middle = (wheelX + plugX) / 2;
        const cable = cables[index];
        cable?.setAttribute(
          'd',
          `M${wheelX} 110 C${middle} 110, ${middle} ${plugY}, ${plugX} ${plugY}`,
        );
        cable?.setAttribute('stroke-width', side === active ? '4' : '2.5');
        cable?.setAttribute('stroke-dasharray', side === active ? '' : '6 4');
      });
      wheelUpdates.forEach((each) => each());
      hub.refresh();
    };
    update();
    openPicker(this, root);
    hub.tabs.get(left)?.focus();
  }
}

/** One motor of a motor set, and whether it turns the other way. */
export interface MotorChoice {
  readonly port: PortName;
  readonly reverse: boolean;
}

const MOTOR_SET = /^(?:[A-F][+-])+$/;

/** `"A+B-"`: motor A ↻ and motor B ↺, in port order, each port once. */
export function parseMotorSet(value: string): MotorChoice[] {
  if (!MOTOR_SET.test(value)) return [];
  const choices = new Map<PortName, boolean>();
  for (let index = 0; index < value.length; index += 2) {
    choices.set(value[index] as PortName, value[index + 1] === '-');
  }
  return PORTS.filter((port) => choices.has(port)).map((port) => ({
    port,
    reverse: choices.get(port) ?? false,
  }));
}

export function formatMotorSet(choices: readonly MotorChoice[]): string {
  return choices.map((choice) => `${choice.port}${choice.reverse ? '-' : '+'}`).join('');
}

export function describeMotorSet(value: string): string {
  const choices = parseMotorSet(value);
  return choices.length === 0
    ? 'none'
    : choices.map((choice) => `${choice.port} ${choice.reverse ? '↺' : '↻'}`).join('  ');
}

/**
 * One or more motors, each turning ↻ or the other way (↺), picked on the hub: tap a port to add
 * it, again to turn it the other way, a third time to take it off. Two motors that face each
 * other (a robot's wheels, a two-sided lift) need opposite signs to work together. JSON:
 * `{ type: 'field_mp_motor_set', name, value: 'C+' }`.
 */
export class FieldMotorSet extends Blockly.FieldTextInput {
  constructor(value: string = 'C+') {
    super(value);
  }

  static override fromJson(
    options: Blockly.FieldTextInputFromJsonConfig & Record<string, unknown>,
  ) {
    return new FieldMotorSet(typeof options.value === 'string' ? options.value : 'C+');
  }

  protected override doClassValidation_(value?: unknown): string | null {
    if (typeof value !== 'string') return null;
    const choices = parseMotorSet(value);
    return choices.length > 0 ? formatMotorSet(choices) : null;
  }

  protected override getText_(): string {
    return describeMotorSet(this.getValue() ?? '');
  }

  override repositionForWindowResize(): boolean {
    return false;
  }

  protected override showEditor_(): void {
    let choices = parseMotorSet(this.getValue() ?? 'C+');
    const hints = getPortHints();
    const root = htmlEl('div', { class: 'mp-picker mp-port-picker' });
    htmlEl('p', { class: 'mp-picker-title' }, root, 'Tap the motors to run');
    const layout: HubLayout = { width: 380, height: 220, hubX: 144 };
    const svg = svgEl('svg', {
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      width: layout.width,
      height: layout.height,
    });
    root.appendChild(svg);
    const readout = htmlEl('p', { class: 'mp-picker-readout' }, root);
    htmlEl(
      'p',
      { class: 'mp-picker-note' },
      root,
      'Tap again to turn it the other way (↺), a third time to take it off. Motors that face each other need opposite arrows.',
    );
    const row = htmlEl('div', { class: 'mp-picker-row' }, root);
    button(row, 'Done', () => closePicker(this));
    htmlEl('p', { class: 'mp-picker-note' }, root, hintSentence(hints, 'motor'));

    const hub = drawHub(svg, layout, {
      hints,
      want: 'motor',
      label: (port) => {
        const choice = choices.find((each) => each.port === port);
        const state = choice ? (choice.reverse ? ', runs ↺' : ', runs ↻') : '';
        return `${describePort(hints, port)}${state}`;
      },
      isSelected: (port) => choices.some((choice) => choice.port === port),
      onPick: (port) => {
        const choice = choices.find((each) => each.port === port);
        if (!choice) choices = [...choices, { port, reverse: false }];
        else if (!choice.reverse) {
          choices = choices.map((each) => (each.port === port ? { port, reverse: true } : each));
        } else if (choices.length > 1) {
          choices = choices.filter((each) => each.port !== port);
        } else {
          // The last motor stays; it turns back to ↻.
          choices = [{ port, reverse: false }];
        }
        this.setValue(formatMotorSet(choices));
        choices = parseMotorSet(this.getValue() ?? '');
        update();
      },
    });
    // ↻ or ↺ on the hub, just inside each chosen port (the captions are outside), drawn after
    // the hub so it stays on top.
    const arrows = new Map(
      PORTS.map((port) => {
        const { x, y, left } = portGeometry(layout, port);
        const arrow = svgEl(
          'text',
          {
            x: left ? x + TAB_WIDTH + 11 : x - 11,
            y: y + TAB_HEIGHT / 2 + 7,
            'text-anchor': 'middle',
            'font-size': 19,
            'font-weight': 700,
            fill: '#15181c',
          },
          svg,
        );
        return [port, arrow] as const;
      }),
    );
    const update = () => {
      hub.refresh();
      for (const [port, arrow] of arrows) {
        const choice = choices.find((each) => each.port === port);
        arrow.textContent = choice ? (choice.reverse ? '↺' : '↻') : '';
      }
      readout.textContent = describeMotorSet(this.getValue() ?? '');
    };
    update();
    openPicker(this, root);
    hub.tabs.get(choices[0]?.port ?? 'C')?.focus({ preventScroll: true });
  }
}
