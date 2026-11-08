/**
 * Searching the blocks (asked for on 2026-11-08: "a search box to find blocks fast; I still cannot
 * find sleep"). A box at the top of the toolbox, as in MakeCode; typing shows every block whose
 * words match, from every category, under its category's name, ready to drag. The LEGO SPIKE app
 * has no search, but it keeps "wait 1 seconds" in Control, where MatPilot keeps it too; the search
 * also knows the words a child or a Python reader might type instead ("sleep", "pause", "delay").
 *
 * A block is also found by the Python it makes (`wait`, `straight`, `run_angle`, `print`), for
 * children who read the Python first: the names come from the Python editor's vocabulary
 * (./from-python/vocabulary.ts), loaded when the search is first used so the page loads no slower.
 *
 * The blocks come from the toolbox itself (./toolbox.ts) and from each category's own flyout as it
 * would open now (the ports a connected hub sees, the robot's wheels, the tab's functions), so a
 * result is the same block the category offers.
 */
import * as Blockly from 'blockly/core';
import { TOOLBOX, type FlyoutItem } from './toolbox';

/** The toolbox item kind of the search box (./toolbox.ts places it first). */
export const SEARCH_KIND = 'search';

/** At most this many blocks are shown. */
export const MAX_RESULTS = 40;

/** Other words for a block, so a search finds it by what it does. */
export const BLOCK_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  mp_wait_seconds: ['sleep', 'pause', 'delay', 'time'],
  mp_wait: ['sleep', 'pause', 'delay', 'time', 'milliseconds'],
  mp_wait_until: ['until', 'pause'],
  controls_whileUntil: ['loop', 'while', 'until'],
  mp_forever: ['loop', 'always', 'while'],
  controls_repeat_ext: ['loop', 'for', 'times'],
  controls_if: ['condition', 'decide', 'check', 'else'],
  mp_switch: ['case', 'choose', 'select', 'match', 'condition'],
  logic_compare: ['equal', 'greater', 'less', 'more', 'condition'],
  logic_operation: ['and', 'or', 'condition'],
  logic_negate: ['not', 'condition'],
  logic_boolean: ['true', 'false', 'yes', 'no'],
  controls_flow_statements: ['break', 'continue', 'exit loop'],
  mp_stop_program: ['end', 'exit', 'quit'],
  mp_move: ['drive', 'go', 'forward', 'backward', 'straight', 'distance'],
  mp_move_turn: ['rotate', 'spin', 'left', 'right', 'angle'],
  mp_move_start: ['drive', 'go', 'forward', 'start'],
  mp_move_start_steering: ['drive', 'steer', 'curve', 'arc'],
  mp_move_stop: ['halt', 'brake', 'stop'],
  mp_move_speed: ['fast', 'slow', 'speed'],
  mp_move_motors: ['wheels', 'drive base', 'robot'],
  mp_move_wheels: ['wheel size', 'diameter', 'track', 'robot'],
  mp_motor_run_for: ['spin', 'rotate', 'arm', 'degrees', 'rotations'],
  mp_motor_start: ['spin', 'rotate', 'arm'],
  mp_motor_stop_simple: ['halt', 'brake', 'stop'],
  mp_motor_set_speed: ['fast', 'slow'],
  mp_motor_position: ['angle', 'degrees', 'encoder'],
  mp_motor_reset_position: ['angle', 'zero', 'encoder'],
  mp_light_show_for: ['display', 'screen', 'matrix', 'picture', 'image', 'icon'],
  mp_light_show: ['display', 'screen', 'matrix', 'picture', 'image', 'icon'],
  mp_light_write: ['display', 'screen', 'text', 'scroll'],
  mp_light_off: ['display', 'screen', 'clear'],
  mp_light_pixel: ['display', 'matrix', 'dot'],
  mp_light_button: ['led', 'colour', 'status light'],
  mp_sound_note: ['music', 'tone', 'speaker', 'play'],
  mp_sound_beep: ['sound', 'tone', 'speaker', 'buzz'],
  mp_sound_volume: ['loud', 'quiet', 'speaker'],
  mp_sensor_color_is: ['see', 'detect', 'condition'],
  mp_sensor_color: ['see', 'detect'],
  mp_color: ['red', 'green', 'blue', 'yellow', 'white'],
  mp_sensor_reflection: ['light', 'line', 'brightness', 'reflect'],
  mp_sensor_distance: ['ultrasonic', 'far', 'near', 'eyes'],
  mp_sensor_closer: ['ultrasonic', 'near', 'close', 'obstacle', 'condition'],
  mp_sensor_pressed: ['button', 'press', 'bump', 'force', 'condition'],
  mp_sensor_force: ['button', 'press', 'push'],
  mp_hub_tilt: ['gyro', 'imu', 'angle', 'pitch', 'roll'],
  mp_hub_button: ['press', 'arrow', 'condition'],
  mp_timer: ['time', 'clock', 'stopwatch', 'seconds'],
  mp_timer_reset: ['time', 'clock', 'stopwatch', 'zero'],
  mp_print: ['log', 'console', 'monitor', 'output', 'say', 'show'],
  mp_plot: ['graph', 'chart', 'plotter'],
  math_random_int: ['dice', 'chance', 'pick'],
  math_arithmetic: ['add', 'plus', 'minus', 'multiply', 'divide', 'math', 'calculate'],
  math_round: ['whole number', 'math'],
  math_modulo: ['remainder', 'math'],
  text_join: ['text', 'string', 'combine'],
  variables_set: ['variable', 'store', 'remember'],
  variables_get: ['variable', 'value'],
  math_change: ['variable', 'add', 'increase', 'count'],
};

