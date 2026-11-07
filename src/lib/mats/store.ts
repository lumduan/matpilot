/**
 * Mats kept in this browser (ADR 0016, D5), in IndexedDB: a WRO mat's PDF is about 9 MB and its
 * picture a few more, too much for localStorage. Two stores: `mats` holds each mat's description
 * (./mat.ts), `mat-files` its source file and its drawn picture. Nothing leaves the browser.
 */
import { matData, readMat, type Mat } from './mat';

const DB_NAME = 'matpilot';
const DB_VERSION = 1;
const MATS = 'mats';
const FILES = 'mat-files';

export interface MatFiles {
  /** The PDF or picture the mat was made from. */
  readonly source: Blob;
  /** The mat drawn at real size (PNG). */
  readonly picture: Blob;
}

let opening: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MATS)) db.createObjectStore(MATS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(
        request.error ?? new Error('This browser cannot keep mats (IndexedDB is not available).'),
      );
    };
  });
  return opening;
}

function finish(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('The mat could not be saved.'));
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error('The mat could not be saved (the browser may be out of space).'),
      );
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The mats could not be read.'));
  });
}

/** Every mat's description, oldest first. */
export async function listMats(): Promise<Mat[]> {
  const db = await database();
  const all = await result(db.transaction(MATS, 'readonly').objectStore(MATS).getAll());
  return (all as unknown[]).map(readMat).filter((mat): mat is Mat => mat !== null);
}

/** Saves a mat's description, and its files when given. */
export async function saveMat(mat: Mat, files?: MatFiles): Promise<void> {
  const db = await database();
  const transaction = db.transaction([MATS, FILES], 'readwrite');
  transaction.objectStore(MATS).put(matData(mat));
  if (files)
    transaction.objectStore(FILES).put({ source: files.source, picture: files.picture }, mat.id);
  await finish(transaction);
}

export async function matFiles(id: string): Promise<MatFiles | null> {
  const db = await database();
  const value = (await result(db.transaction(FILES, 'readonly').objectStore(FILES).get(id))) as
    { source?: unknown; picture?: unknown } | undefined;
  return value && value.source instanceof Blob && value.picture instanceof Blob
    ? { source: value.source, picture: value.picture }
    : null;
}

export async function deleteMat(id: string): Promise<void> {
  const db = await database();
  const transaction = db.transaction([MATS, FILES], 'readwrite');
  transaction.objectStore(MATS).delete(id);
  transaction.objectStore(FILES).delete(id);
  await finish(transaction);
}
