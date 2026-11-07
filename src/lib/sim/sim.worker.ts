/**
 * Runs a program on a mat away from the page (ADR 0016, step 7c), so a program that never waits
 * cannot freeze it: the page ends this worker when it takes too long (./run.ts). MicroPython is
 * served from this site (scripts/vendor-assets.mjs) and loaded here, not bundled.
 */
import { runProgram, type LoadMicroPython, type SimInput } from './runner';

interface Request {
  readonly input: SimInput;
  /** The site's address, ending in /. */
  readonly base: string;
}

addEventListener('message', (event: MessageEvent<Request>) => {
  void (async () => {
    const { input, base } = event.data;
    try {
      const url = `${base}vendor/micropython/micropython.js`;
      const micropython = (await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ url
      )) as {
        loadMicroPython: LoadMicroPython;
      };
      const result = await runProgram(micropython.loadMicroPython, input, {
        wasmUrl: `${base}vendor/micropython/micropython.wasm`,
      });
      postMessage({ ok: true, result });
    } catch (error) {
      postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  })();
});
