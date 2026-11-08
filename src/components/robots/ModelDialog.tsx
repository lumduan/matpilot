'use client';

import { useMemo, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { useLdrawBoxes } from '@/hooks/useLdrawBoxes';
import { PORTS, type PortName } from '@/lib/blocks/pybricks';
import {
  applyModel,
  defaultChoices,
  modelChanges,
  type ModelChoices,
} from '@/lib/ldraw/apply-model';
import { MAX_MODEL_BYTES, modelFileKind, readLdraw } from '@/lib/ldraw/model';
import { robotFromModel, type FoundSensor, type ModelRobot } from '@/lib/ldraw/robot-from-model';
import {
  ROBOT_NAME_MAX_LENGTH,
  robotProblems,
  type RobotModel,
  type RobotProfile,
} from '@/lib/robots/profile';
import { ModelDrawing, partTag } from './ModelDrawing';

const FACING_WORDS: Record<FoundSensor['facing'], string> = {
  down: 'looking down',
  up: 'looking up',
  forward: 'looking forward',
  backward: 'looking backward',
  left: 'looking left',
  right: 'looking right',
};

/** Where a part is, in words: "80 mm ahead, 12 mm to the left". */
function whereWords(xMm: number, yMm: number): string {
  const along =
    Math.abs(xMm) < 1 ? 'at the wheels' : `${Math.abs(xMm)} mm ${xMm > 0 ? 'ahead' : 'behind'}`;
  const side =
    Math.abs(yMm) < 1
      ? 'in the middle'
      : `${Math.abs(yMm)} mm to the ${yMm > 0 ? 'left' : 'right'}`;
  return `${along}, ${side}`;
}

function Port({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: PortName;
  onChange: (port: PortName) => void;
  testId: string;
}) {
  return (
    <label className="model-port">
      <span className="visually-hidden">{label}</span>
      <select
        className="field-input"
        value={value}
        onChange={(event) => onChange(event.target.value as PortName)}
        data-testid={testId}
      >
        {PORTS.map((port) => (
          <option key={port} value={port}>
            Port {port}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Make a robot from a LEGO model (ADR 0017, route A): the child exports the robot from BrickLink
 * Studio (or LeoCAD, LDCad) as LDraw, MatPilot reads its size, wheels, motors and sensors, and the
 * child picks the ports, which a model does not have. Render only while open.
 */
export function ModelDialog({
  robot,
  onApply,
  onClose,
}: {
  robot: RobotProfile;
  onApply: (robot: RobotProfile) => void;
  onClose: () => void;
}) {
  const boxes = useLdrawBoxes();
  const [file, setFile] = useState<{ fileName: string; text: string } | null>(
    robot.model ? { fileName: robot.model.fileName, text: robot.model.text } : null,
  );
  const [turned, setTurned] = useState(robot.model?.turned ?? false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [choices, setChoices] = useState<ModelChoices | null>(null);

  const result = useMemo(() => {
    if (!file || boxes.status !== 'ready') return null;
    const model = readLdraw(file.text, file.fileName);
    if (!model.ok) return model;
    const found = robotFromModel(model.model, boxes.table, { turned });
    return found.ok ? { ...found, submodels: model.model.submodels } : found;
  }, [file, boxes, turned]);
  const found: ModelRobot | null = result?.ok ? result.robot : null;
  const picked = found ? (choices ?? defaultChoices(found, robot)) : null;
  const model: RobotModel | null = file ? { ...file, turned } : null;
  const next = found && picked && model ? applyModel(robot, found, picked, model) : null;
  const problems = next ? robotProblems(next) : [];
  const changes = next ? modelChanges(robot, next) : [];

  const choose = async (picked: File | undefined) => {
    setFileError(null);
    if (!picked) return;
    const head = await picked.slice(0, 4).text();
    const kind = modelFileKind(picked.name, head);
    if (kind === 'studio') {
      setFileError(
        'This is a BrickLink Studio file (.io). In Studio, choose File → Export As → LDraw (.ldr or .mpd), then choose that file here.',
      );
      return;
    }
    if (kind === 'other') {
      setFileError('Choose an LDraw model: a .ldr or .mpd file.');
      return;
    }
    if (picked.size > MAX_MODEL_BYTES) {
      setFileError('This model file is too big (over 1 MB) for MatPilot.');
      return;
    }
    setFile({ fileName: picked.name, text: await picked.text() });
    setTurned(false);
    setChoices(null);
  };

  const setPicked = (change: Partial<ModelChoices>) =>
    picked && setChoices({ ...picked, ...change });
  const otherMotors = found
    ? found.motors
        .map((motor, index) => ({ motor, index }))
        .filter((each) => each.motor.drives === null)
    : [];

  return (
    <Dialog title="Make it from a LEGO model" onClose={onClose} testId="model-dialog">
      <div className="calibrate model-dialog">
        <p className="field-hint">
          Build your robot in BrickLink Studio (free), then choose <strong>File → Export As</strong>{' '}
          and save it as <strong>LDraw (.ldr or .mpd)</strong>. Choose that file here: MatPilot
          measures the robot, finds its wheels, motors and sensors, and you give each motor and
          sensor its port. LeoCAD and LDCad save LDraw files too.
        </p>
        <label className="button model-file">
          {file ? 'Choose another model…' : 'Choose a model…'}
          <input
            type="file"
            accept=".ldr,.mpd,.io,.dat"
            className="visually-hidden"
            onChange={(event) => {
              void choose(event.target.files?.[0]);
              event.target.value = '';
            }}
            data-testid="model-file"
          />
        </label>
        {fileError && (
          <p className="notice notice-error" role="alert" data-testid="model-error">
            {fileError}
          </p>
        )}
        {file && boxes.status === 'loading' && (
          <p className="field-hint">Loading the LEGO parts’ sizes…</p>
        )}
        {file && boxes.status === 'error' && (
          <p className="notice notice-error" role="alert">
            {boxes.message}
          </p>
        )}
        {result && !result.ok && (
          <p className="notice notice-error" role="alert" data-testid="model-error">
            {result.message}
          </p>
        )}

        {found && picked && next && file && (
          <>
            <p className="field-hint" data-testid="model-summary">
              <strong>{file.fileName}</strong>: {found.partCount} parts
              {result?.ok && result.submodels > 0 ? `, in ${result.submodels + 1} models` : ''}
              {found.hub ? `, with a ${found.hub}` : ''}.
            </p>
            <ModelDrawing robot={found} />
            <div className="model-front">
              <span data-testid="model-front">
                The front is up in the picture from above. {found.front.reason}
              </span>
              <button
                type="button"
                className="button button-small"
                onClick={() => setTurned((value) => !value)}
                data-testid="model-turn"
              >
                Turn the front round
              </button>
            </div>

            <section className="calibrate-step" aria-labelledby="model-found">
              <h3 id="model-found">What MatPilot found</h3>
              <ul className="model-found" data-testid="model-found">
                <li>
                  <strong>Wheels:</strong> {found.wheels.label.toLowerCase()},{' '}
                  {found.wheels.diameterMm} mm across and {found.wheels.widthMm} mm wide,{' '}
                  {found.wheels.trackMm} mm apart (middle to middle).
                </li>
                <li>
                  <strong>Body:</strong> {found.body.widthMm} mm wide, {found.body.lengthMm} mm
                  long, {found.body.heightMm} mm high; the wheels’ axle is{' '}
                  {found.body.axleFromBackMm} mm from the back.
                </li>
              </ul>
              <h4>Ports</h4>
              <ul className="model-ports">
                {(['left', 'right'] as const).map((side) => {
                  const index = found.motors.findIndex((motor) => motor.drives === side);
                  const motor = found.motors[index];
                  return (
                    <li key={side}>
                      <span className="model-tag-chip">{side === 'left' ? 'L' : 'R'}</span>
                      <span>
                        {side === 'left' ? 'Left' : 'Right'} wheel:{' '}
                        {motor ? motor.label.toLowerCase() : 'no motor found'}
                        {found.drive.mirrored === side && motor
                          ? ' (turned round: it turns the other way to go forward)'
                          : ''}
                      </span>
                      <Port
                        label={`${side} wheel port`}
                        value={picked[side]}
                        onChange={(port) => setPicked({ [side]: port })}
                        testId={`model-port-${side}`}
                      />
                    </li>
                  );
                })}
                {otherMotors.map(({ motor, index }, n) => (
                  <li key={`motor-${index}`}>
                    <span className="model-tag-chip">{partTag(found, 'motors', index)}</span>
                    <span>
                      {motor.label}, {whereWords(motor.xMm, motor.yMm)}, named
                    </span>
                    <input
                      className="field-input model-motor-name"
                      value={picked.motors[n]?.name ?? ''}
                      maxLength={ROBOT_NAME_MAX_LENGTH}
                      aria-label={`Name of ${partTag(found, 'motors', index)}`}
                      onChange={(event) =>
                        setPicked({
                          motors: picked.motors.map((each, k) =>
                            k === n ? { ...each, name: event.target.value } : each,
                          ),
                        })
                      }
                      data-testid={`model-motor-name-${n}`}
                    />
                    <Port
                      label={`${partTag(found, 'motors', index)} port`}
                      value={picked.motors[n]?.port ?? 'F'}
                      onChange={(port) =>
                        setPicked({
                          motors: picked.motors.map((each, k) =>
                            k === n ? { ...each, port } : each,
                          ),
                        })
                      }
                      testId={`model-motor-port-${n}`}
                    />
                  </li>
                ))}
                {found.sensors.map((sensor, index) => (
                  <li key={`sensor-${index}`}>
                    <span className="model-tag-chip">{partTag(found, 'sensors', index)}</span>
                    <span>
                      {sensor.label}, {whereWords(sensor.xMm, sensor.yMm)},{' '}
                      {FACING_WORDS[sensor.facing]}
                    </span>
                    <Port
                      label={`${partTag(found, 'sensors', index)} port`}
                      value={picked.sensors[index] ?? 'F'}
                      onChange={(port) =>
                        setPicked({
                          sensors: picked.sensors.map((each, k) => (k === index ? port : each)),
                        })
                      }
                      testId={`model-sensor-port-${index}`}
                    />
                  </li>
                ))}
              </ul>
              {found.notes.length > 0 && (
                <ul className="notice notice-warn model-notes" data-testid="model-notes">
                  {found.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="calibrate-step" aria-labelledby="model-changes">
              <h3 id="model-changes">What changes on “{robot.name}”</h3>
              {changes.length === 0 ? (
                <p>Nothing: the robot already has these numbers.</p>
              ) : (
                <table className="model-changes" data-testid="model-changes">
                  <thead>
                    <tr>
                      <th scope="col" />
                      <th scope="col">Now</th>
                      <th scope="col">From the model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        <td>{row.now}</td>
                        <td>{row.next}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="field-hint">
                Its name, speeds, mass and what you measured on the floor stay. The model is kept
                with the robot and saved in its file. Wheel sizes from a model are the parts’ drawn
                sizes: “Measure on the floor” makes them exact.
              </p>
              {problems.length > 0 && (
                <ul className="notice notice-error" role="alert" data-testid="model-problems">
                  {problems.map((problem) => (
                    <li key={`${problem.field}-${problem.message}`}>{problem.message}</li>
                  ))}
                </ul>
              )}
              <div className="button-row">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={problems.length > 0}
                  onClick={() => {
                    onApply(next);
                    onClose();
                  }}
                  data-testid="model-apply"
                >
                  Use these numbers
                </button>
                <button type="button" className="button" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </section>
            <p className="field-hint model-credit">
              {`Part sizes from the LDraw Parts Library (${boxes.status === 'ready' ? boxes.table.release : 'LDraw.org'}), CC BY 4.0 and CC BY 2.0: see NOTICE.`}
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}
