/**
 * Turns the Python of one tab back into blocks (ADR 0014): each statement and expression is
 * matched against the Python a block generates (./../generator.ts, ./../simple-generator.ts,
 * ./../controller-generator.ts, ./../functions.ts, ./../shared.ts), and becomes that block. Python
 * that no block makes is a problem, marked where it is; the caller then changes nothing.
 *
 * When two blocks make the same Python (a simple and a detailed one, or "rotations" and
 * "degrees"), the reader takes the kind the replaced blocks used, else the first it lists.
 */
import type { SyntaxNode } from '@lezer/common';
import * as Blockly from 'blockly/core';
import { INPUT_OPTIONS, inputOption } from '../../controller/layout';
import { RUMBLES } from '../controller-definitions';
import { inputCode } from '../controller-generator';
import { cleanPlotLabel } from '../definitions';
import { formatMotorSet, type MotorChoice } from '../fields/port';
import { MATRIX_LEVELS, MATRIX_SIZE, matrixFromLevels } from '../fields/matrix-value';
import { FUNCTION_BLOCKS } from '../functions';
import { ROBOT, formatNumber } from '../generator-context';
import { DEVICES, type DeviceType, type PortName } from '../pybricks';
import { SHARED_BLOCKS } from '../shared';
import { NOTE_OPTIONS } from '../simple-definitions';
import { COLOR_VALUE_BLOCK, MAX_CASES, MIN_CASES, SWITCH_BLOCK, SWITCH_VALUE } from '../switch';
import { shadowFor, type BlockState } from './shadows';
import { Source, asCall, parts, statements, unwrap, type PythonProblem } from './syntax';

export const NO_BLOCK = 'There is no block for this yet.';
const COLOR_NAMES = 'The colour sensor blocks know Color.RED, YELLOW, GREEN, BLUE, WHITE and NONE.';

/** What one value input holds: a shadow (the toolbox's default), a block over it, or both. */
export interface InputState {
  block?: BlockState;
  shadow?: BlockState;
}

/** A function a call may name: its define block's id, and its inputs' ids. */
export interface FunctionRef {
  readonly id: string;
  readonly name: string;
  readonly inputs: readonly { readonly id: string; readonly name: string }[];
}

export interface ReaderContext {
  readonly source: Source;
  /** Devices set up in main, by Python name. */
  readonly devices: ReadonlyMap<string, { readonly id: string; readonly type: DeviceType }>;
  /** The tab's own variables, by Python name. */
  readonly variables: ReadonlyMap<string, string>;
  /** Shared variables, by Python name (also read as `setup.name`). */
  readonly shared: ReadonlyMap<string, string>;
  /** Functions this tab's text defines, by name. */
  readonly ownFunctions: ReadonlyMap<string, FunctionRef>;
  /** Other tabs' functions this tab may call as `tab.name()`, by tab name, then name. */
  readonly otherFunctions: ReadonlyMap<string, ReadonlyMap<string, FunctionRef>>;
  /** Functions of the main tab, which other tabs cannot use. */
  readonly mainFunctions: ReadonlySet<string>;
  /** Whether a variable may not take this name: Python's, the program's own, tabs, functions. */
  readonly isReserved: (name: string) => boolean;
  /** Names the text sets somewhere (`x = ...`), so reading them is fine. */
  readonly assigned: ReadonlySet<string>;
  /** `type` and `type|FIELD=value,...` of the blocks being replaced. */
  readonly signatures: ReadonlySet<string>;
  /** The `#` comments of the editable parts, in order: each goes to a block's comment. */
  readonly comments: readonly SyntaxNode[];
}

type Span = { readonly from: number; readonly to: number };

/** The last block inside a block's last statement input (a loop's last line), or the block. */
function lastInside(block: BlockState): BlockState {
  const inputs = Object.entries((block.inputs ?? {}) as Record<string, { block?: BlockState }>);
  const statementInputs = inputs.filter(([name]) => /^(DO\d*|ELSE)$/.test(name));
  let last = statementInputs[statementInputs.length - 1]?.[1].block;
  if (!last) return block;
  while (last.next?.block) last = last.next.block;
  return lastInside(last);
}

/** Adds lines to a block's comment (the bubble on the block, which Python shows as `#`). */
export function addComment(block: BlockState, lines: readonly string[], before = false): void {
  if (lines.length === 0) return;
  const icons = (block.icons ?? {}) as Record<string, { text?: string } | undefined>;
  const old = icons.comment?.text;
  const all = before ? [...lines, ...(old ? [old] : [])] : [...(old ? [old] : []), ...lines];
  block.icons = {
    ...icons,
    comment: { text: all.join('\n'), pinned: false, height: 80, width: 220 },
  };
}

const SIMPLE_DEVICE = /^(motor|colour_sensor|distance_sensor|touch_sensor)_([a-f])$/;
const SPEED_NAME = /^motor_([a-f])_speed$/;
const SIMPLE_KIND = {
  motor: 'Motor',
  colour_sensor: 'ColorSensor',
  distance_sensor: 'UltrasonicSensor',
  touch_sensor: 'ForceSensor',
} as const;

const COMPARE: Record<string, string> = {
  '==': 'EQ',
  '!=': 'NEQ',
  '<': 'LT',
  '<=': 'LTE',
  '>': 'GT',
  '>=': 'GTE',
};
const ARITHMETIC: Record<string, string> = {
  '+': 'ADD',
  '-': 'MINUS',
  '*': 'MULTIPLY',
  '/': 'DIVIDE',
  '**': 'POWER',
};
const DRIVE_STYLES: Record<string, string> = {
  'one stick': 'ONE_STICK',
  tank: 'TANK',
  racing: 'RACING',
};
/** Blocks that make no Python of their own (they become Config), kept as they were. */
export const SILENT_BLOCKS: ReadonlySet<string> = new Set([
  'mp_ctrl_use',
  'mp_move_motors',
  'mp_move_wheels',
]);

let scratch: Blockly.Workspace | null = null;
const optionCache = new Map<string, readonly string[]>();

/** The values a dropdown field offers, read from a block of that type. */
export function fieldOptions(type: string, field: string): readonly string[] {
  const key = `${type}.${field}`;
  const known = optionCache.get(key);
  if (known) return known;
  scratch ??= new Blockly.Workspace();
  const block = scratch.newBlock(type);
  const found = block.getField(field);
  const values =
    found instanceof Blockly.FieldDropdown
      ? found.getOptions(false).map((option) => String(option[1]))
      : [];
  block.dispose(false);
  optionCache.set(key, values);
  return values;
}

/** Whether a shadow's field keeps `value` as it is (fields with a range clamp what they get). */
function keepsValue(type: string, field: string, value: number): boolean {
  scratch ??= new Blockly.Workspace();
  const block = scratch.newBlock(type);
  try {
    block.setFieldValue(String(value), field);
    return Number(block.getFieldValue(field)) === value;
  } catch {
    return false;
  } finally {
    block.dispose(false);
  }
}

/** The number field of each shadow type that holds a number. */
const NUMBER_SHADOWS: Record<string, string> = {
  math_number: 'NUM',
  mp_turn_angle: 'ANGLE',
  mp_percent: 'PERCENT',
  mp_steering: 'STEERING',
};

/** The signature of a block state, to compare with the replaced blocks'. */
export function signatureOf(state: BlockState): string {
  const fields = Object.entries(state.fields ?? {})
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .map(([name, value]) => `${name}=${String(value)}`)
    .sort();
  return `${state.type}|${fields.join(',')}`;
}

export function newId(): string {
  return Blockly.utils.idGenerator.genUid();
}

/** A statement list as Blockly's nested `next` chain. */
export function chain(blocks: readonly BlockState[]): BlockState | undefined {
  return blocks.reduceRight<BlockState | undefined>(
    (next, block) => (next ? { ...block, next: { block: next } } : block),
    undefined,
  );
}

const statementInput = (blocks: readonly BlockState[]) => {
  const first = chain(blocks);
  return first ? { block: first } : undefined;
};

/** The calls statements may make, to suggest one when a name is mistyped. */
const KNOWN_CALLS = [
  'print',
  'wait',
  `${ROBOT.robot}.straight`,
  `${ROBOT.robot}.turn`,
  `${ROBOT.robot}.drive`,
  `${ROBOT.robot}.brake`,
  'drive_with_steering',
  'set_movement_speed',
  'hub.light.on',
  'hub.light.off',
  'hub.display.icon',
  'hub.display.number',
  'hub.display.text',
  'hub.display.off',
  'hub.display.pixel',
  'hub.speaker.beep',
  'hub.speaker.volume',
  'timer.reset',
  'drive_with_controller',
  'controller_rumble',
];
const MOTOR_METHODS = [
  'run',
  'run_angle',
  'run_target',
  'run_time',
  'dc',
  'stop',
  'brake',
  'hold',
  'reset_angle',
];

/** Letters to change, add or take away to get from one word to the other. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}

/** The known name a mistyped one most likely meant (at most two letters off), if any. */
export function closest(wanted: string, known: readonly string[]): string | null {
  let best: string | null = null;
  let bestDistance = 3;
  for (const name of known) {
    const d = distance(wanted.toLowerCase(), name.toLowerCase());
    if (d > 0 && d < bestDistance) {
      best = name;
      bestDistance = d;
    }
  }
  return best;
}

const withGuess = (message: string, wanted: string, known: readonly string[]) => {
  const guess = closest(wanted, known);
  return guess ? `${message} Did you mean .${guess}()?` : message;
};

