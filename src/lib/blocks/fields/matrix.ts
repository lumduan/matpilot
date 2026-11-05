/**
 * A picture for the hub's 5×5 lights: tap or drag over the lights to draw, pick a brightness on
 * the right. The block shows a small copy of the picture. The value is in ./matrix-value.ts.
 */
import * as Blockly from 'blockly/core';
import { button, closePicker, htmlEl, openPicker, svgEl } from './common';
import {
  BLANK_MATRIX,
  isMatrixValue,
  MATRIX_LEVELS,
  MATRIX_SIZE,
  matrixFromLevels,
  matrixLevels,
  SMILE_MATRIX,
} from './matrix-value';

const CELL = 5;
const GAP = 1.5;
const PAD = 4;
const GRID = MATRIX_SIZE * CELL + (MATRIX_SIZE - 1) * GAP;

/** How a lit light looks at a level, for both the block and the picker. */
const lightColour = (level: number) =>
  level === 0
    ? 'rgba(255,255,255,0.13)'
    : `rgba(255,236,150,${0.3 + (0.7 * level) / MATRIX_LEVELS})`;

export class FieldMatrix extends Blockly.Field<string> {
  override SERIALIZABLE = true;
  private cells: SVGRectElement[] = [];

  constructor(value: string = SMILE_MATRIX) {
    super(isMatrixValue(value) ? value : SMILE_MATRIX);
  }

  static override fromJson(options: Blockly.FieldConfig & Record<string, unknown>) {
    return new FieldMatrix(typeof options.value === 'string' ? options.value : SMILE_MATRIX);
  }

  protected override doClassValidation_(newValue?: unknown): string | null {
    return isMatrixValue(newValue) ? newValue : null;
  }

  protected override initView(): void {
    this.createBorderRect_();
    const group = svgEl('g', { class: 'mp-matrix-preview', transform: `translate(${PAD} ${PAD})` });
    this.fieldGroup_?.appendChild(group);
    this.cells = [];
    for (let row = 0; row < MATRIX_SIZE; row += 1) {
      for (let column = 0; column < MATRIX_SIZE; column += 1) {
        this.cells.push(
          svgEl(
            'rect',
            {
              x: column * (CELL + GAP),
              y: row * (CELL + GAP),
              width: CELL,
              height: CELL,
              rx: 1,
            },
            group,
          ),
        );
      }
    }
  }

  override applyColour(): void {
    const block = this.getSourceBlock();
    const border = block instanceof Blockly.BlockSvg ? block.style.colourTertiary : '#000';
    // Inline styles: Blockly's own CSS for field rectangles beats presentation attributes.
    if (this.borderRect_) {
      this.borderRect_.style.fill = '#15181c';
      this.borderRect_.style.stroke = border;
    }
  }

  protected override render_(): void {
    const levels = matrixLevels(this.getValue() ?? BLANK_MATRIX);
    this.cells.forEach((cell, index) => cell.setAttribute('fill', lightColour(levels[index] ?? 0)));
    this.updateSize_();
  }

  protected override updateSize_(): void {
    this.size_ = new Blockly.utils.Size(GRID + PAD * 2, GRID + PAD * 2);
    this.positionBorderRect_();
  }

  protected override getText_(): string {
    const lit = matrixLevels(this.getValue() ?? BLANK_MATRIX).filter((level) => level > 0).length;
    return `picture, ${lit} of 25 lights on`;
  }

