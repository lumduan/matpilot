'use client';

import { useEffect, useState } from 'react';
import { BOX_TABLE_URL, readBoxTable, type BoxTable } from '@/lib/ldraw/parts';

/**
 * The LDraw parts' sizes (ADR 0017), loaded from this site the first time a LEGO model is opened
 * and kept for the rest of the visit: about 800 kB, so only the Robots page's model dialog loads it.
 */

export type BoxTableState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly table: BoxTable }
  | { readonly status: 'error'; readonly message: string };

let loaded: Promise<BoxTable> | null = null;

function load(): Promise<BoxTable> {
  loaded ??= fetch(BOX_TABLE_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<unknown>;
    })
    .then((data) => {
      const table = readBoxTable(data);
      if (!table) throw new Error('not a size table');
      return table;
    })
    .catch((error: unknown) => {
      loaded = null; // try again next time
      throw error;
    });
  return loaded;
}

export function useLdrawBoxes(): BoxTableState {
  const [state, setState] = useState<BoxTableState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    load().then(
      (table) => live && setState({ status: 'ready', table }),
      (error: unknown) =>
        live &&
        setState({
          status: 'error',
          message: `MatPilot could not load the LEGO® parts’ sizes (${error instanceof Error ? error.message : 'unknown error'}). Reload the page and try again.`,
        }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
