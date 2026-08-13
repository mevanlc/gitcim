import { spawn } from 'node:child_process';
import type { RawEntry } from './types.js';

export type GitRunner = (args: string[], cwd?: string) => Promise<string>;

/** Run a git command and return stdout. Rejects on non-zero exit. */
export async function runGit(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (c) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c) => (stderr += c.toString('utf8')));

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`git ${args.join(' ')} failed (${code}): ${stderr.trim()}`));
    });
  });
}

/** Split NUL-delimited git output, dropping the empty tail record. */
export function splitZ(text: string): string[] {
  return text.split('\0').filter((s) => s.length > 0);
}

/** Append `-- <pathspec>...` when there is anything to scope the command to. */
function withPathspecs(args: string[], pathspecs: string[]): string[] {
  return pathspecs.length > 0 ? [...args, '--', ...pathspecs] : args;
}

/** Turn `--include`/`--exclude` arguments into git pathspecs. */
export function toPathspecs(include: string[] = [], exclude: string[] = []): string[] {
  return [...include, ...exclude.map((p) => `:(exclude)${p}`)];
}

/** Read the staged changes as raw entries. */
export async function getStagedEntries(
  pathspecs: string[] = [],
  cwd?: string,
  run: GitRunner = runGit,
): Promise<RawEntry[]> {
  const out = await run(
    withPathspecs(['diff', '--cached', '--raw', '-z', '--find-renames'], pathspecs),
    cwd,
  );
  return parseRaw(out);
}

/** True if the pathspec matches a worktree modification or an untracked file. */
export async function hasUnstagedMatch(
  pathspec: string,
  cwd?: string,
  run: GitRunner = runGit,
): Promise<boolean> {
  const modified = await run(['diff', '--name-only', '-z', '--', pathspec], cwd);
  if (splitZ(modified).length > 0) return true;
  const untracked = await run(
    ['ls-files', '--others', '--exclude-standard', '-z', '--', pathspec],
    cwd,
  );
  return splitZ(untracked).length > 0;
}

/**
 * Parse `git diff --raw -z` output.
 *
 * Records look like `:<oldmode> <newmode> <oldsha> <newsha> <status>\0<path>\0`,
 * with a second path following for renames and copies. `-z` is what keeps paths
 * intact — without it git quotes and escapes anything unusual.
 */
export function parseRaw(text: string): RawEntry[] {
  const tokens = splitZ(text);
  const entries: RawEntry[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const meta = tokens[i];
    if (meta === undefined || !meta.startsWith(':')) continue;

    const fields = meta.slice(1).split(' ');
    if (fields.length < 5) continue;
    const [oldMode, newMode, oldSha, newSha, rawStatus] = fields as [
      string,
      string,
      string,
      string,
      string,
    ];

    // Rename and copy statuses carry a similarity score: `R100`, `C75`.
    const status = rawStatus.charAt(0).toUpperCase();
    const pathCount = status === 'R' || status === 'C' ? 2 : 1;
    const paths = tokens.slice(i + 1, i + 1 + pathCount);
    if (paths.length < pathCount) break;
    i += pathCount;

    const entry: RawEntry = {
      oldMode,
      newMode,
      oldSha,
      newSha,
      status,
      path: (pathCount === 2 ? paths[1] : paths[0]) as string,
    };
    if (pathCount === 2) entry.oldPath = paths[0] as string;
    entries.push(entry);
  }

  return entries;
}
