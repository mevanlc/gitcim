import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { buildFormat, HELP, parseCliArgs, type Values } from './args.js';
import {
  CONFIG_ENV,
  configLocation,
  configSchema,
  loadConfig,
  renderConfig,
  renderEffectiveConfig,
  resolveEditor,
  spawnEditor,
  STDIO,
  writeOut,
  type EditorLauncher,
} from './config.js';
import { GitcimError } from './errors.js';
import { generate } from './index.js';
import { OPTION_SPECS, resolveOptions } from './options.js';
import type { Options } from './types.js';

const DEFAULT_VERSION = '0.0.0';

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface RunContext {
  io: Io;
  /** Repository to describe. Defaults to the process's own directory. */
  cwd?: string;
  /** Consulted for `GITCIM_CONFIG_FILE` and `XDG_CONFIG_HOME`; required so a test cannot pick up a real config. */
  env: NodeJS.ProcessEnv;
  /** Reads a config piped in under `GITCIM_CONFIG_FILE=-`. */
  readStdin?: () => Promise<string>;
  /** Runs the editor for `--config-edit`. Defaults to spawning it on this terminal. */
  launchEditor?: EditorLauncher;
}

async function readVersion(): Promise<string> {
  try {
    const url = new URL('../package.json', import.meta.url);
    return JSON.parse(await readFile(url, 'utf8')).version ?? DEFAULT_VERSION;
  } catch {
    return DEFAULT_VERSION;
  }
}

/** The switch-style `--config-*` commands, in the order `--help` lists them. */
const CONFIG_COMMANDS = [
  'config-init',
  'config-init-unset',
  'config-reset',
  'config-edit',
  'config-print',
] as const;

/**
 * The `--config-*` commands, which act on the config file instead of the index.
 * Returns undefined when no command was asked for.
 */
async function runCommand(values: Values, ctx: RunContext): Promise<number | undefined> {
  const asked: string[] = CONFIG_COMMANDS.filter((flag) => values[flag] === true);
  const schemaTarget = values['config-write-schema'];
  if (typeof schemaTarget === 'string') asked.push('config-write-schema');

  // Each of these ends the run, so two of them cannot both be what was meant.
  if (asked.length > 1) {
    throw new GitcimError(`--${asked[0]} and --${asked[1]} are mutually exclusive`, 2);
  }

  if (typeof schemaTarget === 'string') {
    if (schemaTarget === '') throw new GitcimError('--config-write-schema needs a path or "-"', 2);
    const text = JSON.stringify(configSchema(), null, 2) + '\n';
    return report(await writeOut(schemaTarget, text, ctx.io.stdout, { overwrite: true }), ctx.io);
  }

  const write = (text: string, overwrite: boolean) =>
    writeOut(configLocation(ctx.env).path, text, ctx.io.stdout, { overwrite });

  switch (asked[0]) {
    case 'config-init':
    case 'config-init-unset':
      // Never over an existing config: those settings are the user's, not ours.
      return report(
        await write(renderConfig({ commented: asked[0] === 'config-init-unset' }), false),
        ctx.io,
      );

    case 'config-reset':
      // The one command whose whole job is to replace what is there.
      return report(await write(renderConfig({ commented: false }), true), ctx.io);

    case 'config-edit':
      return editConfig(ctx);

    case 'config-print':
      return printConfig(values, ctx);

    default:
      return undefined;
  }
}

/**
 * Open the config file in the user's editor, then check what came back.
 *
 * A file that does not exist yet is created commented out rather than set, so
 * opening the editor and quitting leaves gitcim on its defaults — including
 * defaults that change in a later version.
 */
async function editConfig(ctx: RunContext): Promise<number> {
  const { path } = configLocation(ctx.env);
  if (path === STDIO) throw new GitcimError(`${CONFIG_ENV}=- names no file to edit`, 2);

  // Before writing anything, so a missing $EDITOR leaves no file behind.
  const { command, args } = resolveEditor(ctx.env);

  if (!existsSync(path)) {
    report(
      await writeOut(path, renderConfig({ commented: true }), ctx.io.stdout, { overwrite: false }),
      ctx.io,
    );
  }

  const status = await (ctx.launchEditor ?? spawnEditor)(command, [...args, path]);
  if (status !== 0) throw new GitcimError(`${command} exited with status ${status}`, 1);

  // Report a typo now, while the editor is still in reach, rather than at the
  // next commit.
  await loadConfig(ctx.env);
  return 0;
}

/** Print the configuration this run would use, and where each value came from. */
async function printConfig(values: Values, ctx: RunContext): Promise<number> {
  const { path } = configLocation(ctx.env);
  const config = await loadConfig(ctx.env, ctx.readStdin ? { readStdin: ctx.readStdin } : {});
  const flags = buildFormat(values);
  const source = path === STDIO ? '<stdin>' : path;

  ctx.io.stdout(
    renderEffectiveConfig(resolveOptions({ ...config, ...flags }), origins(values, config, source)),
  );
  return 0;
}

/** Attribute each setting to a flag, the config file, or the default. */
function origins(values: Values, config: Partial<Options>, source: string): Map<string, string> {
  const found = new Map<string, string>();

  for (const spec of OPTION_SPECS) {
    // Negation first, matching buildFormat: `--group=2 --no-group` is off.
    if ('negatable' in spec && spec.negatable && values[spec.negatable] === true) {
      found.set(spec.flag, `--${spec.negatable}`);
    } else if (values[spec.flag] !== undefined && values[spec.flag] !== false) {
      found.set(spec.flag, `--${spec.flag}`);
    } else if (spec.key in config) {
      found.set(spec.flag, source);
    }
  }

  return found;
}

/** Confirm a write on stderr, leaving stdout for the generated text alone. */
function report(path: string | undefined, io: Io): number {
  if (path !== undefined) io.stderr(`gitcim: wrote ${path}\n`);
  return 0;
}

async function dispatch(argv: string[], ctx: RunContext): Promise<number> {
  const { include, exclude, values } = parseCliArgs(argv);

  if (values.help) {
    ctx.io.stdout(HELP);
    return 0;
  }
  if (values.version) {
    ctx.io.stdout((await readVersion()) + '\n');
    return 0;
  }

  const command = await runCommand(values, ctx);
  if (command !== undefined) return command;

  // Defaults < config file < flags.
  const config = await loadConfig(ctx.env, ctx.readStdin ? { readStdin: ctx.readStdin } : {});
  const message = await generate({
    format: { ...config, ...buildFormat(values) },
    ...(ctx.cwd ? { cwd: ctx.cwd } : {}),
    ...(include ? { include } : {}),
    ...(exclude ? { exclude } : {}),
  });
  ctx.io.stdout(message + '\n');
  return 0;
}

/** Run the CLI over `argv` and return the process exit code. */
export async function run(argv: string[], ctx: RunContext): Promise<number> {
  try {
    return await dispatch(argv, ctx);
  } catch (err) {
    ctx.io.stderr(`gitcim: ${err instanceof Error ? err.message : String(err)}\n`);
    return err instanceof GitcimError ? err.code : 1;
  }
}
