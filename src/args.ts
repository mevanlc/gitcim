import { parseArgs, type ParseArgsConfig } from 'node:util';
import { GitcimError } from './errors.js';
import {
  formatDefault,
  negatedValue,
  OPTION_SPECS,
  parseActionOrder,
  type OptionSpec,
  type Section,
} from './options.js';
import type { Options } from './types.js';

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

/** How a flag is written in help: `--list-indent=N`, or `--and, --no-and`. */
function flagSyntax(spec: OptionSpec): string {
  const value = spec.kind === 'boolean' ? '' : `=${spec.placeholder}`;
  const negated = 'negatable' in spec && spec.negatable ? `, --${spec.negatable}` : '';
  return `--${spec.flag}${value}${negated}`;
}

const SECTIONS: Section[] = ['Wording', 'Layout'];

/** Build `--help` from the option table, so it cannot drift from the flags. */
function buildHelp(): string {
  const rows = OPTION_SPECS.map((spec) => ({
    spec,
    syntax: flagSyntax(spec),
  }));
  const width = Math.max(...rows.map((row) => row.syntax.length)) + 2;

  const sections = SECTIONS.map((section) => {
    const lines = rows
      .filter((row) => row.spec.section === section)
      .map((row) => {
        const help = `${row.spec.help} (default: ${formatDefault(row.spec)})`;
        return `    ${row.syntax.padEnd(width)}${help}`;
      });
    return `${section}:\n${lines.join('\n')}\n`;
  });

  return `gitcim — describe the staged changes as a commit message

Usage:
    gitcim [OPTIONS] [--include [FILES...]] [--exclude [FILES...]]

Selection:
    --include [FILES...]${' '.repeat(Math.max(1, width - 20))}Only describe these paths (git pathspecs)
    --exclude [FILES...]${' '.repeat(Math.max(1, width - 20))}Leave these paths out

${sections.join('\n')}
    -v, --version${' '.repeat(Math.max(1, width - 13))}Print version
    -h, --help${' '.repeat(Math.max(1, width - 10))}Show this help
`;
}

export const HELP = buildHelp();

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

/** Coerce a flag value the way its spec says, reporting a usage error if it cannot. */
export function coerce(
  spec: OptionSpec,
  raw: string | boolean,
): boolean | number | string | string[] {
  switch (spec.kind) {
    case 'boolean':
      return raw === true;
    case 'string':
      return String(raw);
    case 'order':
      try {
        return parseActionOrder(String(raw));
      } catch (err) {
        throw new GitcimError(err instanceof Error ? err.message : String(err), 2);
      }
    case 'count': {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0) {
        throw new GitcimError(`--${spec.flag} must be a non-negative integer`, 2);
      }
      return value;
    }
  }
}

/** Turn parsed flag values into formatting overrides. */
export function buildFormat(values: Values): Partial<Options> {
  const format: Record<string, unknown> = {};

  for (const spec of OPTION_SPECS) {
    if ('negatable' in spec && spec.negatable && values[spec.negatable] === true) {
      format[spec.key] = negatedValue(spec);
      continue;
    }
    const raw = values[spec.flag];
    if (raw === undefined || raw === false) continue;
    format[spec.key] = coerce(spec, raw);
  }

  return format as Partial<Options>;
}

/** The `parseArgs` option table, derived from the option specs. */
export function parseArgsOptions(): NonNullable<ParseArgsConfig['options']> {
  const options: NonNullable<ParseArgsConfig['options']> = {
    version: { type: 'boolean', short: 'v' },
    help: { type: 'boolean', short: 'h' },
  };

  for (const spec of OPTION_SPECS) {
    options[spec.flag] = { type: spec.kind === 'boolean' ? 'boolean' : 'string' };
    if ('negatable' in spec && spec.negatable) options[spec.negatable] = { type: 'boolean' };
  }

  return options;
}

/** Parse a full argv tail into file lists plus flag values. */
export function parseCliArgs(argv: string[]): ParsedArgs {
  const { include, exclude, rest } = extractFileLists(argv);

  try {
    const { values } = parseArgs({
      args: rest,
      options: parseArgsOptions(),
      strict: true,
      allowPositionals: false,
    });
    // No option sets `multiple`, so no value is ever an array.
    return {
      ...(include ? { include } : {}),
      ...(exclude ? { exclude } : {}),
      values: values as Values,
    };
  } catch (err) {
    throw new GitcimError(err instanceof Error ? err.message : String(err), 2);
  }
}
