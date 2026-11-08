'use client';

import { useModelView3d } from '@/hooks/useModelView3d';
import type { BoxTable } from '@/lib/ldraw/parts';
import type { ModelRobot } from '@/lib/ldraw/robot-from-model';

/**
 * The model in 3D (ADR 0017, step 10a-2): drag to turn it round, scroll or pinch to zoom. The
 * motors and sensors are outlined and tagged as in the dialog's list; the arrow points to the
 * front.
 */
export function ModelView3d({
  file,
  found,
  boxes,
}: {
  file: { readonly fileName: string; readonly text: string };
  found: ModelRobot;
  boxes: BoxTable;
}) {
  const { canvasRef, labelsRef, state } = useModelView3d(file, found, boxes);
  return (
    <figure className="model-3d" data-testid="model-3d" data-status={state.status}>
      <div className="model-3d-stage">
        <canvas
          ref={canvasRef}
          className="model-3d-canvas"
          role="img"
          aria-label="The model in 3D. Drag to turn it round, scroll to zoom."
        />
        <div ref={labelsRef} className="model-3d-labels" aria-hidden="true" />
        {state.status === 'loading' && <p className="model-3d-wait">Drawing the model in 3D…</p>}
      </div>
      <figcaption data-testid="model-3d-caption">
        {state.status === 'error' ? (
          <span className="notice notice-warn">The 3D view is not available: {state.message}</span>
        ) : state.status === 'ready' ? (
          <>
            In 3D: drag to turn it, scroll to zoom. The arrow points to the front.{' '}
            {state.packed.boxes.length > 0 &&
              `${state.packed.boxes.length === 1 ? 'One kind of part is' : `${state.packed.boxes.length} kinds of part are`} drawn as plain boxes of their size: MatPilot has the shapes of the SPIKE Prime and Technic parts only.`}
          </>
        ) : (
          'In 3D'
        )}
      </figcaption>
    </figure>
  );
}
