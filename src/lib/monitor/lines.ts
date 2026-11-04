/**
 * Turns the hub's stdout byte stream into lines.
 *
 * Stdout arrives as notifications that can end in the middle of a line, or in the middle of a
 * multi-byte UTF-8 character (docs/protocol/pybricks-ble.md, section 4). A streaming decoder keeps
 * the partial character, and this class keeps the partial line until its newline arrives.
 */
export class LineSplitter {
  #decoder = new TextDecoder('utf-8', { fatal: false });
  #partial = '';

  /** Feeds bytes; returns the lines they complete (without line endings). */
  push(bytes: Uint8Array): string[] {
    const text = this.#partial + this.#decoder.decode(bytes, { stream: true });
    const parts = text.split('\n');
    this.#partial = parts.pop() ?? '';
    return parts.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  }

  /** The text after the last newline, not yet a complete line. */
  get partial(): string {
    return this.#partial;
  }

  /** Ends the stream (program stopped): returns the remaining partial line, if any. */
  flush(): string[] {
    const rest = this.#partial + this.#decoder.decode();
    this.#partial = '';
    this.#decoder = new TextDecoder('utf-8', { fatal: false });
    return rest === '' ? [] : [rest.endsWith('\r') ? rest.slice(0, -1) : rest];
  }
}
