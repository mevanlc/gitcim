import { readFile } from 'node:fs/promises';
import { buildFormat, HELP, parseCliArgs, type Values } from './args.js';
import { configLocation, configSchema, loadConfig, renderConfig, writeOut } from './config.js';
import { GitcimError } from './errors.js';
import { generate } from './index.js';

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
}

async function readVersion(): Promise<string> {
  try {
    const url = new URL('../package.json', import.meta.url);
    return JSON.parse(await readFile(url, 'utf8')).version ?? DEFAULT_VERSION;
  } catch {
    return DEFAULT_VERSION;
  }
}

/**
 * The `--config-*` commands, which write a file instead of a message.
 * Returns undefined when no command was asked for.
 */
async function runCommand(values: Values, ctx: RunContext): Promise<number | undefined> {
  const init = values['config-init'] === true;
  const initUnset = values['config-init-unset'] === true;

  if (init && initUnset) {
    throw new GitcimError('--config-init and --config-init-unset are mutually exclusive', 2);
  }

  if (init || initUnset) {
    const { path } = configLocation(ctx.env);
    const text = renderConfig({ commented: initUnset });
    // Never over an existing config: those settings are the user's, not ours.
    return report(await writeOut(path, text, ctx.io.stdout, { overwrite: false }), ctx.io);
  }

  const schemaTarget = values['config-write-schema'];
  if (typeof schemaTarget === 'string') {
    if (schemaTarget === '') throw new GitcimError('--config-write-schema needs a path or "-"', 2);
    const text = JSON.stringify(configSchema(), null, 2) + '\n';
    return report(await writeOut(schemaTarget, text, ctx.io.stdout, { overwrite: true }), ctx.io);
  }

  return undefined;
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
