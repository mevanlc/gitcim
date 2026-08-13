import { parseArgs } from 'node:util';
import { GitcimError } from './errors.js';
import { parseActionOrder } from './options.js';
import type { Options } from './types.js';

export const HELP = `gitcim — describe the staged changes as a commit message

Usage:
    gitcim [OPTIONS] [--include [FILES...]] [--exclude [FILES...]]

Selection:
    --include [FILES...]        Only describe these paths (git pathspecs)
    --exclude [FILES...]        Leave these paths out

Wording:
    --group=N, --no-group       Collapse runs of N or more same-action items
                                into "update: a, b" (default: off)
    --and, --no-and             Join the last item with "and" (default: off)
    --item-separator=S          Between items (default: ", ")
    --group-separator=S         Between groups (default: "; ")
    --item-action-suffix=S      After an item's action (default: " ")
    --group-action-suffix=S     After a group's action (default: ": ")
    --rename-separator=S        Between a rename's paths (default: " to ")
    --quote-char=C              Quotes paths containing spaces (default: ")
    --action-order=A,B,...      Order of add, update, rename, remove, chmod

Layout:
    --overflow=N                Spill past N columns into a list (default: off)
    --list-overflow=N           Max width of a list line (default: unlimited)
    --list-indent=N             Spaces before each list bullet (default: 4)
    --list-max-items=N          Max items per list line (default: unlimited)
    --list-max-groups=N         Max groups per list line (default: unlimited)

    -v, --version               Print version
    -h, --help                  Show this help
`;

export type Values = Record<string, string | boolean | undefined>;

export interface ParsedArgs {
  include?: string[];
  exclude?: string[];
  values: Values;
}

interface FileLists {
  include?: string[];
  exclude?: string[];
  rest: string[];
}

/**
 * Pull the variadic `--include` / `--exclude` lists out of argv.
 *
 * `parseArgs` has no notion of a flag that takes many values, so collect the
 * tokens following one until the next flag, and hand the remainder over intact.
 */
export function extractFileLists(argv: string[]): FileLists {
  const rest: string[] = [];
  const lists: { include?: string[]; exclude?: string[] } = {};
  let current: string[] | undefined;
  let literal = false;

  for (const token of argv) {
    if (!literal && token === '--') {
      literal = true;
      continue;
    }

    if (!literal && token.startsWith('--')) {
      const eq = token.indexOf('=');
      const name = eq > 0 ? token.slice(0, eq) : token;
      if (name === '--include' || name === '--exclude') {
        const key = name.slice(2) as 'include' | 'exclude';
        const list = (lists[key] ??= []);
        if (eq > 0) {
          list.push(token.slice(eq + 1));
          current = undefined;
        } else {
          current = list;
        }
        continue;
      }
    }

    if (!literal && token.startsWith('-') && token !== '-') {
      current = undefined;
      rest.push(token);
      continue;
    }

    if (current) current.push(token);
    else rest.push(token);
  }

  return { ...lists, rest };
}

function toCount(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new GitcimError(`${name} must be a non-negative integer`, 2);
  }
  return value;
}

function str(values: Values, name: string): string | undefined {
  const value = values[name];
  return typeof value === 'string' ? value : undefined;
}

/** Turn parsed flag values into formatting overrides. */
export function buildFormat(values: Values): Partial<Options> {
  const format: Partial<Options> = {};

  const group = toCount('--group', str(values, 'group'));
  if (values['no-group']) format.group = 0;
  else if (group !== undefined) format.group = group;

  if (values['no-and']) format.and = false;
  else if (values.and) format.and = true;

  const strings: [keyof Options, string][] = [
    ['itemSeparator', 'item-separator'],
    ['groupSeparator', 'group-separator'],
    ['itemActionSuffix', 'item-action-suffix'],
    ['groupActionSuffix', 'group-action-suffix'],
    ['renameSeparator', 'rename-separator'],
    ['quoteChar', 'quote-char'],
  ];
  for (const [key, flag] of strings) {
    const value = str(values, flag);
    if (value !== undefined) Object.assign(format, { [key]: value });
  }

  const counts: [keyof Options, string][] = [
    ['overflow', 'overflow'],
    ['listOverflow', 'list-overflow'],
    ['listIndent', 'list-indent'],
    ['listMaxItems', 'list-max-items'],
    ['listMaxGroups', 'list-max-groups'],
  ];
  for (const [key, flag] of counts) {
    const value = toCount(`--${flag}`, str(values, flag));
    if (value !== undefined) Object.assign(format, { [key]: value });
  }

  const order = str(values, 'action-order');
  if (order !== undefined) {
    try {
      format.actionOrder = parseActionOrder(order);
    } catch (err) {
      throw new GitcimError(err instanceof Error ? err.message : String(err), 2);
    }
  }

  return format;
}

/** Parse a full argv tail into file lists plus flag values. */
export function parseCliArgs(argv: string[]): ParsedArgs {
  const { include, exclude, rest } = extractFileLists(argv);

  try {
    const { values } = parseArgs({
      args: rest,
      options: {
        group: { type: 'string' },
        'no-group': { type: 'boolean' },
        and: { type: 'boolean' },
        'no-and': { type: 'boolean' },
        'item-separator': { type: 'string' },
        'group-separator': { type: 'string' },
        'item-action-suffix': { type: 'string' },
        'group-action-suffix': { type: 'string' },
        'rename-separator': { type: 'string' },
        'quote-char': { type: 'string' },
        'action-order': { type: 'string' },
        overflow: { type: 'string' },
        'list-overflow': { type: 'string' },
        'list-indent': { type: 'string' },
        'list-max-items': { type: 'string' },
        'list-max-groups': { type: 'string' },
        version: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
    });
    return { ...(include ? { include } : {}), ...(exclude ? { exclude } : {}), values };
  } catch (err) {
    throw new GitcimError(err instanceof Error ? err.message : String(err), 2);
  }
}
