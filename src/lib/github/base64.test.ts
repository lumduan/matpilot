import { describe, expect, it } from 'vitest';
import { decodeBase64Utf8, encodeBase64Utf8 } from './base64';

describe('base64', () => {
  it('encodes UTF-8 as Node does, and decodes GitHub’s wrapped lines', () => {
    const text = `หุ่นยนต์ 🤖 robot\n${'x'.repeat(70_000)}`;
    const encoded = encodeBase64Utf8(text);
    expect(encoded).toBe(Buffer.from(text, 'utf8').toString('base64'));
    const wrapped = encoded.replace(/(.{60})/g, '$1\n');
    expect(decodeBase64Utf8(wrapped)).toBe(text);
  });

  it('refuses bytes that are not UTF-8', () => {
    expect(() => decodeBase64Utf8(Buffer.from([0xff, 0xfe, 0x00]).toString('base64'))).toThrow();
  });
});