/** The Python editor's words for a block (`straight` for "move"), by block type; null until loaded. */
let pythonNames: ReadonlyMap<string, readonly string[]> | null = null;

/** Where the vocabulary lists names: the program's own names, then after `robot.`, `hub.` and so on. */
const PYTHON_CONTEXTS = [
  '',
  'robot',
  'hub',
  'hub.light',
  'hub.display',
  'hub.speaker',
  'hub.imu',
  'hub.buttons',
  'timer',
  'random',
  'math',
  'motor_a',
  'colour_sensor_d',
  'distance_sensor_e',
  'touch_sensor_f',
];

/** The Python names of each block type, from the vocabulary's `wordsAfter`. */
export function pythonNamesOf(
  wordsAfter: (path: string) => readonly { label: string; blockType: string }[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const context of PYTHON_CONTEXTS) {
    for (const word of wordsAfter(context)) {
      if (!word.blockType) continue;
      const list = out.get(word.blockType) ?? [];
      if (!list.includes(word.label)) list.push(word.label);
      out.set(word.blockType, list);
    }
  }
  return out;
}

export function setPythonNames(names: ReadonlyMap<string, readonly string[]> | null): void {
  pythonNames = names;
}

/** The same word whatever the spelling: colour/color, grey/gray, centre/center, metre/meter. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/colour/g, 'color')
    .replace(/grey/g, 'gray')
    .replace(/centre/g, 'center')
    .replace(/metre/g, 'meter')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** One block the toolbox offers, with what it says and where it is. */
export interface SearchEntry {
  readonly category: string;
  readonly item: FlyoutItem;
  /** The block's own words, as it shows them. */
  readonly text: string;
}

/**
 * The entries that match every word of `query`. A query word matches a word of the block (or of
 * its category, or one of its other words) that starts with it. Blocks whose own words match come
 * first; the toolbox's order is kept otherwise.
 */
