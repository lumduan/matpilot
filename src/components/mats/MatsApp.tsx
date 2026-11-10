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
import { forgetMatPath, useMatPath } from '@/hooks/useMatPath';
import { useMats, type MatDraft } from '@/hooks/useMats';
import { useSendToBlocks } from '@/hooks/useIncomingBlocks';
import { useStoredState } from '@/hooks/useStoredState';
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
import { MAX_PATH_ITEMS, NEW_ITEMS, pathProgram, planPath } from '@/lib/mats/path';
import { insertItem, moveItem, removeItem, updateItem } from '@/lib/mats/path-edit';
import { areaPolygon, matPolygon, normalHeading, poseInArea, robotInside } from '@/lib/mats/pose';
import { PROJECT_NAME, PROJECT_STATUS } from '@/lib/project';
import { robotProblems } from '@/lib/robots/profile';
import { RULES_PROFILES } from '@/lib/robots/rules';
import { AddMatDialog } from './AddMatDialog';
import { MatRunPanel, PlaybackBar, RunSummary } from './MatRunPanel';
import { MatView, type MatTool, type PlanView } from './MatView';
import { PathBar } from './PathBar';
import { PathPanel } from './PathPanel';

const TOOLS: readonly {
  readonly value: Exclude<MatTool, 'path'>;
  readonly label: string;
  readonly hint: string;
}[] = [
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
    hint: 'Drag a rectangle: a start area, a target, a place to keep out of, or a solid object.',
  },
];

