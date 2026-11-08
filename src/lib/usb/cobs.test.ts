import { describe, expect, it } from 'vitest';
import { FrameSplitter, cobsDecode, cobsEncode } from './cobs';

const bytes = (...values: number[]) => Uint8Array.from(values);

describe('COBS, SPIKE Prime variant', () => {
  it('matches the firmware’s known answers', () => {
    // FW lib/pbio/test/src/test_cobs.c#L51-L73 at c860b6a.
    expect(cobsEncode(0x00)).toEqual(bytes(0x00, 0x00, 0x02));
    expect(cobsEncode(0x41, bytes(0x42, 0x43))).toEqual(bytes(0x05, 0x42, 0x41, 0x40, 0x02));
  });

  it('frames the messages MatPilot sends', () => {
    expect(cobsEncode(1, bytes(1))).toEqual(bytes(0x54, 0x54, 0x00, 0x02)); // subscribe
    expect(cobsEncode(3, bytes(1, 0x26, 0x2a))).toEqual(bytes(0x5b, 0x00, 0x06, 0x25, 0x29, 0x02));
    expect(cobsEncode(2, bytes(7, 0))).toEqual(bytes(0xa8, 0x07, 0x04, 0x00, 0x02)); // stop, tag 7
  });

  it('never puts the delimiter or 0x03 inside a frame, and decodes what it encodes', () => {
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
    for (const length of [0, 1, 2, 3, 83, 84, 85, 168, 169, 500, 600]) {
      for (const fill of ['random', 'zeros', 'ones', 'twos', 'high'] as const) {
        const payload = Uint8Array.from({ length }, () =>
          fill === 'random'
            ? random()
            : fill === 'zeros'
              ? 0
              : fill === 'ones'
                ? 1
                : fill === 'twos'
                  ? 2
                  : 200,
        );
        const prefix = length % 4;
        const frame = cobsEncode(prefix, payload);
        expect(frame[frame.length - 1]).toBe(0x02);
        const body = frame.slice(0, -1);
        expect(body.includes(0x02), `${fill} ${length}`).toBe(false);
        expect(body.includes(0x03), `${fill} ${length}`).toBe(false);
        if (length === 0) continue;
        expect(cobsDecode(body), `${fill} ${length}`).toEqual({ prefix, payload });
      }
    }
  });

  it('refuses empty and prefix-only frames, and skips a high-priority start', () => {
    expect(cobsDecode(bytes())).toBeNull();
    expect(cobsDecode(bytes(0x00, 0x00))).toBeNull();
    const frame = cobsEncode(2, bytes(9, 9)).slice(0, -1);
    expect(cobsDecode(Uint8Array.of(0x01, ...frame))).toEqual({ prefix: 2, payload: bytes(9, 9) });
  });

  it('splits a stream into frames, however the bytes arrive', () => {
    const frames: Uint8Array[] = [];
    const splitter = new FrameSplitter((frame) => frames.push(frame), 8);
    const a = cobsEncode(2, bytes(1, 2, 3));
    const b = cobsEncode(1, bytes(5));
    const stream = Uint8Array.of(...a, ...b);
    for (const byte of stream) splitter.push(Uint8Array.of(byte));
    splitter.push(Uint8Array.of(0x02, 0x02)); // empty frames are ignored
    // Too long: dropped at the next delimiter, and the stream goes on.
    splitter.push(Uint8Array.of(...new Uint8Array(20).fill(0x10), 0x02, ...b));
    expect(frames.map((frame) => cobsDecode(frame))).toEqual([
      { prefix: 2, payload: bytes(1, 2, 3) },
      { prefix: 1, payload: bytes(5) },
      { prefix: 1, payload: bytes(5) },
    ]);
  });
});
