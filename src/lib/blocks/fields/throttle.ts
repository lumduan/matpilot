/**
 * A percentage from 0 to 100, set with a lever like a throttle: push it up for more.
 * A FieldNumber underneath (see ./turn.ts for why).
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

export class FieldThrottle extends Blockly.FieldNumber {
  constructor(value: number = 50) {
    super(value, 0, 100, 1);
  }

  static override fromJson(options: Blockly.FieldNumberFromJsonConfig) {
    return new FieldThrottle(Number(options.value ?? 50));
  }

  protected override getText_(): string {
    return `${Number(this.getValue() ?? 0)} %`;
  }

  override repositionForWindowResize(): boolean {
    return false;
  }

  protected override showEditor_(): void {
    const width = 170;
    const height = 220;
    const top = 18;
    const bottom = 198;
    const span = bottom - top;
    const trackX = 96;
    const root = htmlEl('div', { class: 'mp-picker mp-throttle-picker' });
    htmlEl('p', { class: 'mp-picker-title' }, root, 'Push the lever up for more');
    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height });
    root.appendChild(svg);
    svgEl(
      'rect',
      {
        class: 'mp-focus-ring',
        x: trackX - 13,
        y: top - 6,
        width: 26,
        height: span + 12,
        rx: 13,
        fill: 'rgba(0,0,0,0.35)',
        stroke: 'rgba(255,255,255,0.4)',
      },
      svg,
    );
    const fill = svgEl(
      'rect',
      { x: trackX - 8, width: 16, rx: 8, fill: '#fff', opacity: 0.85 },
      svg,
    );
    for (let mark = 0; mark <= 100; mark += 10) {
      const y = bottom - (mark / 100) * span;
      const major = mark % 50 === 0;
      svgEl(
        'line',
        {
          x1: trackX - 24 - (major ? 8 : 0),
          y1: y,
          x2: trackX - 18,
          y2: y,
          stroke: '#fff',
          'stroke-width': major ? 2 : 1.2,
          opacity: 0.85,
        },
        svg,
      );
      if (mark % 25 === 0 || mark === 100) {
        const label = svgEl(
          'text',
          {
            x: trackX - 38,
            y: y + 4,
            'text-anchor': 'end',
            'font-size': 11.5,
            fill: '#fff',
          },
          svg,
        );
        label.textContent = String(mark);
      }
    }
    // The lever's handle: a wide grip that is easy to catch.
    const handle = svgEl('g', {}, svg);
    svgEl(
      'rect',
      {
        x: trackX - 30,
        y: -11,
        width: 60,
        height: 22,
        rx: 7,
        fill: '#fff',
        stroke: 'rgba(0,0,0,0.4)',
        'stroke-width': 1.5,
      },
      handle,
    );
    for (const dy of [-4, 0, 4]) {
      svgEl(
        'line',
        {
          x1: trackX - 16,
          y1: dy,
          x2: trackX + 16,
          y2: dy,
          stroke: '#15181c',
          'stroke-width': 1.5,
          opacity: 0.45,
        },
        handle,
      );
    }
    const value = svgEl(
      'text',
      { x: trackX + 40, 'font-size': 18, 'font-weight': 700, fill: '#fff' },
      svg,
    );
    const get = () => Number(this.getValue() ?? 0);
    const refreshAria = makeSlider(
      svg,
      'Percent',
      { min: 0, max: 100, step: 5, page: 25 },
      get,
      (next) => set(next),
      (current) => `${current} percent`,
    );
    const draw = () => {
      const percent = get();
      const y = bottom - (percent / 100) * span;
      fill.setAttribute('y', String(y));
      fill.setAttribute('height', String(bottom - y));
      handle.setAttribute('transform', `translate(0 ${y})`);
      value.setAttribute('y', String(y + 6));
      value.textContent = `${percent} %`;
      refreshAria();
    };
    const set = (next: number) => {
      this.setValue(clamp(Math.round(next), 0, 100));
      draw();
    };
    onDrag(svg, (_x, y) => set(Math.round(((bottom - y) / span) * 20) * 5));

    const row = htmlEl('div', { class: 'mp-picker-row' }, root);
    for (const preset of [25, 50, 75, 100]) {
      button(row, `${preset} %`, () => set(preset));
    }
    const fine = htmlEl('div', { class: 'mp-picker-row' }, root);
    button(fine, '− 5', () => set(get() - 5), { 'aria-label': '5 percent less' });
    button(fine, '+ 5', () => set(get() + 5), { 'aria-label': '5 percent more' });
    button(fine, 'Done', () => closePicker(this));
    draw();
    openPicker(this, root);
    svg.focus();
  }
}