/** The side panel's tabs: the mat and its robot, the path, a program's run. */
type SideTab = 'mat' | 'path' | 'run';
const SIDE_TABS: readonly { readonly value: SideTab; readonly label: string }[] = [
  { value: 'mat', label: 'Mat' },
  { value: 'path', label: 'Path' },
  { value: 'run', label: 'Run' },
];
const SIDE_TAB_KEY = 'matpilot.mats.side.v1';
const SIDE_TAB_VALUES = SIDE_TABS.map((each) => each.value);
/** The run of a path from the Path tab, by the name the Run tab shows. */
const PATH_RUN_NAME = 'Drawn path';

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
  const [tool, setTool] = useState<Exclude<MatTool, 'path'>>('move');
  const [sideTab, setSideTab] = useStoredState<SideTab>(SIDE_TAB_KEY, 'mat', SIDE_TAB_VALUES);
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
  // The Path tab's moves on this mat, from where the robot stands.
  const path = useMatPath(mat?.id ?? null);
  const [clickBackward, setClickBackward] = useState(false);
  const [pathSent, setPathSent] = useState<'ok' | 'failed' | null>(null);
  const sendToBlocks = useSendToBlocks();
  const plan = robot && placement ? planPath(placement, path.items) : null;
  const editPath = (next: Parameters<typeof path.change>[0]) => {
    path.change(next);
    setPathSent(null);
  };
  const selectedIndex = path.draft.items.findIndex((each) => each.id === path.draft.selected);
  const current = selectedIndex === -1 ? null : path.draft.items[selectedIndex]!;
  /** Where the robot is before move `index`. */
  const poseBefore = (index: number) =>
    index > 0 ? plan?.items[index - 1]?.pose : (placement ?? undefined);
  const planView: PlanView | null =
    plan && robot && sideTab === 'path'
      ? {
          segments: plan.segments,
          marks: path.draft.items.flatMap((each, index): PlanView['marks'][number][] => {
            const mark = {
              id: each.id,
              label: String(index + 1),
              selected: each.id === path.draft.selected,
            };
            const pose = plan.items[index]!.pose;
            switch (each.item.kind) {
              case 'point':
                return [{ ...mark, kind: 'point', xMm: each.item.xMm, yMm: each.item.yMm }];
              case 'straight':
                return [{ ...mark, kind: 'end', xMm: pose.xMm, yMm: pose.yMm }];
              case 'turn': {
                const degrees = each.item.degrees;
                const label = `${degrees < 0 ? '↺' : '↻'} ${Math.abs(degrees)}°`;
                return [{ ...mark, kind: 'badge', label, xMm: pose.xMm, yMm: pose.yMm }];
              }
              case 'wait':
                return [
                  {
                    ...mark,
                    kind: 'badge',
                    label: `wait ${each.item.seconds} s`,
                    xMm: pose.xMm,
                    yMm: pose.yMm,
                  },
                ];
              case 'speed':
                return [
                  {
                    ...mark,
                    kind: 'badge',
                    label: `speed ${each.item.percent} %`,
                    xMm: pose.xMm,
                    yMm: pose.yMm,
                  },
                ];
            }
          }),
          ghost:
            path.draft.items.length > 0
              ? {
                  robotId: robot.id,
                  ...(selectedIndex === -1 ? plan.end : plan.items[selectedIndex]!.pose),
                }
              : null,
          editor: (() => {
            const before = poseBefore(selectedIndex);
            if (!current || !before) return null;
            const from = { robotId: robot.id, ...before };
            if (current.item.kind === 'turn') {
              return { kind: 'turn', from, degrees: current.item.degrees };
            }
            if (current.item.kind === 'straight') {
              return { kind: 'straight', from, mm: current.item.mm };
            }
            return null;
          })(),
        }
      : null;
  const pathRun =
    run.source.kind === 'file' && run.source.name === PATH_RUN_NAME && run.state.kind !== 'idle';

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
          {mat && sideTab === 'path' && (
            <PathBar
              ready={Boolean(robot && placement)}
              clickBackward={clickBackward}
              canUndo={path.canUndo}
              canClear={path.draft.items.length > 0}
              full={path.draft.items.length >= MAX_PATH_ITEMS}
              current={current}
              number={selectedIndex + 1}
              onClickBackward={setClickBackward}
              onAdd={(kind) => editPath((draft) => insertItem(draft, NEW_ITEMS[kind]))}
              onUndo={() => {
                path.undo();
                setPathSent(null);
              }}
              onClear={() => editPath(() => ({ items: [], selected: null }))}
              onChange={(item) =>
                current && editPath((draft) => updateItem(draft, current.id, item))
              }
              onSlide={(item, done) => {
                if (!current) return;
                path.drag((draft) => updateItem(draft, current.id, item), done);
                setPathSent(null);
              }}
            />
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
              plan={run.state.kind === 'done' ? null : planView}
              onPathPoint={
                robot && placement
                  ? (point) =>
                      editPath((draft) =>
                        insertItem(draft, {
                          kind: 'point',
                          xMm: round(point.x),
                          yMm: round(point.y),
                          backward: clickBackward,
                        }),
                      )
                  : undefined
              }
              onPlanMark={(id) => path.select(id)}
              onPlanDrag={(id, at, done) => {
                const point = path.draft.items.find((listed) => listed.id === id)?.item;
                if (point?.kind !== 'point') return;
                path.drag(
                  (draft) => updateItem(draft, id, { ...point, xMm: at.x, yMm: at.y }),
                  done,
                );
                setPathSent(null);
              }}
              onPlanEdit={(value, done) => {
                if (!current) return;
                const item =
                  current.item.kind === 'turn'
                    ? { kind: 'turn' as const, degrees: value }
                    : { kind: 'straight' as const, mm: value };
                path.drag((draft) => updateItem(draft, current.id, item), done);
                setPathSent(null);
              }}
              spread={run.showSpread ? run.spread : null}
              tool={sideTab === 'path' ? 'path' : tool}
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
              <div className="mats-tabs segmented" role="group" aria-label="Show">
                {SIDE_TABS.map((each) => (
                  <button
                    key={each.value}
                    type="button"
                    className="segmented-option"
                    aria-pressed={sideTab === each.value}
                    onClick={() => setSideTab(each.value)}
                    data-testid={`mats-tab-${each.value}`}
                  >
                    {each.label}
                  </button>
                ))}
              </div>
              {sideTab === 'mat' && (
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
                              forgetMatPath(mat.id);
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
                            onClick={() =>
                              place(poseInArea(robot, start, placement.headingDeg), true)
                            }
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
                                <span className="visually-hidden">
                                  {check.ok ? ': yes' : ': no'}
                                </span>
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
                        {rules.name}: its start area is {rules.startAreaMm} mm square. Draw it with
                        the Area tool over the one printed on the mat.
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
                </>
              )}
              {sideTab === 'path' && (
                <PathPanel
                  plan={plan}
                  draft={path.draft}
                  ready={Boolean(robot && placement)}
                  clickBackward={clickBackward}
                  canUndo={path.canUndo}
                  sent={pathSent}
                  running={run.state.kind === 'running'}
                  onClickBackward={setClickBackward}
                  onSelect={path.select}
                  onAdd={(kind) => editPath((draft) => insertItem(draft, NEW_ITEMS[kind]))}
                  onChange={(id, item) => editPath((draft) => updateItem(draft, id, item))}
                  onMove={(id, by) => editPath((draft) => moveItem(draft, id, by))}
                  onRemove={(id) => editPath((draft) => removeItem(draft, id))}
                  onUndo={() => {
                    path.undo();
                    setPathSent(null);
                  }}
                  onClear={() => editPath(() => ({ items: [], selected: null }))}
                  onRun={() =>
                    robot &&
                    plan &&
                    void run.run({
                      kind: 'file',
                      name: PATH_RUN_NAME,
                      files: [{ name: 'main.py', code: pathProgram(robot, plan.steps) }],
                    })
                  }
                  onSend={() =>
                    plan &&
                    setPathSent(sendToBlocks(`Path on ${mat.name}`, plan.steps) ? 'ok' : 'failed')
                  }
                  onShowMat={() => setSideTab('mat')}
                >
                  {pathRun && <RunSummary run={run} />}
                </PathPanel>
              )}
              {sideTab === 'run' && <MatRunPanel run={run} />}
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
