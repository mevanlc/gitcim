import { describe, expect, it } from 'vitest';
import { generate, GitcimError } from '../src/index.js';
import type { GitRunner } from '../src/git.js';

/** Build a `git diff --raw -z` record. */
function raw(meta: string, ...paths: string[]): string {
  return `${meta}\0${paths.map((p) => `${p}\0`).join('')}`;
}

const STAGED =
  raw(':100644 100644 aaaaaaa bbbbbbb M', 'src/main.py') +
  raw(':000000 100644 0000000 ccccccc A', 'src/new.py') +
  raw(':100644 000000 ddddddd 0000000 D', 'src/old.py');

/** A runner that replies per git subcommand, recording what it was asked. */
function fakeGit(replies: {
  staged?: string | ((args: string[]) => string);
  worktree?: string;
  untracked?: string;
}): GitRunner & { calls: string[][] } {
  const calls: string[][] = [];
  const run = (async (args: string[]) => {
    calls.push(args);
    if (args[0] === 'ls-files') return replies.untracked ?? '';
    if (args.includes('--cached')) {
      const staged = replies.staged ?? '';
      return typeof staged === 'function' ? staged(args) : staged;
    }
    return replies.worktree ?? '';
  }) as GitRunner & { calls: string[][] };
  run.calls = calls;
  return run;
}

describe('generate', () => {
  it('describes the staged changes', async () => {
    const message = await generate({ run: fakeGit({ staged: STAGED }) });
    expect(message).toBe('add src/new.py, update src/main.py, remove src/old.py');
  });

  it('passes formatting options through', async () => {
    const message = await generate({
      run: fakeGit({ staged: STAGED }),
      format: { and: true, itemSeparator: '; ' },
    });
    expect(message).toBe('add src/new.py; update src/main.py; and remove src/old.py');
  });

  it('fails with exit code 1 when nothing is staged', async () => {
    await expect(generate({ run: fakeGit({}) })).rejects.toThrow(/no staged changes/);
    await expect(generate({ run: fakeGit({}) })).rejects.toMatchObject({ code: 1 });
  });

  it('scopes the diff with include and exclude pathspecs', async () => {
    const run = fakeGit({ staged: STAGED });
    await generate({ run, include: ['src'], exclude: ['src/vendor'] });
    const scoped = run.calls.find((args) => args.includes(':(exclude)src/vendor'));
    expect(scoped?.slice(-3)).toEqual(['--', 'src', ':(exclude)src/vendor']);
  });

  it('rejects an --include path that is changed but not staged', async () => {
    const run = fakeGit({ staged: '', worktree: 'src/dirty.py\0' });
    const error = await generate({ run, include: ['src/dirty.py'] }).catch((e) => e);
    expect(error).toBeInstanceOf(GitcimError);
    expect(error.message).toBe('src/dirty.py is not staged');
    expect(error.code).toBe(2);
  });

  it('rejects an --include path that is untracked', async () => {
    const run = fakeGit({ staged: '', untracked: 'src/brand-new.py\0' });
    await expect(generate({ run, include: ['src/brand-new.py'] })).rejects.toThrow(/is not staged/);
  });

  it('rejects an --include path that matches nothing at all', async () => {
    const run = fakeGit({ staged: '' });
    await expect(generate({ run, include: ['nope.py'] })).rejects.toThrow(
      /matches no staged changes/,
    );
  });

  it('checks each --include argument separately', async () => {
    // The first path is staged, the second is only modified in the worktree.
    const run = fakeGit({
      staged: (args) => (args.includes('src/main.py') ? STAGED : ''),
      worktree: 'src/dirty.py\0',
    });
    await expect(generate({ run, include: ['src/main.py', 'src/dirty.py'] })).rejects.toThrow(
      /src\/dirty\.py is not staged/,
    );
  });

  it('does not object to an excluded path being unstaged', async () => {
    const run = fakeGit({ staged: STAGED, worktree: 'src/dirty.py\0' });
    await expect(generate({ run, exclude: ['src/dirty.py'] })).resolves.toContain('update');
  });
});
