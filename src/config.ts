import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { GitcimError } from './errors.js';
import {
  ACTION_SLOTS,
  flagSyntax,
  OPTION_SPECS,
  parseActionOrder,
  SECTIONS,
  SPECS_BY_FLAG,
  type OptionSpec,
} from './options.js';
import { parseToml, TomlError, type TomlValue } from './toml.js';
import type { Options } from './types.js';

/** Names the config file to read, or where `--config-init` writes it. */
export const CONFIG_ENV = 'GITCIM_CONFIG_FILE';

/** Stands for stdin when reading a config and stdout when writing one. */
export const STDIO = '-';

/** Consulted in order for the editor `--config-edit` opens. */
export const EDITOR_ENV = ['GITCIM_EDITOR', 'VISUAL', 'EDITOR'] as const;

const COMMENT_WIDTH = 78;

export interface ConfigLocation {
  path: string;
  /** True when the environment named it, which makes a missing file an error. */
  explicit: boolean;
}

/** Where the config file lives: `$GITCIM_CONFIG_FILE`, else the XDG location. */
export function configLocation(env: NodeJS.ProcessEnv): ConfigLocation {
  const named = env[CONFIG_ENV];
  if (named !== undefined && named !== '') return { path: named, explicit: true };

  const base = env.XDG_CONFIG_HOME ?? '';
  return {
    path: join(base === '' ? join(homedir(), '.config') : base, 'gitcim', 'config.toml'),
    explicit: false,
  };
}

// ---------------------------------------------------------------- reading

/**
 * Load the config file into formatting overrides.
 *
 * A missing file at the default location is the ordinary case and yields no
 * overrides. A missing file that the environment pointed at is a mistake worth
 * reporting: the run would otherwise silently ignore the settings asked for.
 */
export async function loadConfig(
  env: NodeJS.ProcessEnv,
  deps: { readStdin?: () => Promise<string> } = {},
): Promise<Partial<Options>> {
  const { path, explicit } = configLocation(env);
  const text = await readConfigText(path, explicit, deps.readStdin ?? readStdin);
  if (text === undefined) return {};
  return parseConfig(text, path === STDIO ? '<stdin>' : path);
}

async function readConfigText(
  path: string,
  explicit: boolean,
  readStdinText: () => Promise<string>,
): Promise<string | undefined> {
  if (path === STDIO) return readStdinText();

  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      if (!explicit) return undefined;
      throw new GitcimError(`config file not found: ${path}`, 2);
    }
    throw new GitcimError(`cannot read config file ${path}: ${describe(err)}`, 2);
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new GitcimError(`${CONFIG_ENV}=- but stdin is a terminal`, 2);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

// ---------------------------------------------------------------- editing

export type EditorLauncher = (command: string, args: string[]) => Promise<number>;

/**
 * The editor `--config-edit` should run, split into a command and its arguments.
 *
 * A value such as `code --wait` works; shell quoting does not, so an editor whose
 * path contains a space needs a wrapper script — the same bargain git's
 * `core.editor` offers, without the shell it would otherwise take to honour.
 */
export function resolveEditor(env: NodeJS.ProcessEnv): { command: string; args: string[] } {
  for (const name of EDITOR_ENV) {
    const value = env[name]?.trim();
    if (value === undefined || value === '') continue;
    const [command = '', ...args] = value.split(/\s+/);
    return { command, args };
  }

  const names = EDITOR_ENV.map((name) => `$${name}`);
  throw new GitcimError(`no editor: set ${names.slice(0, -1).join(', ')} or ${names.at(-1)}`, 2);
}

/** Run an editor against the user's terminal and resolve to its exit status. */
export const spawnEditor: EditorLauncher = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.on('error', (err) => reject(new GitcimError(`cannot run ${command}: ${err.message}`, 1)));
    child.on('close', (code) => resolve(code ?? 1));
  });

/** Parse config text, reporting problems against `source` (a path, or `<stdin>`). */
export function parseConfig(text: string, source: string): Partial<Options> {
  let table: Map<string, TomlValue>;
  try {
    table = parseToml(text);
  } catch (err) {
    if (err instanceof TomlError) throw new GitcimError(`${source}:${err.line}: ${err.message}`, 2);
    throw err;
  }

  const overrides: Record<string, unknown> = {};
  for (const [key, value] of table) {
    const spec = SPECS_BY_FLAG.get(key);
    if (!spec) throw new GitcimError(`${source}: unknown setting "${key}"`, 2);
    overrides[spec.key] = validate(spec, value, source);
  }
  return overrides as Partial<Options>;
}

/** Check one setting against its spec — the same rules the flags are held to. */
function validate(spec: OptionSpec, value: TomlValue, source: string): TomlValue {
  const reject = (want: string): never => {
    throw new GitcimError(`${source}: ${spec.flag} must be ${want}`, 2);
  };

  switch (spec.kind) {
    case 'string':
      return typeof value === 'string' ? value : reject('a string');
    case 'boolean':
      return typeof value === 'boolean' ? value : reject('true or false');
    case 'count':
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return reject('a non-negative integer');
      }
      return value;
    case 'order': {
      if (!Array.isArray(value)) return reject('an array of action names');
      try {
        return parseActionOrder(value.join(','));
      } catch (err) {
        throw new GitcimError(`${source}: ${describe(err)}`, 2);
      }
    }
  }
}

// ---------------------------------------------------------------- writing

/** Where a setting's effective value came from, keyed by flag name. */
export type ConfigOrigins = ReadonlyMap<string, string>;

