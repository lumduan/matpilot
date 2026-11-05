/**
 * Number fields with a picture to set them by hand:
 * - FieldTurnAngle: how far the robot turns, -360 to 360 degrees, positive to the right. The dial
 *   shows the robot from above, turned to where it will face.
 * - FieldSteering: -100 (spin left) to 100 (spin right), 0 straight on. The picture shows the
 *   path the robot will drive.
 *
 * They are FieldNumber underneath, so they look and save like any number, and a variable can be
 * dropped over the shadow block that holds them.
 */
import * as Blockly from 'blockly/core';
import {
  button,
  clamp,
  closePicker,
  htmlEl,
  makeSlider,
  onDrag,
  openPicker,
  svgEl,
} from './common';

export function describeTurn(angle: number): string {
  if (angle === 0) return 'no turn';
  return `${angle > 0 ? 'right' : 'left'} ${Math.abs(angle)}°`;
}

export function describeSteering(steering: number): string {
  if (steering === 0) return 'straight';
  return `${steering > 0 ? 'right' : 'left'} ${Math.abs(steering)}`;
}

/** Degrees clockwise from straight up, -180 to 180. */
function bearing(x: number, y: number, cx: number, cy: number): number {
  return (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
}

const wrap180 = (angle: number) => ((((angle + 180) % 360) + 360) % 360) - 180;

/** A robot seen from above, facing up, centred on (0, 0). */
function drawRobot(parent: SVGElement, scale: number, ghost: boolean): void {
  const stroke = ghost ? 'rgba(255,255,255,0.55)' : '#15181c';
  const fill = ghost ? 'none' : '#fff';
  const dash = ghost ? '4 3' : '';
  const s = scale;
  svgEl(
    'rect',
    {
      x: -15 * s,
      y: -19 * s,
      width: 30 * s,
      height: 38 * s,
      rx: 6 * s,
      fill,
      stroke: ghost ? stroke : 'rgba(0,0,0,0.4)',
      'stroke-width': 1.5,
      'stroke-dasharray': dash,
    },
    parent,
  );
  for (const side of [-1, 1]) {
    svgEl(
      'rect',
      {
        x: side < 0 ? -22 * s : 15 * s,
        y: -10 * s,
        width: 7 * s,
        height: 20 * s,
        rx: 2.5 * s,
        fill: ghost ? 'none' : '#2b3138',
        stroke: ghost ? stroke : 'none',
        'stroke-dasharray': dash,
      },
      parent,
    );
  }
  svgEl(
    'path',
    {
      d: `M${-7 * s} ${-4 * s} L0 ${-13 * s} L${7 * s} ${-4 * s}`,
      fill: 'none',
      stroke,
      'stroke-width': 3,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    parent,
  );
}

/** A pie slice from straight up to `angle` degrees (clockwise when positive). */
function slicePath(cx: number, cy: number, r: number, angle: number): string {
  if (angle === 0) return '';
  if (Math.abs(angle) >= 360) return `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  const radians = (angle * Math.PI) / 180;
  const x = cx + r * Math.sin(radians);
  const y = cy - r * Math.cos(radians);
  const large = Math.abs(angle) > 180 ? 1 : 0;
  const sweep = angle > 0 ? 1 : 0;
  return `M${cx} ${cy} L${cx} ${cy - r} A${r} ${r} 0 ${large} ${sweep} ${x} ${y} Z`;
}

/** Common base: a FieldNumber whose editor is a picture instead of a text box. */
abstract class PictureNumberField extends Blockly.FieldNumber {
  protected abstract describe(value: number): string;

  protected override getText_(): string {
    return this.describe(Number(this.getValue() ?? 0));
  }

  override repositionForWindowResize(): boolean {
    return false;
  }
}

export class FieldTurnAngle extends PictureNumberField {
  constructor(value: number = 90) {
    super(value, -360, 360, 1);
  }

  static override fromJson(options: Blockly.FieldNumberFromJsonConfig) {
    return new FieldTurnAngle(Number(options.value ?? 90));
  }

  protected describe(value: number): string {
    return describeTurn(value);
  }

  protected override showEditor_(): void {
    const size = 220;
    const c = size / 2;
    const r = 86;
    const root = htmlEl('div', { class: 'mp-picker mp-turn-picker' });
    htmlEl('p', { class: 'mp-picker-title' }, root, 'Drag the handle to turn the robot');
    const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size });
    root.appendChild(svg);
    svgEl(
      'circle',
      {
        class: 'mp-focus-ring',
        cx: c,
        cy: c,
        r,
        fill: 'rgba(0,0,0,0.22)',
        stroke: 'rgba(255,255,255,0.5)',
        'stroke-width': 1.5,
      },
      svg,
    );
    for (let tick = 0; tick < 360; tick += 15) {
      const long = tick % 45 === 0;
      const radians = (tick * Math.PI) / 180;
      const inner = r - (long ? 12 : 6);
      svgEl(
        'line',
        {
          x1: c + inner * Math.sin(radians),
          y1: c - inner * Math.cos(radians),
          x2: c + r * Math.sin(radians),
          y2: c - r * Math.cos(radians),
          stroke: '#fff',
          'stroke-width': long ? 2 : 1,
          opacity: long ? 0.85 : 0.5,
        },
        svg,
      );
    }
    for (const [text, x, y] of [
      ['left', c - r - 6, c + 4],
      ['right', c + r + 6, c + 4],
    ] as const) {
      const label = svgEl(
        'text',
        {
          x,
          y,
          'text-anchor': text === 'left' ? 'end' : 'start',
          'font-size': 12,
          'font-weight': 600,
          fill: '#fff',
        },
        svg,
      );
      label.textContent = text;
    }
    const slice = svgEl('path', { fill: 'rgba(255,255,255,0.32)' }, svg);
    const ghost = svgEl('g', { transform: `translate(${c} ${c})` }, svg);
    drawRobot(ghost, 1.15, true);
    const robot = svgEl('g', {}, svg);
    drawRobot(robot, 1.15, false);
    const arm = svgEl('line', { stroke: '#fff', 'stroke-width': 2, opacity: 0.8 }, svg);
    const handle = svgEl(
      'circle',
      { r: 13, fill: '#fff', stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 1.5 },
      svg,
    );
    const readout = htmlEl('p', { class: 'mp-picker-readout' }, root);

    const get = () => Number(this.getValue() ?? 0);
    const refreshAria = makeSlider(
      svg,
      'Turn angle',
      { min: -360, max: 360, step: 5, page: 45 },
      get,
      (value) => set(value),
      (value) =>
        value === 0 ? 'no turn' : `${value > 0 ? 'right' : 'left'} ${Math.abs(value)} degrees`,
    );
    const draw = () => {
      const angle = get();
      const radians = (angle * Math.PI) / 180;
      slice.setAttribute('d', slicePath(c, c, r - 14, angle));
      robot.setAttribute('transform', `translate(${c} ${c}) rotate(${angle})`);
      const hx = c + r * Math.sin(radians);
      const hy = c - r * Math.cos(radians);
      handle.setAttribute('cx', String(hx));
      handle.setAttribute('cy', String(hy));
      arm.setAttribute('x1', String(c));
      arm.setAttribute('y1', String(c));
      arm.setAttribute('x2', String(hx));
      arm.setAttribute('y2', String(hy));
      readout.textContent = angle === 0 ? 'no turn' : `turn ${describeTurn(angle)}`;
      refreshAria();
    };
    const set = (value: number) => {
      this.setValue(clamp(Math.round(value), -360, 360));
      draw();
    };

    // Dragging follows the handle round the dial, past 180° up to a full turn either way. The
    // unrounded angle is kept while dragging, so snapping to 5° steps never adds up.
    let last = 0;
    let running = 0;
    onDrag(svg, (x, y, first) => {
      const raw = bearing(x, y, c, c);
      if (first) {
        // Of raw, raw + 360 and raw - 360, take the one nearest the current angle.
        const current = get();
        const candidates = [raw, raw + 360, raw - 360].filter((a) => Math.abs(a) <= 360);
        running = candidates.reduce((best, a) =>
          Math.abs(a - current) < Math.abs(best - current) ? a : best,
        );
      } else {
        running = clamp(running + wrap180(raw - last), -360, 360);
      }
      last = raw;
      // Snap to 5° steps, which are easy to read and to repeat.
      set(Math.round(running / 5) * 5);
    });

    const presets = htmlEl('div', { class: 'mp-picker-row' }, root);
    for (const [label, value] of [
      ['↶ 90°', -90],
      ['↶ 45°', -45],
      ['↷ 45°', 45],
      ['↷ 90°', 90],
      ['↷ 180°', 180],
    ] as const) {
      button(presets, label, () => set(value), {
        'aria-label': value === 180 ? 'turn around, right 180 degrees' : describeTurn(value),
      });
    }
    const fine = htmlEl('div', { class: 'mp-picker-row' }, root);
    button(fine, '− 5°', () => set(get() - 5), { 'aria-label': '5 degrees more to the left' });
    button(fine, '+ 5°', () => set(get() + 5), { 'aria-label': '5 degrees more to the right' });
    button(fine, 'Done', () => closePicker(this));
    draw();
    openPicker(this, root);
    svg.focus();
  }
}

export class FieldSteering extends PictureNumberField {
  constructor(value: number = 0) {
    super(value, -100, 100, 1);
  }

  static override fromJson(options: Blockly.FieldNumberFromJsonConfig) {
    return new FieldSteering(Number(options.value ?? 0));
  }

  protected describe(value: number): string {
    return describeSteering(value);
  }

  protected override showEditor_(): void {
    const width = 260;
    const height = 200;
    const robotX = width / 2;
    const robotY = 128;
    // The distance between the drawn robot's wheels.
    const trackPx = 31;
    const barY = 182;
    const barHalf = 110;
    const root = htmlEl('div', { class: 'mp-picker mp-steer-picker' });
    htmlEl('p', { class: 'mp-picker-title' }, root, 'Drag left or right to steer');
    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height });
    root.appendChild(svg);
    svgEl(
      'rect',
      {
        class: 'mp-focus-ring',
        x: 1,
        y: 1,
        width: width - 2,
        height: height - 2,
        rx: 12,
        fill: 'rgba(0,0,0,0.22)',
        stroke: 'rgba(255,255,255,0.35)',
      },
      svg,
    );
    const defs = svgEl('defs', {}, svg);
    const marker = svgEl(
      'marker',
      {
        id: 'mp-steer-arrow',
        viewBox: '0 0 10 10',
        refX: 5,
        refY: 5,
        markerWidth: 5,
        markerHeight: 5,
        orient: 'auto-start-reverse',
      },
      defs,
    );
    svgEl('path', { d: 'M0 0 L10 5 L0 10 Z', fill: '#fff' }, marker);
    const path = svgEl(
      'path',
      {
        fill: 'none',
        stroke: '#fff',
        'stroke-width': 4,
        'stroke-linecap': 'round',
        'stroke-dasharray': '1 9',
        'marker-end': 'url(#mp-steer-arrow)',
      },
      svg,
    );
    const robot = svgEl('g', { transform: `translate(${robotX} ${robotY})` }, svg);
    drawRobot(robot, 0.85, false);
    svgEl(
      'line',
      {
        x1: robotX - barHalf,
        y1: barY,
        x2: robotX + barHalf,
        y2: barY,
        stroke: 'rgba(255,255,255,0.6)',
        'stroke-width': 3,
        'stroke-linecap': 'round',
      },
      svg,
    );
    for (const mark of [-100, -50, 0, 50, 100]) {
      svgEl(
        'line',
        {
          x1: robotX + (mark / 100) * barHalf,
          y1: barY - 6,
          x2: robotX + (mark / 100) * barHalf,
          y2: barY + 6,
          stroke: '#fff',
          'stroke-width': mark === 0 ? 2.5 : 1.5,
        },
        svg,
      );
    }
    const knob = svgEl(
      'circle',
      { cy: barY, r: 10, fill: '#fff', stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 1.5 },
      svg,
    );
    const readout = htmlEl('p', { class: 'mp-picker-readout' }, root);
    const get = () => Number(this.getValue() ?? 0);
    const refreshAria = makeSlider(
      svg,
      'Steering',
      { min: -100, max: 100, step: 5, page: 25 },
      get,
      (value) => set(value),
      describeSteering,
    );

    /** The path the middle of the robot drives, about 130 px long. */
    const pathFor = (steering: number): string => {
      const length = 130;
      if (steering === 0) return `M${robotX} ${robotY - 26} V${robotY - 26 - length + 30}`;
      const side = Math.sign(steering);
      if (Math.abs(steering) === 100) {
        // Spinning on the spot: a circle round the robot.
        const rr = 34;
        const end = (side * 300 * Math.PI) / 180;
        const ex = robotX + rr * Math.sin(end);
        const ey = robotY - rr * Math.cos(end);
        return `M${robotX} ${robotY - rr} A${rr} ${rr} 0 1 ${side > 0 ? 1 : 0} ${ex} ${ey}`;
      }
      // Radius of the middle of the robot: half the track × (100 - |s|) / |s| (see the generator).
      const radius = ((trackPx / 2) * (100 - Math.abs(steering))) / Math.abs(steering);
      const sweep = Math.min(length / radius, 1.6 * Math.PI);
      const cx = robotX + side * radius;
      const start = side > 0 ? Math.PI : 0;
      const end = start + side * sweep;
      const sx = cx + radius * Math.cos(start);
      const ex = cx + radius * Math.cos(end);
      const ey = robotY + radius * Math.sin(end);
      const large = sweep > Math.PI ? 1 : 0;
      return `M${sx} ${robotY} A${radius} ${radius} 0 ${large} ${side > 0 ? 1 : 0} ${ex} ${ey}`;
    };
    const draw = () => {
      const steering = get();
      path.setAttribute('d', pathFor(steering));
      knob.setAttribute('cx', String(robotX + (steering / 100) * barHalf));
      readout.textContent = describeSteering(steering);
      refreshAria();
    };
    const set = (value: number) => {
      this.setValue(clamp(Math.round(value), -100, 100));
      draw();
    };
    onDrag(svg, (x) => {
      const steering = ((x - robotX) / barHalf) * 100;
      set(Math.round(steering / 5) * 5);
    });

    const presets = htmlEl('div', { class: 'mp-picker-row' }, root);
    for (const [label, value] of [
      ['spin ↶', -100],
      ['left', -50],
      ['straight', 0],
      ['right', 50],
      ['spin ↷', 100],
    ] as const) {
      button(presets, label, () => set(value), { 'aria-label': describeSteering(value) });
    }
    const fine = htmlEl('div', { class: 'mp-picker-row' }, root);
    button(fine, '← 5', () => set(get() - 5), { 'aria-label': 'steer 5 more to the left' });
    button(fine, '5 →', () => set(get() + 5), { 'aria-label': 'steer 5 more to the right' });
    button(fine, 'Done', () => closePicker(this));
    htmlEl(
      'p',
      { class: 'mp-picker-note' },
      root,
      '0 goes straight · 50 stops the inner wheel · 100 spins on the spot',
    );
    draw();
    openPicker(this, root);
    svg.focus();
  }
}
