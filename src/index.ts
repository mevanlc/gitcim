import { getStagedEntries, hasUnstagedMatch, runGit, toPathspecs, type GitRunner } from './git.js';
import { toItems } from './actions.js';
import { render } from './render.js';
import { resolveOptions } from './options.js';
import { GitcimError } from './errors.js';
import type { Options } from './types.js';

export type { ActionKind, ActionSlot, Item, Options, RawEntry } from './types.js';
export { DEFAULT_OPTIONS, resolveOptions, parseActionOrder, ACTION_SLOTS } from './options.js';
export { render, renderLine, quotePath } from './render.js';
export { toItems, sortItems, slotOf } from './actions.js';
export { runGit, parseRaw, getStagedEntries, toPathspecs, type GitRunner } from './git.js';
export { GitcimError } from './errors.js';

export interface GenerateOptions {
  /** Working directory. Defaults to the current one. */
  cwd?: string;
  /** Pathspecs to restrict the message to. */
  include?: string[];
  /** Pathspecs to leave out. */
  exclude?: string[];
  /** Formatting overrides on top of the defaults. */
  format?: Partial<Options>;
  /** Injectable git runner, for tests. */
  run?: GitRunner;
}

/**
 * Every `--include` argument has to name something staged. A file that was
 * changed but not staged is the mistake worth reporting loudly — the message
 * would otherwise silently describe less than the user asked for.
 */
async function validateIncludes(include: string[], cwd: string | undefined, run: GitRunner) {
  for (const spec of include) {
    const staged = await getStagedEntries([spec], cwd, run);
    if (staged.length > 0) continue;
    if (await hasUnstagedMatch(spec, cwd, run)) {
      throw new GitcimError(`${spec} is not staged`, 2);
    }
    throw new GitcimError(`${spec} matches no staged changes`, 2);
  }
}

/**
 * Outside a work tree git falls back to `--no-index` and complains about
 * `--cached`, which explains nothing. Say what actually went wrong instead.
 */
async function describeGitFailure(
  err: unknown,
  cwd: string | undefined,
  run: GitRunner,
): Promise<never> {
  try {
    await run(['rev-parse', '--is-inside-work-tree'], cwd);
  } catch {
    throw new GitcimError('not a git repository', 1);
  }
  throw err;
}

/** Build the commit message describing the staged changes. */
export async function generate(options: GenerateOptions = {}): Promise<string> {
  const run = options.run ?? runGit;
  const include = options.include ?? [];
  const exclude = options.exclude ?? [];

  const entries = await getStagedEntries(toPathspecs(include, exclude), options.cwd, run).catch(
    (err: unknown) => describeGitFailure(err, options.cwd, run),
  );

  if (include.length > 0) await validateIncludes(include, options.cwd, run);

  if (entries.length === 0) throw new GitcimError('no staged changes', 1);

  const opts = resolveOptions(options.format);
  return render(toItems(entries, opts.actionOrder), opts);
}
