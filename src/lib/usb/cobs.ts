/**
 * Consistent Overhead Byte Stuffing (COBS), SPIKE Prime variant: how Pybricks frames messages on
 * its USB serial link (docs/protocol/pybricks-usb.md section 3). Ported from pybricks-micropython
 * v4.1.3, commit c860b6a00301fb7c6ecd429da11dcb5a6c557c7a (MIT; NOTICE):
 * - the scheme and its constants: lib/pbio/include/pbio/cobs.h#L4-L52
 *   https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/include/pbio/cobs.h#L4-L52
 * - the encoder: lib/pbio/src/cobs.c#L30-L76
 *   https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/src/cobs.c#L30-L76
 * - the decoder: lib/pbio/src/cobs.c#L78-L196
 *   https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/pbio/src/cobs.c#L78-L196
 *
 * Unlike classic COBS it escapes 0x00, 0x01 and 0x02, so 0x02 can end a frame; each code word
 * carries both the block size and which of the three values ended the block
 * (delimiter × 84 + size + 2, or 0xFF for a full block), and the body is XORed with 0x03. Every
 * frame starts with a message type byte, the "prefix".
 */

/** Ends every frame. */
export const COBS_DELIMITER = 0x02;
/** A high-priority start delimiter: never sent by the hub, skipped when decoding. */
const DELIMITER_HIGH_PRIORITY = 0x01;
const XOR = 0x03;
const MAX_DELIMITER = 0x02;
const CODE_OFFSET = 2;
const MAX_BLOCK_SIZE = 84;
const NO_DELIMITER = 0xff;

/** Encodes `prefix` then `payload` into one frame, ending with the delimiter. */
export function cobsEncode(prefix: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  // At most one extra code word per block, plus the last one and the delimiter.
  const out = new Uint8Array(
    payload.length + 1 + Math.floor((payload.length + 1) / MAX_BLOCK_SIZE) + 2,
  );
  let write = 0;
  let code = write++;
  out[code] = NO_DELIMITER;
  let block = 1;
  for (let read = 0; read < payload.length + 1; read += 1) {
    const byte = read === 0 ? prefix & 0xff : payload[read - 1]!;
    if (byte > MAX_DELIMITER) {
      out[write++] = byte;
      block += 1;
    }
    if (byte <= MAX_DELIMITER || block > MAX_BLOCK_SIZE) {
      if (byte <= MAX_DELIMITER) out[code] = byte * MAX_BLOCK_SIZE + block + CODE_OFFSET;
      code = write++;
      out[code] = NO_DELIMITER;
      block = 1;
    }
  }
  out[code] = block + CODE_OFFSET;
  for (let i = 0; i < write; i += 1) out[i]! ^= XOR;
  out[write++] = COBS_DELIMITER;
  return out.slice(0, write);
}

/** A code word: the delimiter value that ended its block (if any) and the block's length. */
function unescape(code: number): { value: number | null; block: number } {
  if (code === NO_DELIMITER) return { value: null, block: MAX_BLOCK_SIZE + 1 };
  const offset = code - CODE_OFFSET;
  let value = Math.floor(offset / MAX_BLOCK_SIZE);
  let block = offset % MAX_BLOCK_SIZE;
  if (block === 0) {
    // A full block that still ends in a delimiter borrows from the value.
    block = MAX_BLOCK_SIZE;
    value -= 1;
  }
  return { value, block };
}

/**
 * Decodes one frame (its delimiter already removed) into its prefix and payload, or `null` when
 * it is empty or malformed.
 */
export function cobsDecode(frame: Uint8Array): { prefix: number; payload: Uint8Array } | null {
  let read = 0;
  if (frame.length > 0 && frame[0] === DELIMITER_HIGH_PRIORITY) read += 1;
  if (read >= frame.length) return null;
  const out: number[] = [];
  let { value, block } = unescape(frame[read++]! ^ XOR);
  if (block < 1 || (value !== null && (value < 0 || value > MAX_DELIMITER))) return null;
  while (read < frame.length) {
    const byte = frame[read++]! ^ XOR;
    block -= 1;
    if (block > 0) {
      out.push(byte);
      continue;
    }
    if (value !== null) out.push(value);
    ({ value, block } = unescape(byte));
    if (block < 1 || (value !== null && (value < 0 || value > MAX_DELIMITER))) return null;
  }
  // The firmware reports a frame with only its prefix as invalid too (every message has a payload).
  if (out.length < 2) return null;
  return { prefix: out[0]!, payload: Uint8Array.from(out.slice(1)) };
}

/**
 * Splits a byte stream into frames: bytes arrive in pieces of any size, and a frame may span
 * several pieces or share one. Calls `onFrame` with each frame, its delimiter removed.
 */
export class FrameSplitter {
  #pending: number[] = [];
  readonly #maxFrame: number;
  #overflow = false;

  constructor(
    private readonly onFrame: (frame: Uint8Array) => void,
    maxFrame = 4096,
  ) {
    this.#maxFrame = maxFrame;
  }

  push(bytes: Uint8Array): void {
    for (const byte of bytes) {
      if (byte !== COBS_DELIMITER) {
        // An over-long frame is dropped at the next delimiter, as the hub does.
        if (this.#pending.length < this.#maxFrame) this.#pending.push(byte);
        else this.#overflow = true;
        continue;
      }
      if (!this.#overflow && this.#pending.length > 0) this.onFrame(Uint8Array.from(this.#pending));
      this.#pending = [];
      this.#overflow = false;
    }
  }
}
