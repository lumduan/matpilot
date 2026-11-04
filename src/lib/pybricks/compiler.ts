/**
 * Compiles MicroPython source to a .mpy module in the browser with Pybricks' WebAssembly build of
 * mpy-cross (`@pybricks/mpy-cross-v6`, docs/adr/0006-adopt-pybricks-mpy-cross.md).
 *
 * The compiler is loaded lazily, on the first compile, so pages that never compile do not download
 * it. In the browser its .wasm file is served from this site (see scripts/vendor-assets.mjs).
 */

import { checkMpyHeader } from './mpy';

/** Where the vendored compiler binary is served in the static export. */
export const MPY_CROSS_WASM_PATH = '/vendor/mpy-cross-v6.wasm';

/** The default name compiled programs carry; tracebacks on the hub show it. */
export const DEFAULT_SOURCE_NAME = 'main.py';

/** Result shape of `compile()` from `@pybricks/mpy-cross-v6`. */
export interface MpyCrossResult {
  readonly status: number;
  readonly mpy?: Uint8Array;
  readonly out: readonly string[];
  readonly err: readonly string[];
}

export interface MpyCrossLike {
  compile(
    fileName: string,
    fileContents: string,
    options?: string[],
    wasmPath?: string,
  ): Promise<MpyCrossResult>;
}

export interface CompileError {
  /** e.g. "SyntaxError: invalid syntax" */
  readonly message: string;
  /** 1-based line of the error in the source, or `null` when the compiler did not say. */
  readonly line: number | null;
  /** The compiler's full error output. */
  readonly detail: string;
}

export type CompileOutcome =
  | { readonly ok: true; readonly mpy: Uint8Array }
  | { readonly ok: false; readonly error: CompileError };

export interface CompileOptions {
  /** Name embedded in the .mpy and shown in tracebacks. Default `main.py`. */
  readonly sourceName?: string;
  /** Path of the .wasm file. Default: the vendored copy in the browser, the package's in Node. */
  readonly wasmPath?: string;
  /** Supplies the compiler. Tests inject fakes; the default loads the real package. */
  readonly loadCompiler?: () => Promise<MpyCrossLike>;
}

async function loadDefaultCompiler(): Promise<MpyCrossLike> {
  const loaded = await import('@pybricks/mpy-cross-v6');
  // The package is CommonJS; bundlers expose `compile` directly or under `default`.
  const compile =
    (loaded as { compile?: MpyCrossLike['compile'] }).compile ??
    (loaded as { default?: { compile?: MpyCrossLike['compile'] } }).default?.compile;
  if (typeof compile !== 'function') throw new Error('mpy-cross did not load.');
  return { compile };
}

function defaultWasmPath(): string | undefined {
  return typeof window === 'undefined' ? undefined : MPY_CROSS_WASM_PATH;
}

/**
 * Reads mpy-cross's error output, for example:
 *
 *     Traceback (most recent call last):
 *       File "<stdin>", line 3
 *     SyntaxError: invalid syntax
 */
export function parseCompileError(err: readonly string[]): CompileError {
  const lines = err.flatMap((chunk) => chunk.split('\n')).map((line) => line.trimEnd());
  const nonEmpty = lines.filter((line) => line.trim() !== '');
  let line: number | null = null;
  for (const text of nonEmpty) {
    const match = /\bline (\d+)/.exec(text);
    if (match?.[1]) line = Number(match[1]);
  }
  const message =
    [...nonEmpty]
      .reverse()
      .find((text) => /^\w*(Error|Exception)\b/.test(text.trim()))
      ?.trim() ??
    nonEmpty.at(-1)?.trim() ??
    'The compiler failed without a message.';
  return { message, line, detail: nonEmpty.join('\n') };
}

/** Compiles one module. Never rejects; failures are returned as `{ ok: false }`. */
export async function compilePython(
  source: string,
  options: CompileOptions = {},
): Promise<CompileOutcome> {
  const sourceName = options.sourceName ?? DEFAULT_SOURCE_NAME;
  let result: MpyCrossResult;
  try {
    const compiler = await (options.loadCompiler ?? loadDefaultCompiler)();
    result = await compiler.compile(
      sourceName,
      source,
      undefined,
      options.wasmPath ?? defaultWasmPath(),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { message: `The compiler could not run: ${detail}`, line: null, detail },
    };
  }
  if (result.status !== 0 || !result.mpy) {
    return { ok: false, error: parseCompileError(result.err) };
  }
  const header = checkMpyHeader(result.mpy);
  if (!header.ok) {
    return { ok: false, error: { message: header.reason, line: null, detail: header.reason } };
  }
  return { ok: true, mpy: result.mpy };
}