export class Reader {
  readonly problems: PythonProblem[] = [];
  /** Variables the text sets that the tab did not have: Python name to new id. */
  readonly newVariables = new Map<string, string>();
  /** The inputs of the function being read, by name. */
  private inputs: ReadonlyMap<string, string> | null = null;
  private loops = 0;
  private readonly src: Source;
  private readonly comments: { readonly node: SyntaxNode; readonly text: string; used: boolean }[];
  /** Comments of the last body read that none of its blocks took: the caller's block takes them. */
  orphans: string[] = [];

  constructor(private readonly ctx: ReaderContext) {
    this.src = ctx.source;
    this.comments = ctx.comments.map((node) => ({
      node,
      text: ctx.source.of(node).replace(/^#\s?/, '').trimEnd(),
      used: false,
    }));
  }

  /** The comments from `from` to `to` that no block has taken yet; they are taken now. */
  private take(from: number, to: number): { readonly node: SyntaxNode; readonly text: string }[] {
    const found = this.comments.filter(
      (comment) => !comment.used && comment.node.from >= from && comment.node.from < to,
    );
    for (const comment of found) comment.used = true;
    return found;
  }

  /** Whether `to` is on the line where the code before `from` ends (spaces after it skipped). */
  private sameLine(from: number, to: number): boolean {
    const end = this.src.text.slice(0, from).trimEnd().length;
    return !this.src.text.slice(end, to).includes('\n');
  }

  /** How far a line is indented, at `position`. */
  private indent(position: number): number {
    return position - (this.src.text.lastIndexOf('\n', position - 1) + 1);
  }

  /**
   * Gives each block the comments around its statement: those on the lines before it, those at
   * the end of its line, and those inside it that no inner block took. Comments after the last
   * statement go to the last block, or, when there is none, to `orphans`.
   */
  placeComments(
    nodes: readonly SyntaxNode[],
    blocks: readonly (BlockState | undefined)[],
    span: Span | null,
  ): void {
    let carry: string[] = [];
    let previous: BlockState | undefined;
    let previousNode: SyntaxNode | undefined;
    let previousEnd = span?.from ?? nodes[0]?.from ?? 0;
    // Comments after the previous statement: on its line, or indented under it (the end of a
    // loop), go to it; the others wait for the next block.
    const settle = (found: readonly { node: SyntaxNode; text: string }[]) => {
      const rest: string[] = [];
      for (const comment of found) {
        if (previous && this.sameLine(previousEnd, comment.node.from)) {
          addComment(previous, [comment.text]);
        } else if (
          previous &&
          previousNode &&
          this.indent(comment.node.from) > this.indent(previousNode.from)
        ) {
          addComment(lastInside(previous), [comment.text]);
        } else {
          rest.push(comment.text);
        }
      }
      return rest;
    };
    for (const [index, node] of nodes.entries()) {
      carry.push(...settle(this.take(previousEnd, node.from)));
      const block = blocks[index];
      const inside = this.take(node.from, node.to).map((comment) => comment.text);
      if (block) {
        addComment(block, carry, true);
        addComment(block, inside);
        carry = [];
        if (block !== previous) {
          previous = block;
          previousNode = node;
        }
      } else {
        carry.push(...inside);
      }
      previousEnd = node.to;
    }
    const after = [...carry, ...settle(span ? this.take(previousEnd, span.to) : [])];
    if (previous) {
      addComment(previous, after);
      this.orphans = [];
    } else {
      this.orphans = after;
    }
  }

  fail(node: SyntaxNode, message: string = NO_BLOCK): null {
    const problem = { from: node.from, to: Math.max(node.to, node.from + 1), message };
    const known = this.problems.some(
      (each) => each.from === problem.from && each.to === problem.to && each.message === message,
    );
    if (!known) this.problems.push(problem);
    return null;
  }

  /** Picks among blocks that make the same Python: the kind the replaced blocks used. */
  private choose(candidates: readonly BlockState[]): BlockState {
    return (
      candidates.find((each) => this.ctx.signatures.has(signatureOf(each))) ??
      candidates.find((each) => this.ctx.signatures.has(each.type)) ??
      candidates[0]!
    );
  }

  // --- Values --------------------------------------------------------------------------------

  /** The value for a block's input: a literal fills the toolbox's shadow, else a block over it. */
  input(node: SyntaxNode, type: string, name: string): InputState | null {
    const shadow = shadowFor(type, name);
    const literal = this.src.number(node);
    if (shadow && literal !== null) {
      const field = NUMBER_SHADOWS[shadow.type];
      if (field && keepsValue(shadow.type, field, literal)) {
        return { shadow: { ...shadow, fields: { ...shadow.fields, [field]: literal } } };
      }
    }
    const text = this.src.string(node);
    if (shadow?.type === 'text' && text !== null) {
      return { shadow: { type: 'text', fields: { TEXT: text } } };
    }
    const block = this.value(node);
    if (!block) return null;
    return shadow ? { shadow, block } : { block };
  }

  /** A value block for an expression. */
  value(node: SyntaxNode): BlockState | null {
    const src = this.src;
    const inner = unwrap(node);
    const number = src.number(inner);
    if (number !== null) return { type: 'math_number', fields: { NUM: number } };
    switch (inner.name) {
      case 'String': {
        const text = src.string(inner);
        return text === null
          ? this.fail(inner, 'Blocks only hold plain text in quotes here.')
          : { type: 'text', fields: { TEXT: text } };
      }
      case 'Boolean':
        return {
          type: 'logic_boolean',
          fields: { BOOL: src.of(inner) === 'True' ? 'TRUE' : 'FALSE' },
        };
      case 'VariableName':
        return this.name(inner);
      case 'MemberExpression':
        return this.member(inner);
      case 'CallExpression':
        return this.callValue(inner);
      case 'BinaryExpression':
        return this.binary(inner);
      case 'UnaryExpression':
        return this.unary(inner);
      default:
        return this.fail(inner);
    }
  }

  private name(node: SyntaxNode): BlockState | null {
    const name = this.src.of(node);
    const input = this.inputs?.get(name);
    if (input) return { type: FUNCTION_BLOCKS.input, extraState: { input, name } };
    const shared = this.ctx.shared.get(name);
    if (shared) return { type: SHARED_BLOCKS.get, fields: { VAR: { id: shared } } };
    const variable = this.variable(node, false);
    return variable ? { type: 'variables_get', fields: { VAR: { id: variable } } } : null;
  }

  /** The id of the tab's variable with this Python name; a new one if the text sets it. */
  private variable(node: SyntaxNode, setting: boolean): string | null {
    const name = this.src.of(node);
    const known = this.ctx.variables.get(name) ?? this.newVariables.get(name);
    if (known) return known;
    if (this.ctx.devices.has(name)) {
      return this.fail(node, `“${name}” is a device. Blocks use it, but cannot change it.`);
    }
    if (this.ctx.isReserved(name) || SIMPLE_DEVICE.test(name) || SPEED_NAME.test(name)) {
      return this.fail(
        node,
        setting
          ? `“${name}” is a name the program uses itself. Choose another name.`
          : `Blocks cannot use “${name}” on its own here.`,
      );
    }
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      return this.fail(node, 'A variable name starts with a letter, then letters, numbers or _.');
    }
    if (!setting && !this.ctx.assigned.has(name)) {
      return this.fail(
        node,
        `There is no variable called “${name}”. Set it first, for example ${name} = 0.`,
      );
    }
    const id = newId();
    this.newVariables.set(name, id);
    return id;
  }

  /** A shared variable written `name` or `setup.name`. */
  private sharedTarget(node: SyntaxNode): string | null {
    const path = this.src.dotted(node);
    if (!path) return null;
    const name =
      path.length === 2 && path[0] === 'setup' ? path[1]! : path.length === 1 ? path[0]! : null;
    return name ? (this.ctx.shared.get(name) ?? null) : null;
  }

  /** The port of a motor speed written `motor_a_speed` or `setup.motor_a_speed`. */
  private speedPort(node: SyntaxNode): PortName | null {
    const path = this.src.dotted(node);
    if (!path) return null;
    const name =
      path.length === 2 && path[0] === 'setup' ? path[1]! : path.length === 1 ? path[0]! : '';
    const match = SPEED_NAME.exec(name);
    return match ? (match[1]!.toUpperCase() as PortName) : null;
  }

  private member(node: SyntaxNode): BlockState | null {
    const shared = this.sharedTarget(node);
    if (shared) return { type: SHARED_BLOCKS.get, fields: { VAR: { id: shared } } };
    // A colour the colour sensor knows: Color.RED
    if (this.src.dotted(node)?.[0] === 'Color') {
      const color = this.enumValue(node, 'Color', COLOR_VALUE_BLOCK, 'COLOR');
      return color
        ? { type: COLOR_VALUE_BLOCK, fields: { COLOR: color } }
        : this.fail(node, COLOR_NAMES);
    }
    // hub.imu.tilt()[0]
    const [object, index, extra] = parts(node);
    if (object && index && !extra && index.name !== 'PropertyName') {
      const call = asCall(this.src, object);
      const axis = this.src.number(index);
      if (
        call &&
        this.src.dotted(call.callee)?.join('.') === 'hub.imu.tilt' &&
        call.args.positional.length === 0 &&
        (axis === 0 || axis === 1)
      ) {
        return { type: 'mp_hub_tilt', fields: { AXIS: String(axis) } };
      }
    }
    return this.fail(node);
  }

  /** `name` from `Name.X` if X is one of the field's options. */
  private enumValue(node: SyntaxNode | undefined, prefix: string, type: string, field: string) {
    if (!node) return null;
    const path = this.src.dotted(node);
    if (!path || path.length !== 2 || path[0] !== prefix) return null;
    return fieldOptions(type, field).includes(path[1]!) ? path[1]! : null;
  }

