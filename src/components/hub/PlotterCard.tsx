'use client';

import type { SeriesData } from '@/lib/monitor/plot';
import { PlotterView } from './PlotterView';

/** The plotter card with Pause / Resume and Clear, shared by /program and /blocks. */
export function PlotterCard({
  series,
  paused,
  onPausedChange,
  onClear,
  variant = 'card',
}: {
  series: readonly SeriesData[];
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  onClear: () => void;
  /** `pane`: inside the Blocks page's output drawer, filling its height. */
  variant?: 'card' | 'pane';
}) {
  return (
    <section className={variant === 'pane' ? 'pane' : 'card'} aria-labelledby="plot-heading">
      <div className="card-header">
        <h2 id="plot-heading">Plotter</h2>
        <div className="button-row">
          <button
            type="button"
            className="button"
            onClick={() => onPausedChange(!paused)}
            aria-pressed={paused}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className="button" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
      <PlotterView series={series} fill={variant === 'pane'} />
    </section>
  );
}
