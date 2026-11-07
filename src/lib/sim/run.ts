/**
 * Runs a program on a mat in a Web Worker (./sim.worker.ts) and gives the timeline (ADR 0016,
 * step 7c). A program that keeps the computer busy without waiting (a loop with nothing in it) is
 * stopped after `timeoutMs` of real time.
 */
import type { SimInput, SimResult } from './runner';

export async function runOnMat(input: SimInput, timeoutMs = 30_000): Promise<SimResult> {
  const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<SimResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve({
          frames: [{ t: 0, pose: input.start }],
          events: [],
          end: { reason: 'busy' },
          timeMs: 0,
          sensorsRead: [],
          programDrive: null,
        });
      }, timeoutMs);
      worker.addEventListener(
        'message',
        (event: MessageEvent<{ ok: boolean; result?: SimResult; message?: string }>) => {
          clearTimeout(timer);
          if (event.data.ok && event.data.result) resolve(event.data.result);
          else reject(new Error(event.data.message ?? 'The program could not be run.'));
        },
      );
      worker.addEventListener('error', (event) => {
        clearTimeout(timer);
        reject(new Error(event.message || 'The program could not be run.'));
      });
      worker.postMessage({ input, base: new URL('/', location.href).href });
    });
  } finally {
    worker.terminate();
  }
}
