/**
 * Getting the report out of the browser without a server: copy it to the clipboard, or save it
 * as a text file generated in the page.
 */

export interface ClipboardNavigatorLike {
  readonly clipboard?: { writeText(text: string): Promise<void> };
}

/**
 * Copies `text` to the clipboard. Resolves `false` when the Clipboard API is missing (it needs a
 * secure context) or the browser refuses; the caller then asks the user to copy by hand.
 */
export async function copyText(
  text: string,
  nav: ClipboardNavigatorLike | undefined = globalThis.navigator,
): Promise<boolean> {
  if (typeof nav?.clipboard?.writeText !== 'function') return false;
  try {
    await nav.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Saves `text` as a UTF-8 text file through a temporary `blob:` link. */
export function downloadText(fileName: string, text: string, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  doc.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
