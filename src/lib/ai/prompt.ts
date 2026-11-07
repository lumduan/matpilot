/**
 * What the AI helper sends (ADR 0015): fixed instructions first, then the program, then the
 * child's question. The fixed part is the same for every question and every mode, so a provider's
 * prompt caching can reuse it; everything that changes comes after it. The page shows the exact
 * text under "What the AI sees", so nothing about the prompt is hidden from the child.
 */
import { DEVICE_TYPES } from '../blocks/pybricks';
import { NO_NAMES, wordsAfter, type ProgramNames } from '../blocks/from-python/vocabulary';
import type { AnswerLanguage } from './settings';
import type { AiMode } from './usage';

export interface ProgramFileText {
  readonly name: string;
  readonly code: string;
}

export interface AiRequest {
  readonly mode: AiMode;
  /** The fixed instructions (the system prompt). */
  readonly system: string;
  /** The program and the question (the user message). */
  readonly user: string;
}

export interface RequestInput {
  readonly mode: AiMode;
  /** Every Python file of the program, the open tab's first or not. */
  readonly files: readonly ProgramFileText[];
  /** The open tab's file; its lines are the ones "Line N" means. */
  readonly openFile: string;
  /** The open tab's name. */
  readonly tab: string;
  /** What the child typed; may be empty. */
  readonly question: string;
  readonly language: AnswerLanguage;
  /** The language when `language` is `auto` and there is no question: the browser's. */
  readonly fallbackLanguage: 'th' | 'en';
}

/** The answer is asked to stay short; this caps it (thinking models count their thinking too). */
export const MAX_ANSWER_TOKENS = 4096;

/** Paths whose words the reference lists, in the order a beginner meets them. */
const REFERENCE_PATHS = [
  '',
  'robot',
  'motor_a',
  'colour_sensor_a',
  'distance_sensor_a',
  'touch_sensor_a',
  'hub.light',
  'hub.display',
  'hub.speaker',
  'hub.imu',
  'hub.buttons',
  'timer',
  'random',
  'math',
];

/** One device of each type, named after its type, so the reference lists the detailed blocks. */
const REFERENCE_NAMES: ProgramNames = {
  ...NO_NAMES,
  devices: DEVICE_TYPES.map((type) => ({ name: `my_${type.toLowerCase()}`, type })),
};

let reference: string | null = null;

/**
 * The Python each block makes, with the block's own words: the AI names blocks the way the child
 * sees them. Built from the editor's word list (../blocks/from-python/vocabulary.ts), which the
 * tests read back into blocks, so it cannot drift from what the blocks make.
 */
export function blockReference(): string {
  if (reference !== null) return reference;
  const seen = new Set<string>();
  const lines: string[] = [];
  const paths = [...REFERENCE_PATHS, ...REFERENCE_NAMES.devices.map((device) => device.name)];
  for (const path of paths) {
    for (const word of wordsAfter(path, REFERENCE_NAMES)) {
      if (word.example === '' || word.block === '' || seen.has(word.example)) continue;
      // The words for ports B to F say what port A's say.
      if (/_[b-f](?:_|\b)/.test(word.example)) continue;
      seen.add(word.example);
      // A block that holds other blocks has an example of several lines; indent the rest.
      const example = word.example.replace(/\n/g, '\n    ');
      lines.push(`- ${example} → block “${word.block}”: ${word.info}`);
    }
  }
  reference = lines.join('\n');
  return reference;
}