  /** A device of the simple blocks: `motor_a` and the like. */
  private simpleDevice(
    name: string,
  ): { kind: (typeof SIMPLE_KIND)[keyof typeof SIMPLE_KIND]; port: PortName } | null {
    const match = SIMPLE_DEVICE.exec(name);
    if (!match) return null;
    return {
      kind: SIMPLE_KIND[match[1] as keyof typeof SIMPLE_KIND],
      port: match[2]!.toUpperCase() as PortName,
    };
  }

  private callValue(node: SyntaxNode): BlockState | null {
    const src = this.src;
    const call = asCall(src, node)!;
    const { positional: args, keywords, unsupported } = call.args;
    if (unsupported || keywords.size > 0) return this.fail(node);
    const callee = unwrap(call.callee);
    // ''.join([str(x) for x in [a, b, c]]): "join text" with three items or more.
    if (callee.name === 'MemberExpression') {
      const [object, property] = parts(callee);
      if (
        object &&
        property &&
        src.string(object) === '' &&
        src.of(property) === 'join' &&
        args.length === 1
      ) {
        const items = this.joinItems(args[0]!);
        if (items) return this.textJoin(items, true);
      }
    }
    const path = src.dotted(callee);
    if (!path) return this.fail(node);
    const dotted = path.join('.');
    const one = (type: string, input: string, field?: Record<string, string>) => {
      if (args.length !== 1) return this.fail(node);
      const value = this.input(args[0]!, type, input);
      return value
        ? { type, ...(field ? { fields: field } : {}), inputs: { [input]: value } }
        : null;
    };
    switch (dotted) {
      case 'str':
        return args.length === 1 ? this.textJoin([args[0]!], false) : this.fail(node);
      case 'round':
        return one('math_round', 'NUM', { OP: 'ROUND' });
      case 'math.ceil':
        return one('math_round', 'NUM', { OP: 'ROUNDUP' });
      case 'math.floor':
        return one('math_round', 'NUM', { OP: 'ROUNDDOWN' });
      case 'random.randint': {
        if (args.length !== 2) return this.fail(node);
        const from = this.input(args[0]!, 'math_random_int', 'FROM');
        const to = this.input(args[1]!, 'math_random_int', 'TO');
        return from && to ? { type: 'math_random_int', inputs: { FROM: from, TO: to } } : null;
      }
      case 'timer.time':
        return args.length === 0 ? { type: 'mp_timer' } : this.fail(node);
      case 'controller_pressed':
      case 'controller_just_pressed': {
        const button = args[args.length - 1];
        const name = this.enumValue(button, 'Button', 'mp_ctrl_pressed', 'BUTTON');
        const slotOk =
          dotted === 'controller_pressed'
            ? args.length === 1
            : args.length === 2 && src.number(args[0]!) !== null;
        if (!name || !slotOk) return this.fail(node);
        return {
          type: dotted === 'controller_pressed' ? 'mp_ctrl_pressed' : 'mp_ctrl_clicked',
          fields: { BUTTON: name },
        };
      }
      case 'controller_value': {
        const option = this.controllerValue(node);
        return option ? { type: 'mp_ctrl_value', fields: { VALUE: option } } : this.fail(node);
      }
      default:
        break;
    }
    if (path.length === 2 && args.length === 0) {
      const [device, method] = path as [string, string];
      const simple = this.simpleDevice(device);
      if (simple) {
        const type = (
          {
            'Motor.angle': 'mp_motor_position',
            'ColorSensor.color': 'mp_sensor_color',
            'ColorSensor.reflection': 'mp_sensor_reflection',
            'UltrasonicSensor.distance': 'mp_sensor_distance',
            'ForceSensor.pressed': 'mp_sensor_pressed',
            'ForceSensor.force': 'mp_sensor_force',
          } as Record<string, string>
        )[`${simple.kind}.${method}`];
        return type ? { type, fields: { PORT: simple.port } } : this.fail(node);
      }
      const known = this.ctx.devices.get(device);
      if (known) {
        const type = (
          {
            'Motor.angle': 'mp_motor_angle',
            'Motor.speed': 'mp_motor_speed',
            'ColorSensor.reflection': 'mp_color_reflection',
            'ColorSensor.ambient': 'mp_color_ambient',
            'UltrasonicSensor.distance': 'mp_ultrasonic_distance',
            'ForceSensor.force': 'mp_force_force',
            'ForceSensor.pressed': 'mp_force_pressed',
            'ForceSensor.touched': 'mp_force_touched',
          } as Record<string, string>
        )[`${known.type}.${method}`];
        const field = known.type === 'Motor' ? 'MOTOR' : 'SENSOR';
        return type
          ? { type, fields: { [field]: { id: known.id } } }
          : this.fail(node, `A ${DEVICES[known.type].label} has no block for .${method}().`);
      }
    }
    if (this.ctx.ownFunctions.has(path[0]!) || this.ctx.otherFunctions.has(path[0]!)) {
      return this.fail(node, 'A function block does not give back a value, so it cannot go here.');
    }
    return this.fail(node);
  }

  /** The controller value option whose Python this is. */
  private controllerValue(node: SyntaxNode): string | null {
    const text = this.src.compact(node);
    for (const value of fieldOptions('mp_ctrl_value', 'VALUE')) {
      const option = inputOption(value);
      if (
        option &&
        option.input.kind !== 'pair' &&
        inputCode(option.input).replace(/\s+/g, '') === text
      ) {
        return value;
      }
    }
    return null;
  }

  /** The items of `[str(x) for x in [a, b, c]]`. */
  private joinItems(node: SyntaxNode): SyntaxNode[] | null {
    const inner = unwrap(node);
    if (inner.name !== 'ArrayComprehensionExpression') return null;
    const children = parts(inner);
    const [element, forWord, name, inWord, list, extra] = children;
    if (!element || !forWord || !name || !inWord || !list || extra) return null;
    if (forWord.name !== 'for' || inWord.name !== 'in' || list.name !== 'ArrayExpression')
      return null;
    const variable = this.src.of(name);
    if (this.src.compact(element) !== `str(${variable})`) return null;
    return parts(list);
  }

  /** "join text" with the items (`str(x)` inside "+" or str() is read as the item x). */
  private textJoin(items: readonly SyntaxNode[], raw: boolean): BlockState | null {
    const inputs: Record<string, InputState> = {};
    for (const [index, item] of items.entries()) {
      let node = unwrap(item);
      if (!raw) {
        const call = asCall(this.src, node);
        if (
          call &&
          this.src.dotted(call.callee)?.join('.') === 'str' &&
          call.args.positional.length === 1
        ) {
          node = call.args.positional[0]!;
        }
      }
      const block = this.value(node);
      if (!block) return null;
      inputs[`ADD${index}`] = { block };
    }
    return { type: 'text_join', extraState: { itemCount: items.length }, inputs };
  }

  /** The items of a chain of `+` if each is text in quotes or str(...); else `null`. */
  private textItems(node: SyntaxNode): SyntaxNode[] | null {
    const inner = unwrap(node);
    if (inner.name === 'BinaryExpression') {
      const [left, op, right] = parts(inner);
      if (left && op && right && this.src.of(op) === '+') {
        const before = this.textItems(left);
        const after = this.textItems(right);
        return before && after ? [...before, ...after] : null;
      }
    }
    if (inner.name === 'String') return [inner];
    const call = asCall(this.src, inner);
    if (
      call &&
      this.src.dotted(call.callee)?.join('.') === 'str' &&
      call.args.positional.length === 1
    ) {
      return [inner];
    }
    return null;
  }

  private binary(node: SyntaxNode): BlockState | null {
    const src = this.src;
    const [left, op, right, extra] = parts(node);
    if (!left || !op || !right || extra) return this.fail(node);
    const operator = src.of(op).replace(/\s+/g, ' ');
    if (op.name === 'CompareOp' || operator === '==' || operator === '!=') {
      const leftInner = unwrap(left);
      if (
        leftInner.name === 'BinaryExpression' &&
        parts(leftInner)[1]?.name === 'CompareOp' &&
        left === leftInner
      ) {
        return this.fail(node, 'Compare two things at a time, for example (0 < x) and (x < 10).');
      }
      const special = this.comparison(node, left, operator, right);
      if (special !== undefined) return special;
      const a = this.input(left, 'logic_compare', 'A');
      const b = this.input(right, 'logic_compare', 'B');
      const code = COMPARE[operator];
      return a && b && code
        ? { type: 'logic_compare', fields: { OP: code }, inputs: { A: a, B: b } }
        : code
          ? null
          : this.fail(op);
    }
    if (operator === 'in') {
      // Button.LEFT in hub.buttons.pressed()
      const button = this.enumValue(left, 'Button', 'mp_hub_button', 'BUTTON');
      const call = asCall(src, right);
      if (
        button &&
        call &&
        src.dotted(call.callee)?.join('.') === 'hub.buttons.pressed' &&
        call.args.positional.length === 0
      ) {
        return { type: 'mp_hub_button', fields: { BUTTON: button } };
      }
      return this.fail(node);
    }
    if (operator === 'and' || operator === 'or') {
      const a = this.input(left, 'logic_operation', 'A');
      const b = this.input(right, 'logic_operation', 'B');
      return a && b
        ? {
            type: 'logic_operation',
            fields: { OP: operator === 'and' ? 'AND' : 'OR' },
            inputs: { A: a, B: b },
          }
        : null;
    }
    if (operator === '+') {
      const items = this.textItems(node);
      if (items && items.length >= 2) return this.textJoin(items, false);
    }
    if (operator === '%') {
      const a = this.input(left, 'math_modulo', 'DIVIDEND');
      const b = this.input(right, 'math_modulo', 'DIVISOR');
      return a && b ? { type: 'math_modulo', inputs: { DIVIDEND: a, DIVISOR: b } } : null;
    }
    const code = ARITHMETIC[operator];
    if (!code) return this.fail(op, NO_BLOCK);
    // The controller's "triggers": controller_value(5) - controller_value(4).
    if (operator === '-') {
      const option = this.controllerValue(node);
      if (option) return { type: 'mp_ctrl_value', fields: { VALUE: option } };
    }
    const a = this.input(left, 'math_arithmetic', 'A');
    const b = this.input(right, 'math_arithmetic', 'B');
    return a && b
      ? { type: 'math_arithmetic', fields: { OP: code }, inputs: { A: a, B: b } }
      : null;
  }

