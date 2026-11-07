/**
 * For tests: runs a generated program on a simulated mat (MicroPython in Node) and says how it
 * ended, so every block's Python is shown to run through the simulated `pybricks`, not only to
 * compile (ADR 0016, step 7c).
 */
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript';
import { runProgram, type LoadMicroPython, type SimEnd } from './runner';

export async function runOnTestMat(code: string, timeLimitMs = 20_000): Promise<SimEnd> {
  const result = await runProgram(loadMicroPython as unknown as LoadMicroPython, {
    files: [{ name: 'main.py', code }],
    robot: {
      wheelDiameterMm: 56,
      trackMm: 112,
      left: 'A',
      right: 'B',
      mirrored: 'left',
      motorTopSpeedDegS: 1000,
    },
    start: { xMm: 1000, yMm: 500, headingDeg: 0 },
    timeLimitMs,
    driveSpeed: null,
  });
  return result.end;
}
