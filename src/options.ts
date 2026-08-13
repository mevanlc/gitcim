import type { ActionSlot, Options } from './types.js';

export const ACTION_SLOTS: readonly ActionSlot[] = ['add', 'update', 'rename', 'remove', 'chmod'];

/**
 * Defaults are chosen so that every example in devdocs/PLAN.md reproduces from
 * the flags it names alone. `0` means off (overflow) or unlimited (list caps).
 */
export const DEFAULT_OPTIONS: Options = {
  group: 0,
  and: false,
  itemSeparator: ', ',
  groupSeparator: '; ',
  itemActionSuffix: ' ',
  groupActionSuffix: ': ',
  renameSeparator: ' to ',
  quoteChar: '"',
  overflow: 0,
  listOverflow: 0,
  listIndent: 4,
  listMaxItems: 0,
  listMaxGroups: 0,
  actionOrder: [...ACTION_SLOTS],
};

export function resolveOptions(overrides: Partial<Options> = {}): Options {
  return { ...DEFAULT_OPTIONS, ...overrides };
}

/** Parse an `--action-order` value such as `add,update,rename,remove,chmod`. */
export function parseActionOrder(value: string): ActionSlot[] {
  const slots = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const seen = new Set<string>();
  for (const slot of slots) {
    if (!ACTION_SLOTS.includes(slot as ActionSlot)) {
      throw new Error(`unknown action "${slot}" (expected one of ${ACTION_SLOTS.join(', ')})`);
    }
    if (seen.has(slot)) throw new Error(`duplicate action "${slot}" in --action-order`);
    seen.add(slot);
  }

  // Unnamed slots keep their default relative position, appended at the end.
  return [...(slots as ActionSlot[]), ...ACTION_SLOTS.filter((s) => !seen.has(s))];
}