export function matchEntries(query: string, entries: readonly SearchEntry[]): SearchEntry[] {
  const words = normalise(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const hits: { entry: SearchEntry; own: boolean; index: number }[] = [];
  entries.forEach((entry, index) => {
    const own = normalise(entry.text).split(' ');
    const type = String(entry.item.type);
    const other = normalise(
      `${entry.category} ${(BLOCK_SYNONYMS[type] ?? []).join(' ')} ${(pythonNames?.get(type) ?? []).join(' ')}`,
    ).split(' ');
    const all = [...own, ...other];
    if (!words.every((word) => all.some((each) => each.startsWith(word)))) return;
    hits.push({
      entry,
      own: words.every((word) => own.some((each) => each.startsWith(word))),
      index,
    });
  });
  hits.sort((a, b) => Number(b.own) - Number(a.own) || a.index - b.index);
  return hits.map((hit) => hit.entry);
}

/** What the search shows: each category's matches under its name, or a hint. */
export function searchFlyout(query: string, entries: readonly SearchEntry[]): FlyoutItem[] {
  const label = (text: string): FlyoutItem => ({ kind: 'label', text });
  if (!normalise(query)) return [label('Type a word: wait, turn, colour, motor, if…')];
  const found = matchEntries(query, entries).slice(0, MAX_RESULTS);
  if (found.length === 0) return [label(`No block matches “${query.trim()}”. Try another word.`)];
  const out: FlyoutItem[] = [];
  let category: string | null = null;
  // Group by category, keeping the order of the first match in each.
  const order = [...new Set(found.map((entry) => entry.category))];
  for (const name of order) {
    for (const entry of found) {
      if (entry.category !== name) continue;
      if (category !== name) {
        out.push(label(name));
        category = name;
      }
      out.push(entry.item);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The blocks the toolbox offers now, and their words
// ---------------------------------------------------------------------------------------------

type ToolboxNode = {
  kind: string;
  name?: string;
  contents?: readonly ToolboxNode[];
  custom?: string;
};

const words = new Map<string, string>();
let scratch: Blockly.Workspace | null = null;

/** A block's words as it shows them ("wait 1 seconds"), made once per block in a hidden workspace. */
export function blockWords(item: FlyoutItem): string {
  const key = JSON.stringify(item);
  const known = words.get(key);
  if (known !== undefined) return known;
  let text = String(item.type ?? '');
  scratch ??= new Blockly.Workspace();
  const enabled = Blockly.Events.isEnabled();
  if (enabled) Blockly.Events.disable();
  try {
    const { kind: _kind, ...state } = item;
    void _kind;
    const block = Blockly.serialization.blocks.append(
      state as unknown as Blockly.serialization.blocks.State,
      scratch,
    );
    // Every block of a stack ("stop moving", then "wait 1 seconds").
    const parts: string[] = [];
    for (let each: Blockly.Block | null = block; each; each = each.getNextBlock()) {
      parts.push(each.toString());
    }
    text = parts.join(' ');
    block.dispose(false);
  } catch {
    // A block that needs its workspace (a variable, a function call): its type is enough.
  } finally {
    if (enabled) Blockly.Events.enable();
  }
  words.set(key, text);
  return text;
}

/** Every block in the toolbox's categories, each category's flyout made as it would open now. */
export function toolboxEntries(workspace: Blockly.WorkspaceSvg): SearchEntry[] {
  const out: SearchEntry[] = [];
  const walk = (nodes: readonly ToolboxNode[]) => {
    for (const node of nodes) {
      if (node.kind !== 'category' || !node.name) continue;
      let contents: readonly unknown[] = node.contents ?? [];
      if (node.custom) {
        const callback = workspace.getToolboxCategoryCallback(node.custom);
        try {
          contents = callback ? (callback(workspace) as unknown as readonly unknown[]) : [];
        } catch {
          contents = [];
        }
      }
      const blocks = contents.filter(
        (item): item is FlyoutItem => (item as FlyoutItem).kind === 'block',
      );
      for (const item of blocks) out.push({ category: node.name, item, text: blockWords(item) });
      walk(contents.filter((item) => (item as ToolboxNode).kind === 'category') as ToolboxNode[]);
    }
  };
  walk(TOOLBOX.contents as readonly ToolboxNode[]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The search box in the toolbox
// ---------------------------------------------------------------------------------------------

/**
 * A toolbox category whose row is a text box. Typing selects it and fills its flyout with the
 * matches; Escape clears it. Keys typed in it stay in it (Blockly's own shortcuts do not see them).
 */
class SearchCategory extends Blockly.ToolboxCategory {
  #input: HTMLInputElement | null = null;
  #selected = false;

  protected override createDom_(): HTMLDivElement {
    const dom = super.createDom_();
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search blocks';
    input.className = 'mp-toolbox-search';
    input.setAttribute('aria-label', 'Search the blocks');
    input.setAttribute('data-testid', 'block-search');
    input.addEventListener('input', () => this.#show());
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        input.value = '';
        this.parentToolbox_.clearSelection();
      }
    });
    // A click in the box while the results are open must not close them.
    input.addEventListener('click', (event) => {
      if (this.#selected) event.stopPropagation();
    });
    this.rowContents_?.replaceChildren(input);
    // The row fits the box, and is never coloured as a selected category.
    this.rowDiv_?.classList.add('mp-toolbox-search-row');
    this.#input = input;
    return dom;
  }

  /** No colour strip: the box is not a category of blocks. */
  protected override addColourBorder_(): void {}

  override getClickTarget(): Element {
    return this.#input ?? super.getClickTarget();
  }

  override setSelected(selected: boolean): void {
    super.setSelected(selected);
    if (this.rowDiv_) this.rowDiv_.style.backgroundColor = '';
    this.#selected = selected;
    if (!this.#input) return;
    if (selected) {
      this.#input.focus();
      this.#show(false);
    } else {
      this.#input.value = '';
    }
  }

  #show(refresh = true): void {
    const query = this.#input?.value ?? '';
    // The Python names, once: then the search runs again with them.
    if (pythonNames === null && !loadingNames) {
      loadingNames = import('./from-python/vocabulary')
        .then(({ wordsAfter }) => {
          pythonNames = pythonNamesOf((path) => wordsAfter(path));
          if (this.#selected && this.#input?.value) this.#show();
        })
        .catch(() => undefined);
    }
    const toolbox = this.parentToolbox_ as unknown as Blockly.Toolbox;
    const entries = normalise(query) ? toolboxEntries(this.workspace_) : [];
    this.updateFlyoutContents(
      searchFlyout(query, entries) as Blockly.utils.toolbox.FlyoutDefinition,
    );
    if (!this.#selected) toolbox.setSelectedItem(this);
    else if (refresh) toolbox.refreshSelection();
  }
}

let registered = false;
let loadingNames: Promise<void> | null = null;

export function registerSearchCategory(): void {
  if (registered) return;
  registered = true;
  Blockly.registry.register(Blockly.registry.Type.TOOLBOX_ITEM, SEARCH_KIND, SearchCategory, true);
}
