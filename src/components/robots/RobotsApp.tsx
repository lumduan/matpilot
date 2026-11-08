'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { GitHubSettingsDialog } from '@/components/blocks/GitHubSettingsDialog';
import { FileLoadDialog } from '@/components/files/FileLoadDialog';
import { FileSaveDialog } from '@/components/files/FileSaveDialog';
import { StudioNav } from '@/components/StudioNav';
import { useGitHub } from '@/hooks/useGitHub';
import { useRobots } from '@/hooks/useRobots';
import { ROBOT_FILES } from '@/lib/github/files';
import { PORTS, type PortName } from '@/lib/blocks/pybricks';
import { PROJECT_NAME, PROJECT_STATUS } from '@/lib/project';
import { autoSpeed, robotMotion } from '@/lib/robots/motion';
import {
  DEFAULT_ROBOT_NAME,
  FACINGS,
  MOTOR_TYPES,
  ROBOT_NAME_MAX_LENGTH,
  SENSOR_TYPES,
  cleanRobotName,
  newRobot,
  newRobotId,
  robotProblems,
  serializeRobotFile,
  type Facing,
  type MotorType,
  type RobotProfile,
  type SensorType,
} from '@/lib/robots/profile';
import { RULES_PROFILES, robotChecks } from '@/lib/robots/rules';
import { boxLength, boxWidth, footprint, overallHeight, turningRadius } from '@/lib/robots/shape';
import { CalibrateDialog } from './CalibrateDialog';
import { ModelDialog } from './ModelDialog';
import { NumberField } from './NumberField';
import { RobotDrawing } from './RobotDrawing';

