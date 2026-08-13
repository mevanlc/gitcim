import type { ActionKind, Item, Options } from './types.js';
import { DEFAULT_OPTIONS } from './options.js';

const LABELS: Record<ActionKind, string> = {
  add: 'add',
  update: 'update',
  rename: 'rename',
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
  if (item.kind !== 'rename' || item.oldPath === undefined) return path;
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
        // Two segments read as "a and b"; three or more keep the serial comma.
        return segments.length === 2 ? ` ${AND}${seg.text}` : `${seg.sep}${AND}${seg.text}`;
      }
      return `${seg.sep}${seg.text}`;
    })
    .join('');
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

/** Render items as the final message: a first line, plus an overflow list if needed. */
export function render(items: Item[], overrides: Partial<Options> = {}): string {
  const opts: Options = { ...DEFAULT_OPTIONS, ...overrides };
  if (items.length === 0) return '';

  const headCount = fitCount(items, opts, {
    width: opts.overflow,
    maxItems: 0,
    maxGroups: 0,
    prefixLen: 0,
  });
  const head = renderLine(items.slice(0, headCount), opts, headCount === items.length);

  let rest = items.slice(headCount);
  if (rest.length === 0) return head;

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

  return `${head}\n\n${bullets.join('\n')}`;
}
