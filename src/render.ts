import type { ActionKind, ActionSlot, Item, Options } from './types.js';
import { DEFAULT_OPTIONS } from './options.js';
import { GitcimError } from './errors.js';

const LABELS: Record<ActionKind, string> = {
  add: 'add',
  update: 'update',
  rename: 'rename',
  copy: 'copy',
  remove: 'remove',
  'chmod+x': 'chmod +x',
  'chmod-x': 'chmod -x',
};

const AND = 'and ';

/**
 * A run of items rendered as a unit. Either one action's items collapsed behind
 * a shared label (`update: a, b`), or a stretch of items each carrying its own
 * label (`remove old, add new`). Chunks are joined by the group separator.
 */
export interface Chunk {
  collapsed: boolean;
  items: Item[];
}

/** Quote a path only when it would otherwise be ambiguous to read. */
export function quotePath(path: string, quoteChar: string): string {
  if (quoteChar === '') return path;
  if (!/\s/.test(path) && !path.includes(quoteChar)) return path;
  const escaped = path.split(quoteChar).join(`\\${quoteChar}`);
  return `${quoteChar}${escaped}${quoteChar}`;
}

function operand(item: Item, opts: Options): string {
  const path = quotePath(item.path, opts.quoteChar);
  if ((item.kind !== 'rename' && item.kind !== 'copy') || item.oldPath === undefined) return path;
  return `${quotePath(item.oldPath, opts.quoteChar)}${opts.renameSeparator}${path}`;
}

/** Split items into chunks: collapsed groups, with expanded runs merged together. */
export function chunkItems(items: Item[], opts: Options): Chunk[] {
  const chunks: Chunk[] = [];

  for (let i = 0; i < items.length;) {
    const kind = items[i]?.kind;
    let end = i;
    while (end < items.length && items[end]?.kind === kind) end++;
    const run = items.slice(i, end);
    i = end;

    if (opts.group > 0 && run.length >= opts.group) {
      chunks.push({ collapsed: true, items: run });
      continue;
    }
    // Adjacent runs that both stay expanded read as one comma-joined list.
    const last = chunks[chunks.length - 1];
    if (last && !last.collapsed) last.items.push(...run);
    else chunks.push({ collapsed: false, items: run });
  }

  return chunks;
}

/**
 * Render one line's worth of items.
 *
 * `isLast` marks the final line of the message, where `--and` replaces the last
 * separator — at whatever level that separator happens to be.
 */
export function renderLine(items: Item[], opts: Options, isLast = false): string {
  const segments: { text: string; sep: string }[] = [];

  for (const chunk of chunkItems(items, opts)) {
    if (chunk.collapsed) {
      const label = LABELS[chunk.items[0]!.kind];
      const paths = chunk.items.map((it) => operand(it, opts)).join(opts.itemSeparator);
      segments.push({
        text: `${label}${opts.groupActionSuffix}${paths}`,
        sep: opts.groupSeparator,
      });
    } else {
      chunk.items.forEach((item, i) => {
        const text = `${LABELS[item.kind]}${opts.itemActionSuffix}${operand(item, opts)}`;
        segments.push({ text, sep: i === 0 ? opts.groupSeparator : opts.itemSeparator });
      });
    }
  }

  return segments
    .map((seg, i) => {
      if (i === 0) return seg.text;
      const last = i === segments.length - 1;
      if (isLast && opts.and && last) {
        // Two segments read as "a and b"; three or more keep the serial comma if oxfordAnd is true.
        const useSerialComma = segments.length > 2 && opts.oxfordAnd;
        // Keeping the separator means "and" needs whitespace in front of it;
        // dropping it means keeping only whatever whitespace it ended with, so
        // a separator like ",\n" still breaks the line where it used to.
        const spaced = /\s$/.test(seg.sep) ? seg.sep : `${seg.sep} `;
        const gap = /\s+$/.exec(seg.sep)?.[0] ?? ' ';
        return `${useSerialComma ? spaced : gap}${AND}${seg.text}`;
      }
      return `${seg.sep}${seg.text}`;
    })
    .join('');
}

const KINDS_BY_SLOT: Record<ActionSlot, readonly ActionKind[]> = {
  add: ['add'],
  update: ['update'],
  remove: ['remove'],
  rename: ['rename'],
  copy: ['copy'],
  chmod: ['chmod+x', 'chmod-x'],
};

function slotOf(kind: ActionKind): ActionSlot {
  return kind === 'chmod+x' || kind === 'chmod-x' ? 'chmod' : kind;
}

