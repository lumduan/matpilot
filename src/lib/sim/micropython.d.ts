/** MicroPython's WebAssembly port ships no types; MatPilot uses only its loader (./runner.ts). */
declare module '@micropython/micropython-webassembly-pyscript' {
  export function loadMicroPython(options?: Record<string, unknown>): Promise<unknown>;
}