interface SettingsRender {
  /** The opening comment, below the shared title. */
  intro: string[];
  value: (spec: OptionSpec) => string | number | boolean | readonly string[];
  /** Rendered as a `## Source:` line, when a setting has one to report. */
  origin?: (spec: OptionSpec) => string | undefined;
  commented: boolean;
}

/** The shared shape of every generated config file: prose, then one setter. */
function renderSettings({ intro, value, origin, commented }: SettingsRender): string {
  const setter = commented ? '#' : '';
  const lines = ['## gitcim configuration', '##', ...intro];

  for (const section of SECTIONS) {
    lines.push('', `## === ${section} ===`);
    for (const spec of OPTION_SPECS.filter((s) => s.section === section)) {
      const from = origin?.(spec);
      lines.push(
        '',
        ...wrap(`${spec.help}.`),
        ...wrap(valueDoc(spec)),
        `## Flag: ${flagSyntax(spec)}`,
        // Unwrapped: a source is one word, and a long path reads worse split.
        ...(from === undefined ? [] : [`## Source: ${from}`]),
        `${setter}${spec.flag} = ${toToml(value(spec))}`,
      );
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Render a config file of defaults.
 *
 * With `commented`, the setting lines are prefixed with a bare `#` while the
 * prose keeps its `##`, so uncommenting a setting means deleting one character
 * and the file still says what everything does.
 */
export function renderConfig({ commented }: { commented: boolean }): string {
  return renderSettings({
    commented,
    value: (spec) => spec.default,
    intro: [
      ...wrap(
        `Every setting below is gitcim's default. Each has a command-line flag of the same name, and the flag wins over this file.`,
      ),
      '##',
      ...wrap(
        `Read from $${CONFIG_ENV} when that is set, otherwise from \${XDG_CONFIG_HOME:-~/.config}/gitcim/config.toml.`,
      ),
    ],
  });
}

/**
 * Render the configuration a run is actually using, noting where each value
 * came from. The result is itself a valid config file, so a run worth keeping
 * can be saved as one.
 */
export function renderEffectiveConfig(values: Options, origins: ConfigOrigins): string {
  return renderSettings({
    commented: false,
    value: (spec) => values[spec.key],
    origin: (spec) => origins.get(spec.flag) ?? 'default',
    intro: [
      ...wrap(
        `The configuration in effect: gitcim's defaults, overlaid with the config file, overlaid with the flags of this run.`,
      ),
      '##',
      ...wrap(`This is a valid config file — save it to keep these settings.`),
    ],
  });
}

/** What a setting accepts, in a sentence, for the generated file's prose. */
function valueDoc(spec: OptionSpec): string {
  switch (spec.kind) {
    case 'string':
      return 'A string.';
    case 'boolean':
      return 'true or false.';
    case 'count':
      return spec.zeroLabel === undefined
        ? 'A non-negative integer.'
        : `A non-negative integer; 0 means ${spec.zeroLabel}.`;
    case 'order':
      return `An array holding any of ${ACTION_SLOTS.map((s) => `"${s}"`).join(', ')}, in the order you want them; names left out keep their default order at the end.`;
  }
}

function toToml(value: string | number | boolean | readonly string[]): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
}

function wrap(text: string, prefix = '## ', width = COMMENT_WIDTH): string[] {
  const lines: string[] = [];
  let line = '';

  for (const word of text.split(' ')) {
    if (line === '') line = word;
    else if (`${prefix}${line} ${word}`.length <= width) line += ` ${word}`;
    else {
      lines.push(prefix + line);
      line = word;
    }
  }
  if (line !== '') lines.push(prefix + line);

  return lines;
}

/**
 * The JSON Schema for the config file, so an editor can complete and check it.
 * Derived from the same specs, so it cannot describe a gitcim that does not exist.
 */
export function configSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  for (const spec of OPTION_SPECS) {
    properties[spec.flag] = {
      description: spec.help,
      ...schemaType(spec),
      default: spec.kind === 'order' ? [...spec.default] : spec.default,
    };
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'gitcim configuration',
    description: 'Settings for gitcim, one for one with its command-line flags.',
    type: 'object',
    additionalProperties: false,
    properties,
  };
}

function schemaType(spec: OptionSpec): Record<string, unknown> {
  switch (spec.kind) {
    case 'string':
      return { type: 'string' };
    case 'boolean':
      return { type: 'boolean' };
    case 'count':
      return { type: 'integer', minimum: 0 };
    case 'order':
      return {
        type: 'array',
        items: { type: 'string', enum: [...ACTION_SLOTS] },
        uniqueItems: true,
      };
  }
}

/**
 * Write generated text to `path`, or hand it to `stdout` when the path is `-`.
 *
 * `overwrite` is off for the config file — replacing one loses whatever the
 * user had set — and on for the schema, which is a derived artifact written to
 * a destination the user just named.
 */
export async function writeOut(
  path: string,
  text: string,
  stdout: (text: string) => void,
  { overwrite }: { overwrite: boolean },
): Promise<string | undefined> {
  if (path === STDIO) {
    stdout(text);
    return undefined;
  }

  try {
    await mkdir(dirname(path), { recursive: true });
  } catch (err) {
    // Includes EEXIST when a parent of the path is a file, which is not the
    // "already configured" case below.
    throw new GitcimError(`cannot write ${path}: ${describe(err)}`, 2);
  }

  try {
    await writeFile(path, text, overwrite ? {} : { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new GitcimError(`refusing to overwrite ${path}`, 2);
    }
    throw new GitcimError(`cannot write ${path}: ${describe(err)}`, 2);
  }

  return path;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
