'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { NumberField } from '@/components/robots/NumberField';
import { StudioNav } from '@/components/StudioNav';
import { useMats, type MatDraft } from '@/hooks/useMats';
import { useRobots } from '@/hooks/useRobots';
import {
  AREA_KINDS,
  newAreaId,
  type AreaKind,
  type Mat,
  type MatArea,
  type MatPlacement,
} from '@/lib/mats/mat';
import { areaPolygon, matPolygon, normalHeading, poseInArea, robotInside } from '@/lib/mats/pose';
import { PROJECT_NAME, PROJECT_STATUS } from '@/lib/project';
import { robotProblems } from '@/lib/robots/profile';
import { RULES_PROFILES } from '@/lib/robots/rules';
import { AddMatDialog } from './AddMatDialog';
import { MatView, type MatTool } from './MatView';

const TOOLS: readonly { readonly value: MatTool; readonly label: string; readonly hint: string }[] =
  [
    {
      value: 'move',
      label: 'Move',
      hint: 'Drag the robot to move it, its round handle to turn it, the mat to look around.',
    },
    {
      value: 'ruler',
      label: 'Ruler',
      hint: 'Drag from one point to another: the distance and the angle show.',
    },
    {
      value: 'area',
      label: 'Area',
      hint: 'Drag a rectangle: a start area, a target, or a place to keep out of.',
    },
  ];

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * The Mats page (ADR 0016, step 7b): add a mat from a PDF or a picture at real size, mark its
 * areas, and place a robot from the Robots page on it, to see whether it fits and how far things
 * are. Running a program on the mat is the next step (7c).
 */
