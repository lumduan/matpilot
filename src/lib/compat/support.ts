/**
 * The project's supported browser and platform policy (docs/adr/0001-browser-only-web-bluetooth.md).
 * docs/compatibility.md and README.md carry the same lists; keep all three in sync.
 */

export const SUPPORTED_BROWSERS = ['Google Chrome', 'Microsoft Edge'] as const;

export const SUPPORTED_PLATFORMS = ['Windows', 'macOS', 'ChromeOS', 'Android'] as const;

export const UNSUPPORTED_BROWSERS_SENTENCE =
  'Firefox, Safari, and every browser on iPhone and iPad (iOS and iPadOS) are not supported because they do not implement Web Bluetooth.';

/** The message shown whenever a compatibility check fails. */
export const SUPPORT_STATEMENT = `MatPilot needs Web Bluetooth, which is available only in Chromium-based browsers. Use ${SUPPORTED_BROWSERS.join(' or ')} on ${listWithOr(SUPPORTED_PLATFORMS)}. ${UNSUPPORTED_BROWSERS_SENTENCE}`;

function listWithOr(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}