/** The least-compressed summary: paths for single actions, counts for repeated ones. */
function detailedSummary(items: Item[], opts: Options): string {
  const byKind = new Map<ActionKind, Item[]>();
  for (const item of items) {
    const group = byKind.get(item.kind) ?? [];
    group.push(item);
    byKind.set(item.kind, group);
  }

  const parts: string[] = [];
  for (const slot of opts.actionOrder) {
    for (const kind of KINDS_BY_SLOT[slot]) {
      const group = byKind.get(kind) ?? [];
      if (group.length === 0) continue;
      parts.push(
        group.length === 1 ? renderLine(group, opts) : `${LABELS[kind]} ${group.length} files`,
      );
    }
  }
  return parts.join(', ');
}

interface CountSummary {
  counts: Record<ActionSlot, number>;
  labels: Record<ActionSlot, string>;
  units: Record<ActionSlot, boolean>;
  spaces: Record<ActionSlot, boolean>;
  separator: string;
}

function countSummary(items: Item[]): CountSummary {
  const counts: Record<ActionSlot, number> = {
    add: 0,
    update: 0,
    remove: 0,
    rename: 0,
    copy: 0,
    chmod: 0,
  };
  for (const item of items) counts[slotOf(item.kind)]++;

  return {
    counts,
    labels: {
      add: 'add',
      update: 'update',
      remove: 'remove',
      rename: 'rename',
      copy: 'copy',
      chmod: 'chmod',
    },
    units: { add: true, update: true, remove: true, rename: true, copy: true, chmod: true },
    spaces: { add: true, update: true, remove: true, rename: true, copy: true, chmod: true },
    separator: ', ',
  };
}

function renderCountSummary(summary: CountSummary, order: readonly ActionSlot[]): string {
  return order
    .filter((slot) => summary.counts[slot] > 0)
    .map((slot) => {
      const count = summary.counts[slot];
      const gap = summary.spaces[slot] ? ' ' : '';
      const unit = summary.units[slot] ? ` ${count === 1 ? 'file' : 'files'}` : '';
      return `${summary.labels[slot]}${gap}${count}${unit}`;
    })
    .join(summary.separator);
}

function rightToLeft(slots: readonly ActionSlot[], summary: CountSummary): ActionSlot[] {
  return slots.filter((slot) => summary.counts[slot] > 0).reverse();
}

/**
 * Produce progressively shorter summaries, preserving each intermediate form
 * so the first one that fits loses as little information as possible.
 */
function summaryCandidates(items: Item[], opts: Options): string[] {
  const candidates = [detailedSummary(items, opts)];
  const summary = countSummary(items);
  const push = () => {
    const candidate = renderCountSummary(summary, opts.actionOrder);
    const previous = candidates.at(-1) ?? '';
    if (candidate !== previous && candidate.length < previous.length) candidates.push(candidate);
  };

  push();

  // Fold special actions into their broader category, starting at the right.
  const folds = (
    [
      { source: 'copy', target: 'add' },
      { source: 'chmod', target: 'update' },
    ] satisfies Array<{ source: ActionSlot; target: ActionSlot }>
  ).sort((a, b) => opts.actionOrder.indexOf(b.source) - opts.actionOrder.indexOf(a.source));
  for (const { source, target } of folds) {
    if (summary.counts[source] === 0) continue;
    summary.counts[target] += summary.counts[source];
    summary.counts[source] = 0;
    push();
  }

  // Short words, then no units, then Git's one-letter action codes.
  const synonyms: Partial<Record<ActionSlot, string>> = { remove: 'rm', rename: 'mv' };
  for (const slot of rightToLeft(opts.actionOrder, summary)) {
    const label = synonyms[slot];
    if (label === undefined) continue;
    summary.labels[slot] = label;
    push();
  }
  for (const slot of rightToLeft(opts.actionOrder, summary)) {
    summary.units[slot] = false;
    push();
  }

  const codes: Record<ActionSlot, string> = {
    add: 'A',
    update: 'M',
    remove: 'D',
    rename: 'R',
    copy: 'C',
    chmod: 'X',
  };
  for (const slot of rightToLeft(opts.actionOrder, summary)) {
    summary.labels[slot] = codes[slot];
    push();
  }
  for (const slot of rightToLeft(opts.actionOrder, summary)) {
    summary.spaces[slot] = false;
    push();
  }

  summary.separator = ' ';
  push();
  summary.separator = '';
  push();

  const total = String(items.length);
  if (total.length < (candidates.at(-1)?.length ?? Infinity)) candidates.push(total);
  return candidates;
}

/** Summarize all actions on one line, compressing until it fits `--overflow`. */
export function summarizeItems(items: Item[], opts: Options): string {
  const candidates = summaryCandidates(items, opts);
  if (opts.overflow === 0) return candidates[0] ?? '';
  const fitting = candidates.find((candidate) => candidate.length <= opts.overflow);
  if (fitting !== undefined) return fitting;
  throw new GitcimError(
    `cannot summarize ${items.length} changes within --overflow=${opts.overflow}`,
    2,
  );
}

