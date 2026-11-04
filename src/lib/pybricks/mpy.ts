/**
 * MicroPython .mpy header checks and the Pybricks multi-file program format.
 *
 * Sources (see docs/protocol/pybricks-ble.md, section 5):
 * - The firmware loads a .mpy only if byte 0 is 'M', byte 1 is MPY_VERSION (6), and byte 3 (small
 *   int bits) fits; the sub-version in byte 2 is checked only for native code
 *   (https://github.com/pybricks/micropython/blob/13580b6ad057173f62e8b2363e01d6851bcc6699/py/persistentcode.c#L465-L473).
 *   Byte 2 holds the sub-version in bits 0-1 and the native architecture from bit 2 up
 *   (https://github.com/pybricks/micropython/blob/13580b6ad057173f62e8b2363e01d6851bcc6699/py/persistentcode.h#L43-L48).
 * - The upload is a sequence of (u32 LE size, NUL-terminated name, .mpy data), with the entry module
 *   named "__main__", as pybricksdev writes it
 *   (https://github.com/pybricks/pybricksdev/blob/65210a23f53cc62a4b32c0599eac398aeea0c282/pybricksdev/compile.py#L240-L264)
 *   and the firmware reads it
 *   (https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/bricks/_common/micropython.c#L142-L181).
 */

/** 'M', the first byte of every .mpy file. */
export const MPY_MAGIC = 0x4d;

/** The .mpy format version of Pybricks v4.0.1 (`MPY_VERSION 6`). */
export const MPY_VERSION = 6;

/** Small int bits on the 32-bit hubs; a .mpy that needs more is rejected. */
export const MAX_SMALL_INT_BITS = 31;

/** Name of the module the firmware runs. */
export const MAIN_MODULE_NAME = '__main__';

export interface MpyHeader {
  readonly version: number;
  readonly subVersion: number;
  /** 0 means bytecode only (no native code). */
  readonly arch: number;
  readonly smallIntBits: number;
}

export type MpyHeaderCheck =
  | { readonly ok: true; readonly header: MpyHeader }
  | { readonly ok: false; readonly reason: string };

/** Checks that `mpy` is a bytecode-only .mpy file the tested firmware accepts. */
export function checkMpyHeader(mpy: Uint8Array): MpyHeaderCheck {
  if (mpy.length < 4) return { ok: false, reason: 'The .mpy data is shorter than its header.' };
  const [magic = 0, version = 0, features = 0, smallIntBits = 0] = mpy;
  if (magic !== MPY_MAGIC) return { ok: false, reason: 'The data is not a .mpy file.' };
  const header: MpyHeader = {
    version,
    subVersion: features & 3,
    arch: features >> 2,
    smallIntBits,
  };
  if (version !== MPY_VERSION) {
    return {
      ok: false,
      reason: `.mpy version ${version}, but the hub needs version ${MPY_VERSION}.`,
    };
  }
  if (header.arch !== 0) {
    return { ok: false, reason: 'The .mpy contains native code; MatPilot uploads bytecode only.' };
  }
  if (smallIntBits > MAX_SMALL_INT_BITS) {
    return {
      ok: false,
      reason: `The .mpy needs ${smallIntBits}-bit small ints; the hub has ${MAX_SMALL_INT_BITS}.`,
    };
  }
  return { ok: true, header };
}

export interface ProgramModule {
  readonly name: string;
  readonly mpy: Uint8Array;
}

/**
 * Packs compiled modules into the upload format. The first module must be `__main__`, the entry
 * point the firmware runs.
 */
export function packMultiMpy(modules: readonly ProgramModule[]): Uint8Array {
  if (modules[0]?.name !== MAIN_MODULE_NAME) {
    throw new Error(`The first module must be named "${MAIN_MODULE_NAME}".`);
  }
  const encoder = new TextEncoder();
  const parts = modules.map(({ name, mpy }) => {
    if (name.length === 0 || name.includes('\0')) throw new Error(`Invalid module name: "${name}"`);
    return { name: encoder.encode(name), mpy };
  });
  const total = parts.reduce((sum, part) => sum + 4 + part.name.length + 1 + part.mpy.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let offset = 0;
  for (const part of parts) {
    view.setUint32(offset, part.mpy.length, true);
    offset += 4;
    out.set(part.name, offset);
    offset += part.name.length;
    out[offset++] = 0;
    out.set(part.mpy, offset);
    offset += part.mpy.length;
  }
  return out;
}
