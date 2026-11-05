/**
 * Pybricks BLE protocol: command encoders and event decoders. Every value is documented, with
 * upstream citations at Pybricks v4.0.1 (commit 4104553), in docs/protocol/pybricks-ble.md. The
 * section numbers below refer to that page.
 *
 * FW = https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/
 */

/**
 * Command types, byte 0 of a write (section 3).
 * FW lib/pbio/include/pbio/protocol.h#L86-L208
 */
export const Command = {
  STOP_USER_PROGRAM: 0x00,
  START_USER_PROGRAM: 0x01,
  WRITE_USER_PROGRAM_META: 0x03,
  WRITE_USER_RAM: 0x04,
  WRITE_STDIN: 0x06,
} as const;

/**
 * Event types, byte 0 of a notification (section 4).
 * FW lib/pbio/include/pbio/protocol.h#L240-L292
 */
export const EventType = {
  STATUS_REPORT: 0x00,
  WRITE_STDOUT: 0x01,
  WRITE_APP_DATA: 0x02,
} as const;

/**
 * Status flag bit numbers (section 4).
 * FW lib/pbio/include/pbio/protocol.h#L294-L394
 */
export const StatusFlag = {
  BATTERY_LOW_VOLTAGE_WARNING: 0,
  BATTERY_LOW_VOLTAGE_SHUTDOWN: 1,
  POWER_BUTTON_PRESSED: 5,
  USER_PROGRAM_RUNNING: 6,
  SHUTDOWN: 7,
} as const;

/**
 * Hub feature flags (section 2).
 * FW lib/pbio/include/pbio/protocol.h#L401-L448
 */
export const FeatureFlag = {
  BUILTIN_REPL: 1 << 0,
  USER_PROG_FORMAT_MULTI_MPY_V6: 1 << 1,
} as const;

/**
 * Built-in program ids for START_USER_PROGRAM (section 3). Ids 0 to 127 are downloaded program
 * slots; 128 is the REPL. FW lib/pbio/include/pbio/protocol.h#L43-L84
 */
export const ProgramId = {
  REPL: 128,
} as const;

/** Bytes before the data in WRITE_USER_RAM: 1 command byte and a u32 offset (section 6). */
export const WRITE_USER_RAM_HEADER_SIZE = 5;

/** Bytes before the data in WRITE_STDIN: 1 command byte (section 6). */
export const WRITE_STDIN_HEADER_SIZE = 1;

export interface HubCapabilities {
  /** Largest value a single write may carry (MTU - 3, at most 512 over BLE). */
  readonly maxWriteSize: number;
  readonly featureFlags: number;
  readonly maxProgramSize: number;
  /** Program slots; `null` before protocol 1.5, which did not report them. */
  readonly numSlots: number | null;
}

/**
 * Decodes the hub capabilities characteristic (section 2): u16 max write size, u32 feature flags,
 * u32 max program size, and since protocol 1.5 one byte for the number of slots.
 * FW lib/pbio/src/protocol/pybricks.c#L39-L63
 */
export function decodeHubCapabilities(value: DataView): HubCapabilities {
  if (value.byteLength < 10) {
    throw new Error(`Hub capabilities are ${value.byteLength} bytes; at least 10 are expected.`);
  }
  return {
    maxWriteSize: value.getUint16(0, true),
    featureFlags: value.getUint32(2, true),
    maxProgramSize: value.getUint32(6, true),
    numSlots: value.byteLength >= 11 ? value.getUint8(10) : null,
  };
}

export type HubEvent =
  | {
      readonly type: 'status';
      readonly flags: number;
      /** Running program id (protocol 1.4+), or `null` when not reported. */
      readonly programId: number | null;
      /** Selected slot (protocol 1.5+), or `null` when not reported. */
      readonly selectedSlot: number | null;
    }
  | { readonly type: 'stdout'; readonly data: Uint8Array }
  | { readonly type: 'app-data'; readonly data: Uint8Array }
  | { readonly type: 'unknown'; readonly code: number };

/**
 * Decodes one notification from the command/event characteristic (section 4).
 * Status report layout: FW lib/pbio/src/protocol/pybricks.c#L31-L37
 */
