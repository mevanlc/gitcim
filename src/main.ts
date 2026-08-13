import { readFile } from 'node:fs/promises';
import { buildFormat, HELP, parseCliArgs } from './args.js';
import { GitcimError } from './errors.js';
import { generate } from './index.js';

const DEFAULT_VERSION = '0.0.0';

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

async function readVersion(): Promise<string> {
  try {
    const url = new URL('../package.json', import.meta.url);
    return JSON.parse(await readFile(url, 'utf8')).version ?? DEFAULT_VERSION;
  } catch {
    return DEFAULT_VERSION;
  }
}

async function dispatch(argv: string[], io: Io, cwd?: string): Promise<number> {
  const { include, exclude, values } = parseCliArgs(argv);

  if (values.help) {
    io.stdout(HELP);
    return 0;
  }
  if (values.version) {
    io.stdout((await readVersion()) + '\n');
    return 0;
  }

  const message = await generate({
    format: buildFormat(values),
    ...(cwd ? { cwd } : {}),
    ...(include ? { include } : {}),
    ...(exclude ? { exclude } : {}),
  });
  io.stdout(message + '\n');
  return 0;
}

/** Run the CLI over `argv` and return the process exit code. */
export async function run(argv: string[], io: Io, cwd?: string): Promise<number> {
  try {
    return await dispatch(argv, io, cwd);
  } catch (err) {
    io.stderr(`gitcim: ${err instanceof Error ? err.message : String(err)}\n`);
    return err instanceof GitcimError ? err.code : 1;
  }
}