  /** Comparisons that are sensor blocks; `undefined` when it is a plain comparison. */
  private comparison(
    node: SyntaxNode,
    left: SyntaxNode,
    operator: string,
    right: SyntaxNode,
  ): BlockState | null | undefined {
    const call = asCall(this.src, left);
    const path = call && call.args.positional.length === 0 ? this.src.dotted(call.callee) : null;
    if (!path || path.length !== 2) return undefined;
    const [device, method] = path as [string, string];
    const simple = this.simpleDevice(device);
    const known = this.ctx.devices.get(device);
    if (operator === '==' && method === 'color') {
      if (simple?.kind === 'ColorSensor') {
        const color = this.enumValue(right, 'Color', 'mp_sensor_color_is', 'COLOR');
        return color
          ? { type: 'mp_sensor_color_is', fields: { PORT: simple.port, COLOR: color } }
          : this.fail(right, COLOR_NAMES);
      }
      if (known?.type === 'ColorSensor') {
        const color = this.enumValue(right, 'Color', 'mp_color_sees', 'COLOR');
        return color
          ? { type: 'mp_color_sees', fields: { SENSOR: { id: known.id }, COLOR: color } }
          : this.fail(right, COLOR_NAMES);
      }
      return undefined;
    }
    if (operator === '<' && method === 'distance' && simple?.kind === 'UltrasonicSensor') {
      const distance = this.input(right, 'mp_sensor_closer', 'DISTANCE');
      const b = this.input(right, 'logic_compare', 'B');
      if (!distance || !b) return null;
      return this.choose([
        { type: 'mp_sensor_closer', fields: { PORT: simple.port }, inputs: { DISTANCE: distance } },
        {
          type: 'logic_compare',
          fields: { OP: 'LT' },
          inputs: {
            A: { block: { type: 'mp_sensor_distance', fields: { PORT: simple.port } } },
            B: b,
          },
        },
      ]);
    }
    return undefined;
  }

  private unary(node: SyntaxNode): BlockState | null {
    const [op, operand] = parts(node);
    if (!op || !operand) return this.fail(node);
    const operator = this.src.of(op);
    if (operator === 'not') {
      const value = this.input(operand, 'logic_negate', 'BOOL');
      return value ? { type: 'logic_negate', inputs: { BOOL: value } } : null;
    }
    if (operator === '+') return this.value(operand);
    if (operator === '-') {
      // -x is 0 - x in blocks.
      const b = this.input(operand, 'math_arithmetic', 'B');
      const zero = shadowFor('math_arithmetic', 'A');
      return b
        ? {
            type: 'math_arithmetic',
            fields: { OP: 'MINUS' },
            inputs: {
              A: zero
                ? { shadow: { ...zero, fields: { NUM: 0 } } }
                : { block: { type: 'math_number', fields: { NUM: 0 } } },
              B: b,
            },
          }
        : null;
    }
    return this.fail(node);
  }

  // --- Numbers the generator scaled or negated -------------------------------------------------

  /** `-x` (or a negative number): the sign and what is left. */
  private sign(node: SyntaxNode): { negative: boolean; node: SyntaxNode; literal: number | null } {
    const inner = unwrap(node);
    if (inner.name === 'UnaryExpression') {
      const [op, operand] = parts(inner);
      if (op && operand && this.src.of(op) === '-') {
        return { negative: true, node: unwrap(operand), literal: this.src.number(operand) };
      }
    }
    return { negative: false, node: inner, literal: this.src.number(inner) };
  }

  /**
   * The input whose value the generator multiplied by `factor` (seconds to ms, rotations to
   * degrees): a number divided back, or `x * factor` read as x. `null` when it is neither.
   */
  private unscaled(
    node: SyntaxNode,
    factor: number,
    type: string,
    input: string,
  ): InputState | null | undefined {
    const literal = this.src.number(node);
    if (literal !== null) {
      const value = Number(formatNumber(literal / factor));
      if (formatNumber(value * factor) !== formatNumber(literal)) return undefined;
      const shadow = shadowFor(type, input);
      const field = shadow ? NUMBER_SHADOWS[shadow.type] : undefined;
      if (shadow && field && keepsValue(shadow.type, field, value)) {
        return { shadow: { ...shadow, fields: { ...shadow.fields, [field]: value } } };
      }
      return {
        ...(shadow ? { shadow } : {}),
        block: { type: 'math_number', fields: { NUM: value } },
      };
    }
    const inner = unwrap(node);
    if (inner.name !== 'BinaryExpression') return undefined;
    const [left, op, right] = parts(inner);
    if (!left || !op || !right || this.src.of(op) !== '*' || this.src.number(right) !== factor)
      return undefined;
    return this.input(left, type, input);
  }

  // --- Statements --------------------------------------------------------------------------------

  /**
   * Reads statements into a chain; a problem in one does not stop the others being read. The
   * comments in `span` go to the blocks (see placeComments).
   */
  body(nodes: readonly SyntaxNode[], span: Span | null = null): BlockState[] {
    const out: BlockState[] = [];
    // One entry per statement read: the statements it used (as one node range) and its block.
    const ranges: SyntaxNode[] = [];
    const firsts: (BlockState | undefined)[] = [];
    let i = 0;
    while (i < nodes.length) {
      const result = this.statement(nodes, i);
      out.push(...result.blocks);
      ranges.push(nodes[i]!);
      firsts.push(result.blocks[0]);
      // A block made from several statements takes the comments between them too.
      for (let extra = 1; extra < result.used; extra += 1) {
        ranges.push(nodes[i + extra]!);
        firsts.push(result.blocks[0]);
      }
      i += result.used;
    }
    this.placeComments(ranges, firsts, span);
    return out;
  }

  /** The statements of a Body node, `pass` alone being none, with the comments in it. */
  bodyOf(body: SyntaxNode | null | undefined): BlockState[] {
    if (!body) return [];
    const nodes = statements(body).filter((node) => node.name !== 'PassStatement');
    return this.body(nodes, { from: body.from, to: body.to });
  }

  /** bodyOf, and the comments it could not give to a block (the caller's block takes them). */
  private bodyAndOrphans(body: SyntaxNode | null | undefined): {
    blocks: BlockState[];
    orphans: string[];
  } {
    const blocks = this.bodyOf(body);
    const orphans = this.orphans;
    this.orphans = [];
    return { blocks, orphans };
  }

  private statement(
    nodes: readonly SyntaxNode[],
    i: number,
  ): { blocks: BlockState[]; used: number } {
    const node = nodes[i]!;
    const sequence = this.sequence(nodes, i);
    if (sequence) return sequence;
    const one = (block: BlockState | null) => ({ blocks: block ? [block] : [], used: 1 });
    switch (node.name) {
      case 'PassStatement':
        return { blocks: [], used: 1 };
      case 'ExpressionStatement':
        return one(this.callStatement(node, parts(node)[0]!));
      case 'AssignStatement':
        return one(this.assign(node));
      case 'UpdateStatement':
        return one(this.update(node));
      case 'IfStatement':
        return one(this.ifStatement(node));
      case 'ForStatement':
        return one(this.forStatement(node));
      case 'WhileStatement':
        return one(this.whileStatement(node));
      case 'BreakStatement':
      case 'ContinueStatement':
        if (this.loops === 0) {
          return one(this.fail(node, `“${this.src.of(node)}” only works inside a loop.`));
        }
        return one({
          type: 'controls_flow_statements',
          fields: { FLOW: node.name === 'BreakStatement' ? 'BREAK' : 'CONTINUE' },
        });
      case 'RaiseStatement':
        return one(
          this.src.compact(node) === 'raiseSystemExit'
            ? { type: 'mp_stop_program' }
            : this.fail(node),
        );
      case 'FunctionDefinition':
        return one(this.fail(node, 'Functions go in the “Functions” part, above Main.'));
      case 'ReturnStatement':
        return one(
          this.fail(
            node,
            'Function blocks do not give back a value, so there is no block for return.',
          ),
        );
      case 'ScopeStatement':
        return one(this.fail(node, 'Blocks write “global” themselves where it is needed.'));
      default:
        return one(this.fail(node));
    }
  }

