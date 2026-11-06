/**
 * The controller, drawn for the pickers on the Controller blocks (ADR 0012) from the same layout
 * as the page's Controller pane (src/lib/controller/layout.ts). It sits on the block's colour, so
 * it is drawn in white and translucent black, like the hub in ./port.ts.
 */
import type { ControllerProfile } from '../../controller/layout';
import type { XboxButtonName } from '../../controller/xbox';
import { svgEl } from './common';

/** A part of the controller a picker can light up or offer. */
export type PadPart =
  | { readonly kind: 'key'; readonly button: XboxButtonName }
  | { readonly kind: 'stick'; readonly side: 'left' | 'right' }
  | { readonly kind: 'trigger'; readonly side: 'left' | 'right' };

export const partKey = (part: PadPart) =>
  part.kind === 'key' ? part.button : `${part.kind}:${part.side}`;

export interface PadOptions {
  /** Lit (chosen). */
  readonly isLit: (part: PadPart) => boolean;
  /** A small sign beside the part: ↻, ↺, ↕, ↔. */
  readonly mark?: (part: PadPart) => string | null;
  /** Whether a tap does anything. */
  readonly pickable: (part: PadPart) => boolean;
  /** A finger that is already busy: drawn with a dashed ring. */
  readonly busy?: (part: PadPart) => boolean;
  readonly label: (part: PadPart) => string;
  readonly onPick?: (part: PadPart) => void;
  /** Fade parts that cannot be picked (default true); false for a plain picture. */
  readonly dimOff?: boolean;
}

export interface PadDrawing {
  readonly targets: ReadonlyMap<string, SVGGElement>;
  /** Re-applies lit, marks and labels; elements are updated in place, so focus stays. */
  readonly refresh: () => void;
}

const DARK = 'rgba(0,0,0,0.38)';
const LINE = 'rgba(255,255,255,0.8)';
const INK = '#15181c';

export const PAD_WIDTH = 320;
export const PAD_HEIGHT = 186;

