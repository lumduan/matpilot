/** Base64 for GitHub's contents API, which sends and receives file bytes as Base64 (ADR 0011). */

/** UTF-8 bytes of `text`, as Base64. */
export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  // Chunks keep String.fromCharCode's argument list short.
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/** Base64 (GitHub wraps it in lines) to text, read as UTF-8. Throws on bad Base64 or UTF-8. */
export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
