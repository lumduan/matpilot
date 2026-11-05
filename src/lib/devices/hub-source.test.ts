import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compilePython } from '@/lib/pybricks/compiler';
import { compactSource, LIVE_PREFIX, LIVE_VIEW_PASTE, LIVE_VIEW_SOURCE } from './hub-source';

// The compiler's Emscripten loader reads the .wasm from disk only when fetch is absent
// (see src/lib/pybricks/compiler.golden.test.ts).
beforeEach(() => {
  vi.stubGlobal('fetch', undefined);
});

async function expectCompiles(code: string) {
  const outcome = await compilePython(code);
  expect(
    outcome.ok,
    outcome.ok ? '' : `${outcome.error.message} (line ${outcome.error.line})\n${code}`,
  ).toBe(true);
}

describe('the live device values reader', () => {
  it('compiles, as written and as pasted', async () => {
    await expectCompiles(LIVE_VIEW_SOURCE);
    await expectCompiles(LIVE_VIEW_PASTE);
  });

  it('is pasted as plain ASCII with tab indents and no blank lines', () => {
    expect(LIVE_VIEW_PASTE).toMatch(/^[\t\n\x20-\x7e]+$/);
    expect(LIVE_VIEW_PASTE).not.toMatch(/\n\n/);
    expect(LIVE_VIEW_PASTE).not.toMatch(/^ /m);
    expect(LIVE_VIEW_PASTE.length).toBeLessThan(LIVE_VIEW_SOURCE.length);
    // Stays small: it is sent every time live values start.
    expect(LIVE_VIEW_PASTE.length).toBeLessThan(2000);
  });

  it('only reads devices: no motor moves, lights, sounds or display changes', () => {
    for (const call of ['.run', '.dc(', '.hold(', '.light', '.display', '.speaker', '.track']) {
      expect(LIVE_VIEW_SOURCE).not.toContain(call);
    }
  });

  it('prints only lines that start with the prefix, and ends the REPL when done', () => {
    const prints = LIVE_VIEW_SOURCE.match(/print\(.*\)/g) ?? [];
    expect(prints.length).toBeGreaterThan(0);
    for (const call of prints) expect(call).toMatch(new RegExp(`^print\\("${LIVE_PREFIX}`));
    expect(LIVE_VIEW_SOURCE.trimEnd().endsWith('raise SystemExit')).toBe(true);
  });

  it('turns 4-space indents into tabs', () => {
    expect(compactSource('a\n\nif a:\n    b\n        c\n')).toBe('a\nif a:\n\tb\n\t\tc\n');
  });
});