  /** Python that several statements make for one block. */
  private sequence(
    nodes: readonly SyntaxNode[],
    i: number,
  ): { blocks: BlockState[]; used: number } | null {
    const src = this.src;
    const callAt = (index: number) => {
      const node = nodes[index];
      if (node?.name !== 'ExpressionStatement') return null;
      const call = asCall(src, parts(node)[0]!);
      const path = call ? src.dotted(call.callee) : null;
      return call && path ? { ...call, path: path.join('.') } : null;
    };
    const first = callAt(i);
    const second = callAt(i + 1);
    const third = callAt(i + 2);
    // move for seconds: robot.drive(robot.settings()[0], 0); wait(ms); robot.brake()
    if (first?.path === 'robot.drive' && second?.path === 'wait' && third?.path === 'robot.brake') {
      const direction = this.driveDirection(first.args.positional);
      const amount =
        direction && second.args.positional.length === 1
          ? this.unscaled(second.args.positional[0]!, 1000, 'mp_move', 'AMOUNT')
          : undefined;
      if (direction && amount) {
        return {
          blocks: [
            {
              type: 'mp_move',
              fields: { DIRECTION: direction, UNIT: 'SECONDS' },
              inputs: { AMOUNT: amount },
            },
          ],
          used: 3,
        };
      }
    }
    // show picture for seconds: hub.display.icon([...]); wait(ms); hub.display.off()
    if (
      first?.path === 'hub.display.icon' &&
      second?.path === 'wait' &&
      third?.path === 'hub.display.off'
    ) {
      const picture =
        first.args.positional.length === 1 ? this.picture(first.args.positional[0]!, false) : null;
      const seconds =
        picture && second.args.positional.length === 1
          ? this.unscaled(second.args.positional[0]!, 1000, 'mp_light_show_for', 'SECONDS')
          : undefined;
      if (picture && seconds) {
        return {
          blocks: [
            {
              type: 'mp_light_show_for',
              fields: { PICTURE: picture },
              inputs: { SECONDS: seconds },
            },
          ],
          used: 3,
        };
      }
    }
    // A controller block for several motors: controller_power = ...; then one line per motor.
    const assign = nodes[i];
    // switch on: switch_value = ...; then if switch_value == ...: ... elif ...
    if (assign?.name === 'AssignStatement') {
      const [target, op, value, extra] = parts(assign);
      if (target && op && value && !extra && src.of(target) === SWITCH_VALUE) {
        const next = nodes[i + 1];
        const block = next?.name === 'IfStatement' ? this.switchBlock(value, next) : undefined;
        if (block !== undefined) return { blocks: block ? [block] : [], used: 2 };
        this.fail(
          assign,
          `${SWITCH_VALUE} is set by the “switch on” block, just before its if … elif.`,
        );
        return { blocks: [], used: 1 };
      }
    }
    if (assign?.name === 'AssignStatement') {
      const [target, op, value, extra] = parts(assign);
      if (target && op && value && !extra && src.of(target) === 'controller_power') {
        const source = this.controllerSource(value);
        const motors: MotorChoice[] = [];
        let index = i + 1;
        for (
          let line = callAt(index);
          line?.path === 'run_motor_with_controller';
          line = callAt(index)
        ) {
          const choice = this.controllerMotor(line.args.positional, true);
          if (!choice || choice.power !== null) break;
          motors.push(choice.motor);
          index += 1;
        }
        if (source && motors.length >= 2) {
          return {
            blocks: [
              { type: 'mp_ctrl_motor', fields: { SOURCE: source, MOTORS: formatMotorSet(motors) } },
            ],
            used: index - i,
          };
        }
        this.fail(
          assign,
          'controller_power is set by the “… runs motors” block for several motors.',
        );
        return { blocks: [], used: 1 };
      }
    }
    return null;
  }

  /** FORWARD or BACKWARD from `robot.drive(robot.settings()[0], 0)` (or `-robot...`). */
  private driveDirection(args: readonly SyntaxNode[]): string | null {
    if (args.length !== 2 || this.src.number(args[1]!) !== 0) return null;
    const speed = this.src.compact(args[0]!);
    if (speed === `${ROBOT.robot}.settings()[0]`) return 'FORWARD';
    if (speed === `-${ROBOT.robot}.settings()[0]`) return 'BACKWARD';
    return null;
  }

  /** The 5×5 picture of `hub.display.icon([[...], ...])`, as the picture field's value. */
  private picture(node: SyntaxNode, report = true): string | null {
    const fail = (at: SyntaxNode, message: string) => (report ? this.fail(at, message) : null);
    const inner = unwrap(node);
    const rows = inner.name === 'ArrayExpression' ? parts(inner) : [];
    if (rows.length !== MATRIX_SIZE) return fail(node, 'A picture is 5 rows of 5 lights.');
    const levels: number[] = [];
    for (const row of rows) {
      const cells = row.name === 'ArrayExpression' ? parts(row) : [];
      if (cells.length !== MATRIX_SIZE) return fail(row, 'Each row of a picture has 5 lights.');
      for (const cell of cells) {
        const value = this.src.number(cell);
        if (value === null || value < 0 || value > 100 || value % 10 !== 0) {
          return fail(cell, 'Each light is a number from 0 to 100, in steps of 10.');
        }
        levels.push(value / (100 / MATRIX_LEVELS));
      }
    }
    return matrixFromLevels(levels);
  }

  /** The controller input whose Python is `node` (for "... runs motors"). */
  private controllerSource(node: SyntaxNode): string | null {
    const text = this.src.compact(node);
    for (const option of INPUT_OPTIONS) {
      if (
        fieldOptions('mp_ctrl_motor', 'SOURCE').includes(option.value) &&
        inputCode(option.input).replace(/\s+/g, '') === text
      ) {
        return option.value;
      }
    }
    return null;
  }

  /** One `run_motor_with_controller(slot, motor_c, motor_c_speed, power)` line. */
  private controllerMotor(
    args: readonly SyntaxNode[],
    shared: boolean,
  ): { motor: MotorChoice; power: SyntaxNode | null } | null {
    if (args.length !== 4 || this.src.number(args[0]!) === null) return null;
    const device = this.simpleDevice(this.src.of(args[1]!));
    const port = this.speedPort(args[2]!);
    if (!device || device.kind !== 'Motor' || port !== device.port) return null;
    const power = this.src.compact(args[3]!);
    if (shared) {
      if (power === 'controller_power') return { motor: { port, reverse: false }, power: null };
      if (power === '-controller_power') return { motor: { port, reverse: true }, power: null };
      return null;
    }
    const signed = this.sign(args[3]!);
    return { motor: { port, reverse: signed.negative }, power: signed.node };
  }

