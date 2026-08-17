import { parseArgs, type ParseArgsConfig } from 'node:util';
import { CONFIG_ENV, EDITOR_ENV } from './config.js';
import { GitcimError } from './errors.js';
import {
  flagSyntax,
  formatDefault,
  negatedValue,
  OPTION_SPECS,
  parseActionOrder,
  SECTIONS,
  type OptionSpec,
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

/**
 * A flag that makes gitcim do something other than describe the index. These
 * are not `Options` fields, so they live here rather than in the option specs.
 */
export interface CommandSpec {
  flag: string;
  short?: string;
  /** Placeholder for a command that takes a value. */
  placeholder?: string;
  help: string;
}

export const COMMAND_SPECS: readonly CommandSpec[] = [
  { flag: 'config-init', help: 'Write a config file of defaults, then exit' },
  { flag: 'config-init-unset', help: 'The same file with every setting commented out' },
  { flag: 'config-reset', help: 'Overwrite the config file with the defaults' },
  { flag: 'config-edit', help: 'Open the config file in an editor, then check it' },
  { flag: 'config-print', help: 'Print the configuration this run would use' },
  {
    flag: 'config-write-schema',
    placeholder: 'PATH',
    help: "Write the config file's JSON schema, then exit",
  },
  { flag: 'version', short: 'v', help: 'Print version' },
  { flag: 'help', short: 'h', help: 'Show this help' },
];

function commandSyntax(spec: CommandSpec): string {
  const short = spec.short ? `-${spec.short}, ` : '';
  const value = spec.placeholder ? ` ${spec.placeholder}` : '';
  return `${short}--${spec.flag}${value}`;
}

interface HelpRow {
  section: string;
  syntax: string;
  help: string;
}

/** Build `--help` from the tables, so it cannot drift from the flags. */
function buildHelp(): string {
  const rows: HelpRow[] = [
    {
      section: 'Selection',
      syntax: '--include [FILES...]',
      help: 'Only describe these paths (git pathspecs)',
    },
    { section: 'Selection', syntax: '--exclude [FILES...]', help: 'Leave these paths out' },
    ...OPTION_SPECS.map((spec) => ({
      section: spec.section as string,
      syntax: flagSyntax(spec),
      help: `${spec.help} (default: ${formatDefault(spec)})`,
    })),
    ...COMMAND_SPECS.map((spec) => ({
      section: 'Commands',
      syntax: commandSyntax(spec),
      help: spec.help,
    })),
  ];

  const width = Math.max(...rows.map((row) => row.syntax.length)) + 2;
  const sections = ['Selection', ...SECTIONS, 'Commands'].map((section) => {
    const lines = rows
      .filter((row) => row.section === section)
      .map((row) => `    ${row.syntax.padEnd(width)}${row.help}`);
    return `${section}:\n${lines.join('\n')}\n`;
  });

  return `gitcim — describe the staged changes as a commit message

Usage:
    gitcim [OPTIONS] [--include [FILES...]] [--exclude [FILES...]]

${sections.join('\n')}
Environment:
    ${CONFIG_ENV.padEnd(width)}Config file to read, or to write with --config-init.
    ${''.padEnd(width)}"-" means stdin when reading, stdout when writing.
    ${''.padEnd(width)}Defaults to ~/.config/gitcim/config.toml.
    ${EDITOR_ENV[0].padEnd(width)}Editor for --config-edit; then ${EDITOR_ENV.slice(1)
      .map((name) => `$${name}`)
      .join(', then ')}.
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
    case 'choice': {
      const value = String(raw);
      if (!spec.values.includes(value)) {
        throw new GitcimError(`--${spec.flag} must be one of ${spec.values.join(', ')}`, 2);
      }
      return value;
    }
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

/** Supply the declared value for flags used without `=VALUE`. */
export function expandBareValues(argv: string[]): string[] {
  const bare = new Map(
    OPTION_SPECS.flatMap((spec) =>
      'bare' in spec && spec.bare !== undefined ? [[`--${spec.flag}`, spec.bare]] : [],
    ),
  );
  let literal = false;

  return argv.map((token) => {
    if (token === '--') literal = true;
    if (literal) return token;
    const value = bare.get(token);
    return value === undefined ? token : `${token}=${value}`;
  });
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

/** The `parseArgs` option table, derived from the option and command specs. */
export function parseArgsOptions(): NonNullable<ParseArgsConfig['options']> {
  const options: NonNullable<ParseArgsConfig['options']> = {};

  for (const spec of COMMAND_SPECS) {
    options[spec.flag] = {
      type: spec.placeholder ? 'string' : 'boolean',
      ...(spec.short ? { short: spec.short } : {}),
    };
  }

  for (const spec of OPTION_SPECS) {
    options[spec.flag] = { type: spec.kind === 'boolean' ? 'boolean' : 'string' };
    if ('negatable' in spec && spec.negatable) options[spec.negatable] = { type: 'boolean' };
  }

  return options;
}

/** Parse a full argv tail into file lists plus flag values. */
export function parseCliArgs(argv: string[]): ParsedArgs {
  const { include, exclude, rest } = extractFileLists(expandBareValues(argv));

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
