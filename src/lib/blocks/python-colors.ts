/**
 * Colours for Python, in the style most programmers know from VS Code (its Dark+ and Light+
 * themes): keywords that control the flow and imports in purple, `def`/`True`/`and` in blue,
 * text in orange, numbers in green, comments in green, functions in yellow, classes and modules
 * in teal, constants and variables in light blue, and brackets coloured by how deep they are.
 *
 * One list of tokens serves both the read-only Python on the Blocks page and the editor
 * (./python-editor.ts), so they look the same. The colours themselves are CSS variables
 * (`--py-*`, src/app/globals.css), with values for the light and the dark theme.
 */
import type { SyntaxNode, Tree } from '@lezer/common';
import { parser } from '@lezer/python';

export type TokenKind =
  | 'control'
  | 'keyword'
  | 'string'
  | 'escape'
  | 'number'
  | 'comment'
  | 'function'
  | 'class'
  | 'module'
  | 'constant'
  | 'variable'
  | 'bracket1'
  | 'bracket2'
  | 'bracket3';

export interface Token {
  readonly from: number;
  readonly to: number;
  readonly kind: TokenKind;
}

/** Keywords that change the flow, and imports: purple in VS Code. */
const CONTROL = new Set([
  'if',
  'elif',
  'else',
  'for',
  'while',
  'try',
  'except',
  'finally',
  'return',
  'raise',
  'break',
  'continue',
  'pass',
  'with',
  'as',
  'import',
  'from',
  'yield',
  'await',
  'assert',
  'match',
  'case',
  'del',
]);

/** The other keywords and the constants True, False, None: blue in VS Code. */
const KEYWORD = new Set([
  'def',
  'class',
  'lambda',
  'global',
  'nonlocal',
  'and',
  'or',
  'not',
  'in',
  'is',
  'async',
  'Boolean',
  'None',
]);

const OPEN = new Set(['(', '[', '{']);
const CLOSE = new Set([')', ']', '}']);
const BRACKETS: readonly TokenKind[] = ['bracket1', 'bracket2', 'bracket3'];

const isConstant = (name: string) => /^[A-Z][A-Z0-9_]+$/.test(name);
const isClass = (name: string) => /^[A-Z]/.test(name) && /[a-z]/.test(name);

/** Modules the code imports with `import name` (and math and random, which blocks use so). */
function importedModules(tree: Tree, text: string): Set<string> {
  const modules = new Set(['math', 'random']);
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== 'ImportStatement') continue;
    const first = node.firstChild;
    if (first?.name !== 'import') continue;
    for (let child = first.nextSibling; child; child = child.nextSibling) {
      if (child.name === 'VariableName') modules.add(text.slice(child.from, child.to));
    }
  }
  return modules;
}

/** What colour a name gets, from where it stands. */
function nameKind(node: SyntaxNode, name: string, modules: ReadonlySet<string>): TokenKind {
  const parent = node.parent;
  if (node.name === 'PropertyName') {
    const member = parent;
    const callee = member?.parent?.name === 'CallExpression' ? member.parent.firstChild : null;
    if (
      member?.name === 'MemberExpression' &&
      callee?.from === member.from &&
      callee.to === member.to
    ) {
      return 'function';
    }
    return isConstant(name) ? 'constant' : 'variable';
  }
  if (parent?.name === 'CallExpression' && parent.firstChild?.from === node.from) {
    return isClass(name) ? 'class' : 'function';
  }
  if (parent?.name === 'FunctionDefinition') return 'function';
  if (parent?.name === 'ClassDefinition') return 'class';
  if (parent?.name === 'ImportStatement') {
    // `from x import Name`: what comes after import is a name in the module.
    let afterImport = false;
    for (
      let child = parent.firstChild;
      child && child.from < node.from;
      child = child.nextSibling
    ) {
      if (child.name === 'import' && parent.firstChild?.name === 'from') afterImport = true;
    }
    if (!afterImport) return 'module';
    return isConstant(name) ? 'constant' : isClass(name) ? 'class' : 'variable';
  }
  if (modules.has(name)) return 'module';
  if (isConstant(name)) return 'constant';
  if (isClass(name)) return 'class';
  return 'variable';
}

/** The coloured parts of Python text, in order (`tree`: an existing parse of `text`). */
export function pythonTokens(text: string, tree: Tree = parser.parse(text)): Token[] {
  const tokens: Token[] = [];
  const modules = importedModules(tree, text);
  let depth = 0;
  tree.iterate({
    enter(ref) {
      const { name, from, to } = ref;
      if (from === to) return;
      const add = (kind: TokenKind) => tokens.push({ from, to, kind });
      switch (name) {
        case 'Comment':
          add('comment');
          return false;
        case 'String':
        case 'FormatString': {
          // The text in quotes, with its escapes (\n, \") in their own colour.
          let at = from;
          for (let child = ref.node.firstChild; child; child = child.nextSibling) {
            if (child.name !== 'Escape') continue;
            if (child.from > at) tokens.push({ from: at, to: child.from, kind: 'string' });
            tokens.push({ from: child.from, to: child.to, kind: 'escape' });
            at = child.to;
          }
          if (to > at) tokens.push({ from: at, to, kind: 'string' });
          return false;
        }
        case 'Number':
          add('number');
          return false;
        case 'VariableName':
        case 'PropertyName':
          add(nameKind(ref.node, text.slice(from, to), modules));
          return false;
        default:
          break;
      }
      if (CONTROL.has(name)) add('control');
      else if (KEYWORD.has(name)) add('keyword');
      else if (OPEN.has(name)) {
        add(BRACKETS[depth % BRACKETS.length]!);
        depth += 1;
      } else if (CLOSE.has(name)) {
        depth = Math.max(0, depth - 1);
        add(BRACKETS[depth % BRACKETS.length]!);
      }
      return undefined;
    },
  });
  return tokens.sort((a, b) => a.from - b.from);
}

/** The text cut into plain and coloured pieces, for the read-only view. */
export function colouredPieces(
  text: string,
): { readonly text: string; readonly kind: TokenKind | null }[] {
  const pieces: { text: string; kind: TokenKind | null }[] = [];
  let at = 0;
  for (const token of pythonTokens(text)) {
    if (token.from < at) continue;
    if (token.from > at) pieces.push({ text: text.slice(at, token.from), kind: null });
    pieces.push({ text: text.slice(token.from, token.to), kind: token.kind });
    at = token.to;
  }
  if (at < text.length) pieces.push({ text: text.slice(at), kind: null });
  return pieces;
}
