import { describe, expect, it, vi } from 'vitest';
import {
  compilePython,
  parseCompileError,
  type MpyCrossLike,
  type MpyCrossResult,
} from './compiler';

function fakeCompiler(result: MpyCrossResult) {
  const compile = vi.fn<MpyCrossLike['compile']>(() => Promise.resolve(result));
  return { compile, load: () => Promise.resolve({ compile }) };
}

const MPY = new Uint8Array([0x4d, 6, 0, 31, 1, 2, 3]);

describe('compilePython', () => {
  it('returns the .mpy and names the source main.py by default', async () => {
    const fake = fakeCompiler({ status: 0, mpy: MPY, out: [], err: [] });
    const outcome = await compilePython('print(1)', { loadCompiler: fake.load });
    expect(outcome).toEqual({ ok: true, mpy: MPY });
    expect(fake.compile).toHaveBeenCalledWith('main.py', 'print(1)', undefined, undefined);
  });

  it('passes a custom source name and wasm path through', async () => {
    const fake = fakeCompiler({ status: 0, mpy: MPY, out: [], err: [] });
    await compilePython('x = 1', {
      sourceName: 'robot.py',
      wasmPath: '/w.wasm',
      loadCompiler: fake.load,
    });
    expect(fake.compile).toHaveBeenCalledWith('robot.py', 'x = 1', undefined, '/w.wasm');
  });

  it('reports syntax errors with their line', async () => {
    const fake = fakeCompiler({
      status: 1,
      out: [],
      err: [
        'Traceback (most recent call last):',
        '  File "<stdin>", line 3',
        'SyntaxError: invalid syntax',
      ],
    });
    const outcome = await compilePython('if True\n', { loadCompiler: fake.load });
    expect(outcome).toEqual({
      ok: false,
      error: {
        message: 'SyntaxError: invalid syntax',
        line: 3,
        detail:
          'Traceback (most recent call last):\n  File "<stdin>", line 3\nSyntaxError: invalid syntax',
      },
    });
  });

  it('turns a compiler that cannot load into an error, never a rejection', async () => {
    const outcome = await compilePython('x', {
      loadCompiler: () => Promise.reject(new Error('wasm blocked')),
    });
    expect(outcome).toMatchObject({
      ok: false,
      error: { message: 'The compiler could not run: wasm blocked' },
    });
  });

  it('rejects output the hub would not load', async () => {
    const fake = fakeCompiler({
      status: 0,
      mpy: new Uint8Array([0x4d, 5, 0, 31]),
      out: [],
      err: [],
    });
    const outcome = await compilePython('x', { loadCompiler: fake.load });
    expect(outcome).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('version 5') },
    });
  });
});

describe('parseCompileError', () => {
  it('handles output split across chunks and missing line numbers', () => {
    expect(parseCompileError(['oops\nMemoryError: memory allocation failed'])).toEqual({
      message: 'MemoryError: memory allocation failed',
      line: null,
      detail: 'oops\nMemoryError: memory allocation failed',
    });
    expect(parseCompileError([]).message).toBe('The compiler failed without a message.');
  });
});
