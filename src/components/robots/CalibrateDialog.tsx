'use client';

import { useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { ConnectButton } from '@/components/hub/ConnectButton';
import { linkSummary, programSummary } from '@/components/hub/status';
import { useHubRunner } from '@/hooks/useHubRunner';
import {
  CALIBRATION_DISTANCE_MM,
  CALIBRATION_TURNS,
  applyCalibration,
  basisOf,
  calibrate,
  calibrationProgram,
  turnedDegrees,
  type CalibrationKind,
} from '@/lib/robots/calibrate';
import type { RobotProfile } from '@/lib/robots/profile';
import { NumberField } from './NumberField';

type Stopped = 'exactly' | 'before' | 'past';

/**
 * The calibration helper (ADR 0016, section 3): run two short programs on the robot, measure on
 * the floor, and correct the wheel size and the gap between the wheels. Render only while open:
 * its hub connection ends when it closes.
 */
export function CalibrateDialog({
  robot,
  onApply,
  onClose,
}: {
  robot: RobotProfile;
  onApply: (robot: RobotProfile) => void;
  onClose: () => void;
}) {
  const runner = useHubRunner();
  const { connection } = runner;
  const [driven, setDriven] = useState<number | null>(null);
  const [sideways, setSideways] = useState<number | null>(null);
  const [turns, setTurns] = useState(CALIBRATION_TURNS);
  const [stopped, setStopped] = useState<Stopped>('exactly');
  const [offDeg, setOffDeg] = useState<number | null>(null);
  const [turnMeasured, setTurnMeasured] = useState(false);
  const [saved, setSaved] = useState(false);

  const basis = basisOf(robot);
  const turned = turnMeasured
    ? turnedDegrees(turns, stopped, stopped === 'exactly' ? 0 : (offDeg ?? 0))
    : null;
  const result = calibrate(basis, { drivenMm: driven, sidewaysMm: sideways, turnedDeg: turned });
  const ready = connection.link.status === 'ready';
  const running = connection.flags.userProgramRunning || connection.program.phase !== 'idle';
  const status = programSummary(connection, runner.compiling) ?? linkSummary(connection);

  const runButtons = (kind: CalibrationKind) => (
    <div className="button-row">
      <button
        type="button"
        className="button button-primary"
        disabled={!ready || running || runner.compiling}
        onClick={() => {
          setSaved(false);
          runner.runSource(calibrationProgram(robot, kind));
        }}
        data-testid={`calibrate-run-${kind}`}
      >
        ▶ Run on the robot
      </button>
      {running && (
        <button type="button" className="button button-stop" onClick={runner.stop}>
          ■ Stop
        </button>
      )}
    </div>
  );

  const program = (kind: CalibrationKind) => (
    <details className="calibrate-program">
      <summary>The program (Python), for the Pybricks app</summary>
      <pre data-testid={`calibrate-program-${kind}`}>{calibrationProgram(robot, kind)}</pre>
    </details>
  );

  return (
    <Dialog title="Measure your robot on the floor" onClose={onClose} testId="calibrate">
      <div className="calibrate">
        <p className="field-hint">
          Two short programs drive the robot; you measure with a ruler or a tape measure, and
          MatPilot corrects the wheel size and the gap between the wheels. Both programs use the
          numbers on this page now:{' '}
          <strong data-testid="calibrate-basis">
            {basis.wheelDiameterMm} mm wheels, {basis.trackMm} mm apart
          </strong>
          . Measure on the floor or the table the robot will run on.
        </p>
        <div className="calibrate-hub">
          <ConnectButton
            connection={connection}
            onConnect={runner.connect}
            onDisconnect={runner.disconnect}
          />
          <span className="field-hint" data-testid="calibrate-status" aria-live="polite">
            {status}
          </span>
        </div>
        {runner.compileError && (
          <p className="notice notice-error">{runner.compileError.message}</p>
        )}

        <section className="calibrate-step" aria-labelledby="calibrate-straight">
          <h3 id="calibrate-straight">1. Drive {CALIBRATION_DISTANCE_MM / 1000} metre</h3>
          <p>
            Give the robot a metre of room ahead. Mark the floor at the front of the robot (tape, or
            a pencil line). Run it, then measure from the mark to the front of the robot.
          </p>
          {runButtons('straight')}
          {program('straight')}
          <div className="calibrate-fields">
            <NumberField
              label="It drove"
              unit="mm"
              value={driven}
              optional
              onChange={(value) => {
                setDriven(value);
                setSaved(false);
              }}
              testId="calibrate-driven"
            />
            <NumberField
              label="It ended to the side by (left or right, if you measured it)"
              unit="mm"
              value={sideways}
              optional
              onChange={(value) => {
                setSideways(value);
                setSaved(false);
              }}
              hint="Kept as its drift per metre."
              testId="calibrate-sideways"
            />
          </div>
        </section>

        <section className="calibrate-step" aria-labelledby="calibrate-turn">
          <h3 id="calibrate-turn">2. Turn {CALIBRATION_TURNS} times</h3>
          <p>
            Line the robot up with something straight: the mat’s edge, a table’s edge, a tile. Run
            it: it turns {CALIBRATION_TURNS} times on the spot, clockwise. Count the turns, then
            look at the way it points.
          </p>
          {runButtons('turn')}
          {program('turn')}
          <div className="calibrate-turn">
            <div className="calibrate-fields">
              <label className="field">
                <span className="field-label">It turned about</span>
                <select
                  className="field-input"
                  value={turnMeasured ? turns : ''}
                  onChange={(event) => {
                    setTurnMeasured(event.target.value !== '');
                    setTurns(Number(event.target.value) || CALIBRATION_TURNS);
                    setSaved(false);
                  }}
                  data-testid="calibrate-turns"
                >
                  <option value="">— not measured —</option>
                  {[8, 9, 10, 11, 12].map((count) => (
                    <option key={count} value={count}>
                      {count} times
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">and stopped</span>
                <select
                  className="field-input"
                  value={stopped}
                  disabled={!turnMeasured}
                  onChange={(event) => {
                    setStopped(event.target.value as Stopped);
                    setSaved(false);
                  }}
                  data-testid="calibrate-stopped"
                >
                  <option value="exactly">pointing the way it started</option>
                  <option value="before">before the way it started</option>
                  <option value="past">past the way it started</option>
                </select>
              </label>
              {turnMeasured && stopped !== 'exactly' && (
                <NumberField
                  label="by"
                  unit="°"
                  value={offDeg}
                  optional
                  onChange={(value) => {
                    setOffDeg(value === null ? null : Math.min(180, Math.max(0, value)));
                    setSaved(false);
                  }}
                  hint="Make the picture look like your robot."
                  testId="calibrate-off"
                />
              )}
            </div>
            <TurnDial stopped={turnMeasured ? stopped : 'exactly'} degrees={offDeg ?? 0} />
          </div>
        </section>

        <section className="calibrate-result" aria-live="polite" data-testid="calibrate-result">
          {driven === null && turned === null ? (
            <p className="field-hint">Run a test and type what you measured.</p>
          ) : !result.ok ? (
            <p className="notice notice-warn">{result.message}</p>
          ) : (
            <>
              <ul className="calibrate-changes">
                <li>
                  Wheels: {basis.wheelDiameterMm} → <strong>{result.wheelDiameterMm} mm</strong>
                </li>
                <li>
                  Between the wheels: {basis.trackMm} → <strong>{result.trackMm} mm</strong>
                </li>
                {result.driftPerMetreMm !== null && (
                  <li>
                    Drift per metre: <strong>{result.driftPerMetreMm} mm</strong>
                  </li>
                )}
              </ul>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  onApply(applyCalibration(robot, result));
                  setDriven(null);
                  setSideways(null);
                  setTurnMeasured(false);
                  setStopped('exactly');
                  setOffDeg(null);
                  setSaved(true);
                }}
                data-testid="calibrate-apply"
              >
                Use these numbers
              </button>
            </>
          )}
          {saved && (
            <p className="notice notice-ok" data-testid="calibrate-saved">
              Saved. Run both tests again to check: it should now drive {CALIBRATION_DISTANCE_MM} mm
              and end pointing the way it started. Programs on the Blocks page that use this robot
              offer <strong>Update</strong>.
            </p>
          )}
        </section>
      </div>
    </Dialog>
  );
}

/** The way it started (dashed) and the way it stopped, seen from above. */
function TurnDial({ stopped, degrees }: { stopped: Stopped; degrees: number }) {
  // Clockwise turns: "past" is further clockwise, "before" short of it.
  const angle = stopped === 'exactly' ? 0 : stopped === 'past' ? degrees : -degrees;
  const at = (a: number, r: number) => {
    const rad = (a * Math.PI) / 180;
    return [50 + Math.sin(rad) * r, 50 - Math.cos(rad) * r] as const;
  };
  const tip = (a: number, r: number) => at(a, r).join(',');
  const [endX, endY] = at(angle, 36);
  return (
    <svg
      className="calibrate-dial"
      viewBox="0 0 100 100"
      role="img"
      aria-label={
        angle === 0
          ? 'It points the way it started.'
          : `It points ${Math.abs(angle)}° ${angle > 0 ? 'past' : 'before'} the way it started.`
      }
      data-testid="calibrate-dial"
    >
      <circle cx="50" cy="50" r="44" className="calibrate-dial-ring" />
      <line x1="50" y1="50" x2="50" y2="8" className="calibrate-dial-start" />
      <line x1="50" y1="50" x2={endX} y2={endY} className="calibrate-dial-end" />
      <polygon
        points={`${tip(angle, 44)} ${tip(angle - 9, 32)} ${tip(angle + 9, 32)}`}
        className="calibrate-dial-head"
      />
      <rect
        x="40"
        y="38"
        width="20"
        height="24"
        rx="3"
        transform={`rotate(${angle} 50 50)`}
        className="calibrate-dial-robot"
      />
    </svg>
  );
}
