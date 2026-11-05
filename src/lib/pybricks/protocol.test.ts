import { describe, expect, it } from 'vitest';
import {
  decodeHubCapabilities,
  decodeHubEvent,
  encodeProgramUpload,
  encodeStartProgramId,
  encodeStartUserProgram,
  encodeStdinWrites,
  encodeStopUserProgram,
  encodeWriteUserProgramMeta,
  encodeWriteUserRam,
  hasStatusFlag,
  ProgramId,
  StatusFlag,
} from './protocol';

const view = (bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);
const list = (bytes: Uint8Array) => Array.from(bytes);

describe('command encoders', () => {
  it('encodes stop, start, meta and RAM writes little-endian', () => {
    expect(list(encodeStopUserProgram())).toEqual([0x00]);
    expect(list(encodeStartUserProgram())).toEqual([0x01]);
    expect(list(encodeWriteUserProgramMeta(0x01020304))).toEqual([0x03, 4, 3, 2, 1]);
    expect(list(encodeWriteUserRam(258, Uint8Array.of(9, 8)))).toEqual([0x04, 2, 1, 0, 0, 9, 8]);
  });

  it('starts a built-in program by id, and refuses ids that are not one byte', () => {
    expect(list(encodeStartProgramId(ProgramId.REPL))).toEqual([0x01, 0x80]);
    expect(() => encodeStartProgramId(256)).toThrow(/one byte/);
    expect(() => encodeStartProgramId(-1)).toThrow(/one byte/);
  });

  it('uploads like pybricksdev: meta 0, chunks of max-5 bytes, then meta size', () => {
    const program = Uint8Array.from({ length: 33 }, (_, i) => i);
    const writes = encodeProgramUpload(program, 20).map(list);
    expect(writes[0]).toEqual([0x03, 0, 0, 0, 0]);
    expect(writes[1]).toEqual([0x04, 0, 0, 0, 0, ...list(program.subarray(0, 15))]);
    expect(writes[2]).toEqual([0x04, 15, 0, 0, 0, ...list(program.subarray(15, 30))]);
    expect(writes[3]).toEqual([0x04, 30, 0, 0, 0, 30, 31, 32]);
    expect(writes[4]).toEqual([0x03, 33, 0, 0, 0]);
    expect(writes).toHaveLength(5);
    expect(writes.every((write) => write.length <= 20)).toBe(true);
  });

  it('splits stdin into writes of at most max-1 data bytes', () => {
    const writes = encodeStdinWrites(new TextEncoder().encode('abcdef'), 4).map(list);
    expect(writes).toEqual([
      [0x06, 97, 98, 99],
      [0x06, 100, 101, 102],
    ]);
  });

  it('refuses a max write size too small to carry data', () => {
    expect(() => encodeProgramUpload(new Uint8Array(1), 5)).toThrow('too small');
    expect(() => encodeStdinWrites(new Uint8Array(1), 1)).toThrow('too small');
  });
});

describe('decodeHubCapabilities', () => {
  it('reads the 11-byte protocol 1.5 value', () => {
    expect(
      decodeHubCapabilities(view([0xf4, 0x01, 0x02, 0, 0, 0, 0x00, 0x40, 0x01, 0, 5])),
    ).toEqual({
      maxWriteSize: 500,
      featureFlags: 2,
      maxProgramSize: 0x14000,
      numSlots: 5,
    });
  });

  it('reads the older 10-byte value without slots, and rejects shorter data', () => {
    expect(decodeHubCapabilities(view([20, 0, 2, 0, 0, 0, 0, 1, 0, 0])).numSlots).toBeNull();
    expect(() => decodeHubCapabilities(view([1, 2, 3]))).toThrow('at least 10');
  });
});

describe('decodeHubEvent', () => {
  it('decodes a status report with the running flag, program id and slot', () => {
    const flags = 1 << StatusFlag.USER_PROGRAM_RUNNING;
    const event = decodeHubEvent(view([0x00, flags, 0, 0, 0, 0, 2]));
    expect(event).toEqual({ type: 'status', flags, programId: 0, selectedSlot: 2 });
    expect(hasStatusFlag(flags, StatusFlag.USER_PROGRAM_RUNNING)).toBe(true);
    expect(hasStatusFlag(flags, StatusFlag.SHUTDOWN)).toBe(false);
  });

  it('decodes older 5-byte status reports and stdout data', () => {
    expect(decodeHubEvent(view([0x00, 1, 0, 0, 0]))).toEqual({
      type: 'status',
      flags: 1,
      programId: null,
      selectedSlot: null,
    });
    const stdout = decodeHubEvent(view([0x01, 104, 105, 10]));
    expect(stdout?.type).toBe('stdout');
    expect(stdout?.type === 'stdout' ? list(stdout.data) : null).toEqual([104, 105, 10]);
  });

  it('handles empty, short and unknown events', () => {
    expect(decodeHubEvent(view([]))).toBeNull();
    expect(decodeHubEvent(view([0x00, 1]))).toBeNull();
    expect(decodeHubEvent(view([0x03, 1, 2]))).toEqual({ type: 'unknown', code: 3 });
  });
});
