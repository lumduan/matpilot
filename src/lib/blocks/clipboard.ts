/**
 * Copy and paste between tabs (ADR 0013, decision 10).
 *
 * Blockly pastes into the workspace the blocks were copied from, even when that workspace is a tab
 * that is now hidden: copy in "main", open "moves", press Ctrl+V, and nothing seems to happen.
 * Here, Ctrl+V pastes into the tab you are in. Within one tab, Blockly's own paste is used.
 *
 * The right-click menu also gets **Copy** (on a block) and **Paste** (on the empty block area),
 * for touch screens and for anyone who does not know the keys.
 */
import * as Blockly from 'blockly/core';

const COPY_ITEM = 'mp_block_copy';
const PASTE_ITEM = 'mp_workspace_paste';

/** The workspace blocks land in: a flyout's blocks go to the workspace it belongs to. */
function home(workspace: Blockly.WorkspaceSvg | null): Blockly.WorkspaceSvg | null {
  return workspace?.isFlyout ? (workspace.targetWorkspace ?? null) : workspace;
}

/** `workspace` when the last copy came from another tab, else `null` (Blockly's own paste). */
function otherTab(workspace: Blockly.WorkspaceSvg): Blockly.WorkspaceSvg | null {
  const here = home(workspace);
  if (!here || !Blockly.clipboard.getLastCopiedData()) return null;
  return home(Blockly.clipboard.getLastCopiedWorkspace()) === here ? null : here;
}

/** A point near the middle of what the workspace shows, in its own coordinates. */
function viewMiddle(workspace: Blockly.WorkspaceSvg): Blockly.utils.Coordinate {
  const { left, top, width, height } = workspace.getMetricsManager().getViewMetrics(true);
  return new Blockly.utils.Coordinate(left + width / 3, top + height / 3);
}

/** Pastes the last copied blocks into `workspace`, at `at` or near the middle of the view. */
function pasteInto(workspace: Blockly.WorkspaceSvg, at?: Blockly.utils.Coordinate): boolean {
  const data = Blockly.clipboard.getLastCopiedData();
  if (!data || workspace.isReadOnly() || workspace.isDragging()) return false;
  workspace.hideChaff();
  return Blockly.clipboard.paste(data, workspace, at ?? viewMiddle(workspace)) !== null;
}

type MarkedShortcut = Blockly.ShortcutRegistry.KeyboardShortcut & {
  /** Blockly's own paste, which this one wraps. */
  mpBuiltIn?: Blockly.ShortcutRegistry.KeyboardShortcut;
};

/** Ctrl+V pastes into the tab the key was pressed in. */
function registerPasteShortcut(): void {
  const registry = Blockly.ShortcutRegistry.registry;
  const name = Blockly.ShortcutItems.names.PASTE;
  const current = registry.getRegistry()[name] as MarkedShortcut | undefined;
  if (!current) return;
  // After a hot reload the registry still holds the wrapper: wrap Blockly's own again.
  const builtIn = current.mpBuiltIn ?? current;
  const keyCodes = registry.getKeyCodesByShortcutName(name);
  registry.unregister(name);
  const shortcut: MarkedShortcut = {
    ...builtIn,
    mpBuiltIn: builtIn,
    keyCodes,
    preconditionFn(workspace, scope) {
      const target = otherTab(workspace);
      if (!target) return builtIn.preconditionFn?.(workspace, scope) ?? true;
      return (
        !target.isReadOnly() &&
        !target.isDragging() &&
        !Blockly.getFocusManager().ephemeralFocusTaken()
      );
    },
    callback(workspace, event, self, scope) {
      const target = otherTab(workspace);
      if (!target) return builtIn.callback?.(workspace, event, self, scope) ?? false;
      return pasteInto(target);
    },
  };
  registry.register(shortcut);
}

function registerMenuItems(): void {
  const registry = Blockly.ContextMenuRegistry.registry;
  if (!registry.getItem(COPY_ITEM)) {
    registry.register({
      id: COPY_ITEM,
      scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
      displayText: 'Copy',
      // Like Blockly's Duplicate: a block that can be moved and deleted can be copied.
      preconditionFn(scope) {
        const block = scope.block;
        if (!block || block.isInFlyout || !block.isDeletable() || !block.isMovable()) {
          return 'hidden';
        }
        return block.isDuplicatable() ? 'enabled' : 'disabled';
      },
      callback(scope) {
        const block = scope.block;
        if (block) Blockly.clipboard.copy(block, block.getRelativeToSurfaceXY());
      },
      weight: 0,
      associatedKeyboardShortcut: Blockly.ShortcutItems.names.COPY,
    });
  }
  if (!registry.getItem(PASTE_ITEM)) {
    registry.register({
      id: PASTE_ITEM,
      scopeType: Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
      displayText: 'Paste',
      preconditionFn(scope) {
        const workspace = scope.workspace;
        if (!workspace || workspace.isFlyout) return 'hidden';
        return Blockly.clipboard.getLastCopiedData() && !workspace.isReadOnly()
          ? 'enabled'
          : 'disabled';
      },
      // Where the menu was opened.
      callback(scope, _open, _select, location) {
        const workspace = scope.workspace;
        if (!workspace) return;
        pasteInto(workspace, Blockly.utils.svgMath.screenToWsCoordinates(workspace, location));
      },
      weight: 0,
      associatedKeyboardShortcut: Blockly.ShortcutItems.names.PASTE,
    });
  }
}

let registered = false;

/** Registers the paste key and the Copy and Paste menu items. Browser only; safe to repeat. */
export function registerClipboard(): void {
  if (registered) return;
  registered = true;
  registerPasteShortcut();
  registerMenuItems();
}
