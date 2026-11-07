'use client';

import { useId, useState } from 'react';

/**
 * A number with its unit. What is typed stays as typed while it is not a number yet (an empty
 * box, a lone minus); the value changes when it is one. `optional` lets the box be empty (null).
 */
export function NumberField({
  label,
  unit,
  value,
  onChange,
  problem,
  hint,
  step = 1,
  optional = false,
  testId,
}: {
  label: string;
  unit: string;
  value: number | null;
  onChange: (value: number | null) => void;
  problem?: string | undefined;
  hint?: string;
  step?: number;
  optional?: boolean;
  testId?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value === null ? '' : String(value));
  const [shown, setShown] = useState(value);
  // The value changed from elsewhere (another robot opened): show it.
  if (value !== shown) {
    setShown(value);
    setText(value === null ? '' : String(value));
  }
  const message = problem ?? (text.trim() === '' && !optional ? 'Type a number.' : undefined);
  return (
    <div className="field robot-number">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <span className="robot-number-input">
        <input
          id={id}
          className="field-input"
          type="number"
          inputMode="decimal"
          step={step}
          value={text}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-problem` : undefined}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            if (next.trim() === '') {
              if (optional) {
                setShown(null);
                onChange(null);
              }
              return;
            }
            const number = Number(next);
            if (Number.isFinite(number)) {
              setShown(number);
              onChange(number);
            }
          }}
          data-testid={testId}
        />
        <span className="robot-unit">{unit}</span>
      </span>
      {message ? (
        <span className="field-problem" id={`${id}-problem`}>
          {message}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  );
}
