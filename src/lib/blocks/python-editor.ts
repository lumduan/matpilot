/**
 * The Python editor of the Blocks page (ADR 0014): CodeMirror 6 with Python colours, line numbers,
 * undo, and problems underlined in red where they are. Only the parts of the file that become
 * blocks can change (the Functions section, and main's program); the rest is made from the
 * blocks and the devices, so it is greyed and edits there are refused.
 *
 * Loaded only when someone presses Edit, so the Blocks page does not carry it otherwise.
 */
import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { HighlightStyle, indentUnit, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import {
  EditorState,
  RangeSetBuilder,
  StateField,
  type Extension,
  type Text,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightActiveLine,
  hoverTooltip,
  keymap,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { PythonProblem, TextRange } from './from-python/tab';
import { wordFor, wordsAfter, type ProgramNames, type Word } from './from-python/vocabulary';

export interface PythonEditorOptions {
  readonly host: HTMLElement;
  readonly text: string;
  /** The parts that may change; everything else is read-only. */
  readonly editable: readonly TextRange[];
  /** The file's name, for screen readers. */
  readonly label: string;
  /** This program's names, suggested along with the blocks' Python. */
  readonly names: ProgramNames;
  readonly onChange: (text: string) => void;
  /** Someone tried to change a part made from the blocks. */
  readonly onLocked: () => void;
}

export interface PythonEditorHandle {
  text(): string;
  setProblems(problems: readonly PythonProblem[]): void;
  /** Puts the cursor at a place and shows it. */
  reveal(from: number, to: number): void;
  focus(): void;
  destroy(): void;
}

/** The editable ranges, kept in step with every change (an empty one stays, to type into). */
const editableField = StateField.define<readonly TextRange[]>({
  create: () => [],
  update(ranges, tr) {
    if (!tr.docChanged) return ranges;
    return ranges.map((range) => ({
      from: tr.changes.mapPos(range.from, -1),
      to: tr.changes.mapPos(range.to, 1),
    }));
  },
});

/** Whether every change of the transaction is inside an editable range. */
function onlyEditable(
  ranges: readonly TextRange[],
  changes: { iterChangedRanges: (f: (fromA: number, toA: number) => void) => void },
): boolean {
  let ok = true;
  changes.iterChangedRanges((fromA, toA) => {
    if (!ranges.some((range) => range.from <= fromA && toA <= range.to)) ok = false;
  });
  return ok;
}

const lockedMark = Decoration.mark({ class: 'cm-locked' });

/** Inside a text in quotes or a comment, nothing is suggested or explained. */
function inTextOrComment(state: EditorState, position: number): boolean {
  const name = syntaxTree(state).resolveInner(position, -1).name;
  return name === 'String' || name === 'FormatString' || name === 'Comment';
}

/** The help for a word: its shape, what it does, the block it becomes, and an example. */
function help(word: Word, path: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'cm-mp-help';
  const head = document.createElement('div');
  head.className = 'cm-mp-help-head';
  head.textContent = `${path ? `${path}.` : ''}${word.label.split(' ')[0]}${word.detail ? ` ${word.detail}` : ''}`;
  const info = document.createElement('p');
  info.textContent = word.info;
  box.append(head, info);
  if (word.block) {
    const block = document.createElement('p');
    block.className = 'cm-mp-help-block';
    block.textContent = `Block: ${word.block}`;
    box.append(block);
  }
  if (word.example) {
    const example = document.createElement('pre');
    example.textContent = word.example;
    box.append(example);
  }
  return box;
}

/** Suggestions while typing: after `robot.` what the robot can do, and so on. */
function suggestions(names: ProgramNames) {
  return (context: CompletionContext): CompletionResult | null => {
    if (inTextOrComment(context.state, context.pos)) return null;
    const before = context.matchBefore(/[\w.]*$/);
    const text = before?.text ?? '';
    const dot = text.lastIndexOf('.');
    const path = dot >= 0 ? text.slice(0, dot) : '';
    const typed = dot >= 0 ? text.slice(dot + 1) : text;
    if (!context.explicit && dot < 0 && typed === '') return null;
    if (/^\d/.test(text)) return null;
    const words = wordsAfter(path, names);
    if (words.length === 0) return null;
    const options: Completion[] = words.map((word) =>
      snippetCompletion(word.insert, {
        label: word.label,
        detail: word.detail,
        type: word.kind,
        info: () => help(word, path),
        ...(word.boost === undefined ? {} : { boost: word.boost }),
      }),
    );
    return { from: (before?.from ?? context.pos) + dot + 1, options, validFor: /^\w*$/ };
  };
}

/** The help for the name under the pointer. */
function explain(names: ProgramNames) {
  return hoverTooltip((view, position) => {
    if (inTextOrComment(view.state, position)) return null;
    const line = view.state.doc.lineAt(position);
    const text = line.text;
    let start = position - line.from;
    let end = start;
    while (start > 0 && /[\w.]/.test(text[start - 1]!)) start -= 1;
    while (end < text.length && /\w/.test(text[end]!)) end += 1;
    const path = text.slice(start, end).split('.').filter(Boolean);
    const word = wordFor(path, names);
    if (!word) return null;
    return {
      pos: line.from + start,
      end: line.from + end,
      above: true,
      create: () => ({ dom: help(word, path.slice(0, -1).join('.')) }),
    };
  });
}

/** The read-only parts, greyed. */
function lockedDecorations(doc: Text, ranges: readonly TextRange[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let at = 0;
  for (const range of [...ranges].sort((a, b) => a.from - b.from)) {
    if (range.from > at) builder.add(at, range.from, lockedMark);
    at = Math.max(at, range.to);
  }
  if (at < doc.length) builder.add(at, doc.length, lockedMark);
  return builder.finish();
}

/** Colours from the page's own colour variables, so light and dark follow the page. */
const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.definitionKeyword],
    color: 'var(--code-keyword)',
    fontWeight: '600',
  },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-number)' },
  { tag: tags.comment, color: 'var(--code-comment)', fontStyle: 'italic' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: 'var(--code-call)',
  },
  {
    tag: tags.definition(tags.function(tags.variableName)),
    color: 'var(--code-call)',
    fontWeight: '600',
  },
]);