export function MatsApp() {
  const mats = useMats();
  const library = useRobots();
  const [draft, setDraft] = useState<MatDraft | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [tool, setTool] = useState<MatTool>('move');
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [dragging, setDragging] = useState<MatPlacement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const addInput = useRef<HTMLInputElement>(null);
  const loadInput = useRef<HTMLInputElement>(null);

  const mat = mats.open;
  const usable = library.robots.filter((robot) => robotProblems(robot).length === 0);
  const robot = mat?.placement?.robotId
    ? (usable.find((each) => each.id === mat.placement!.robotId) ?? null)
    : null;
  const placement = dragging ?? mat?.placement ?? null;
  const rules = RULES_PROFILES.find((each) => each.id === mat?.rulesId) ?? null;
  const start = mat?.areas.find((area) => area.kind === 'start') ?? null;

  const change = (next: Partial<Mat>) => mat && mats.update({ ...mat, ...next });
  const place = (next: MatPlacement, done: boolean) => {
    if (done) {
      setDragging(null);
      change({ placement: next });
    } else setDragging(next);
  };
  const chooseRobot = (id: string) => {
    if (!mat) return;
    const chosen = usable.find((each) => each.id === id);
    if (!chosen) {
      change({ placement: null });
      return;
    }
    const pose = start
      ? poseInArea(chosen, start, mat.placement?.headingDeg ?? 0)
      : {
          robotId: chosen.id,
          xMm: round(mat.widthMm / 2),
          yMm: round(mat.heightMm / 2),
          headingDeg: 0,
        };
    change({ placement: { ...pose, robotId: chosen.id } });
  };
  const addArea = (rect: Omit<MatArea, 'id' | 'name' | 'kind'>) => {
    if (!mat) return;
    const kind: AreaKind = mat.areas.some((area) => area.kind === 'start') ? 'target' : 'start';
    const count = mat.areas.filter((area) => area.kind === kind).length + 1;
    const area: MatArea = {
      id: newAreaId(),
      name: kind === 'start' ? 'Start' : `Target ${count}`,
      kind,
      ...rect,
    };
    change({ areas: [...mat.areas, area] });
    setSelectedArea(area.id);
  };
  const setArea = (id: string, next: Partial<MatArea>) =>
    mat &&
    change({ areas: mat.areas.map((area) => (area.id === id ? { ...area, ...next } : area)) });

  return (
    <main className="mats-page">
      <header className="studio-bar">
        <div className="studio-brand">
          <Link href="/" className="studio-home" title={`Back to ${PROJECT_NAME}`}>
            {PROJECT_NAME}
          </Link>
          <span className="status-pill">{PROJECT_STATUS}</span>
          <StudioNav current="mats" />
        </div>
        <div className="studio-actions">
          <button
            type="button"
            className="button button-small button-primary"
            onClick={() => addInput.current?.click()}
            disabled={mats.status !== 'ready' || mats.busy}
            data-testid="mat-add"
          >
            Add a mat
          </button>
          <button
            type="button"
            className="button button-small"
            onClick={() => loadInput.current?.click()}
            disabled={mats.status !== 'ready' || mats.busy}
            data-testid="mat-load"
          >
            Load mat file
          </button>
          <button
            type="button"
            className="button button-small"
            disabled={!mat || mats.busy}
            onClick={() =>
              mat &&
              void mats.exportFile(mat).then(
                (name) =>
                  setNotice({
                    kind: 'ok',
                    text: `Saved “${name}” to your downloads (it holds the mat’s file, so it can be large).`,
                  }),
                (reason: unknown) =>
                  setNotice({
                    kind: 'error',
                    text: reason instanceof Error ? reason.message : String(reason),
                  }),
              )
            }
            data-testid="mat-save"
          >
            Save mat file
          </button>
          <input
            ref={addInput}
            type="file"
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setNotice(null);
              try {
                setDraft(await mats.inspect(file));
              } catch (reason) {
                setNotice({
                  kind: 'error',
                  text: reason instanceof Error ? reason.message : String(reason),
                });
              }
            }}
            data-testid="mat-add-input"
          />
          <input
            ref={loadInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              try {
                const loaded = await mats.importFile(await file.text());
                setNotice({ kind: 'ok', text: `Opened the mat “${loaded.name}”.` });
              } catch (reason) {
                setNotice({
                  kind: 'error',
                  text: reason instanceof Error ? reason.message : String(reason),
                });
              }
            }}
            data-testid="mat-load-input"
          />
        </div>
      </header>

      <div className="mats-body">
        <div className="mats-stage">
          {mats.status === 'error' && (
            <p className="notice notice-error mats-message">{mats.error}</p>
          )}
          {mats.status === 'ready' && !mat && (
            <div className="mats-empty" data-testid="mats-empty">
              <h2>Put your mat here</h2>
              <p>
                Add the mat’s PDF (the printing file a competition gives out) and MatPilot reads its
                real size from the file. A photo or a picture works too: you type its size. Then
                place a robot from the Robots page on it, measure distances, and mark the start area
                and the targets.
              </p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => addInput.current?.click()}
              >
                Add a mat
              </button>
            </div>
          )}
          {mats.busy && (
            <p className="notice notice-ok mats-message" role="status" data-testid="mats-busy">
              Drawing the mat… A large PDF takes a few seconds.
            </p>
          )}
          {mat && (
            <MatView
              mat={mat}
              picture={mats.picture}
              robot={robot}
              placement={robot ? placement : null}
              tool={tool}
              selectedArea={selectedArea}
              onPlace={place}
              onArea={addArea}
              onSelectArea={setSelectedArea}
            />
          )}
        </div>

        <aside className="mats-side" aria-label="The mat and the robot">
          {notice && (
            <p
              className={notice.kind === 'ok' ? 'notice notice-ok' : 'notice notice-error'}
              role={notice.kind === 'ok' ? 'status' : 'alert'}
              data-testid="mat-notice"
            >
              {notice.text}
            </p>
          )}
          {mat && (
            <>
              <section className="mats-section">
                <label className="field">
                  <span className="field-label">Mat</span>
                  <select
                    className="field-input"
                    value={mat.id}
                    onChange={(event) => {
                      mats.setOpen(event.target.value);
                      setSelectedArea(null);
                      setConfirmDelete(false);
                    }}
                    data-testid="mat-choice"
                  >
                    {mats.mats.map((each) => (
                      <option key={each.id} value={each.id}>
                        {each.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mats-size" data-testid="mat-size">
                  {round(mat.widthMm)} × {round(mat.heightMm)} mm
                  <span className="muted">
                    {' '}
                    {mat.source.sizeFrom === 'trim'
                      ? '(the PDF’s trim box)'
                      : mat.source.sizeFrom === 'page'
                        ? '(the PDF’s page)'
                        : '(typed in)'}
                  </span>
                </p>
                <label className="field">
                  <span className="field-label">Name</span>
                  <input
                    className="field-input"
                    value={mat.name}
                    maxLength={60}
                    onChange={(event) => change({ name: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Rules</span>
                  <select
                    className="field-input"
                    value={mat.rulesId ?? ''}
                    onChange={(event) => change({ rulesId: event.target.value || null })}
                    data-testid="mat-rules"
                  >
                    <option value="">No rules</option>
                    {RULES_PROFILES.map((each) => (
                      <option key={each.id} value={each.id}>
                        {each.name}
                      </option>
                    ))}
                  </select>
                </label>
                {confirmDelete ? (
                  <p className="mats-confirm">
                    Delete “{mat.name}” from this browser?{' '}
                    <button
                      type="button"
                      className="button button-small button-stop"
                      onClick={() =>
                        void mats.remove(mat.id).then(() => {
                          setConfirmDelete(false);
                          setNotice({ kind: 'ok', text: `Deleted the mat “${mat.name}”.` });
                        })
                      }
                      data-testid="mat-delete-yes"
                    >
                      Delete
                    </button>{' '}
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Keep
                    </button>
                  </p>
                ) : (
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => setConfirmDelete(true)}
                    data-testid="mat-delete"
                  >
                    Delete this mat
                  </button>
                )}
              </section>

              <section className="mats-section" aria-label="The robot on the mat">
                <label className="field">
                  <span className="field-label">Robot</span>
                  <select
                    className="field-input"
                    value={robot?.id ?? ''}
                    onChange={(event) => chooseRobot(event.target.value)}
                    data-testid="mat-robot-choice"
                  >
                    <option value="">No robot</option>
                    {usable.map((each) => (
                      <option key={each.id} value={each.id}>
                        {each.name}
                      </option>
                    ))}
                  </select>
                </label>
                {usable.length === 0 && (
                  <p className="field-hint">
                    Make your robot on the <Link href="/robots">Robots</Link> page first.
                  </p>
                )}
                {robot && placement && (
                  <>
                    <div className="mats-pose">
                      <NumberField
                        label="x"
                        unit="mm"
                        value={placement.xMm}
                        onChange={(value) =>
                          value !== null && place({ ...placement, xMm: value }, true)
                        }
                        testId="mat-pose-x"
                      />
                      <NumberField
                        label="y"
                        unit="mm"
                        value={placement.yMm}
                        onChange={(value) =>
                          value !== null && place({ ...placement, yMm: value }, true)
                        }
                        testId="mat-pose-y"
                      />
                      <NumberField
                        label="Facing"
                        unit="°"
                        value={placement.headingDeg}
                        onChange={(value) =>
                          value !== null &&
                          place({ ...placement, headingDeg: normalHeading(value) }, true)
                        }
                        hint="0° faces right, 90° up."
                        testId="mat-pose-heading"
                      />
                    </div>
                    {start && (
                      <button
                        type="button"
                        className="button button-small"
                        onClick={() => place(poseInArea(robot, start, placement.headingDeg), true)}
                        data-testid="mat-snap"
                      >
                        Put it in the start area
                      </button>
                    )}
                    <ul className="robot-checks" data-testid="mat-checks">
                      {[
                        {
                          id: 'mat',
                          ok: robotInside(robot, placement, matPolygon(mat)),
                          label: 'On the mat',
                        },
                        ...(start
                          ? [
                              {
                                id: 'start',
                                ok: robotInside(robot, placement, areaPolygon(start)),
                                label: `Wholly inside “${start.name || 'the start area'}”`,
                              },
                            ]
                          : []),
                      ].map((check) => (
                        <li key={check.id} data-ok={String(check.ok)}>
                          <span className="robot-check-mark" aria-hidden="true">
                            {check.ok ? '✓' : '✗'}
                          </span>
                          <span>
                            {check.label}
                            <span className="visually-hidden">{check.ok ? ': yes' : ': no'}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              <section className="mats-section" aria-label="Tools">
                <div className="segmented" role="group" aria-label="Tool">
                  {TOOLS.map((each) => (
                    <button
                      key={each.value}
                      type="button"
                      className="segmented-option"
                      aria-pressed={tool === each.value}
                      onClick={() => setTool(each.value)}
                      data-testid={`mat-tool-${each.value}`}
                    >
                      {each.label}
                    </button>
                  ))}
                </div>
                <p className="field-hint">{TOOLS.find((each) => each.value === tool)!.hint}</p>
                {rules?.startAreaMm && !start && (
                  <p className="field-hint">
                    {rules.name}: its start area is {rules.startAreaMm} mm square. Draw it with the
                    Area tool over the one printed on the mat.
                  </p>
                )}
              </section>

              {mat.areas.length > 0 && (
                <section className="mats-section" aria-label="Areas">
                  <h2 className="mats-heading">Areas</h2>
                  <ul className="mats-areas" data-testid="mat-areas">
                    {mat.areas.map((area) => (
                      <li key={area.id} data-selected={area.id === selectedArea}>
                        <input
                          className="field-input"
                          value={area.name}
                          maxLength={40}
                          aria-label="Area name"
                          onChange={(event) => setArea(area.id, { name: event.target.value })}
                          onFocus={() => setSelectedArea(area.id)}
                        />
                        <select
                          className="field-input"
                          value={area.kind}
                          aria-label="Kind of area"
                          onChange={(event) =>
                            setArea(area.id, { kind: event.target.value as AreaKind })
                          }
                        >
                          {AREA_KINDS.map((each) => (
                            <option key={each.value} value={each.value}>
                              {each.label}
                            </option>
                          ))}
                        </select>
                        <span className="muted mats-area-size">
                          {Math.round(area.widthMm)} × {Math.round(area.heightMm)} mm at{' '}
                          {Math.round(area.xMm)}, {Math.round(area.yMm)}
                        </span>
                        <button
                          type="button"
                          className="button button-small"
                          onClick={() =>
                            change({ areas: mat.areas.filter((each) => each.id !== area.id) })
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <p className="field-hint">Running a block program on the mat comes next.</p>
            </>
          )}
        </aside>
      </div>
      {draft && (
        <AddMatDialog
          draft={draft}
          mats={mats}
          onClose={() => {
            if (draft.kind === 'pdf') draft.pdf.close();
            setDraft(null);
          }}
          onAdded={(message) => {
            setDraft(null);
            setNotice({ kind: 'ok', text: message });
          }}
        />
      )}
    </main>
  );
}
