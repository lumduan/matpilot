'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LDCONFIG_URL,
  SHAPES_FOLDER_URL,
  SHAPES_URL,
  packModel,
  readShapeLibrary,
  type PackedModel,
  type ShapeLibrary,
} from '@/lib/ldraw/pack';
import type { BoxTable } from '@/lib/ldraw/parts';
import { partTag, type ModelRobot } from '@/lib/ldraw/robot-from-model';
import type { ModelView, Outline } from '@/lib/ldraw/view3d';

/**
 * The 3D view of a LEGO model in the model dialog (ADR 0017, step 10a-2): packs the model with
 * the LDraw shapes this site serves, loads three.js (./../lib/ldraw/view3d.ts) and draws it; turning
 * the front round only moves it. The shapes are fetched once per visit.
 */

let shapesLoaded: Promise<ShapeLibrary> | null = null;
function loadShapes(): Promise<ShapeLibrary> {
  shapesLoaded ??= fetch(SHAPES_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<unknown>;
    })
    .then((data) => {
      const shapes = readShapeLibrary(data);
      if (!shapes) throw new Error('not a list of LEGO shapes');
      return shapes;
    })
    .catch((error: unknown) => {
      shapesLoaded = null;
      throw error;
    });
  return shapesLoaded;
}

const files = new Map<string, Promise<string>>();
function fetchShape(path: string): Promise<string> {
  let text = files.get(path);
  if (!text) {
    text = fetch(`${SHAPES_FOLDER_URL}${path}`).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });
    text.catch(() => files.delete(path));
    files.set(path, text);
  }
  return text;
}

export type ModelView3dState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly packed: PackedModel }
  | { readonly status: 'error'; readonly message: string };

export function useModelView3d(
  file: { readonly fileName: string; readonly text: string } | null,
  found: ModelRobot | null,
  boxes: BoxTable | null,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ModelView | null>(null);
  const [state, setState] = useState<ModelView3dState>({ status: 'loading' });
  const shown = found !== null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const labels = labelsRef.current;
    if (!file || !boxes || !canvas || !labels) return;
    let live = true;
    let view: ModelView | null = null;
    setState({ status: 'loading' });
    (async () => {
      const [shapes, { createModelView }] = await Promise.all([
        loadShapes(),
        import('@/lib/ldraw/view3d'),
      ]);
      const packed = await packModel(file.text, file.fileName, shapes, boxes, fetchShape);
      if (!live) return;
      view = await createModelView(canvas, labels, packed.text, LDCONFIG_URL);
      if (!live) {
        view.dispose();
        return;
      }
      viewRef.current = view;
      setState({ status: 'ready', packed });
    })().catch((error: unknown) => {
      if (live) {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'The model could not be drawn in 3D.',
        });
      }
    });
    return () => {
      live = false;
      view?.dispose();
      viewRef.current = null;
    };
  }, [file, boxes, shown]);

  const outlines = useMemo<Outline[]>(
    () =>
      found
        ? found.parts.flatMap((part) =>
            part.ref
              ? [
                  {
                    tag: partTag(found, part.ref.list, part.ref.index),
                    kind: part.ref.list === 'motors' ? ('motor' as const) : ('sensor' as const),
                    corners: part.corners,
                  },
                ]
              : [],
          )
        : [],
    [found],
  );

  useEffect(() => {
    if (state.status === 'ready' && found) viewRef.current?.place(found.frame, outlines);
  }, [state, found, outlines]);

  return { canvasRef, labelsRef, state };
}
