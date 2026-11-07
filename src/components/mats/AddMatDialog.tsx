'use client';

import { useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { NumberField } from '@/components/robots/NumberField';
import type { MatDraft, MatsStore } from '@/hooks/useMats';
import {
  MAT_MAX_MM,
  MAT_MIN_MM,
  cleanMatName,
  matNameFromFileName,
  validMatSize,
} from '@/lib/mats/mat';
import type { PageSize } from '@/lib/mats/pdf-box';
import { RULES_PROFILES } from '@/lib/robots/rules';

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Adding a mat (ADR 0016, D5): a PDF's real size comes from the file; a picture's size is typed
 * in. The file stays in this browser.
 */
export function AddMatDialog({
  draft,
  mats,
  onClose,
  onAdded,
}: {
  draft: MatDraft;
  mats: MatsStore;
  onClose: () => void;
  onAdded: (message: string) => void;
}) {
  const [name, setName] = useState(matNameFromFileName(draft.file.name));
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<PageSize | null>(draft.kind === 'pdf' ? draft.size : null);
  const aspect = draft.kind === 'image' ? draft.pixelHeight / draft.pixelWidth : 1;
  const [widthMm, setWidthMm] = useState<number | null>(null);
  const [heightMm, setHeightMm] = useState<number | null>(null);
  const [rulesId, setRulesId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const mat = await mats.create(draft, {
        name: cleanMatName(name) || matNameFromFileName(draft.file.name),
        page,
        ...(draft.kind === 'image' ? { widthMm: widthMm ?? 0, heightMm: heightMm ?? 0 } : {}),
        rulesId: rulesId || null,
      });
      onAdded(`Added the mat “${mat.name}”, ${round(mat.widthMm)} × ${round(mat.heightMm)} mm.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const sizeOk =
    draft.kind === 'pdf' || (validMatSize(widthMm ?? 0) && validMatSize(heightMm ?? 0));

  return (
    <Dialog title="Add a mat" onClose={onClose} testId="add-mat">
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span className="field-label">Name</span>
          <input
            className="field-input"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            data-testid="add-mat-name"
          />
        </label>

        {draft.kind === 'pdf' ? (
          <>
            {draft.pageCount > 1 && (
              <label className="field">
                <span className="field-label">Page</span>
                <select
                  className="field-input"
                  value={page}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setPage(next);
                    setSize(null);
                    void draft.pdf.size(next).then(setSize);
                  }}
                  data-testid="add-mat-page"
                >
                  {Array.from({ length: draft.pageCount }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Page {i + 1} of {draft.pageCount}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="notice notice-ok" data-testid="add-mat-size">
              {size
                ? `Real size: ${round(size.widthMm)} × ${round(size.heightMm)} mm, ${
                    size.sizeFrom === 'trim'
                      ? 'from the PDF’s trim box (where it is cut)'
                      : 'the size of the page'
                  }.`
                : 'Measuring the page…'}
            </p>
          </>
        ) : (
          <>
            <p className="field-hint">
              A picture has no size of its own: measure the real mat and type its width. The height
              follows the picture’s shape ({draft.pixelWidth} × {draft.pixelHeight} pixels); change
              it if your mat is cut differently.
            </p>
            <div className="add-mat-size">
              <NumberField
                label="Width"
                unit="mm"
                value={widthMm}
                optional
                onChange={(value) => {
                  setWidthMm(value);
                  if (value !== null) setHeightMm(round(value * aspect));
                }}
                problem={
                  widthMm !== null && !validMatSize(widthMm)
                    ? `Use a number from ${MAT_MIN_MM} to ${MAT_MAX_MM} mm.`
                    : undefined
                }
                testId="add-mat-width"
              />
              <NumberField
                label="Height"
                unit="mm"
                value={heightMm}
                optional
                onChange={setHeightMm}
                problem={
                  heightMm !== null && !validMatSize(heightMm)
                    ? `Use a number from ${MAT_MIN_MM} to ${MAT_MAX_MM} mm.`
                    : undefined
                }
                testId="add-mat-height"
              />
            </div>
          </>
        )}

        <label className="field">
          <span className="field-label">Rules</span>
          <select
            className="field-input"
            value={rulesId}
            onChange={(event) => setRulesId(event.target.value)}
            data-testid="add-mat-rules"
          >
            <option value="">No rules</option>
            {RULES_PROFILES.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </select>
        </label>

        <div className="button-row">
          <button
            type="submit"
            className="button button-primary"
            disabled={mats.busy || !sizeOk || (draft.kind === 'pdf' && !size)}
            data-testid="add-mat-save"
          >
            {mats.busy ? 'Drawing the mat…' : 'Add the mat'}
          </button>
        </div>
        {error && (
          <p className="notice notice-error" role="alert" data-testid="add-mat-error">
            {error}
          </p>
        )}
        <p className="field-hint">
          The file stays in this browser. Competition mats are the organiser’s work: keep them for
          your own practice.
        </p>
      </form>
    </Dialog>
  );
}