  private callStatement(statement: SyntaxNode, expression: SyntaxNode): BlockState | null {
    const src = this.src;
    const call = asCall(src, expression);
    if (!call) {
      return this.fail(
        statement,
        'This line does nothing on its own. Blocks are actions, like print(...) or robot.turn(90).',
      );
    }
    const { positional: args, keywords, unsupported } = call.args;
    if (unsupported) return this.fail(unsupported);
    const path = src.dotted(call.callee);
    if (!path) return this.fail(expression);
    const dotted = path.join('.');
    const noKeywords = () => keywords.size === 0;
    const count = (n: number) => args.length === n && noKeywords();
    const input = (index: number, type: string, name: string) =>
      this.input(args[index]!, type, name);

    switch (dotted) {
      case 'print': {
        if (!noKeywords()) return this.fail(expression);
        if (args.length === 0)
          return {
            type: 'mp_print',
            inputs: { VALUE: { shadow: { type: 'text', fields: { TEXT: '' } } } },
          };
        if (args.length === 1) {
          const value = input(0, 'mp_print', 'VALUE');
          return value ? { type: 'mp_print', inputs: { VALUE: value } } : null;
        }
        const label = args.length === 2 ? src.string(args[0]!) : null;
        if (label !== null && label.endsWith(':')) {
          const name = label.slice(0, -1);
          if (cleanPlotLabel(name) !== name) {
            return this.fail(
              args[0]!,
              'A plot name uses letters, numbers and _ (no spaces, commas, : or =).',
            );
          }
          const value = input(1, 'mp_plot', 'VALUE');
          return value
            ? { type: 'mp_plot', fields: { LABEL: name }, inputs: { VALUE: value } }
            : null;
        }
        return this.fail(
          expression,
          'Blocks print one value, or plot a name and a value: print("speed:", x).',
        );
      }
      case 'wait': {
        if (!count(1)) return this.fail(expression);
        const seconds = this.unscaled(args[0]!, 1000, 'mp_wait_seconds', 'SECONDS');
        const time = input(0, 'mp_wait', 'TIME');
        if (seconds === null || !time) return null;
        return this.choose([
          ...(seconds ? [{ type: 'mp_wait_seconds', inputs: { SECONDS: seconds } }] : []),
          { type: 'mp_wait', inputs: { TIME: time } },
        ]);
      }
      case `${ROBOT.robot}.straight`: {
        if (!count(1)) return this.fail(expression);
        const rotations = this.rotations(args[0]!);
        const amount = this.sign(rotations ?? args[0]!);
        const value = this.input(amount.node, 'mp_move', 'AMOUNT');
        if (!value) return null;
        const unit = rotations ? 'ROTATIONS' : 'MM';
        const candidates: BlockState[] = [
          {
            type: 'mp_move',
            fields: { DIRECTION: amount.negative ? 'BACKWARD' : 'FORWARD', UNIT: unit },
            inputs: { AMOUNT: value },
          },
        ];
        if (amount.negative && amount.literal !== null) {
          const forward = this.input(rotations ?? args[0]!, 'mp_move', 'AMOUNT');
          if (forward)
            candidates.push({
              type: 'mp_move',
              fields: { DIRECTION: 'FORWARD', UNIT: unit },
              inputs: { AMOUNT: forward },
            });
        }
        return this.choose(candidates);
      }
      case `${ROBOT.robot}.turn`: {
        if (!count(1)) return this.fail(expression);
        const angle = input(0, 'mp_move_turn', 'ANGLE');
        return angle ? { type: 'mp_move_turn', inputs: { ANGLE: angle } } : null;
      }
      case `${ROBOT.robot}.drive`: {
        const direction = noKeywords() ? this.driveDirection(args) : null;
        return direction
          ? { type: 'mp_move_start', fields: { DIRECTION: direction } }
          : this.fail(expression);
      }
      case `${ROBOT.robot}.brake`:
        return count(0) ? { type: 'mp_move_stop' } : this.fail(expression);
      case 'drive_with_steering': {
        if (!count(1)) return this.fail(expression);
        const steering = input(0, 'mp_move_start_steering', 'STEERING');
        return steering ? { type: 'mp_move_start_steering', inputs: { STEERING: steering } } : null;
      }
      case 'set_movement_speed': {
        if (!count(1)) return this.fail(expression);
        const speed = input(0, 'mp_move_speed', 'SPEED');
        return speed ? { type: 'mp_move_speed', inputs: { SPEED: speed } } : null;
      }
      case 'hub.light.on': {
        const color = count(1)
          ? this.enumValue(args[0], 'Color', 'mp_light_button', 'COLOR')
          : null;
        if (!color)
          return this.fail(
            expression,
            'The hub light takes a colour, for example hub.light.on(Color.GREEN).',
          );
        return this.choose([
          { type: 'mp_light_button', fields: { COLOR: color } },
          { type: 'mp_hub_light_on', fields: { COLOR: color } },
        ]);
      }
      case 'hub.light.off':
        return count(0)
          ? this.choose([{ type: 'mp_light_button_off' }, { type: 'mp_hub_light_off' }])
          : this.fail(expression);
      case 'hub.display.icon': {
        if (!count(1)) return this.fail(expression);
        const icon = this.enumValue(args[0], 'Icon', 'mp_hub_display_icon', 'ICON');
        if (icon) return { type: 'mp_hub_display_icon', fields: { ICON: icon } };
        const picture = this.picture(args[0]!);
        return picture ? { type: 'mp_light_show', fields: { PICTURE: picture } } : null;
      }
      case 'hub.display.number': {
        if (!count(1)) return this.fail(expression);
        const number = input(0, 'mp_hub_display_number', 'NUMBER');
        return number ? { type: 'mp_hub_display_number', inputs: { NUMBER: number } } : null;
      }
      case 'hub.display.text': {
        if (!count(1)) return this.fail(expression);
        const simple = this.displayText(args[0]!, 'mp_light_write');
        const detailed = this.displayText(args[0]!, 'mp_hub_display_text');
        return simple && detailed
          ? this.choose([
              { type: 'mp_light_write', inputs: { TEXT: simple } },
              { type: 'mp_hub_display_text', inputs: { TEXT: detailed } },
            ])
          : null;
      }
      case 'hub.display.off':
        return count(0)
          ? this.choose([{ type: 'mp_light_off' }, { type: 'mp_hub_display_off' }])
          : this.fail(expression);
      case 'hub.display.pixel': {
        if (!count(3)) return this.fail(expression);
        const row = src.number(args[0]!);
        const column = src.number(args[1]!);
        const inRange = (value: number | null) =>
          value !== null && Number.isInteger(value) && value >= 0 && value < MATRIX_SIZE;
        if (!inRange(row)) return this.fail(args[0]!, 'The row is a number from 0 (top) to 4.');
        if (!inRange(column))
          return this.fail(args[1]!, 'The column is a number from 0 (left) to 4.');
        const brightness = input(2, 'mp_light_pixel', 'BRIGHTNESS');
        return brightness
          ? {
              type: 'mp_light_pixel',
              fields: { ROW: String(row! + 1), COLUMN: String(column! + 1) },
              inputs: { BRIGHTNESS: brightness },
            }
          : null;
      }
      case 'hub.speaker.beep': {
        if (count(0)) return { type: 'mp_sound_beep' };
        if (!count(2)) return this.fail(expression);
        const frequency = src.number(args[0]!);
        const note =
          frequency !== null && NOTE_OPTIONS.some((option) => option[1] === String(frequency));
        const seconds = note
          ? this.unscaled(args[1]!, 1000, 'mp_sound_note', 'SECONDS')
          : undefined;
        const freq = input(0, 'mp_hub_beep', 'FREQUENCY');
        const duration = input(1, 'mp_hub_beep', 'DURATION');
        if (seconds === null || !freq || !duration) return null;
        return this.choose([
          ...(seconds
            ? [
                {
                  type: 'mp_sound_note',
                  fields: { NOTE: String(frequency) },
                  inputs: { SECONDS: seconds },
                },
              ]
            : []),
          { type: 'mp_hub_beep', inputs: { FREQUENCY: freq, DURATION: duration } },
        ]);
      }
      case 'hub.speaker.volume': {
        if (!count(1)) return this.fail(expression);
        const volume = input(0, 'mp_sound_volume', 'VOLUME');
        return volume ? { type: 'mp_sound_volume', inputs: { VOLUME: volume } } : null;
      }
      case 'timer.reset':
        return count(0) ? { type: 'mp_timer_reset' } : this.fail(expression);
      case 'drive_with_controller': {
        const style = count(1) ? src.string(args[0]!) : null;
        const value = style === null ? undefined : DRIVE_STYLES[style];
        return value
          ? { type: 'mp_ctrl_drive', fields: { STYLE: value } }
          : this.fail(expression, 'Drive with "one stick", "tank" or "racing".');
      }
      case 'controller_rumble': {
        const duration = count(2) ? src.number(args[0]!) : null;
        const times = count(2) ? src.number(args[1]!) : null;
        const kind = Object.entries(RUMBLES).find(
          ([, rumble]) => rumble.duration === duration && rumble.count === times,
        )?.[0];
        return kind
          ? { type: 'mp_ctrl_rumble', fields: { KIND: kind } }
          : this.fail(
              expression,
              'The rumble block shakes short (150, 1), long (500, 1) or twice (150, 2).',
            );
      }
      case 'run_motor_with_controller': {
        const line = noKeywords() ? this.controllerMotor(args, false) : null;
        const source = line?.power ? this.controllerSource(line.power) : null;
        return line && source
          ? {
              type: 'mp_ctrl_motor',
              fields: { SOURCE: source, MOTORS: formatMotorSet([line.motor]) },
            }
          : this.fail(expression);
      }
      default:
        break;
    }
    if (path.length === 2) {
      const motor = this.motorStatement(expression, path[0]!, path[1]!, args, keywords);
      if (motor !== undefined) return motor;
    }
    return this.functionCall(expression, path, args, keywords);
  }

  /** `x * math.pi * WHEEL_DIAMETER_MM`: the x, or `null`. */
  private rotations(node: SyntaxNode): SyntaxNode | null {
    const outer = unwrap(node);
    if (outer.name !== 'BinaryExpression') return null;
    const [left, op, right] = parts(outer);
    if (
      !left ||
      !op ||
      !right ||
      this.src.of(op) !== '*' ||
      this.src.of(right) !== ROBOT.wheelDiameter
    )
      return null;
    const inner = unwrap(left);
    if (inner.name !== 'BinaryExpression') return null;
    const [amount, op2, pi] = parts(inner);
    if (!amount || !op2 || !pi || this.src.of(op2) !== '*' || this.src.compact(pi) !== 'math.pi')
      return null;
    return amount;
  }

  /** The text input of "write" blocks: `str(x)` is x; text in quotes stays text. */
  private displayText(node: SyntaxNode, type: string): InputState | null {
    const call = asCall(this.src, node);
    if (
      call &&
      this.src.dotted(call.callee)?.join('.') === 'str' &&
      call.args.positional.length === 1
    ) {
      const inner = call.args.positional[0]!;
      const shadow = shadowFor(type, 'TEXT');
      const block = this.value(inner);
      return block ? { ...(shadow ? { shadow } : {}), block } : null;
    }
    return this.input(node, type, 'TEXT');
  }

