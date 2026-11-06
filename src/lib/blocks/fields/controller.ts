/**
 * Pickers for the Controller blocks (ADR 0012) that show the controller, like a controller's
 * settings page: choose the controller, tap a button, or choose what runs the motors. Each says
 * which finger reaches the control, and warns when that finger is already driving the robot.
 */
import * as Blockly from 'blockly/core';
import {
  CONTROLLER_PROFILES,
  DEFAULT_CONTROLLER,
  DRIVE_FINGERS,
  INPUT_OPTIONS,
  buttonFinger,
  controllerProfile,
  inputFingers,
  inputOption,
  type ControllerProfile,
  type Finger,
  type InputOption,
} from '../../controller/layout';
import { XBOX_BUTTONS, type XboxButtonName } from '../../controller/xbox';
import { programBlocksByType } from '../tabs';
import { button, closePicker, htmlEl, openPicker, svgEl } from './common';
import { controllerButton } from './images';
import { PAD_HEIGHT, PAD_WIDTH, drawPad, partKey, type PadPart } from './pad-drawing';

/** The controller the program uses: its "use the controller" block (in any tab), or the default. */
function programController(field: Blockly.Field): ControllerProfile {
  const block = field.getSourceBlock();
  const use = block ? programBlocksByType(block.workspace, 'mp_ctrl_use')[0] : undefined;
  return controllerProfile(use?.getFieldValue('CONTROLLER') as string | undefined);
}

/** Fingers the program's "drive with the controller" blocks, in every tab, keep busy. */
function drivingFingers(field: Blockly.Field): Set<Finger> {
  const block = field.getSourceBlock();
  const busy = new Set<Finger>();
  if (!block || block.isInFlyout) return busy;
  for (const drive of programBlocksByType(block.workspace, 'mp_ctrl_drive')) {
    for (const finger of DRIVE_FINGERS[drive.getFieldValue('STYLE') as string] ?? []) {
      busy.add(finger);
    }
  }
  return busy;
}

function padSvg(width = PAD_WIDTH): SVGSVGElement {
  return svgEl('svg', {
    viewBox: `0 0 ${PAD_WIDTH} ${PAD_HEIGHT}`,
    width,
    height: Math.round((width * PAD_HEIGHT) / PAD_WIDTH),
  });
}

const busyAdvice = (fingers: readonly Finger[], busy: Set<Finger>) => {
  const clash = fingers.filter((finger) => busy.has(finger));
  return clash.length > 0
    ? `Your ${clash.join(' and ')} also ${clash.length > 1 ? 'drive' : 'drives'} the robot, so using both at once is hard. Try a control for another finger.`
    : '';
};

const stickClick = (profile: ControllerProfile, side: 'left' | 'right') =>
  profile.sticks.find((stick) => stick.side === side)?.click ?? null;

const buttonLabel = (name: XboxButtonName) =>
  XBOX_BUTTONS.find((entry) => entry.python === name)?.label ?? name;

// --- Which controller ----------------------------------------------------------------------

/**
 * The controller the program uses. JSON: `{ type: 'field_mp_controller', name, value: 'XBOX' }`.
 */
export class FieldController extends Blockly.FieldDropdown {
  constructor(value: string = DEFAULT_CONTROLLER) {
    super(Object.values(CONTROLLER_PROFILES).map((profile) => [profile.short, profile.id]));
    this.setValue(value);
  }

  static override fromJson(options: Blockly.FieldDropdownFromJsonConfig & Record<string, unknown>) {
    return new FieldController(typeof options.value === 'string' ? options.value : undefined);
  }

  protected override showEditor_(): void {
    const root = htmlEl('div', { class: 'mp-picker mp-pad-picker' });
    htmlEl('p', { class: 'mp-picker-title' }, root, 'Which controller do you use?');
    const cards = htmlEl('div', { class: 'mp-pad-cards' }, root);
    let first: HTMLButtonElement | null = null;
    for (const profile of Object.values(CONTROLLER_PROFILES)) {
      const card = htmlEl(
        'button',
        {
          type: 'button',
          class: 'mp-picker-button mp-pad-card',
          'aria-pressed': String(profile.id === this.getValue()),
        },
        cards,
      );
      const svg = padSvg(280);
      svg.setAttribute('aria-hidden', 'true');
      card.appendChild(svg);
      drawPad(svg, profile, {
        isLit: () => false,
        pickable: () => false,
        dimOff: false,
        label: () => '',
      });
      htmlEl('span', { class: 'mp-pad-card-name' }, card, profile.name);
      card.addEventListener('click', () => {
        this.setValue(profile.id);
        closePicker(this);
      });
      first ??= card;
    }
    const profile = controllerProfile(this.getValue());
    htmlEl('p', { class: 'mp-picker-note' }, root, `To connect: ${profile.pairing}`);
    htmlEl(
      'p',
      { class: 'mp-picker-note' },
      root,
      'Only the Xbox controller connects to a SPIKE Prime hub for now.',
    );
    openPicker(this, root);
    first?.focus({ preventScroll: true });
  }
}