/** Draws the controller into `svg` (viewBox 0 0 320 186). */
export function drawPad(
  svg: SVGSVGElement,
  profile: ControllerProfile,
  options: PadOptions,
): PadDrawing {
  svgEl(
    'path',
    { d: profile.body, fill: 'rgba(0,0,0,0.22)', stroke: LINE, 'stroke-width': 1.5 },
    svg,
  );
  const targets = new Map<string, SVGGElement>();
  const updates: (() => void)[] = [];

  const part = (
    target: PadPart,
    draw: (group: SVGGElement) => {
      readonly shape: SVGElement;
      readonly text?: SVGTextElement;
      readonly colour?: string;
      readonly markAt: readonly [number, number];
      readonly hit: readonly [number, number, number, number];
    },
  ) => {
    const pickable = options.pickable(target);
    const group = svgEl(
      'g',
      pickable
        ? { class: 'mp-pad-part', role: 'button', tabindex: 0, 'data-part': partKey(target) }
        : { class: 'mp-pad-part mp-pad-off', 'data-part': partKey(target) },
      svg,
    );
    const { shape, text, colour, markAt, hit } = draw(group);
    const ring = svgEl(
      'rect',
      {
        x: hit[0] - 2,
        y: hit[1] - 2,
        width: hit[2] + 4,
        height: hit[3] + 4,
        rx: 8,
        fill: 'none',
        stroke: '#fff',
        'stroke-width': 1.5,
        'stroke-dasharray': '4 3',
      },
      group,
    );
    const mark = svgEl(
      'text',
      {
        x: markAt[0],
        y: markAt[1],
        'text-anchor': 'middle',
        'font-size': 13,
        'font-weight': 700,
        fill: '#fff',
        class: 'mp-pad-mark',
      },
      group,
    );
    // A bigger invisible target for small fingers.
    svgEl(
      'rect',
      { x: hit[0], y: hit[1], width: hit[2], height: hit[3], fill: 'transparent' },
      group,
    );
    if (pickable && options.onPick) {
      const pick = () => options.onPick?.(target);
      group.addEventListener('click', pick);
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          pick();
        }
      });
    }
    updates.push(() => {
      const lit = options.isLit(target);
      if (colour) {
        shape.setAttribute('fill', lit ? colour : DARK);
        shape.setAttribute('stroke', lit ? '#fff' : colour);
        text?.setAttribute('fill', '#fff');
      } else {
        shape.setAttribute('fill', lit ? '#fff' : DARK);
        shape.setAttribute('stroke', lit ? '#fff' : LINE);
        text?.setAttribute('fill', lit ? INK : '#fff');
      }
      group.setAttribute('opacity', pickable || lit || options.dimOff === false ? '1' : '0.45');
      ring.setAttribute('visibility', options.busy?.(target) ? 'visible' : 'hidden');
      mark.textContent = options.mark?.(target) ?? '';
      group.setAttribute('aria-label', options.label(target));
      if (pickable) group.setAttribute('aria-pressed', String(lit));
    });
    targets.set(partKey(target), group);
  };

  for (const trigger of profile.triggers) {
    part({ kind: 'trigger', side: trigger.side }, (group) => {
      const shape = svgEl(
        'rect',
        { x: trigger.x, y: trigger.y, width: 48, height: 14, rx: 5, 'stroke-width': 1.5 },
        group,
      );
      const text = svgEl(
        'text',
        {
          x: trigger.x + 24,
          y: trigger.y + 11,
          'text-anchor': 'middle',
          'font-size': 10,
          'font-weight': 700,
        },
        group,
      );
      text.textContent = trigger.label;
      return {
        shape,
        text,
        markAt: [trigger.side === 'left' ? trigger.x - 10 : trigger.x + 58, trigger.y + 12],
        hit: [trigger.x - 4, trigger.y - 4, 56, 22],
      };
    });
  }

  for (const stick of profile.sticks) {
    part({ kind: 'stick', side: stick.side }, (group) => {
      svgEl(
        'circle',
        {
          cx: stick.cx,
          cy: stick.cy,
          r: 20,
          fill: 'rgba(0,0,0,0.25)',
          stroke: LINE,
          'stroke-width': 1.2,
        },
        group,
      );
      const shape = svgEl(
        'circle',
        { cx: stick.cx, cy: stick.cy, r: 12, 'stroke-width': 1.5 },
        group,
      );
      return {
        shape,
        markAt: [stick.cx + (stick.side === 'left' ? -31 : 31), stick.cy + 5],
        hit: [stick.cx - 22, stick.cy - 22, 44, 44],
      };
    });
  }

  // Marks for the face buttons and the D-pad go outward from the middle of their cluster.
  const centre = (shape: 'face' | 'dpad') => {
    const keys = profile.keys.filter((key) => key.shape === shape);
    return [
      keys.reduce((sum, key) => sum + key.x, 0) / Math.max(1, keys.length),
      keys.reduce((sum, key) => sum + key.y, 0) / Math.max(1, keys.length),
    ] as const;
  };
  const clusters = { face: centre('face'), dpad: centre('dpad') };
  const outward = (x: number, y: number, shape: 'face' | 'dpad', distance: number) => {
    const [cx, cy] = clusters[shape];
    const length = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / length) * distance, y + ((y - cy) / length) * distance + 4.5] as const;
  };

  for (const key of profile.keys) {
    part({ kind: 'key', button: key.button }, (group) => {
      let shape: SVGElement;
      let hit: [number, number, number, number];
      if (key.shape === 'bumper') {
        shape = svgEl(
          'rect',
          { x: key.x - 26, y: key.y - 7, width: 52, height: 14, rx: 7, 'stroke-width': 1.5 },
          group,
        );
        hit = [key.x - 30, key.y - 10, 60, 20];
      } else if (key.shape === 'dpad') {
        shape = svgEl(
          'rect',
          { x: key.x - 7.5, y: key.y - 7.5, width: 15, height: 15, rx: 3, 'stroke-width': 1.5 },
          group,
        );
        hit = [key.x - 9, key.y - 9, 18, 18];
      } else {
        const r = key.shape === 'face' ? 9.5 : key.button === 'GUIDE' ? 8 : 6.5;
        shape = svgEl(
          'circle',
          { cx: key.x, cy: key.y, r, 'stroke-width': key.colour ? 2.2 : 1.5 },
          group,
        );
        hit = [key.x - r - 3, key.y - r - 3, 2 * r + 6, 2 * r + 6];
      }
      const text = svgEl(
        'text',
        {
          x: key.x,
          y: key.y + (key.shape === 'face' ? 4.3 : 3.6),
          'text-anchor': 'middle',
          'font-size': key.shape === 'face' ? 12 : key.shape === 'round' ? 7.5 : 9.5,
          'font-weight': 700,
        },
        group,
      );
      text.textContent = key.shape === 'round' && key.button === 'VIEW' ? '⧉' : key.text;
      const right = key.x >= 160;
      const markAt: readonly [number, number] =
        key.shape === 'face'
          ? outward(key.x, key.y, 'face', 20)
          : key.shape === 'dpad'
            ? outward(key.x, key.y, 'dpad', 16)
            : [key.x + (key.shape === 'bumper' ? (right ? 36 : -36) : right ? 15 : -15), key.y - 8];
      return { shape, text, colour: key.colour, markAt, hit };
    });
  }

  const refresh = () => updates.forEach((update) => update());
  refresh();
  return { targets, refresh };
}
