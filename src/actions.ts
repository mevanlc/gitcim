import type { ActionKind, ActionSlot, Item, RawEntry } from './types.js';
import { DEFAULT_OPTIONS } from './options.js';

const REGULAR_MODE = '100644';
const EXEC_MODE = '100755';

/** The `--action-order` slot an action belongs to. */
export function slotOf(kind: ActionKind): ActionSlot {
  return kind === 'chmod+x' || kind === 'chmod-x' ? 'chmod' : kind;
}

/** The executable-bit change between two file modes, if any. */
function chmodKind(oldMode: string, newMode: string): ActionKind | undefined {
  if (oldMode === REGULAR_MODE && newMode === EXEC_MODE) return 'chmod+x';
  if (oldMode === EXEC_MODE && newMode === REGULAR_MODE) return 'chmod-x';
  return undefined;
}

/**
 * Turn raw diff entries into actions.
 *
 * A staged change can be two actions at once: editing a file and flipping its
 * executable bit yields both `update` and `chmod +x`. Git only reports mode
 * changes that actually changed something, so a no-op chmod produces nothing.
 */
export function toItems(
  entries: RawEntry[],
  order: readonly ActionSlot[] = DEFAULT_OPTIONS.actionOrder,
): Item[] {
  const items: Item[] = [];

  for (const entry of entries) {
    switch (entry.status) {
      case 'A':
        items.push({ kind: 'add', path: entry.path });
        break;
      case 'D':
        items.push({ kind: 'remove', path: entry.path });
        break;
      case 'C':
      case 'R': {
        const kind = entry.status === 'C' ? 'copy' : 'rename';
        items.push({ kind, path: entry.path, oldPath: entry.oldPath ?? entry.path });
        // A rename carries one file's mode forward, so a difference there is a
        // real chmod. A copy's old mode belongs to the source file, which is
        // still sitting there unchanged — the destination was simply created
        // with the mode it has, exactly as an untracked `add` would be.
        const chmod = kind === 'rename' ? chmodKind(entry.oldMode, entry.newMode) : undefined;
        if (chmod) items.push({ kind: chmod, path: entry.path });
        if (entry.oldSha !== entry.newSha) items.push({ kind: 'update', path: entry.path });
        break;
      }
      default: {
        // M, T and anything else that means "this file changed in place".
        const chmod = chmodKind(entry.oldMode, entry.newMode);
        const contentChanged = entry.oldSha !== entry.newSha;
        if (contentChanged || !chmod) items.push({ kind: 'update', path: entry.path });
        if (chmod) items.push({ kind: chmod, path: entry.path });
        break;
      }
    }
  }

  return sortItems(items, order);
}

/** A rename or copy is what brings its destination path into existence. */
function creates(item: Item): boolean {
  return item.kind === 'rename' || item.kind === 'copy';
}

/**
 * Order by action slot, then by path. Both sorts are total, so output is stable.
 *
 * A renamed or copied path is the one exception to the slot order: the path
 * does not exist until that action, so everything else said about it is ranked
 * alongside it instead of by its own slot. Without that, `--action-order` puts
 * `update` first and the message reads `update new.md, rename old.md to new.md`.
 */
export function sortItems(items: Item[], order: readonly ActionSlot[]): Item[] {
  const rank = new Map<ActionKind, number>();
  order.forEach((slot, i) => {
    if (slot === 'chmod') {
      // `+x` before `-x` within the shared slot.
      rank.set('chmod+x', i * 2);
      rank.set('chmod-x', i * 2 + 1);
    } else {
      rank.set(slot, i * 2);
    }
  });

  const creation = new Map<string, number>();
  for (const item of items) {
    if (creates(item)) creation.set(item.path, rank.get(item.kind) ?? 0);
  }

  /**
   * Slot, then path, then position within a renamed path's own run — 0 for the
   * rename or copy itself, so it leads, and the item's own slot (shifted clear
   * of 0) for everything that follows it.
   */
  const keyOf = (item: Item): [number, string, number] => {
    const own = rank.get(item.kind) ?? 0;
    const created = creation.get(item.path);
    if (created === undefined) return [own, item.path, 0];
    return [created, item.path, creates(item) ? 0 : own + 1];
  };

  return [...items].sort((a, b) => {
    const [aSlot, aPath, aSub] = keyOf(a);
    const [bSlot, bPath, bSub] = keyOf(b);
    if (aSlot !== bSlot) return aSlot - bSlot;
    if (aPath !== bPath) return aPath < bPath ? -1 : 1;
    return aSub - bSub;
  });
}