interface Limits {
  /** Max rendered width including `prefixLen`. 0 means unlimited. */
  width: number;
  maxItems: number;
  maxGroups: number;
  prefixLen: number;
}

/**
 * How many leading items fit on one line. Always at least one: a single item is
 * never broken up, so an over-long path simply overruns the limit.
 */
function fitCount(items: Item[], opts: Options, limits: Limits): number {
  let count = 1;

  while (count < items.length) {
    const candidate = count + 1;
    if (limits.maxItems > 0 && candidate > limits.maxItems) break;

    const slice = items.slice(0, candidate);
    if (limits.maxGroups > 0 && chunkItems(slice, opts).length > limits.maxGroups) break;

    if (limits.width > 0) {
      const rendered = renderLine(slice, opts, candidate === items.length);
      if (limits.prefixLen + rendered.length > limits.width) break;
    }
    count = candidate;
  }

  return count;
}

function renderBody(items: Item[], opts: Options): string {
  if (opts.groupGroup !== '') return renderGroupedBody(items, opts);

  let rest = items;
  const indent = ' '.repeat(opts.listIndent);
  const bullets: string[] = [];
  while (rest.length > 0) {
    const count = fitCount(rest, opts, {
      width: opts.listOverflow,
      maxItems: opts.listMaxItems,
      maxGroups: opts.listMaxGroups,
      prefixLen: opts.listIndent + 2,
    });
    bullets.push(`${indent}- ${renderLine(rest.slice(0, count), opts, count === rest.length)}`);
    rest = rest.slice(count);
  }
  return bullets.join('\n');
}

/**
 * Render each contiguous action run behind one label. Continuation lines contain
 * operands only and begin with the exact prefix supplied by `--group-group`.
 */
function renderGroupedBody(items: Item[], opts: Options): string {
  const lines: string[] = [];
  const indent = ' '.repeat(opts.listIndent);

  for (let start = 0; start < items.length;) {
    const kind = items[start]!.kind;
    let end = start + 1;
    while (end < items.length && items[end]!.kind === kind) end++;

    let rest = items.slice(start, end);
    let first = true;
    while (rest.length > 0) {
      const prefix = first
        ? `${indent}- ${LABELS[kind]}${opts.groupActionSuffix}`
        : opts.groupGroup;
      const maxItems =
        opts.listMaxItems > 0 ? Math.min(opts.listMaxItems, rest.length) : rest.length;
      let count = 1;

      for (let candidate = 1; candidate <= maxItems; candidate++) {
        const continues = candidate < rest.length;
        const text = rest
          .slice(0, candidate)
          .map((item) => operand(item, opts))
          .join(opts.groupGroupItemSeparator);
        const rendered = `${prefix}${text}${continues ? opts.groupGroupCont : ''}`;
        if (opts.listOverflow === 0 || rendered.length <= opts.listOverflow) count = candidate;
      }

      const continues = count < rest.length;
      const text = rest
        .slice(0, count)
        .map((item) => operand(item, opts))
        .join(opts.groupGroupItemSeparator);
      lines.push(`${prefix}${text}${continues ? opts.groupGroupCont : ''}`);
      rest = rest.slice(count);
      first = false;
    }

    start = end;
  }

  return lines.join('\n');
}

/** Render the ordinary first line and only its overflow remainder as a body. */
function renderDetailed(items: Item[], opts: Options): string {
  const headCount = fitCount(items, opts, {
    width: opts.overflow,
    maxItems: 0,
    maxGroups: 0,
    prefixLen: 0,
  });
  const head = renderLine(items.slice(0, headCount), opts, headCount === items.length);

  const rest = items.slice(headCount);
  if (rest.length === 0) return head;
  return `${head}\n\n${renderBody(rest, opts)}`;
}

/** Render items as a commit-message first line plus an optional detailed body. */
export function render(items: Item[], overrides: Partial<Options> = {}): string {
  const opts: Options = { ...DEFAULT_OPTIONS, ...overrides };
  if (items.length === 0) return '';

  const summarize =
    opts.summarize === 'always' ||
    (opts.summarize === 'overflow' &&
      opts.overflow > 0 &&
      renderLine(items, opts, true).length > opts.overflow);
  const message = summarize
    ? `${summarizeItems(items, opts)}\n\n${renderBody(items, opts)}`
    : renderDetailed(items, opts);
  return opts.excludeBody ? (message.split('\n', 1)[0] ?? '') : message;
}
