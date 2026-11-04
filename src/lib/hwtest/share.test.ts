import { describe, expect, it, vi } from 'vitest';
import { copyText } from './share';

describe('copyText', () => {
  it('writes the text through the Clipboard API', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    expect(await copyText('report', { clipboard: { writeText } })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('report');
  });

  it('resolves false without the Clipboard API or when the browser refuses', async () => {
    expect(await copyText('report', {})).toBe(false);
    expect(await copyText('report', undefined)).toBe(false);
    const writeText = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
    expect(await copyText('report', { clipboard: { writeText } })).toBe(false);
  });
});
