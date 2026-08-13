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
  order: ActionSlot[] = DEFAULT_OPTIONS.actionOrder,
): Item[] {
  const items: Item[] = [];

  for (const entry of entries) {
    switch (entry.status) {
      case 'A':
      case 'C':
        items.push({ kind: 'add', path: entry.path });
        break;
      case 'D':
        items.push({ kind: 'remove', path: entry.path });
        break;
      case 'R': {
        items.push({ kind: 'rename', path: entry.path, oldPath: entry.oldPath ?? entry.path });
        const chmod = chmodKind(entry.oldMode, entry.newMode);
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

/** Order by action slot, then by path. Both sorts are total, so output is stable. */
export function sortItems(items: Item[], order: ActionSlot[]): Item[] {
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

  return [...items].sort((a, b) => {
    const byKind = (rank.get(a.kind) ?? 0) - (rank.get(b.kind) ?? 0);
    if (byKind !== 0) return byKind;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}