  /** Statements of a motor: simple (`motor_a`) or set up (`arm`); `undefined` if not a motor. */
  private motorStatement(
    expression: SyntaxNode,
    device: string,
    method: string,
    args: readonly SyntaxNode[],
    keywords: ReadonlyMap<string, SyntaxNode>,
  ): BlockState | null | undefined {
    const simple = this.simpleDevice(device);
    if (simple) {
      if (simple.kind !== 'Motor' || keywords.size > 0) return this.fail(expression);
      const port = simple.port;
      const speedOf = (node: SyntaxNode | undefined) => {
        if (!node) return null;
        const signed = this.sign(node);
        return this.speedPort(signed.node) === port ? signed.negative : null;
      };
      switch (method) {
        case 'run_angle': {
          if (args.length !== 2 || speedOf(args[0]) !== false) break;
          const signed = this.sign(args[1]!);
          const direction = signed.negative ? 'COUNTERCLOCKWISE' : 'CLOCKWISE';
          const rotations = this.unscaled(signed.node, 360, 'mp_motor_run_for', 'AMOUNT');
          const degrees = this.input(signed.node, 'mp_motor_run_for', 'AMOUNT');
          if (rotations === null || !degrees) return null;
          const literalRotations =
            signed.literal !== null && signed.literal !== 0 && signed.literal % 360 === 0;
          const isScaled = signed.literal === null && rotations;
          const options: BlockState[] = [];
          const make = (unit: string, amount: InputState) => ({
            type: 'mp_motor_run_for',
            fields: { PORT: port, DIRECTION: direction, UNIT: unit },
            inputs: { AMOUNT: amount },
          });
          if (isScaled || literalRotations) options.push(make('ROTATIONS', rotations!));
          options.push(make('DEGREES', degrees));
          return this.choose(options);
        }
        case 'run_time': {
          const negative = args.length === 2 ? speedOf(args[0]) : null;
          if (negative === null) break;
          const seconds = this.unscaled(args[1]!, 1000, 'mp_motor_run_for', 'AMOUNT');
          if (seconds === undefined)
            return this.fail(
              args[1]!,
              'Blocks run a motor for seconds: write the time in ms as a number, or seconds * 1000.',
            );
          return seconds
            ? {
                type: 'mp_motor_run_for',
                fields: {
                  PORT: port,
                  DIRECTION: negative ? 'COUNTERCLOCKWISE' : 'CLOCKWISE',
                  UNIT: 'SECONDS',
                },
                inputs: { AMOUNT: seconds },
              }
            : null;
        }
        case 'run': {
          const negative = args.length === 1 ? speedOf(args[0]) : null;
          if (negative === null) break;
          return {
            type: 'mp_motor_start',
            fields: { PORT: port, DIRECTION: negative ? 'COUNTERCLOCKWISE' : 'CLOCKWISE' },
          };
        }
        case 'brake':
          if (args.length === 0) return { type: 'mp_motor_stop_simple', fields: { PORT: port } };
          break;
        case 'reset_angle':
          if (args.length === 1 && this.src.number(args[0]!) === 0) {
            return { type: 'mp_motor_reset_position', fields: { PORT: port } };
          }
          break;
        default:
          break;
      }
      return this.fail(
        expression,
        `The motor blocks write ${device}.${method}(...) with ${device}_speed. Set up a motor in the “set up” block to use other values.`,
      );
    }
    const known = this.ctx.devices.get(device);
    if (!known) return undefined;
    if (known.type !== 'Motor') {
      return this.fail(expression, `“${device}” is a ${DEVICES[known.type].label}, not a motor.`);
    }
    const motor = { MOTOR: { id: known.id } };
    const options = (): Record<string, string> | null => {
      const fields: Record<string, string> = { THEN: 'HOLD', WAIT: 'TRUE' };
      for (const [key, value] of keywords) {
        if (key === 'then') {
          const then = this.enumValue(value, 'Stop', 'mp_motor_run_angle', 'THEN');
          if (!then) return this.fail(value, 'then= is Stop.HOLD, Stop.BRAKE or Stop.COAST.');
          fields.THEN = then;
        } else if (key === 'wait') {
          const text = this.src.of(value);
          if (text !== 'True' && text !== 'False')
            return this.fail(value, 'wait= is True or False.');
          fields.WAIT = text === 'True' ? 'TRUE' : 'FALSE';
        } else {
          return this.fail(value);
        }
      }
      return fields;
    };
    const two = (type: string, second: string) => {
      if (args.length !== 2) return this.fail(expression);
      const fields = options();
      const speed = this.input(args[0]!, type, 'SPEED');
      const other = this.input(args[1]!, type, second);
      return fields && speed && other
        ? { type, fields: { ...motor, ...fields }, inputs: { SPEED: speed, [second]: other } }
        : null;
    };
    const plain = (type: string, input: string) => {
      if (args.length !== 1 || keywords.size > 0) return this.fail(expression);
      const value = this.input(args[0]!, type, input);
      return value ? { type, fields: motor, inputs: { [input]: value } } : null;
    };
    switch (method) {
      case 'run':
        return plain('mp_motor_run', 'SPEED');
      case 'run_angle':
        return two('mp_motor_run_angle', 'ANGLE');
      case 'run_target':
        return two('mp_motor_run_target', 'TARGET');
      case 'run_time':
        return two('mp_motor_run_time', 'TIME');
      case 'dc':
        return plain('mp_motor_dc', 'DUTY');
      case 'reset_angle':
        return plain('mp_motor_reset_angle', 'ANGLE');
      case 'stop':
      case 'brake':
      case 'hold':
        return args.length === 0 && keywords.size === 0
          ? { type: 'mp_motor_stop', fields: { ...motor, MODE: method } }
          : this.fail(expression);
      default:
        return this.fail(
          expression,
          withGuess(`A motor has no block for .${method}().`, method, MOTOR_METHODS),
        );
    }
  }

  private functionCall(
    expression: SyntaxNode,
    path: readonly string[],
    args: readonly SyntaxNode[],
    keywords: ReadonlyMap<string, SyntaxNode>,
  ): BlockState | null {
    let ref: FunctionRef | undefined;
    if (path.length === 1) {
      ref = this.ctx.ownFunctions.get(path[0]!);
      if (!ref && this.ctx.mainFunctions.has(path[0]!)) {
        return this.fail(
          expression,
          `“${path[0]}” is in the main tab. Other tabs cannot use main’s functions.`,
        );
      }
    } else if (path.length === 2) {
      ref = this.ctx.otherFunctions.get(path[0]!)?.get(path[1]!);
      if (!ref && this.ctx.otherFunctions.has(path[0]!)) {
        return this.fail(expression, `The tab “${path[0]}” has no function called “${path[1]}”.`);
      }
    }
    if (!ref) {
      const wanted = path.join('.');
      const known = [
        ...KNOWN_CALLS,
        ...this.ctx.ownFunctions.keys(),
        ...[...this.ctx.otherFunctions].flatMap(([tab, byName]) =>
          [...byName.keys()].map((name) => `${tab}.${name}`),
        ),
      ];
      const guess = closest(wanted, known);
      if (guess)
        return this.fail(expression, `There is no block for ${wanted}(). Did you mean ${guess}()?`);
      return path.length === 1
        ? this.fail(expression, `There is no block or function called “${wanted}”.`)
        : this.fail(expression, `There is no block for ${wanted}().`);
    }
    if (keywords.size > 0)
      return this.fail(expression, 'Give a function its values in order, without names.');
    if (args.length !== ref.inputs.length) {
      const names = ref.inputs.map((input) => input.name).join(', ');
      return this.fail(
        expression,
        `“${ref.name}” takes ${ref.inputs.length} value${ref.inputs.length === 1 ? '' : 's'}${names ? ` (${names})` : ''}.`,
      );
    }
    const inputs: Record<string, InputState> = {};
    for (const [index, input] of ref.inputs.entries()) {
      const value = this.input(args[index]!, FUNCTION_BLOCKS.call, 'ARG');
      if (!value) return null;
      const shadow: BlockState = { type: 'math_number', fields: { NUM: 0 } };
      const literal = this.src.number(args[index]!);
      inputs[`ARG_${input.id}`] =
        literal !== null
          ? { shadow: { ...shadow, fields: { NUM: literal } } }
          : { shadow, ...value };
    }
    return {
      type: FUNCTION_BLOCKS.call,
      fields: { FUNC: ref.id },
      extraState: {
        name: ref.name,
        inputs: ref.inputs.map((input) => ({ id: input.id, name: input.name })),
      },
      inputs,
    };
  }

  private assign(node: SyntaxNode): BlockState | null {
    const src = this.src;
    const children = parts(node);
    if (
      children.filter((child) => child.name === 'AssignOp').length !== 1 ||
      children.length !== 3
    ) {
      return this.fail(node, 'Set one variable at a time: x = 1.');
    }
    const [target, , value] = children as [SyntaxNode, SyntaxNode, SyntaxNode];
    // motor_a_speed = motor_a.control.limits()[0] * 50 // 100
    const port = this.speedPort(target);
    if (port) {
      const percent = this.speedPercent(value, port);
      if (!percent) return null;
      return { type: 'mp_motor_set_speed', fields: { PORT: port }, inputs: { SPEED: percent } };
    }
    const shared = this.sharedTarget(target);
    if (shared) {
      const set = this.input(value, SHARED_BLOCKS.set, 'VALUE');
      return set
        ? { type: SHARED_BLOCKS.set, fields: { VAR: { id: shared } }, inputs: { VALUE: set } }
        : null;
    }
    if (target.name === 'MemberExpression' && src.dotted(target)?.[0] === 'setup') {
      return this.fail(
        target,
        `There is no shared variable “${src.dotted(target)![1]}”. Create it under Variables first.`,
      );
    }
    if (target.name !== 'VariableName')
      return this.fail(target, 'Blocks set a variable by its name: x = 1.');
    const variable = this.variable(target, true);
    const set = this.input(value, 'variables_set', 'VALUE');
    return variable && set
      ? { type: 'variables_set', fields: { VAR: { id: variable } }, inputs: { VALUE: set } }
      : null;
  }

  /** `motor_a.control.limits()[0] * P // 100`: the P, as the speed block's input. */
  private speedPercent(value: SyntaxNode, port: PortName): InputState | null {
    const fail = () =>
      this.fail(
        value,
        `The “set motor speed” block writes motor_${port.toLowerCase()}.control.limits()[0] * 50 // 100.`,
      );
    const outer = unwrap(value);
    if (outer.name !== 'BinaryExpression') return fail();
    const [product, div, hundred] = parts(outer);
    if (
      !product ||
      !div ||
      !hundred ||
      this.src.of(div) !== '//' ||
      this.src.number(hundred) !== 100
    )
      return fail();
    const inner = unwrap(product);
    if (inner.name !== 'BinaryExpression') return fail();
    const [limits, times, percent] = parts(inner);
    if (!limits || !times || !percent || this.src.of(times) !== '*') return fail();
    if (this.src.compact(limits) !== `motor_${port.toLowerCase()}.control.limits()[0]`)
      return fail();
    return this.input(percent, 'mp_motor_set_speed', 'SPEED');
  }

  private update(node: SyntaxNode): BlockState | null {
    const [target, op, value] = parts(node);
    if (!target || !op || !value) return this.fail(node);
    const operator = this.src.of(op);
    let delta: InputState | null;
    const type = this.sharedTarget(target) ? SHARED_BLOCKS.change : 'math_change';
    if (operator === '+=') {
      delta = this.input(value, type, 'DELTA');
    } else if (operator === '-=' && this.src.number(value) !== null) {
      const shadow = shadowFor(type, 'DELTA') ?? { type: 'math_number', fields: { NUM: 0 } };
      delta = { shadow: { ...shadow, fields: { NUM: -this.src.number(value)! } } };
    } else {
      return this.fail(op, 'The “change by” block adds: x += 1 (or x -= a number).');
    }
    if (!delta) return null;
    const shared = this.sharedTarget(target);
    if (shared)
      return {
        type: SHARED_BLOCKS.change,
        fields: { VAR: { id: shared } },
        inputs: { DELTA: delta },
      };
    if (target.name !== 'VariableName') return this.fail(target);
    const variable = this.variable(target, true);
    return variable
      ? { type: 'math_change', fields: { VAR: { id: variable } }, inputs: { DELTA: delta } }
      : null;
  }

