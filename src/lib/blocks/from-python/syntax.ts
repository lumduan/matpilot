/**
 * Reading Python text for the Python-to-blocks converter (ADR 0014): the parse tree from Lezer's
 * Python grammar (the same parser the Python editor uses for its colours), its syntax errors, and
 * small helpers to look at nodes: their text, their parts, literals and call arguments.
 */
import type { SyntaxNode, Tree } from '@lezer/common';
import { parser } from '@lezer/python';

/** A place in the text that the converter cannot turn into blocks, and why. */
export interface PythonProblem {
  readonly from: number;
  readonly to: number;
  readonly message: string;
}

export const SYNTAX_ERROR = 'Python cannot read this (syntax error).';

export function parsePython(text: string): { tree: Tree; problems: PythonProblem[] } {
  const tree = parser.parse(text);
  const problems: PythonProblem[] = [];
  tree.iterate({
    enter(node) {
      if (!node.type.isError) return;
      const from = node.from;
      // An error with no width marks the character there, or the one before at the end.
      const to = node.to > from ? node.to : Math.min(text.length, from + 1);
      const start = to > from ? from : Math.max(0, from - 1);
      const last = problems[problems.length - 1];
      if (last && start <= last.to) return;
      problems.push({ from: start, to: Math.max(to, start + 1), message: SYNTAX_ERROR });
    },
  });
  return { tree, problems };
}

/** Tokens and keywords that are parts of a node, not things in it. */
const PUNCTUATION = new Set(['(', ')', '[', ']', '{', '}', ',', ':', '.', ';', 'Comment']);

/** The children of a node, without brackets, commas, colons, dots and comments. */
export function parts(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (!PUNCTUATION.has(child.name)) out.push(child);
  }
  return out;
}

/** The statements of a Body or Script node (comments and the colon left out). */
export function statements(node: SyntaxNode): SyntaxNode[] {
  return parts(node).filter((child) => !child.type.isError);
}

/** A node that only wraps another: `(x)`. */
export function unwrap(node: SyntaxNode): SyntaxNode {
  let current = node;
  while (current.name === 'ParenthesizedExpression') {
    const inner = parts(current)[0];
    if (!inner) break;
    current = inner;
  }
  return current;
}

export class Source {
  constructor(readonly text: string) {}

  of(node: SyntaxNode): string {
    return this.text.slice(node.from, node.to);
  }

  /** The node's text with all spaces and line breaks taken out, to compare fixed shapes. */
  compact(node: SyntaxNode): string {
    return this.of(node).replace(/\s+/g, '');
  }

  /** A number literal (`-` in front included), or `null`. */
  number(node: SyntaxNode): number | null {
    const inner = unwrap(node);
    if (inner.name === 'Number') return parseNumber(this.of(inner));
    if (inner.name === 'UnaryExpression') {
      const [op, operand] = parts(inner);
      if (op && operand && this.of(op) === '-') {
        const value = this.number(operand);
        if (value !== null && unwrap(operand).name === 'Number') return -value;
      }
    }
    return null;
  }

  /** A plain string literal's value, or `null` (f-strings, bytes and the like are not). */
  string(node: SyntaxNode): string | null {
    const inner = unwrap(node);
    if (inner.name !== 'String') return null;
    return decodeString(this.of(inner));
  }

  /** `a.b.c` as `['a', 'b', 'c']`, or `null` if it is anything else. */
  dotted(node: SyntaxNode): string[] | null {
    const inner = unwrap(node);
    if (inner.name === 'VariableName') return [this.of(inner)];
    if (inner.name !== 'MemberExpression') return null;
    const [object, property, extra] = parts(inner);
    if (!object || !property || extra || property.name !== 'PropertyName') return null;
    const left = this.dotted(object);
    return left ? [...left, this.of(property)] : null;
  }
}

/** A Python number literal: decimal, with `_`, exponent, or 0x/0o/0b; not complex. */
export function parseNumber(text: string): number | null {
  const clean = text.replace(/_/g, '');
  if (/[jJ]$/.test(clean)) return null;
  if (/^0[xX][0-9a-fA-F]+$/.test(clean)) return Number.parseInt(clean.slice(2), 16);
  if (/^0[oO][0-7]+$/.test(clean)) return Number.parseInt(clean.slice(2), 8);
  if (/^0[bB][01]+$/.test(clean)) return Number.parseInt(clean.slice(2), 2);
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

/** The value of a Python string literal; `null` for prefixes other than r and u. */
export function decodeString(literal: string): string | null {
  const match = /^([rRuU]?)('''|"""|'|")([\s\S]*)\2$/.exec(literal);
  if (!match) return null;
  const raw = match[1]!.toLowerCase() === 'r';
  const body = match[3]!;
  if (raw) return body;
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]!;
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = body[i + 1];
    i += 1;
    switch (next) {
      case undefined:
        return null;
      case '\n':
        break;
      case '\\':
      case "'":
      case '"':
        out += next;
        break;
      case 'n':
        out += '\n';
        break;
      case 't':
        out += '\t';
        break;
      case 'r':
        out += '\r';
        break;
      case '0':
        out += '\0';
        break;
      case 'x':
      case 'u': {
        const size = next === 'x' ? 2 : 4;
        const hex = body.slice(i + 1, i + 1 + size);
        if (!new RegExp(`^[0-9a-fA-F]{${size}}$`).test(hex)) return null;
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += size;
        break;
      }
      default:
        out += `\\${next}`;
    }
  }
  return out;
}

/** The arguments of a call: positional ones in order, and keyword ones by name. */
export interface CallArguments {
  readonly positional: SyntaxNode[];
  readonly keywords: Map<string, SyntaxNode>;
  /** `*args`, `**kwargs` or a generator: no block takes these. */
  readonly unsupported: SyntaxNode | null;
}

export function callArguments(source: Source, argList: SyntaxNode): CallArguments {
  const positional: SyntaxNode[] = [];
  const keywords = new Map<string, SyntaxNode>();
  let unsupported: SyntaxNode | null = null;
  const children = parts(argList);
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i]!;
    const next = children[i + 1];
    if (child.name === 'VariableName' && next?.name === 'AssignOp') {
      const value = children[i + 2];
      if (value) keywords.set(source.of(child), value);
      i += 2;
    } else if (child.name === '*' || child.name === '**' || child.name === 'for') {
      unsupported ??= child;
    } else {
      positional.push(child);
    }
  }
  return { positional, keywords, unsupported };
}

/** A call's callee and its arguments, or `null` when the node is no call. */
export function asCall(
  source: Source,
  node: SyntaxNode,
): { callee: SyntaxNode; args: CallArguments } | null {
  const inner = unwrap(node);
  if (inner.name !== 'CallExpression') return null;
  const callee = inner.firstChild;
  const argList = inner.getChild('ArgList');
  if (!callee || !argList) return null;
  return { callee, args: callArguments(source, argList) };
}
