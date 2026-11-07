'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { GitHubSettingsDialog } from '@/components/blocks/GitHubSettingsDialog';
import { FileLoadDialog } from '@/components/files/FileLoadDialog';
import { FileSaveDialog } from '@/components/files/FileSaveDialog';
import { NumberField } from '@/components/robots/NumberField';
import { StudioNav } from '@/components/StudioNav';
import { useGitHub } from '@/hooks/useGitHub';
import { useMatRun } from '@/hooks/useMatRun';
import { useMats, type MatDraft } from '@/hooks/useMats';
import { MAT_FILES } from '@/lib/github/files';
import { useRobots } from '@/hooks/useRobots';
import {
  AREA_KINDS,
  DEFAULT_MAT_NAME,
  MAT_NAME_MAX_LENGTH,
  cleanMatName,
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
import { MatRunPanel, PlaybackBar } from './MatRunPanel';
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
  const github = useGitHub();
  const [dialog, setDialog] = useState<{
    readonly name: 'save' | 'load' | 'github';
    readonly back: 'save' | 'load' | null;
  } | null>(null);
  const setUpGitHub = () =>
    setDialog((current) => ({
      name: 'github',
      back: current && current.name !== 'github' ? current.name : null,
    }));
  const closeDialog = () =>
    setDialog((current) =>
      current?.name === 'github' && current.back ? { name: current.back, back: null } : null,
    );

  const mat = mats.open;
  const usable = library.robots.filter((robot) => robotProblems(robot).length === 0);
  const robot = mat?.placement?.robotId
    ? (usable.find((each) => each.id === mat.placement!.robotId) ?? null)
    : null;
  const placement = dragging ?? mat?.placement ?? null;
  const rulesForRun = RULES_PROFILES.find((each) => each.id === mat?.rulesId) ?? null;
  const run = useMatRun(mat, robot, robot ? placement : null, rulesForRun, mats.picture);
  // While a run is shown, the robot stands where the run has it.
  const shown =
    run.pose && run.state.kind === 'done' ? { robotId: robot?.id ?? null, ...run.pose } : placement;
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
            className="button button-small button-file"
            onClick={() => setDialog({ name: 'load', back: null })}
            disabled={mats.status !== 'ready' || mats.busy}
            title="Load a mat from this computer or from GitHub"
            data-testid="mat-load"
          >
            Load
          </button>
          <button
            type="button"
            className="button button-small button-file"
            disabled={!mat || mats.busy}
            onClick={() => setDialog({ name: 'save', back: null })}
            title="Save this mat on this computer or on GitHub"
            data-testid="mat-save"
          >
            Save
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
              placement={robot ? shown : null}
              path={run.state.kind === 'done' ? run.state.result.frames : null}
              playhead={run.time}
              locked={run.state.kind === 'done' || run.state.kind === 'running'}
              tool={tool}
              selectedArea={selectedArea}
              onPlace={place}
              onArea={addArea}
              onSelectArea={setSelectedArea}
            />
          )}
          {mat && <PlaybackBar run={run} />}
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
              <MatRunPanel run={run} />
            </>
          )}
        </aside>
      </div>
      {dialog?.name === 'save' && mat && (
        <FileSaveDialog
          title="Save this mat"
          kind={MAT_FILES}
          github={github}
          id={mat.id}
          name={mat.name}
          maxLength={MAT_NAME_MAX_LENGTH}
          clean={cleanMatName}
          fallbackName={DEFAULT_MAT_NAME}
          onRename={(name) => name !== mat.name && mats.update({ ...mat, name })}
          saveToComputer={(name) => mats.exportFile({ ...mat, name })}
          fileText={(name) => mats.fileText({ ...mat, name })}
          publicWarning="A competition mat is the organiser’s work: keep it for your own team, in a private repository."
          onClose={closeDialog}
          onSetUpGitHub={setUpGitHub}
        />
      )}
      {dialog?.name === 'load' && (
        <FileLoadDialog
          title="Load a mat"
          kind={MAT_FILES}
          github={github}
          maxBytes={150_000_000}
          open={async (text) => {
            try {
              const loaded = await mats.importFile(text);
              setSelectedArea(null);
              return { ok: true, id: loaded.id, name: loaded.name };
            } catch (reason) {
              return {
                ok: false,
                message: reason instanceof Error ? reason.message : String(reason),
              };
            }
          }}
          onOpened={(message) => {
            setDialog(null);
            setNotice({ kind: 'ok', text: message });
          }}
          onClose={closeDialog}
          onSetUpGitHub={setUpGitHub}
        />
      )}
      {dialog?.name === 'github' && <GitHubSettingsDialog github={github} onClose={closeDialog} />}
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
