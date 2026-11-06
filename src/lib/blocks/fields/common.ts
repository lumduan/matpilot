/**
 * Shared parts of the pickers that open from the simple blocks' fields: DOM helpers, the drop-down
 * they open in, pointer dragging, slider keys, and their styles.
 *
 * The pickers are Blockly drop-downs (DropDownDiv) in the block's own colour, with white text,
 * the same in light and dark mode.
 */
import * as Blockly from 'blockly/core';

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attributes = Readonly<Record<string, string | number>>;

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  parent?.appendChild(element);
  return element;
}

export function htmlEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  parent?: Element,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  parent?.appendChild(element);
  return element;
}

export function button(
  parent: Element,
  label: string,
  onClick: () => void,
  attributes: Attributes = {},
): HTMLButtonElement {
  const element = htmlEl('button', { type: 'button', class: 'mp-picker-button', ...attributes });
  element.textContent = label;
  element.addEventListener('click', onClick);
  parent.appendChild(element);
  return element;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The colours of the block the field is on (its parent's, for a shadow block). */
function blockColours(field: Blockly.Field): { primary: string; tertiary: string } {
  let block = field.getSourceBlock();
  if (block?.isShadow()) block = block.getParent() ?? block;
  if (block instanceof Blockly.BlockSvg) {
    return { primary: block.style.colourPrimary, tertiary: block.style.colourTertiary };
  }
  return { primary: '#1d4ed8', tertiary: '#1e3a8a' };
}

/** Opens a picker below the field. Escape closes it, as it does Blockly's own menus. */
export function openPicker(field: Blockly.Field, content: HTMLElement, onHide?: () => void): void {
  content.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closePicker(field);
  });
  Blockly.DropDownDiv.clearContent();
  Blockly.DropDownDiv.getContentDiv().appendChild(content);
  const { primary, tertiary } = blockColours(field);
  Blockly.DropDownDiv.setColour(primary, tertiary);
  const area = blockArea(field);
  // Never taller than the block area: it scrolls inside instead.
  if (area) {
    content.style.maxHeight = `${Math.max(160, Math.floor(area.height - 16))}px`;
    content.style.overflowY = 'auto';
  }
  Blockly.DropDownDiv.showPositionedByField(field, onHide);
  if (area) keepInside(area);
}

/** The block area the drop-down is drawn in (Blockly puts it in the workspace's own div). */
function blockArea(field: Blockly.Field): DOMRect | null {
  const workspace = field.getSourceBlock()?.workspace as Partial<Blockly.WorkspaceSvg> | undefined;
  return workspace?.getInjectionDiv?.()?.getBoundingClientRect() ?? null;
}

/**
 * When a picker fits neither below nor above its block, Blockly puts it at the top of the page.
 * The block area hides anything outside it, so above the block area (under the page's header and
 * tabs) the picker would be cut off. Move it down into the block area.
 */
function keepInside(area: DOMRect): void {
  const div = Blockly.DropDownDiv.getContentDiv().parentElement;
  if (!div) return;
  const rect = div.getBoundingClientRect();
  const shift =
    rect.top < area.top ? area.top - rect.top + 8 : Math.min(0, area.bottom - rect.bottom - 8);
  if (shift !== 0) div.style.top = `${parseFloat(div.style.top || '0') + shift}px`;
}

export function closePicker(field: Blockly.Field): void {
  Blockly.DropDownDiv.hideIfOwner(field, true);
}

/**
 * Calls `onPoint` while the pointer is pressed on the element, with its position in the
 * element's own SVG units. All changes from one press are one undo step.
 */
export function onDrag(
  element: SVGSVGElement,
  onPoint: (x: number, y: number, first: boolean) => void,
): void {
  const toLocal = (event: PointerEvent) => {
    const box = element.getBoundingClientRect();
    const view = element.viewBox.baseVal;
    const scaleX = view && view.width ? view.width / box.width : 1;
    const scaleY = view && view.height ? view.height / box.height : 1;
    return [(event.clientX - box.left) * scaleX, (event.clientY - box.top) * scaleY] as const;
  };
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    element.setPointerCapture(event.pointerId);
    Blockly.Events.setGroup(true);
    const [x, y] = toLocal(event);
    onPoint(x, y, true);
    const move = (next: PointerEvent) => {
      const [nx, ny] = toLocal(next);
      onPoint(nx, ny, false);
    };
    const end = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', end);
      element.removeEventListener('pointercancel', end);
      Blockly.Events.setGroup(false);
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
  });
}

/**
 * The new value of a slider after a key press, or `null` for keys it does not handle.
 * Arrows step, Page Up/Down take big steps, Home/End jump to the ends.
 */
export function sliderKey(
  event: KeyboardEvent,
  value: number,
  options: { min: number; max: number; step: number; page: number },
): number | null {
  const { min, max, step, page } = options;
  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return clamp(value + step, min, max);
    case 'ArrowDown':
    case 'ArrowLeft':
      return clamp(value - step, min, max);
    case 'PageUp':
      return clamp(value + page, min, max);
    case 'PageDown':
      return clamp(value - page, min, max);
    case 'Home':
      return min;
    case 'End':
      return max;
    default:
      return null;
  }
}

