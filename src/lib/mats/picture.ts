/**
 * Drawing a mat's picture (ADR 0016, section 5): a PDF page through pdf.js, at real size and cut
 * to its trim box (./pdf-box.ts), or a picture file as it is. pdf.js is loaded only here, when a
 * mat is added, with its worker and decoders served from this site (scripts/vendor-assets.mjs);
 * a PDF's scripts are never run (pdf.js runs none unless asked, and its script engine is not
 * served).
 */
import {
  MM_PER_PT,
  pageSize,
  pixelsPerMm,
  trimBoxesInBytes,
  type Box,
  type PageSize,
} from './pdf-box';

const PDFJS = '/vendor/pdfjs/';

export interface PdfMat {
  readonly pageCount: number;
  /** The page's real size. */
  size(page: number): Promise<PageSize>;
  /** The page as a picture at `pxPerMm`, cut to its real size. */
  draw(page: number, pxPerMm?: number): Promise<HTMLCanvasElement>;
  close(): void;
}

/** Opens a PDF. Throws when it is not one, or is damaged or locked. */
export async function openPdf(bytes: ArrayBuffer): Promise<PdfMat> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.js`;
  const data = new Uint8Array(bytes);
  // One page: its trim box, if the file writes it as plain text, belongs to it.
  const trims = trimBoxesInBytes(data);
  const task = pdfjs.getDocument({
    // pdf.js moves the bytes to its worker, so it gets a copy.
    data: data.slice(),
    wasmUrl: `${PDFJS}wasm/`,
    iccUrl: `${PDFJS}iccs/`,
    cMapUrl: `${PDFJS}cmaps/`,
    cMapPacked: true,
    // Fonts a PDF names without carrying are drawn with the computer's own (no font files are
    // served: scripts/vendor-assets.mjs).
    useSystemFonts: true,
    enableXfa: false,
  });
  const doc = await task.promise;
  const trimFor = (page: number): Box | null =>
    doc.numPages === 1 && page === 1 ? (trims[0] ?? null) : null;
  const size = async (number: number) => {
    const page = await doc.getPage(number);
    return pageSize(page.view as unknown as Box, page.rotate, trimFor(number));
  };
  return {
    pageCount: doc.numPages,
    size,
    async draw(number, wanted = 2) {
      const page = await doc.getPage(number);
      const real = await size(number);
      const pxPerMm = pixelsPerMm(real.widthMm, real.heightMm, wanted);
      const scale = pxPerMm * MM_PER_PT;
      const viewport = page.getViewport({ scale });
      const full = document.createElement('canvas');
      full.width = Math.round(viewport.width);
      full.height = Math.round(viewport.height);
      await page.render({ canvas: full, viewport, background: 'white' }).promise;
      if (!real.crop) return full;
      const cut = document.createElement('canvas');
      cut.width = Math.round(real.crop.width * scale);
      cut.height = Math.round(real.crop.height * scale);
      cut
        .getContext('2d')!
        .drawImage(
          full,
          real.crop.x * scale,
          real.crop.y * scale,
          cut.width,
          cut.height,
          0,
          0,
          cut.width,
          cut.height,
        );
      full.width = 0;
      return cut;
    },
    close() {
      void task.destroy();
    },
  };
}

/** A canvas as a PNG file (lossless, so a colour sensor can read it later). */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be made.'))),
      'image/png',
    );
  });
}

/** A picture file's size in pixels. Throws when the browser cannot read it. */
export async function pictureSize(file: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** A file as base64 (for a mat file), and back. */
export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(base64: string, mediaType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mediaType });
}
