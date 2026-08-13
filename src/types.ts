/** A single mechanical action performed on one path. */
export type ActionKind = 'add' | 'update' | 'rename' | 'remove' | 'chmod+x' | 'chmod-x';

/** The `--action-order` slots. Both chmod kinds share the `chmod` slot. */
export type ActionSlot = 'add' | 'update' | 'rename' | 'remove' | 'chmod';

export interface Item {
  kind: ActionKind;
  /** Path after the change. */
  path: string;
  /** Path before the change. Renames only. */
  oldPath?: string;
}

/** One record of `git diff --cached --raw -z`. */
export interface RawEntry {
  oldMode: string;
  newMode: string;
  oldSha: string;
  newSha: string;
  /** Status letter with any similarity score stripped: A, M, D, R, C, T, U. */
  status: string;
  /** Path after the change (the destination path for renames and copies). */
  path: string;
  /** Source path, present only for renames and copies. */
  oldPath?: string;
}

export interface Options {
  /** Collapse a run of N or more same-action items into `action: a, b`. 0 disables. */
  group: number;
  /** Join the final chunk with `and`. */
  and: boolean;
  itemSeparator: string;
  groupSeparator: string;
  /** Between an action label and its operand, for an expanded item. */
  itemActionSuffix: string;
  /** Between an action label and its operands, for a collapsed group. */
  groupActionSuffix: string;
  renameSeparator: string;
  quoteChar: string;
  /** Max width of the first line before spilling into a list. 0 disables. */
  overflow: number;
  /** Max width of a list line, indent and bullet included. 0 means unlimited. */
  listOverflow: number;
  listIndent: number;
  /** Max items per list line. 0 means unlimited. */
  listMaxItems: number;
  /** Max chunks per list line. 0 means unlimited. */
  listMaxGroups: number;
  actionOrder: readonly ActionSlot[];
}