const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.8rem',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
  },
  // The scroll bar's room is kept even when it is not needed, so the width stays the same and
  // long lines do not wrap differently when the editor grows or shrinks.
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.5', scrollbarGutter: 'stable' },
  '.cm-content': { caretColor: 'var(--text)' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg)',
    color: 'var(--muted)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--code-active-line)' },
  // A fixed width: a problem's dot coming and going must not change how long lines wrap.
  '.cm-gutter-lint': { width: '1.1em' },
  '.cm-gutter-lint .cm-gutterElement': { padding: '0 0.15em' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--code-selection)',
  },
  '.cm-locked': { color: 'var(--muted)', backgroundColor: 'var(--code-locked)' },
  '.cm-lintRange-error': { textDecorationColor: 'var(--error-border)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-text)',
  },
  '.cm-completionDetail': { color: 'var(--muted)', fontStyle: 'normal', marginLeft: '0.5em' },
  '.cm-tooltip-autocomplete ul li[aria-selected] .cm-completionDetail': { color: 'inherit' },
  '.cm-completionInfo, .cm-tooltip-hover': { maxWidth: '22rem' },
  '.cm-mp-help': { padding: '0.35rem 0.5rem', fontFamily: 'var(--font-sans)', fontSize: '0.8rem' },
  '.cm-mp-help-head': { fontFamily: 'var(--font-mono)', fontWeight: '600' },
  '.cm-mp-help p': { margin: '0.3rem 0 0' },
  '.cm-mp-help-block': { color: 'var(--muted)' },
  '.cm-mp-help pre': {
    margin: '0.35rem 0 0',
    padding: '0.3rem 0.4rem',
    fontFamily: 'var(--font-mono)',
    backgroundColor: 'var(--bg)',
    borderRadius: '0.3rem',
    whiteSpace: 'pre-wrap',
  },
});

export function createPythonEditor(options: PythonEditorOptions): PythonEditorHandle {
  let lockedTimer = 0;
  const extensions: Extension[] = [
    lineNumbers(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    indentUnit.of('    '),
    EditorState.tabSize.of(4),
    python(),
    syntaxHighlighting(highlight),
    lintGutter(),
    autocompletion({ override: [suggestions(options.names)], icons: true }),
    explain(options.names),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    editableField.init(() => options.editable),
    EditorState.changeFilter.of((tr) => {
      if (onlyEditable(tr.startState.field(editableField), tr.changes)) return true;
      // Tell once per burst of key presses, not for every key.
      window.clearTimeout(lockedTimer);
      lockedTimer = window.setTimeout(options.onLocked, 50);
      return false;
    }),
    EditorView.decorations.compute([editableField, 'doc'], (state) =>
      lockedDecorations(state.doc, state.field(editableField)),
    ),
    // The panel is narrow: long lines wrap instead of scrolling sideways.
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ 'aria-label': options.label }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange(update.state.doc.toString());
    }),
    theme,
  ];
  const view = new EditorView({
    parent: options.host,
    state: EditorState.create({ doc: options.text, extensions }),
  });
  // Start where the program is: the last editable part (main's program, or the functions).
  const last = options.editable[options.editable.length - 1];
  if (last) view.dispatch({ selection: { anchor: last.from }, scrollIntoView: true });

  return {
    text: () => view.state.doc.toString(),
    setProblems(problems) {
      const length = view.state.doc.length;
      const diagnostics: Diagnostic[] = problems.map((problem) => ({
        from: Math.min(problem.from, length),
        to: Math.min(Math.max(problem.to, problem.from), length),
        severity: 'error',
        message: problem.message,
      }));
      view.dispatch(setDiagnostics(view.state, diagnostics));
    },
    reveal(from, to) {
      const length = view.state.doc.length;
      view.dispatch({
        selection: { anchor: Math.min(from, length), head: Math.min(to, length) },
        scrollIntoView: true,
      });
      view.focus();
    },
    focus: () => view.focus(),
    destroy() {
      window.clearTimeout(lockedTimer);
      view.destroy();
    },
  };
}