/** The fixed instructions: the same text for every question. */
export function systemPrompt(): string {
  return `You are the AI helper in MatPilot, a web page where children build programs for a LEGO SPIKE Prime robot (a hub running Pybricks firmware) out of blocks. Each block makes Python (Pybricks MicroPython), and you see that Python.

WHO YOU TALK TO
- A child, maybe with a parent nearby. Use short sentences and simple, friendly words. Be encouraging.
- The page tells the child that you are an AI. Never pretend to be a person.

WHAT YOU HELP WITH
- Only this robot, its program, and programming ideas (steps, loops, conditions, variables, functions, motors, sensors). If the child asks about anything else, say kindly that you only help with the robot program, and suggest a question about it.
- Never ask for personal information (names, addresses, schools, phone numbers, photos, passwords). If the child shares some, do not repeat it, and remind them to keep it private.
- Nothing scary, violent, unkind or meant for adults.

HOW YOU HELP
- The child works with blocks, so talk about blocks, not only Python. When you mention a line, name the block it comes from, using the block's words from the reference below.
- Help the child think: give hints and guiding questions. Do not write a new program and do not give the finished fix; suggest the next small step to try.
- MatPilot makes some parts by itself: the imports, the Config and Setup parts, the ports, and the try/finally that stops every motor when the program ends. The child cannot change those parts, so do not ask them to.
- Units: distances in millimetres, angles in degrees, wait() in milliseconds (1000 = 1 second), speeds as the blocks show them.
- You cannot see the robot. If what happens depends on the real robot (its build, its ports, the floor, the light), say so and suggest a small test.

HOW TO WRITE THE ANSWER
- Plain text: short paragraphs, or bullets that start with "- ". No headings, no tables, and no more than 3 lines of code at a time.
- When a point is about one line of the open file, start that bullet with "Line N:", where N is the number shown before that line. The page turns it into a link to the line.
- Keep it short: about 150 words, at most 250.
- Write in the language you are asked to use.

HOW THE PYTHON IS LAID OUT
- Each tab is one file (main.py for the main tab, then one file per other tab), plus setup.py when tabs share ports, devices or variables.
- A file has parts, each starting with a "# --- Name ----" line: Config (ports and settings), Setup (the devices), Functions (the child's "define" blocks), and Main (the blocks under "when program starts", inside try/finally).
- The lines of each file are numbered for you as "  12| code". The numbers are not part of the Python.

THE BLOCKS AND THE PYTHON THEY MAKE
"motor_a" stands for any port A to F, and "my_motor" and the like for the names the child gave devices. Words in a block like "…" are what the child fills in.
${blockReference()}`;
}

const MODE_TASK: Record<AiMode, string> = {
  explain:
    'Explain what the open file does, in the order the robot does it. Start with one sentence about the whole program, then the steps. If the child asks about one part, explain only that part.',
  review:
    'Review the open file. Look for mistakes and for things that could go wrong on the real robot: a loop that never ends, a motor that keeps running, a wait that is too short to see, a sensor that is read once instead of in a loop, a value that never changes, a function that is never used. Give at most 4 points, most important first. Each point: what you noticed, then a hint or a question that helps the child find the fix. Do not give the fixed code. If nothing looks wrong, say what is good and suggest one thing to try next.',
};

const NO_QUESTION: Record<AiMode, string> = {
  explain: '(No question: explain the whole open file.)',
  review: '(No question: review the whole open file.)',
};

/** The file's lines, numbered like an editor's gutter. */
export function numbered(code: string): string {
  const lines = code.replace(/\n$/, '').split('\n');
  const width = String(lines.length).length;
  return lines.map((line, i) => `${String(i + 1).padStart(width + 2)}| ${line}`).join('\n');
}

function languageLine(input: RequestInput): string {
  const named = { th: 'Thai', en: 'English' } as const;
  if (input.language !== 'auto') return `Answer in ${named[input.language]}.`;
  if (input.question.trim() === '') return `Answer in ${named[input.fallbackLanguage]}.`;
  return "Answer in the language of the child's question.";
}

/** The whole request for one question. */
export function buildRequest(input: RequestInput): AiRequest {
  const open = input.files.find((file) => file.name === input.openFile);
  const others = input.files.filter((file) => file !== open);
  const files = [...(open ? [open] : []), ...others];
  const parts = [
    `THE PROGRAM (the open tab is “${input.tab}”, its file is ${input.openFile})`,
    ...files.map(
      (file) =>
        `=== ${file.name}${file === open ? ' (the open tab)' : ''} ===\n${numbered(file.code)}`,
    ),
    `THE TASK\n${MODE_TASK[input.mode]}`,
    `THE CHILD'S QUESTION\n${input.question.trim() === '' ? NO_QUESTION[input.mode] : input.question.trim()}`,
    languageLine(input),
  ];
  return { mode: input.mode, system: systemPrompt(), user: parts.join('\n\n') };
}

/** The request as one text, as the page shows it under "What the AI sees". */
export function requestText(request: AiRequest): string {
  return `[Fixed instructions]\n${request.system}\n\n[The program and the question]\n${request.user}`;
}