// --- One button ----------------------------------------------------------------------------

/** Buttons a block may check: Menu stops the program, and the Xbox button switches it off. */
export const CHECKABLE_BUTTONS = XBOX_BUTTONS.filter(
  (button) => button.python !== 'MENU' && button.python !== 'GUIDE',
);
const checkable = (name: XboxButtonName | null) =>
  name !== null && CHECKABLE_BUTTONS.some((entry) => entry.python === name);

/**
 * One controller button, picked on the controller. JSON:
 * `{ type: 'field_mp_controller_button', name, value: 'A' }`.
 */
export class FieldControllerButton extends Blockly.FieldDropdown {
  constructor(value: string = 'A') {
    super(
      CHECKABLE_BUTTONS.map((entry) => [controllerButton(entry.python, entry.label), entry.python]),
    );
    this.setValue(value);
  }

  static override fromJson(options: Blockly.FieldDropdownFromJsonConfig & Record<string, unknown>) {
    return new FieldControllerButton(typeof options.value === 'string' ? options.value : 'A');
  }

  protected override showEditor_(): void {
    const profile = programController(this);
    const busy = drivingFingers(this);
    const root = htmlEl('div', { class: 'mp-picker mp-pad-picker' });
    htmlEl('p', { class: 'mp-picker-title' }, root, 'Tap a button on the controller');
    const svg = padSvg();
    root.appendChild(svg);
    const readout = htmlEl('p', { class: 'mp-picker-readout' }, root);
    const finger = htmlEl('p', { class: 'mp-picker-note' }, root);
    const advice = htmlEl('p', { class: 'mp-picker-note mp-pad-advice' }, root);
    const row = htmlEl('div', { class: 'mp-picker-row' }, root);
    button(row, 'Done', () => closePicker(this));

    const buttonOf = (part: PadPart): XboxButtonName | null =>
      part.kind === 'key'
        ? part.button
        : part.kind === 'stick'
          ? stickClick(profile, part.side)
          : null;
    const pad = drawPad(svg, profile, {
      isLit: (part) => buttonOf(part) === this.getValue(),
      pickable: (part) => checkable(buttonOf(part)),
      busy: (part) => {
        const name = buttonOf(part);
        const reach = name ? buttonFinger(profile, name) : null;
        return reach !== null && busy.has(reach) && checkable(name);
      },
      label: (part) => {
        const name = buttonOf(part);
        if (name === 'MENU') return 'Menu: stops the program';
        if (name === null) return part.kind === 'trigger' ? 'Trigger: not a button' : '';
        return buttonLabel(name);
      },
      onPick: (part) => {
        const name = buttonOf(part);
        if (!checkable(name)) return;
        this.setValue(name);
        update();
      },
    });
    const update = () => {
      pad.refresh();
      const name = (this.getValue() as XboxButtonName | null) ?? 'A';
      const reach = buttonFinger(profile, name);
      readout.textContent = buttonLabel(name);
      finger.textContent = reach ? `Press it with your ${reach}.` : '';
      advice.textContent = reach
        ? busyAdvice([reach], busy) ||
          (busy.size > 0 ? 'A dashed ring marks buttons under a finger that drives.' : '')
        : '';
    };
    update();
    htmlEl(
      'p',
      { class: 'mp-picker-note' },
      root,
      'Menu (☰) always stops the program, so it is not offered.',
    );
    openPicker(this, root);
    pad.targets.get(partKey({ kind: 'key', button: 'A' }))?.focus({ preventScroll: true });
  }
}

// --- What runs the motors, or gives a number -----------------------------------------------

export type InputMode = 'drives' | 'number';

function inputOptions(mode: InputMode): readonly InputOption[] {
  return INPUT_OPTIONS.filter((option) => (mode === 'drives' ? option.drives : option.number));
}

/** The input a tap on the controller chooses, if this field offers it. */
function inputForPart(part: PadPart, mode: InputMode, current: string): string | null {
  let value: string | null = null;
  if (part.kind === 'stick') {
    const prefix = part.side === 'left' ? 'LEFT' : 'RIGHT';
    value = current === `${prefix}_Y` ? `${prefix}_X` : `${prefix}_Y`;
  } else if (part.kind === 'trigger') {
    value = mode === 'drives' ? 'TRIGGERS' : part.side === 'left' ? 'LT' : 'RT';
  } else {
    value =
      INPUT_OPTIONS.find(
        (option) =>
          option.input.kind === 'pair' &&
          (option.input.forward === part.button || option.input.backward === part.button),
      )?.value ?? null;
  }
  return value !== null && inputOptions(mode).some((option) => option.value === value)
    ? value
    : null;
}

