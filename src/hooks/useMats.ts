'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  matFileName,
  newMatId,
  parseMatFile,
  serializeMatFile,
  validMatSize,
  type Mat,
} from '@/lib/mats/mat';
import type { PageSize } from '@/lib/mats/pdf-box';
import {
  canvasToPng,
  fromBase64,
  openPdf,
  pictureSize,
  toBase64,
  type PdfMat,
} from '@/lib/mats/picture';
import { deleteMat, listMats, matFiles, saveMat } from '@/lib/mats/store';
import { downloadTextFile } from './downloadFile';

/**
 * The mats kept in this browser (ADR 0016, step 7b): their list, the one open, its picture, and
 * adding one from a PDF or a picture. Mats live in IndexedDB (src/lib/mats/store.ts).
 */

const OPEN_KEY = 'matpilot.mats.open.v1';

/** A file chosen to become a mat, before it is added. */
export type MatDraft =
  | {
      readonly kind: 'pdf';
      readonly file: File;
      readonly pdf: PdfMat;
      readonly pageCount: number;
      /** The first page's real size. */
      readonly size: PageSize;
    }
  | {
      readonly kind: 'image';
      readonly file: File;
      readonly pixelWidth: number;
      readonly pixelHeight: number;
    };

export interface MatChoice {
  readonly name: string;
  readonly page: number;
  /** For a picture: its size, typed in. */
  readonly widthMm?: number;
  readonly heightMm?: number;
  readonly rulesId: string | null;
}

export interface MatsStore {
  readonly status: 'loading' | 'ready' | 'error';
  readonly error: string | null;
  readonly mats: readonly Mat[];
  readonly open: Mat | null;
  /** The open mat's picture, once drawn. */
  readonly picture: ImageBitmap | null;
  /** Drawing a mat: adding one or loading a mat file. */
  readonly busy: boolean;
  readonly setOpen: (id: string) => void;
  readonly inspect: (file: File) => Promise<MatDraft>;
  readonly create: (draft: MatDraft, choice: MatChoice) => Promise<Mat>;
  /** Saves the mat's description (areas, where the robot stands, its name). */
  readonly update: (mat: Mat) => void;
  readonly remove: (id: string) => Promise<void>;
  readonly exportFile: (mat: Mat) => Promise<string>;
  /** The mat file's text (description and source file), for saving to GitHub. */
  readonly fileText: (mat: Mat) => Promise<string>;
  readonly importFile: (text: string) => Promise<Mat>;
}

const readOpen = () => {
  try {
    return window.localStorage.getItem(OPEN_KEY);
  } catch {
    return null;
  }
};

const writeOpen = (id: string | null) => {
  try {
    if (id === null) window.localStorage.removeItem(OPEN_KEY);
    else window.localStorage.setItem(OPEN_KEY, id);
  } catch {
    // The choice is only remembered while storage works.
  }
};

const isPdf = (file: Blob, name = '') => file.type === 'application/pdf' || /\.pdf$/i.test(name);

/** Draws a mat's picture from its source file. */
async function drawPicture(source: Blob, mat: Mat): Promise<Blob> {
  if (mat.source.kind === 'image') return source;
  const pdf = await openPdf(await source.arrayBuffer());
  try {
    return await canvasToPng(await pdf.draw(mat.source.page));
  } finally {
    pdf.close();
  }
}