  private ifStatement(node: SyntaxNode): BlockState | null {
    const children = parts(node);
    const inputs: Record<string, InputState> = {};
    let branch = 0;
    let hasElse = false;
    let ok = true;
    const orphans: string[] = [];
    for (let i = 0; i < children.length; i += 1) {
      const word = children[i]!.name;
      if (word === 'if' || word === 'elif') {
        const condition = children[i + 1];
        const body = children[i + 2];
        if (!condition || body?.name !== 'Body') return this.fail(node);
        const value = this.input(condition, 'controls_if', `IF${branch}`);
        if (!value) ok = false;
        else inputs[`IF${branch}`] = value;
        const { blocks, orphans: left } = this.bodyAndOrphans(body);
        orphans.push(...left);
        const statement = statementInput(blocks);
        if (statement) inputs[`DO${branch}`] = statement;
        branch += 1;
        i += 2;
      } else if (word === 'else') {
        const body = children[i + 1];
        if (body?.name !== 'Body') return this.fail(node);
        hasElse = true;
        const { blocks, orphans: left } = this.bodyAndOrphans(body);
        orphans.push(...left);
        const statement = statementInput(blocks);
        if (statement) inputs.ELSE = statement;
        i += 1;
      }
    }
    if (!ok) return null;
    const elseIfCount = branch - 1;
    const block: BlockState = {
      type: 'controls_if',
      ...(elseIfCount > 0 || hasElse
        ? {
            extraState: {
              ...(elseIfCount > 0 ? { elseIfCount } : {}),
              ...(hasElse ? { hasElse: true } : {}),
            },
          }
        : {}),
      inputs,
    };
    addComment(block, orphans);
    return block;
  }

  /**
   * "switch on" (../switch.ts): the value it checks and an if … elif … else whose every test is
   * `switch_value == case`. `undefined` when the if is not that shape.
   */
  private switchBlock(value: SyntaxNode, chainNode: SyntaxNode): BlockState | null | undefined {
    const src = this.src;
    const children = parts(chainNode);
    // The shape first, so an if that is not a switch is read as one.
    const tests: SyntaxNode[] = [];
    for (let i = 0; i < children.length; i += 1) {
      const word = children[i]!.name;
      if (word === 'if' || word === 'elif') {
        const test = unwrap(children[i + 1] ?? chainNode);
        const [left, op, right, extra] = test.name === 'BinaryExpression' ? parts(test) : [];
        if (!left || !op || !right || extra || src.of(left) !== SWITCH_VALUE || src.of(op) !== '==')
          return undefined;
        if (children[i + 2]?.name !== 'Body') return undefined;
        tests.push(right);
        i += 2;
      } else if (word === 'else') {
        i += 1;
      }
    }
    if (tests.length < MIN_CASES || tests.length > MAX_CASES) return undefined;

    const inputs: Record<string, InputState> = {};
    let ok = true;
    if (src.of(unwrap(value)) !== 'None') {
      const checked = this.input(value, SWITCH_BLOCK, 'VALUE');
      if (checked) inputs.VALUE = checked;
      else ok = false;
    }
    for (const [index, test] of tests.entries()) {
      const slot = this.switchCase(test);
      if (slot === null) ok = false;
      else if (slot) inputs[`CASE${index}`] = slot;
    }
    const orphans: string[] = [];
    let branch = 0;
    for (let i = 0; i < children.length; i += 1) {
      const word = children[i]!.name;
      const body = word === 'else' ? children[i + 1] : children[i + 2];
      if (word !== 'if' && word !== 'elif' && word !== 'else') continue;
      const { blocks, orphans: left } = this.bodyAndOrphans(body);
      orphans.push(...left);
      const statement = statementInput(blocks);
      if (statement) inputs[word === 'else' ? 'ELSE' : `DO${branch}`] = statement;
      if (word === 'else') i += 1;
      else {
        branch += 1;
        i += 2;
      }
    }
    if (!ok) return null;
    const block: BlockState = {
      type: SWITCH_BLOCK,
      extraState: { cases: tests.length },
      inputs,
    };
    addComment(block, orphans);
    return block;
  }

  /**
   * A case of "switch on", as ⊕ makes them: a number, a text or a colour fills a shadow; anything
   * else is a block. `undefined` for an empty case (None), `null` when it cannot be read.
   */
  private switchCase(node: SyntaxNode): InputState | null | undefined {
    const src = this.src;
    const inner = unwrap(node);
    if (src.of(inner) === 'None') return undefined;
    const literal = src.number(inner);
    if (literal !== null) return { shadow: { type: 'math_number', fields: { NUM: literal } } };
    const text = inner.name === 'String' ? src.string(inner) : null;
    if (text !== null) return { shadow: { type: 'text', fields: { TEXT: text } } };
    const color = this.enumValue(inner, 'Color', COLOR_VALUE_BLOCK, 'COLOR');
    if (color) return { shadow: { type: COLOR_VALUE_BLOCK, fields: { COLOR: color } } };
    const block = this.value(inner);
    return block ? { block } : null;
  }

  private forStatement(node: SyntaxNode): BlockState | null {
    const children = parts(node);
    if (children.some((child) => child.name === 'else'))
      return this.fail(node, 'There is no block for for … else.');
    const [, target, , iterable, body] = children;
    const call = iterable ? asCall(this.src, iterable) : null;
    if (
      !target ||
      target.name !== 'VariableName' ||
      !call ||
      this.src.dotted(call.callee)?.join('.') !== 'range' ||
      call.args.positional.length !== 1 ||
      body?.name !== 'Body'
    ) {
      return this.fail(node, 'Blocks repeat with for count in range(4):.');
    }
    // range(int(x)) when the number of times is not a number in the code.
    let times = call.args.positional[0]!;
    const toInt = asCall(this.src, times);
    if (
      toInt &&
      this.src.dotted(toInt.callee)?.join('.') === 'int' &&
      toInt.args.positional.length === 1
    ) {
      times = toInt.args.positional[0]!;
    }
    const count = this.input(times, 'controls_repeat_ext', 'TIMES');
    this.loops += 1;
    const { blocks, orphans } = this.bodyAndOrphans(body);
    this.loops -= 1;
    if (!count) return null;
    const statement = statementInput(blocks);
    const block: BlockState = {
      type: 'controls_repeat_ext',
      inputs: { TIMES: count, ...(statement ? { DO: statement } : {}) },
    };
    addComment(block, orphans);
    return block;
  }

  /** `while`: repeat forever, wait until, or repeat while / until. */
  private whileStatement(node: SyntaxNode): BlockState | null {
    const children = parts(node);
    const [, condition, body, extra] = children;
    if (!condition || body?.name !== 'Body' || extra) {
      return this.fail(node, 'There is no block for while … else.');
    }
    this.loops += 1;
    const { blocks, orphans } = this.bodyAndOrphans(body);
    this.loops -= 1;
    const statement = statementInput(blocks);
    const loopBody: Record<string, InputState> = statement ? { DO: statement } : {};
    const candidates: BlockState[] = [];
    if (this.src.of(condition) === 'True') {
      candidates.push({ type: 'mp_forever', ...(statement ? { inputs: loopBody } : {}) });
    }
    const inner = unwrap(condition);
    const [notWord, negated] = parts(inner);
    if (inner.name === 'UnaryExpression' && notWord && negated && this.src.of(notWord) === 'not') {
      // wait until: while not condition: wait(10)
      const inside = statements(body);
      if (inside.length === 1 && this.src.compact(inside[0]!) === 'wait(10)') {
        const value = this.input(negated, 'mp_wait_until', 'CONDITION');
        if (value) candidates.push({ type: 'mp_wait_until', inputs: { CONDITION: value } });
      }
      const until = this.input(negated, 'controls_whileUntil', 'BOOL');
      if (until) {
        candidates.push({
          type: 'controls_whileUntil',
          fields: { MODE: 'UNTIL' },
          inputs: { BOOL: until, ...loopBody },
        });
      }
    }
    const whileValue = this.input(condition, 'controls_whileUntil', 'BOOL');
    if (whileValue) {
      candidates.push({
        type: 'controls_whileUntil',
        fields: { MODE: 'WHILE' },
        inputs: { BOOL: whileValue, ...loopBody },
      });
    }
    if (candidates.length === 0) return null;
    const chosen = this.choose(candidates);
    addComment(chosen, orphans);
    return chosen;
  }

  /** A `def`: the define block, with its inputs and body. */
  define(node: SyntaxNode, ref: FunctionRef): BlockState {
    const body = node.getChild('Body');
    let nodes = body ? statements(body) : [];
    // `global` lines come from the blocks; skip them at the start.
    while (nodes[0]?.name === 'ScopeStatement' && this.src.of(nodes[0]).startsWith('global'))
      nodes = nodes.slice(1);
    nodes = nodes.filter((each) => each.name !== 'PassStatement');
    this.inputs = new Map(ref.inputs.map((input) => [input.name, input.id]));
    const saved = this.loops;
    this.loops = 0;
    const blocks = this.body(nodes, body ? { from: body.from, to: body.to } : null);
    const orphans = this.orphans;
    this.orphans = [];
    this.loops = saved;
    this.inputs = null;
    const statement = statementInput(blocks);
    const block: BlockState = {
      type: FUNCTION_BLOCKS.define,
      id: ref.id,
      fields: {
        NAME: ref.name,
        ...Object.fromEntries(ref.inputs.map((input) => [`INPUT_${input.id}`, input.name])),
      },
      ...(ref.inputs.length > 0
        ? {
            extraState: { inputs: ref.inputs.map((input) => ({ id: input.id, name: input.name })) },
          }
        : {}),
      ...(statement ? { inputs: { DO: statement } } : {}),
    };
    addComment(block, orphans);
    return block;
  }
}