function describeInput(option: InputOption, mode: InputMode): string {
  const { input } = option;
  switch (input.kind) {
    case 'pair':
      return `Hold ${buttonLabel(input.forward)} for ↻, ${buttonLabel(input.backward)} for ↺. Let go to stop.`;
    case 'axis': {
      const [plus, minus] = input.axis === 'y' ? ['up', 'down'] : ['right', 'left'];
      return mode === 'drives'
        ? `Push the ${input.side} stick ${plus} for ↻, ${minus} for ↺. Further is faster.`
        : `The ${input.side} stick: -100 (${minus}) to 100 (${plus}).`;
    }
    case 'triggers':
      return 'Squeeze RT for ↻, LT for ↺. Further is faster.';
    case 'trigger':
      return `${input.side === 'left' ? 'LT' : 'RT'}: 0 when let go, 100 squeezed.`;
  }
}

/**
 * A control on the controller: what runs motors (`mode: 'drives'`), or a stick or trigger number
 * (`mode: 'number'`). JSON: `{ type: 'field_mp_controller_input', name, value: 'A_B', mode }`.
 */
export class FieldControllerInput extends Blockly.FieldDropdown {
  private readonly mode: InputMode;

  constructor(value: string = 'A_B', mode: InputMode = 'drives') {
    super(inputOptions(mode).map((option) => [option.label, option.value]));
    this.mode = mode;
    this.setValue(value);
  }

  static override fromJson(options: Blockly.FieldDropdownFromJsonConfig & Record<string, unknown>) {
    const mode: InputMode = options.mode === 'number' ? 'number' : 'drives';
    const fallback = mode === 'number' ? 'LEFT_Y' : 'A_B';
    return new FieldControllerInput(
      typeof options.value === 'string' ? options.value : fallback,
      mode,
    );
  }

  protected override showEditor_(): void {
    const profile = programController(this);
    const busy = drivingFingers(this);
    const root = htmlEl('div', { class: 'mp-picker mp-pad-picker' });
    htmlEl(
      'p',
      { class: 'mp-picker-title' },
      root,
      this.mode === 'drives' ? 'What runs the motors?' : 'Which stick or trigger?',
    );
    const layout = htmlEl('div', { class: 'mp-pad-layout' }, root);
    const svg = padSvg();
    layout.appendChild(svg);
    const list = htmlEl('div', { class: 'mp-pad-list', role: 'group' }, layout);
    const readout = htmlEl('p', { class: 'mp-picker-note mp-pad-describe' }, root);
    const advice = htmlEl('p', { class: 'mp-picker-note mp-pad-advice' }, root);
    const row = htmlEl('div', { class: 'mp-picker-row' }, root);
    button(row, 'Done', () => closePicker(this));

    const current = () => inputOption(this.getValue()) ?? inputOptions(this.mode)[0]!;
    const parts = (option: InputOption): Map<string, string> => {
      // The parts the input uses, with the sign drawn beside each.
      const { input } = option;
      const marks = new Map<string, string>();
      if (input.kind === 'pair') {
        marks.set(input.forward, '↻');
        marks.set(input.backward, '↺');
      } else if (input.kind === 'axis') {
        marks.set(`stick:${input.side}`, input.axis === 'y' ? '↕' : '↔');
      } else if (input.kind === 'triggers') {
        marks.set('trigger:right', '↻');
        marks.set('trigger:left', '↺');
      } else {
        marks.set(`trigger:${input.side}`, '');
      }
      return marks;
    };
    const choose = (value: string) => {
      this.setValue(value);
      update();
    };
    const pad = drawPad(svg, profile, {
      isLit: (part) => parts(current()).has(partKey(part)),
      mark: (part) => parts(current()).get(partKey(part)) || null,
      pickable: (part) => inputForPart(part, this.mode, this.getValue() ?? '') !== null,
      busy: (part) => {
        const value = inputForPart(part, this.mode, this.getValue() ?? '');
        const option = value ? inputOption(value) : undefined;
        return option ? inputFingers(profile, option.input).some((f) => busy.has(f)) : false;
      },
      label: (part) => {
        const value = inputForPart(part, this.mode, this.getValue() ?? '');
        return value ? (inputOption(value)?.label ?? '') : 'Not offered here';
      },
      onPick: (part) => {
        const value = inputForPart(part, this.mode, this.getValue() ?? '');
        if (value) choose(value);
      },
    });
    const items = inputOptions(this.mode).map((option) => {
      const item = button(list, option.label, () => choose(option.value), {
        class: 'mp-picker-button mp-pad-item',
      });
      return { option, item };
    });
    const update = () => {
      pad.refresh();
      const option = current();
      for (const { option: each, item } of items) {
        item.setAttribute('aria-pressed', String(each.value === option.value));
      }
      const fingers = inputFingers(profile, option.input);
      readout.textContent = `${describeInput(option, this.mode)} ${
        fingers.length > 0 ? `Your ${fingers.join(' and ')}.` : ''
      }`.trim();
      advice.textContent = busyAdvice(fingers, busy);
    };
    update();
    openPicker(this, root);
    items
      .find(({ option }) => option.value === this.getValue())
      ?.item.focus({ preventScroll: true });
  }
}