export function useMats(): MatsStore {
  const [status, setStatus] = useState<MatsStore['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [mats, setMats] = useState<Mat[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picture, setPicture] = useState<{ id: string; bitmap: ImageBitmap } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    let current = true;
    listMats().then(
      (list) => {
        if (!current) return;
        setMats(list);
        const remembered = readOpen();
        setOpenId(list.some((mat) => mat.id === remembered) ? remembered : (list[0]?.id ?? null));
        setStatus('ready');
      },
      (reason: unknown) => {
        if (!current) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setStatus('error');
      },
    );
    return () => {
      current = false;
    };
  }, []);

  // The open mat's picture.
  useEffect(() => {
    if (!openId) return;
    let current = true;
    matFiles(openId)
      .then((files) => (files ? createImageBitmap(files.picture) : null))
      .then(
        (bitmap) => {
          if (!current) {
            bitmap?.close();
            return;
          }
          setPicture((old) => {
            old?.bitmap.close();
            return bitmap ? { id: openId, bitmap } : null;
          });
        },
        () => undefined,
      );
    return () => {
      current = false;
    };
  }, [openId]);

  // Description saves wait a moment, so dragging the robot saves once at the end.
  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  const setOpen = useCallback((id: string) => {
    setOpenId(id);
    writeOpen(id);
  }, []);

  const inspect = useCallback(async (file: File): Promise<MatDraft> => {
    if (isPdf(file, file.name)) {
      let pdf: PdfMat;
      try {
        pdf = await openPdf(await file.arrayBuffer());
      } catch {
        throw new Error(
          'This PDF could not be opened. It may be damaged or locked with a password.',
        );
      }
      return { kind: 'pdf', file, pdf, pageCount: pdf.pageCount, size: await pdf.size(1) };
    }
    try {
      const size = await pictureSize(file);
      return { kind: 'image', file, pixelWidth: size.width, pixelHeight: size.height };
    } catch {
      throw new Error(
        'This file is neither a PDF nor a picture this browser can read (PNG, JPEG, WebP).',
      );
    }
  }, []);

  const store = useCallback(async (mat: Mat, source: Blob, picture: Blob) => {
    await saveMat(mat, { source, picture });
    setMats((list) => [...list.filter((each) => each.id !== mat.id), mat]);
    setOpenId(mat.id);
    writeOpen(mat.id);
  }, []);

  const create = useCallback(
    async (draft: MatDraft, choice: MatChoice): Promise<Mat> => {
      setBusy(true);
      try {
        if (draft.kind === 'pdf') {
          const size = await draft.pdf.size(choice.page);
          const mat: Mat = {
            id: newMatId(),
            name: choice.name,
            widthMm: size.widthMm,
            heightMm: size.heightMm,
            source: {
              kind: 'pdf',
              fileName: draft.file.name,
              page: choice.page,
              pageCount: draft.pageCount,
              sizeFrom: size.sizeFrom,
            },
            rulesId: choice.rulesId,
            areas: [],
            placement: null,
          };
          const picture = await canvasToPng(await draft.pdf.draw(choice.page));
          draft.pdf.close();
          await store(mat, draft.file, picture);
          return mat;
        }
        const width = choice.widthMm ?? 0;
        const height = choice.heightMm ?? 0;
        if (!validMatSize(width) || !validMatSize(height)) {
          throw new Error('Type the mat’s real width and height in millimetres.');
        }
        const mat: Mat = {
          id: newMatId(),
          name: choice.name,
          widthMm: width,
          heightMm: height,
          source: {
            kind: 'image',
            fileName: draft.file.name,
            page: 1,
            pageCount: 1,
            sizeFrom: 'typed',
          },
          rulesId: choice.rulesId,
          areas: [],
          placement: null,
        };
        await store(mat, draft.file, draft.file);
        return mat;
      } finally {
        setBusy(false);
      }
    },
    [store],
  );

  const update = useCallback((mat: Mat) => {
    setMats((list) => list.map((each) => (each.id === mat.id ? mat : each)));
    const timers = pending.current;
    clearTimeout(timers.get(mat.id));
    timers.set(
      mat.id,
      setTimeout(() => {
        timers.delete(mat.id);
        saveMat(mat).catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : String(reason)),
        );
      }, 300),
    );
  }, []);

  const remove = useCallback(
    async (id: string) => {
      clearTimeout(pending.current.get(id));
      await deleteMat(id);
      const index = mats.findIndex((mat) => mat.id === id);
      const next = mats.filter((mat) => mat.id !== id);
      const nextId = next[Math.min(index, next.length - 1)]?.id ?? null;
      setMats(next);
      setOpenId(nextId);
      writeOpen(nextId);
    },
    [mats],
  );

  const fileText = useCallback(async (mat: Mat) => {
    const files = await matFiles(mat.id);
    if (!files) throw new Error('The mat’s file is missing from this browser.');
    const mediaType =
      files.source.type || (mat.source.kind === 'pdf' ? 'application/pdf' : 'image/png');
    return serializeMatFile(mat, await toBase64(files.source), mediaType);
  }, []);

  const exportFile = useCallback(
    async (mat: Mat) => {
      const fileName = matFileName(mat.name);
      downloadTextFile(fileName, await fileText(mat));
      return fileName;
    },
    [fileText],
  );

  const importFile = useCallback(
    async (text: string): Promise<Mat> => {
      const parsed = parseMatFile(text);
      if (!parsed.ok) throw new Error(parsed.message);
      setBusy(true);
      try {
        const source = fromBase64(parsed.base64, parsed.mediaType);
        if (parsed.mat.source.kind === 'pdf' && !isPdf(source)) {
          throw new Error('The mat in this file is damaged.');
        }
        // Another mat with this id stays; this one gets its own.
        const mat = mats.some((each) => each.id === parsed.mat.id)
          ? { ...parsed.mat, id: newMatId() }
          : parsed.mat;
        await store(mat, source, await drawPicture(source, mat));
        return mat;
      } finally {
        setBusy(false);
      }
    },
    [mats, store],
  );

  const open = mats.find((mat) => mat.id === openId) ?? null;
  return {
    status,
    error,
    mats,
    open,
    picture: picture && picture.id === openId ? picture.bitmap : null,
    busy,
    setOpen,
    inspect,
    create,
    update,
    remove,
    exportFile,
    fileText,
    importFile,
  };
}