/** Makes an SVG act as a slider for the keyboard and screen readers. */
export function makeSlider(
  element: SVGSVGElement,
  label: string,
  options: { min: number; max: number; step: number; page: number },
  get: () => number,
  set: (value: number) => void,
  describe: (value: number) => string,
): () => void {
  element.setAttribute('role', 'slider');
  element.setAttribute('tabindex', '0');
  element.setAttribute('aria-label', label);
  element.setAttribute('aria-valuemin', String(options.min));
  element.setAttribute('aria-valuemax', String(options.max));
  element.addEventListener('keydown', (event) => {
    const next = sliderKey(event, get(), options);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    set(next);
  });
  return () => {
    const value = get();
    element.setAttribute('aria-valuenow', String(value));
    element.setAttribute('aria-valuetext', describe(value));
  };
}

const CSS = `
/* Blockly limits drop-downs to 300 px high; the pictures need more. */
.blocklyDropDownDiv .blocklyDropDownContent:has(> .mp-picker) {
  max-height: calc(100vh - 24px);
  overflow: auto;
}
.mp-picker {
  color: #fff;
  font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 2px 4px;
  max-width: min(94vw, 560px);
  user-select: none;
  -webkit-user-select: none;
}
.mp-picker-title { font-weight: 650; text-align: center; margin: 0 0 6px; }
.mp-picker-note { font-size: 12px; text-align: center; margin: 6px 0 0; opacity: 0.92; }
.mp-picker-readout { font-size: 19px; font-weight: 700; text-align: center; margin: 2px 0 0; }
.mp-picker svg {
  display: block; margin: 0 auto; max-width: 100%; height: auto;
  touch-action: none; overflow: visible;
}
.mp-port-caption { paint-order: stroke; stroke: rgba(0, 0, 0, 0.45); stroke-width: 3px; }
.mp-picker svg:focus { outline: none; }
.mp-picker svg:focus-visible .mp-focus-ring { stroke: #fff; stroke-width: 3; }
.mp-picker-row {
  display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 8px;
}
.mp-picker-button {
  font: inherit; color: #fff; cursor: pointer;
  min-width: 36px; min-height: 32px; padding: 2px 10px;
  background: rgba(0, 0, 0, 0.24); border: 1.5px solid rgba(255, 255, 255, 0.6);
  border-radius: 999px;
}
.mp-picker-button:hover { background: rgba(0, 0, 0, 0.36); }
.mp-picker-button[aria-pressed="true"] { background: #fff; color: #15181c; border-color: #fff; }
.mp-picker :focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
.mp-port { cursor: pointer; }
.mp-port:focus { outline: none; }
.mp-port:focus-visible .mp-port-tab { stroke: #fff; stroke-width: 3.5; }
.mp-pad-part { cursor: pointer; }
.mp-pad-part.mp-pad-off { cursor: default; }
.mp-pad-part:focus { outline: none; }
.mp-pad-part:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
.mp-pad-layout {
  display: flex; flex-wrap: wrap; gap: 8px 12px; justify-content: center; align-items: center;
}
.mp-pad-layout > svg { flex: 0 1 320px; margin: 0; }
.mp-pad-list {
  display: flex; flex-direction: column; gap: 4px; flex: 1 1 150px; max-width: 220px;
}
.mp-pad-item { text-align: left; border-radius: 10px; min-height: 28px; }
@media (max-width: 30rem) {
  .mp-pad-list {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
    flex-basis: 100%; max-width: none;
  }
  .mp-pad-item { font-size: 12px; min-height: 26px; padding: 2px 8px; }
}
.mp-pad-describe { font-size: 13px; font-weight: 600; }
.mp-pad-advice { font-weight: 700; }
.mp-pad-advice:empty { display: none; }
.mp-pad-cards { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.mp-pad-card {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  border-radius: 14px; padding: 8px 10px;
}
.mp-pad-card[aria-pressed="true"] { background: rgba(0, 0, 0, 0.3); color: #fff; border-color: #fff; }
.mp-pad-card-name { font-weight: 700; }
.mp-matrix { display: flex; gap: 12px; justify-content: center; align-items: stretch; }
.mp-matrix-grid {
  display: grid; grid-template-columns: repeat(5, 36px); grid-auto-rows: 36px; gap: 6px;
  padding: 9px; border-radius: 12px; background: rgba(0, 0, 0, 0.42); touch-action: none;
}
.mp-matrix-cell { border: 0; padding: 0; border-radius: 7px; cursor: pointer; }
.mp-matrix-levels {
  display: flex; flex-direction: column; gap: 3px; padding: 4px; width: 34px;
  border-radius: 10px; background: rgba(0, 0, 0, 0.3);
}
.mp-matrix-level {
  flex: 1; min-height: 14px; border: 2px solid transparent; border-radius: 4px; padding: 0;
  cursor: pointer;
}
.mp-matrix-level[aria-pressed="true"] { border-color: #fff; box-shadow: 0 0 0 2px rgba(0,0,0,0.5); }
`;

let cssRegistered = false;

/** Registers the pickers' styles; Blockly adds them to the page when the editor starts. */
export function registerPickerCss(): void {
  if (cssRegistered) return;
  cssRegistered = true;
  Blockly.Css.register(CSS);
}