  protected override showEditor_(): void {
    const levels = matrixLevels(this.getValue() ?? BLANK_MATRIX);
    let brush = MATRIX_LEVELS;
    const root = htmlEl('div', { class: 'mp-picker mp-matrix-picker' });
    htmlEl('p', { class: 'mp-picker-title' }, root, 'Tap or drag over the lights to draw');
    const body = htmlEl('div', { class: 'mp-matrix' }, root);
    const grid = htmlEl(
      'div',
      { class: 'mp-matrix-grid', role: 'group', 'aria-label': 'Hub lights, 5 by 5' },
      body,
    );
    const cells: HTMLButtonElement[] = [];
    const levelsColumn = htmlEl(
      'div',
      { class: 'mp-matrix-levels', role: 'group', 'aria-label': 'Brightness' },
      body,
    );
    const levelButtons: HTMLButtonElement[] = [];

    const save = () => this.setValue(matrixFromLevels(levels));
    const paintCell = (index: number) => {
      const cell = cells[index];
      if (!cell) return;
      const level = levels[index] ?? 0;
      cell.style.background = lightColour(level);
      cell.setAttribute('aria-pressed', String(level > 0));
      cell.setAttribute(
        'aria-label',
        `row ${Math.floor(index / MATRIX_SIZE) + 1}, column ${(index % MATRIX_SIZE) + 1}, ${level === 0 ? 'off' : `${level * 10} percent`}`,
      );
    };
    const setCell = (index: number, level: number) => {
      levels[index] = level;
      paintCell(index);
    };

    for (let index = 0; index < MATRIX_SIZE * MATRIX_SIZE; index += 1) {
      const cell = htmlEl('button', {
        type: 'button',
        class: 'mp-matrix-cell',
        'data-index': index,
      });
      // Keyboard (Enter or Space) toggles one light; the pointer is handled on the grid below.
      cell.addEventListener('click', (event) => {
        if (event.detail !== 0) return;
        setCell(index, levels[index] === brush ? 0 : brush);
        save();
      });
      grid.appendChild(cell);
      cells.push(cell);
      paintCell(index);
    }

    // Press on a light to switch it on (or off, if it is already at this brightness), then drag
    // to do the same to every light the pointer passes over. One drag is one undo step.
    let paint: number | null = null;
    const cellAt = (event: PointerEvent): number | null => {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const cell = target instanceof HTMLElement ? target.closest('.mp-matrix-cell') : null;
      return cell && grid.contains(cell) ? Number(cell.getAttribute('data-index')) : null;
    };
    grid.addEventListener('pointerdown', (event) => {
      const index = cellAt(event);
      if (index === null || event.button !== 0) return;
      event.preventDefault();
      Blockly.Events.setGroup(true);
      paint = levels[index] === brush ? 0 : brush;
      setCell(index, paint);
      save();
    });
    grid.addEventListener('pointermove', (event) => {
      if (paint === null) return;
      const index = cellAt(event);
      if (index === null || levels[index] === paint) return;
      setCell(index, paint);
      save();
    });
    const stop = () => {
      if (paint === null) return;
      paint = null;
      Blockly.Events.setGroup(false);
    };
    grid.addEventListener('pointerup', stop);
    grid.addEventListener('pointercancel', stop);
    grid.addEventListener('pointerleave', stop);

    const showBrush = () => {
      levelButtons.forEach((levelButton, i) =>
        levelButton.setAttribute('aria-pressed', String(MATRIX_LEVELS - i === brush)),
      );
    };
    for (let level = MATRIX_LEVELS; level >= 1; level -= 1) {
      const levelButton = htmlEl('button', {
        type: 'button',
        class: 'mp-matrix-level',
        'aria-label': `brightness ${level * 10} percent`,
      });
      levelButton.style.background = lightColour(level);
      levelButton.addEventListener('click', () => {
        brush = level;
        showBrush();
      });
      levelsColumn.appendChild(levelButton);
      levelButtons.push(levelButton);
    }
    showBrush();

    const row = htmlEl('div', { class: 'mp-picker-row' }, root);
    button(row, 'Clear', () => {
      levels.fill(0);
      levels.forEach((_, index) => paintCell(index));
      save();
    });
    button(row, 'Fill', () => {
      levels.fill(brush);
      levels.forEach((_, index) => paintCell(index));
      save();
    });
    button(row, 'Done', () => closePicker(this));
    openPicker(this, root);
    cells[0]?.focus();
  }
}