export function decodeHubEvent(value: DataView): HubEvent | null {
  if (value.byteLength < 1) return null;
  const code = value.getUint8(0);
  const payload = new Uint8Array(value.buffer, value.byteOffset + 1, value.byteLength - 1).slice();
  switch (code) {
    case EventType.STATUS_REPORT:
      if (value.byteLength < 5) return null;
      return {
        type: 'status',
        flags: value.getUint32(1, true),
        programId: value.byteLength >= 6 ? value.getUint8(5) : null,
        selectedSlot: value.byteLength >= 7 ? value.getUint8(6) : null,
      };
    case EventType.WRITE_STDOUT:
      return { type: 'stdout', data: payload };
    case EventType.WRITE_APP_DATA:
      return { type: 'app-data', data: payload };
    default:
      return { type: 'unknown', code };
  }
}

export function hasStatusFlag(flags: number, flag: number): boolean {
  return (flags & (1 << flag)) !== 0;
}

function withU32(command: number, value: number): Uint8Array {
  const out = new Uint8Array(5);
  out[0] = command;
  new DataView(out.buffer).setUint32(1, value, true);
  return out;
}

/** STOP_USER_PROGRAM, no payload (section 3). */
export function encodeStopUserProgram(): Uint8Array {
  return Uint8Array.of(Command.STOP_USER_PROGRAM);
}

/**
 * START_USER_PROGRAM without a program id: the firmware then starts the selected slot, which is
 * where the program was just written (FW lib/pbio/sys/command.c#L47-L54).
 */
export function encodeStartUserProgram(): Uint8Array {
  return Uint8Array.of(Command.START_USER_PROGRAM);
}

/**
 * START_USER_PROGRAM with a program id (protocol 1.4+), for example the REPL. A built-in program
 * does not touch the stored program slots (FW lib/pbio/sys/command.c#L47-L54).
 */
export function encodeStartProgramId(programId: number): Uint8Array {
  if (!Number.isInteger(programId) || programId < 0 || programId > 255) {
    throw new Error(`A program id is one byte; got ${programId}.`);
  }
  return Uint8Array.of(Command.START_USER_PROGRAM, programId);
}

/** WRITE_USER_PROGRAM_META with a u32 program size (section 3). */
export function encodeWriteUserProgramMeta(size: number): Uint8Array {
  return withU32(Command.WRITE_USER_PROGRAM_META, size);
}

/** WRITE_USER_RAM with a u32 offset and the data (section 3). */
export function encodeWriteUserRam(offset: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(WRITE_USER_RAM_HEADER_SIZE + data.length);
  out.set(withU32(Command.WRITE_USER_RAM, offset));
  out.set(data, WRITE_USER_RAM_HEADER_SIZE);
  return out;
}

/** WRITE_STDIN with the data (section 3). */
export function encodeWriteStdin(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(WRITE_STDIN_HEADER_SIZE + data.length);
  out[0] = Command.WRITE_STDIN;
  out.set(data, WRITE_STDIN_HEADER_SIZE);
  return out;
}

/**
 * The writes that upload a program, in order (section 6): clear the size, write the data in
 * chunks of (max write size - 5) bytes, then set the size. Mirrors pybricksdev's
 * `download_user_program()`.
 */
export function encodeProgramUpload(program: Uint8Array, maxWriteSize: number): Uint8Array[] {
  const chunkSize = maxWriteSize - WRITE_USER_RAM_HEADER_SIZE;
  if (chunkSize < 1) throw new Error(`The hub's max write size (${maxWriteSize}) is too small.`);
  const writes = [encodeWriteUserProgramMeta(0)];
  for (let offset = 0; offset < program.length; offset += chunkSize) {
    writes.push(encodeWriteUserRam(offset, program.subarray(offset, offset + chunkSize)));
  }
  writes.push(encodeWriteUserProgramMeta(program.length));
  return writes;
}

/** Splits stdin data into writes of at most (max write size - 1) bytes. */
export function encodeStdinWrites(data: Uint8Array, maxWriteSize: number): Uint8Array[] {
  const chunkSize = maxWriteSize - WRITE_STDIN_HEADER_SIZE;
  if (chunkSize < 1) throw new Error(`The hub's max write size (${maxWriteSize}) is too small.`);
  const writes: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    writes.push(encodeWriteStdin(data.subarray(offset, offset + chunkSize)));
  }
  return writes;
}