const round = (value: number, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/**
 * The Robots page (ADR 0016, step 7a): make and keep robot profiles, see each to scale with the
 * numbers that follow from it, and check it against a competition's rules. Every change is kept
 * in this browser at once.
 */
export function RobotsApp() {
  const library = useRobots();
  const robot = library.open;
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const github = useGitHub();
  const [dialog, setDialog] = useState<{
    readonly name: 'save' | 'load' | 'github';
    /** The dialog to go back to when GitHub settings close. */
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

  const create = () => {
    library.save(newRobot(`Robot ${library.robots.length + 1}`));
    setNotice(null);
  };

  return (
    <main className="robots-page">
      <header className="studio-bar">
        <div className="studio-brand">
          <Link href="/" className="studio-home" title={`Back to ${PROJECT_NAME}`}>
            {PROJECT_NAME}
          </Link>
          <span className="status-pill">{PROJECT_STATUS}</span>
          <StudioNav current="robots" />
        </div>
        <div className="studio-actions">
          <button
            type="button"
            className="button button-small button-file"
            onClick={() => setDialog({ name: 'load', back: null })}
            title="Load a robot from this computer or from GitHub"
            data-testid="robot-load"
          >
            Load
          </button>
          <button
            type="button"
            className="button button-small button-file"
            disabled={!robot}
            onClick={() => setDialog({ name: 'save', back: null })}
            title="Save this robot on this computer or on GitHub"
            data-testid="robot-save"
          >
            Save
          </button>
        </div>
      </header>

      <div className="robots-body">
        <section className="robots-list" aria-label="Your robots">
          <div className="robots-picker">
            {library.robots.length > 0 && (
              <label className="field robots-choice">
                <span className="field-label">Robot</span>
                <select
                  className="field-input"
                  value={library.openId ?? ''}
                  onChange={(event) => {
                    library.setOpen(event.target.value);
                    setConfirmDelete(false);
                  }}
                  data-testid="robot-choice"
                >
                  {library.robots.map((each) => (
                    <option key={each.id} value={each.id}>
                      {each.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="button-row">
              <button
                type="button"
                className="button button-small button-primary"
                onClick={create}
                data-testid="robot-new"
              >
                New robot
              </button>
              {robot && (
                <>
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() =>
                      library.save({
                        ...robot,
                        id: newRobotId(),
                        name: `${robot.name} copy`.slice(0, 40),
                      })
                    }
                    data-testid="robot-copy"
                  >
                    Copy
                  </button>
                  {confirmDelete ? (
                    <span className="robots-confirm" role="group" aria-label="Delete this robot?">
                      Delete “{robot.name}”?
                      <button
                        type="button"
                        className="button button-small button-stop"
                        onClick={() => {
                          library.remove(robot.id);
                          setConfirmDelete(false);
                          setNotice({
                            kind: 'ok',
                            text: `Deleted “${robot.name}”. Programs that use it keep their own copy.`,
                          });
                        }}
                        data-testid="robot-delete-yes"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="button button-small"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => setConfirmDelete(true)}
                      data-testid="robot-delete"
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {notice && (
            <p
              className={notice.kind === 'ok' ? 'notice notice-ok' : 'notice notice-error'}
              role={notice.kind === 'ok' ? 'status' : 'alert'}
              data-testid="robot-notice"
            >
              {notice.text}
            </p>
          )}
          {robot ? (
            <RobotForm key={robot.id} robot={robot} onChange={library.save} />
          ) : (
            <div className="robots-empty" data-testid="robots-empty">
              <h2>Describe your robot</h2>
              <p>
                Measure your robot and type in its size, its wheels, and which ports its motors and
                sensors use. MatPilot draws it to scale, works out how fast it drives and how much
                room it needs to turn, and checks it against competition rules. A block program can
                then use it, and later it runs on a mat.
              </p>
              <button type="button" className="button button-primary" onClick={create}>
                Make a robot
              </button>
            </div>
          )}
        </section>
        {robot && <RobotFacts robot={robot} onChange={library.save} />}
      </div>
      {dialog?.name === 'save' && robot && (
        <FileSaveDialog
          title="Save your robot"
          kind={ROBOT_FILES}
          github={github}
          id={robot.id}
          name={robot.name}
          maxLength={ROBOT_NAME_MAX_LENGTH}
          clean={cleanRobotName}
          fallbackName={DEFAULT_ROBOT_NAME}
          onRename={(name) => name !== robot.name && library.save({ ...robot, name })}
          saveToComputer={(name) => Promise.resolve(library.exportFile({ ...robot, name }))}
          fileText={(name) => Promise.resolve(serializeRobotFile({ ...robot, name }))}
          onClose={closeDialog}
          onSetUpGitHub={setUpGitHub}
        />
      )}
      {dialog?.name === 'load' && (
        <FileLoadDialog
          title="Load a robot"
          kind={ROBOT_FILES}
          github={github}
          maxBytes={3_000_000}
          open={(text) => {
            const result = library.importFile(text);
            return Promise.resolve(
              result.ok ? { ok: true, id: result.robot.id, name: result.robot.name } : result,
            );
          }}
          onOpened={(message) => {
            setDialog(null);
            setConfirmDelete(false);
            setNotice({ kind: 'ok', text: message });
          }}
          onClose={closeDialog}
          onSetUpGitHub={setUpGitHub}
        />
      )}
      {dialog?.name === 'github' && <GitHubSettingsDialog github={github} onClose={closeDialog} />}
    </main>
  );
}

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <fieldset className="robot-section">
      <legend>{title}</legend>
      {hint && <p className="field-hint robot-section-hint">{hint}</p>}
      <div className="robot-fields">{children}</div>
    </fieldset>
  );
}

function PortSelect({
  label,
  value,
  onChange,
  problem,
  testId,
}: {
  label: string;
  value: PortName;
  onChange: (port: PortName) => void;
  problem?: string | undefined;
  testId?: string;
}) {
  return (
    <label className="field robot-port">
      <span className="field-label">{label}</span>
      <select
        className="field-input"
        value={value}
        aria-invalid={problem ? true : undefined}
        onChange={(event) => onChange(event.target.value as PortName)}
        data-testid={testId}
      >
        {PORTS.map((port) => (
          <option key={port} value={port}>
            Port {port}
          </option>
        ))}
      </select>
      {problem && <span className="field-problem">{problem}</span>}
    </label>
  );
}

/** The robot's fields; every change is saved at once. */
function RobotForm({
  robot,
  onChange,
}: {
  robot: RobotProfile;
  onChange: (robot: RobotProfile) => void;
}) {
  const problems = robotProblems(robot);
  const problem = (field: string) => problems.find((each) => each.field === field)?.message;
  const set = (next: Partial<RobotProfile>) => onChange({ ...robot, ...next });
  const auto = autoSpeed(robot);
  const req = (value: number | null) => value ?? 0;

  return (
    <form
      className="robot-form"
      onSubmit={(event) => event.preventDefault()}
      data-testid="robot-form"
    >
      <Section title="Name">
        <label className="field robot-name">
          <span className="field-label">Name</span>
          <input
            className="field-input"
            value={robot.name}
            maxLength={40}
            onChange={(event) => set({ name: event.target.value })}
            aria-invalid={problem('name') ? true : undefined}
            data-testid="robot-name"
          />
          {problem('name') && <span className="field-problem">{problem('name')}</span>}
        </label>
      </Section>

      <Section
        title="Body"
        hint="Measure the whole robot from above and from the side, in millimetres."
      >
        <NumberField
          label="Width (left to right)"
          unit="mm"
          value={robot.body.widthMm}
          onChange={(value) => set({ body: { ...robot.body, widthMm: req(value) } })}
          problem={problem('body.widthMm')}
          testId="robot-width"
        />
        <NumberField
          label="Length (back to front)"
          unit="mm"
          value={robot.body.lengthMm}
          onChange={(value) => set({ body: { ...robot.body, lengthMm: req(value) } })}
          problem={problem('body.lengthMm')}
          testId="robot-length"
        />
        <NumberField
          label="Height"
          unit="mm"
          value={robot.body.heightMm}
          onChange={(value) => set({ body: { ...robot.body, heightMm: req(value) } })}
          problem={problem('body.heightMm')}
          testId="robot-height"
        />
        <NumberField
          label="Wheel axle from the back"
          unit="mm"
          value={robot.body.axleFromBackMm}
          onChange={(value) => set({ body: { ...robot.body, axleFromBackMm: req(value) } })}
          problem={problem('body.axleFromBackMm')}
          hint="Where the robot turns around."
          testId="robot-axle"
        />
      </Section>

      <Section title="Wheels">
        <NumberField
          label="Wheel diameter"
          unit="mm"
          value={robot.wheels.diameterMm}
          step={0.1}
          onChange={(value) => set({ wheels: { ...robot.wheels, diameterMm: req(value) } })}
          problem={problem('wheels.diameterMm')}
          hint="The number on a LEGO® tyre is often its diameter."
          testId="robot-wheel"
        />
        <NumberField
          label="Wheel width"
          unit="mm"
          value={robot.wheels.widthMm}
          onChange={(value) => set({ wheels: { ...robot.wheels, widthMm: req(value) } })}
          problem={problem('wheels.widthMm')}
          testId="robot-wheel-width"
        />
        <NumberField
          label="Axle track"
          unit="mm"
          value={robot.wheels.trackMm}
          step={0.1}
          onChange={(value) => set({ wheels: { ...robot.wheels, trackMm: req(value) } })}
          problem={problem('wheels.trackMm')}
          hint="From the middle of one wheel to the middle of the other."
          testId="robot-track"
        />
      </Section>

      <Section title="Drive motors">
        <PortSelect
          label="Left wheel"
          value={robot.drive.left}
          onChange={(left) => set({ drive: { ...robot.drive, left } })}
          problem={problem('drive.left')}
          testId="robot-left-port"
        />
        <PortSelect
          label="Right wheel"
          value={robot.drive.right}
          onChange={(right) => set({ drive: { ...robot.drive, right } })}
          problem={problem('drive.right')}
          testId="robot-right-port"
        />
        <label className="field">
          <span className="field-label">Motor type</span>
          <select
            className="field-input"
            value={robot.drive.motor}
            onChange={(event) =>
              set({ drive: { ...robot.drive, motor: event.target.value as MotorType } })
            }
            data-testid="robot-motor-type"
          >
            {MOTOR_TYPES.map((each) => (
              <option key={each.value} value={each.value}>
                {each.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="field robot-mirrored">
          <legend className="field-label">Mounted turned round</legend>
          {(['left', 'right'] as const).map((side) => (
            <label key={side} className="field-check">
              <input
                type="radio"
                name={`mirrored-${robot.id}`}
                checked={robot.drive.mirrored === side}
                onChange={() => set({ drive: { ...robot.drive, mirrored: side } })}
              />
              <span>The {side} motor</span>
            </label>
          ))}
          <span className="field-hint">
            The two motors face opposite ways, so one turns backwards to drive forward. Usually the
            left one.
          </span>
        </fieldset>
      </Section>

      <Section title="Other motors" hint="An arm, a claw: a port and a name for each.">
        {robot.motors.map((motor, index) => (
          <div key={index} className="robot-row" data-testid="robot-motor-row">
            <PortSelect
              label="Port"
              value={motor.port}
              onChange={(port) =>
                set({
                  motors: robot.motors.map((each, i) => (i === index ? { ...each, port } : each)),
                })
              }
              problem={problem(`motors.${index}.port`)}
            />
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="field-input"
                value={motor.name}
                maxLength={40}
                onChange={(event) =>
                  set({
                    motors: robot.motors.map((each, i) =>
                      i === index ? { ...each, name: event.target.value } : each,
                    ),
                  })
                }
                aria-invalid={problem(`motors.${index}.name`) ? true : undefined}
              />
              {problem(`motors.${index}.name`) && (
                <span className="field-problem">{problem(`motors.${index}.name`)}</span>
              )}
            </label>
            <button
              type="button"
              className="button button-small robot-remove"
              onClick={() => set({ motors: robot.motors.filter((_, i) => i !== index) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button button-small"
          onClick={() => set({ motors: [...robot.motors, { port: freePort(robot), name: '' }] })}
          disabled={robot.motors.length + robot.sensors.length + 2 >= PORTS.length}
          data-testid="robot-add-motor"
        >
          Add a motor
        </button>
      </Section>

      <Section
        title="Sensors"
        hint="Where each sensor is, measured from the point between the wheels: ahead (+) or behind (−), and left (+) or right (−)."
      >
        {robot.sensors.map((sensor, index) => {
          const change = (next: Partial<typeof sensor>) =>
            set({
              sensors: robot.sensors.map((each, i) => (i === index ? { ...each, ...next } : each)),
            });
          return (
            <div key={index} className="robot-row robot-sensor-row" data-testid="robot-sensor-row">
              <label className="field">
                <span className="field-label">Sensor</span>
                <select
                  className="field-input"
                  value={sensor.type}
                  onChange={(event) => {
                    const type = event.target.value as SensorType;
                    change({ type, facing: type === 'color' ? 'down' : 'forward' });
                  }}
                >
                  {SENSOR_TYPES.map((each) => (
                    <option key={each.value} value={each.value}>
                      {each.label}
                    </option>
                  ))}
                </select>
              </label>
              <PortSelect
                label="Port"
                value={sensor.port}
                onChange={(port) => change({ port })}
                problem={problem(`sensors.${index}.port`)}
              />
              <NumberField
                label="Ahead"
                unit="mm"
                value={sensor.xMm}
                onChange={(value) => change({ xMm: req(value) })}
                problem={problem(`sensors.${index}.xMm`)}
              />
              <NumberField
                label="Left"
                unit="mm"
                value={sensor.yMm}
                onChange={(value) => change({ yMm: req(value) })}
                problem={problem(`sensors.${index}.yMm`)}
              />
              <label className="field">
                <span className="field-label">Looks</span>
                <select
                  className="field-input"
                  value={sensor.facing}
                  onChange={(event) => change({ facing: event.target.value as Facing })}
                >
                  {FACINGS.map((facing) => (
                    <option key={facing} value={facing}>
                      {facing}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button button-small robot-remove"
                onClick={() => set({ sensors: robot.sensors.filter((_, i) => i !== index) })}
              >
                Remove
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="button button-small"
          onClick={() =>
            set({
              sensors: [
                ...robot.sensors,
                {
                  type: 'color',
                  port: freePort(robot),
                  xMm: Math.round(robot.body.lengthMm - robot.body.axleFromBackMm - 20),
                  yMm: 0,
                  facing: 'down',
                },
              ],
            })
          }
          disabled={robot.motors.length + robot.sensors.length + 2 >= PORTS.length}
          data-testid="robot-add-sensor"
        >
          Add a sensor
        </button>
      </Section>

      <Section title="Speed">
        <fieldset className="field robot-speed-mode">
          <legend className="visually-hidden">Where the speed comes from</legend>
          <label className="field-check">
            <input
              type="radio"
              name={`speed-${robot.id}`}
              checked={robot.speed.mode === 'auto'}
              onChange={() => set({ speed: { mode: 'auto' } })}
              data-testid="robot-speed-auto"
            />
            <span>Work it out from the motors and wheels, as the hub does</span>
          </label>
          <label className="field-check">
            <input
              type="radio"
              name={`speed-${robot.id}`}
              checked={robot.speed.mode === 'set'}
              onChange={() =>
                set({
                  speed: {
                    mode: 'set',
                    straightMmS: round(auto.straightMmS, 0),
                    straightAccelerationMmS2: round(auto.straightAccelerationMmS2, 0),
                    turnRateDegS: round(auto.turnRateDegS, 0),
                    turnAccelerationDegS2: round(auto.turnAccelerationDegS2, 0),
                  },
                })
              }
              data-testid="robot-speed-set"
            />
            <span>Type it in, or what you measured</span>
          </label>
        </fieldset>
        {robot.speed.mode === 'set' ? (
          <>
            <NumberField
              label="Straight speed"
              unit="mm/s"
              value={robot.speed.straightMmS}
              onChange={(value) =>
                robot.speed.mode === 'set' &&
                set({ speed: { ...robot.speed, straightMmS: req(value) } })
              }
              problem={problem('speed.straightMmS')}
              testId="robot-speed-straight"
            />
            <NumberField
              label="Straight acceleration"
              unit="mm/s²"
              value={robot.speed.straightAccelerationMmS2}
              onChange={(value) =>
                robot.speed.mode === 'set' &&
                set({ speed: { ...robot.speed, straightAccelerationMmS2: req(value) } })
              }
              problem={problem('speed.straightAccelerationMmS2')}
            />
            <NumberField
              label="Turn rate"
              unit="°/s"
              value={robot.speed.turnRateDegS}
              onChange={(value) =>
                robot.speed.mode === 'set' &&
                set({ speed: { ...robot.speed, turnRateDegS: req(value) } })
              }
              problem={problem('speed.turnRateDegS')}
            />
            <NumberField
              label="Turn acceleration"
              unit="°/s²"
              value={robot.speed.turnAccelerationDegS2}
              onChange={(value) =>
                robot.speed.mode === 'set' &&
                set({ speed: { ...robot.speed, turnAccelerationDegS2: req(value) } })
              }
              problem={problem('speed.turnAccelerationDegS2')}
            />
          </>
        ) : (
          <p className="robot-auto-speed" data-testid="robot-auto-speed">
            Straight {round(auto.straightMmS, 0)} mm/s (accelerating at{' '}
            {round(auto.straightAccelerationMmS2, 0)} mm/s²), turning {round(auto.turnRateDegS, 0)}{' '}
            °/s (accelerating at {round(auto.turnAccelerationDegS2, 0)} °/s²): the hub’s own
            defaults for these motors and wheels. A “set movement speed” block changes them in a
            program.
          </p>
        )}
      </Section>

      <Section title="More (optional)" hint="Leave empty what you have not measured.">
        <NumberField
          label="Mass"
          unit="g"
          value={robot.massG}
          optional
          onChange={(massG) => set({ massG })}
          problem={problem('massG')}
          testId="robot-mass"
        />
        <NumberField
          label="Off after driving 1 m"
          unit="mm"
          value={robot.drift.perMetreMm}
          optional
          onChange={(perMetreMm) => set({ drift: { ...robot.drift, perMetreMm } })}
          problem={problem('drift.perMetreMm')}
        />
        <NumberField
          label="Off after a 90° turn"
          unit="°"
          value={robot.drift.per90Deg}
          step={0.1}
          optional
          onChange={(per90Deg) => set({ drift: { ...robot.drift, per90Deg } })}
          problem={problem('drift.per90Deg')}
        />
        <label className="field robot-notes">
          <span className="field-label">Notes</span>
          <textarea
            className="field-input"
            rows={2}
            maxLength={2000}
            value={robot.notes}
            onChange={(event) => set({ notes: event.target.value })}
          />
        </label>
      </Section>
    </form>
  );
}

/** The first port no motor or sensor uses. */
function freePort(robot: RobotProfile): PortName {
  const used = new Set<PortName>([
    robot.drive.left,
    robot.drive.right,
    ...robot.motors.map((motor) => motor.port),
    ...robot.sensors.map((sensor) => sensor.port),
  ]);
  return PORTS.find((port) => !used.has(port)) ?? 'F';
}

/** The drawing, the numbers that follow from the robot, and the rules checks. */
function RobotFacts({
  robot,
  onChange,
}: {
  robot: RobotProfile;
  onChange: (robot: RobotProfile) => void;
}) {
  const [rulesId, setRulesId] = useState<string>(RULES_PROFILES[0]!.id);
  const [calibrating, setCalibrating] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [heading, setHeading] = useState(0);
  const rules = RULES_PROFILES.find((each) => each.id === rulesId) ?? null;
  const motion = robotMotion(robot);
  const box = footprint(robot);
  const problems = robotProblems(robot);
  const checks = rules ? robotChecks(robot, rules, heading) : [];
  return (
    <section className="robots-facts" aria-label="What follows from it">
      <RobotDrawing robot={robot} />
      {problems.length > 0 && (
        <p className="notice notice-warn" data-testid="robot-problems">
          Fix the {problems.length === 1 ? 'value' : `${problems.length} values`} marked in red: a
          program cannot use this robot until then.
        </p>
      )}
      <dl className="robot-numbers" data-testid="robot-numbers">
        <dt>Footprint</dt>
        <dd>
          {round(boxWidth(box))} × {round(boxLength(box))} mm, {round(overallHeight(robot))} mm high
        </dd>
        <dt>Room to turn on the spot</dt>
        <dd data-testid="robot-turning">a circle of {round(turningRadius(robot))} mm radius</dd>
        <dt>One wheel turn</dt>
        <dd>{round(Math.PI * robot.wheels.diameterMm)} mm forward</dd>
        <dt>One motor degree</dt>
        <dd>{round(motion.mmPerMotorDegree, 3)} mm</dd>
        <dt>Top speed</dt>
        <dd data-testid="robot-top-speed">
          {round(motion.topStraightMmS, 0)} mm/s straight, {round(motion.topTurnRateDegS, 0)} °/s
          turning
        </dd>
        <dt>Drives at</dt>
        <dd>
          {round(motion.straightMmS, 0)} mm/s, turns at {round(motion.turnRateDegS, 0)} °/s
          {motion.source === 'auto' ? ' (the hub’s defaults)' : ' (typed in)'}
        </dd>
      </dl>

      <section className="robot-calibrate" aria-labelledby="robot-model-title">
        <h2 id="robot-model-title">From a LEGO® model</h2>
        <p className="muted" data-testid="robot-model-status">
          {robot.model
            ? `Made from ${robot.model.fileName}. Open it to see it again, or to choose a newer one.`
            : 'Built it in BrickLink Studio, the free LEGO® building program? Export it as an LDraw file, and MatPilot measures it: its size, its wheels, its motors and its sensors.'}
        </p>
        <button
          type="button"
          className="button"
          onClick={() => setModelOpen(true)}
          data-testid="robot-model"
        >
          {robot.model ? 'Open the LEGO® model…' : 'Make from a LEGO® model…'}
        </button>
      </section>
      {modelOpen && (
        <ModelDialog robot={robot} onApply={onChange} onClose={() => setModelOpen(false)} />
      )}

      <section className="robot-calibrate" aria-labelledby="robot-calibrate-title">
        <h2 id="robot-calibrate-title">Measure it on the floor</h2>
        <p className="muted">
          Wheel sizes printed on the tyre and a gap measured with a ruler are close, not exact. Two
          short runs on the floor make them right, so the robot drives as far and turns as much as
          the program says.
        </p>
        <button
          type="button"
          className="button"
          disabled={problems.length > 0}
          onClick={() => setCalibrating(true)}
          data-testid="robot-calibrate"
        >
          Measure on the floor…
        </button>
      </section>
      {calibrating && (
        <CalibrateDialog robot={robot} onApply={onChange} onClose={() => setCalibrating(false)} />
      )}

      <div className="robot-rules">
        <label className="field">
          <span className="field-label">Check against</span>
          <select
            className="field-input"
            value={rulesId}
            onChange={(event) => setRulesId(event.target.value)}
            data-testid="robot-rules"
          >
            {RULES_PROFILES.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
            <option value="">No rules</option>
          </select>
        </label>
        {rules?.startAreaMm !== null && rules && (
          <label className="field robot-heading">
            <span className="field-label">Turned in the start area: {heading}°</span>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={heading}
              onChange={(event) => setHeading(Number(event.target.value))}
              data-testid="robot-heading"
            />
          </label>
        )}
        {rules && (
          <ul className="robot-checks" data-testid="robot-checks">
            {checks.map((check) => (
              <li key={check.id} data-ok={check.ok === null ? 'unknown' : String(check.ok)}>
                <span className="robot-check-mark" aria-hidden="true">
                  {check.ok === null ? '?' : check.ok ? '✓' : '✗'}
                </span>
                <span>
                  <strong>{check.label}</strong>
                  <span className="visually-hidden">
                    {check.ok === null ? ': not known' : check.ok ? ': yes' : ': no'}
                  </span>
                  <br />
                  <span className="muted">{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {rules && (
          <details className="robot-rule-quotes">
            <summary>Where these come from</summary>
            <ul>
              {rules.quotes.map((quote) => (
                <li key={quote.rule}>
                  Rule {quote.rule} (page {quote.page}): “{quote.text}”
                </li>
              ))}
            </ul>
            <p className="muted">{rules.note}</p>
          </details>
        )}
      </div>
    </section>
  );
}
