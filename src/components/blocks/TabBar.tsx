'use client';

import { useEffect, useRef, useState } from 'react';
import type { AddTabResult, EditorTab } from '@/lib/blocks/editor';
import type { TabNameCheck } from '@/lib/blocks/tabs';

interface Renaming {
  readonly id: string;
  readonly text: string;
}

/**
 * The program's tabs, like a browser's (ADR 0013): main first, then the tabs the user makes.
 * Each tab is a Python file of functions. Tap a tab to open it, + to make one, double-tap (or ✎)
 * to rename it, × to close it.
 */
export function TabBar({
  tabs,
  active,
  problemTabs,
  disabled,
  onSelect,
  onAdd,
  onRename,
  onClose,
}: {
  readonly tabs: readonly EditorTab[];
  readonly active: string;
  /** Tabs with something to fix. */
  readonly problemTabs: ReadonlySet<string>;
  readonly disabled: boolean;
  readonly onSelect: (id: string) => void;
  readonly onAdd: () => AddTabResult;
  readonly onRename: (id: string, text: string) => TabNameCheck;
  readonly onClose: (id: string) => void;
}) {
  const [renaming, setRenamingState] = useState<Renaming | null>(null);
  // What is being renamed right now, also for a blur that fires as the input goes away.
  const current = useRef<Renaming | null>(null);
  const setRenaming = (next: Renaming | null) => {
    current.current = next;
    setRenamingState(next);
  };
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const mainId = tabs[0]?.id;
  const renamingId = renaming?.id ?? null;

  // Select the whole name when renaming starts, so typing replaces it.
  useEffect(() => {
    if (renamingId === null) return;
    input.current?.focus();
    input.current?.select();
  }, [renamingId]);

  const startRename = (tab: EditorTab) => {
    if (tab.id === mainId || disabled) return;
    setError(null);
    setRenaming({ id: tab.id, text: tab.name });
  };

  /** Enter keeps the input open on a bad name; leaving it keeps the old name. */
  const finishRename = (leaving: boolean) => {
    const editing = current.current;
    if (!editing) return;
    const result = onRename(editing.id, editing.text);
    if (result.ok) {
      setRenaming(null);
      setError(null);
    } else if (leaving) {
      const old = tabs.find((tab) => tab.id === editing.id)?.name ?? '';
      setRenaming(null);
      setError(`${result.message} The tab is still called “${old}”.`);
    } else {
      setError(result.message);
    }
  };

  const add = () => {
    const result = onAdd();
    if (result.ok) {
      setError(null);
      setRenaming({ id: result.tab.id, text: result.tab.name });
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="block-tabs-bar">
      <div className="block-tabs" role="tablist" aria-label="Tabs of the program">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          const isMain = tab.id === mainId;
          if (renaming?.id === tab.id) {
            return (
              <div key={tab.id} className="block-tab" data-active="true">
                <input
                  ref={input}
                  className="block-tab-input"
                  value={renaming.text}
                  maxLength={20}
                  aria-label="Tab name"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoComplete="off"
                  onChange={(event) => setRenaming({ id: tab.id, text: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      finishRename(false);
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setRenaming(null);
                      setError(null);
                    }
                  }}
                  onBlur={() => finishRename(true)}
                  data-testid="tab-name-input"
                />
              </div>
            );
          }
          return (
            <div key={tab.id} className="block-tab" data-active={isActive}>
              <button
                type="button"
                role="tab"
                className="block-tab-name"
                aria-selected={isActive}
                onClick={() => onSelect(tab.id)}
                onDoubleClick={() => startRename(tab)}
                title={
                  isMain
                    ? 'The program starts here'
                    : `Functions in ${tab.name}.py. Double-tap to rename.`
                }
                data-testid={`tab-${tab.name}`}
              >
                {tab.name}
                {problemTabs.has(tab.id) && (
                  <span className="block-tab-problem">
                    <span className="visually-hidden"> (something to fix)</span>
                  </span>
                )}
              </button>
              {isActive && !isMain && (
                <>
                  <button
                    type="button"
                    className="block-tab-icon"
                    onClick={() => startRename(tab)}
                    disabled={disabled}
                    title="Rename this tab"
                    data-testid="tab-rename"
                  >
                    <PencilIcon />
                    <span className="visually-hidden">Rename the tab {tab.name}</span>
                  </button>
                  <button
                    type="button"
                    className="block-tab-icon"
                    onClick={() => {
                      setError(null);
                      onClose(tab.id);
                    }}
                    disabled={disabled}
                    title="Close this tab"
                    data-testid="tab-close"
                  >
                    <CrossIcon />
                    <span className="visually-hidden">Close the tab {tab.name}</span>
                  </button>
                </>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="block-tab-add"
          onClick={add}
          disabled={disabled}
          title="New tab, for functions"
          data-testid="tab-add"
        >
          <PlusIcon />
          <span className="visually-hidden">New tab</span>
        </button>
      </div>
      {error && (
        <p className="block-tabs-error" role="alert" data-testid="tab-error">
          {error}
        </p>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M8 3v10M3 8h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M4 4l8 8M12 4l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M10.5 3 13 5.5 6 12.5H3.5V10z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
