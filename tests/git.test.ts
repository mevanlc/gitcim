import { describe, expect, it } from 'vitest';
import { getStagedEntries, hasUnstagedMatch, parseRaw, splitZ, toPathspecs } from '../src/git.js';

/** Build a `git diff --raw -z` record. */
function raw(meta: string, ...paths: string[]): string {
  return `${meta}\0${paths.map((p) => `${p}\0`).join('')}`;
}

describe('splitZ', () => {
  it('drops the trailing empty record', () => {
    expect(splitZ('a\0b\0')).toEqual(['a', 'b']);
  });

  it('returns nothing for empty output', () => {
    expect(splitZ('')).toEqual([]);
  });
});

describe('parseRaw', () => {
  it('parses an added file', () => {
    expect(parseRaw(raw(':000000 100644 0000000 e69de29 A', 'src/new.ts'))).toEqual([
      {
        oldMode: '000000',
        newMode: '100644',
        oldSha: '0000000',
        newSha: 'e69de29',
        status: 'A',
        path: 'src/new.ts',
      },
    ]);
  });

  it('parses a deletion', () => {
    const [entry] = parseRaw(raw(':100644 000000 e69de29 0000000 D', 'gone.ts'));
    expect(entry).toMatchObject({ status: 'D', path: 'gone.ts' });
  });

  it('parses a rename and keeps both paths', () => {
    const [entry] = parseRaw(raw(':100644 100644 aaaaaaa aaaaaaa R100', 'old.md', 'new.md'));
    expect(entry).toMatchObject({ status: 'R', oldPath: 'old.md', path: 'new.md' });
  });

  it('parses a copy as two paths', () => {
    const [entry] = parseRaw(raw(':100644 100644 aaaaaaa aaaaaaa C75', 'from.md', 'to.md'));
    expect(entry).toMatchObject({ status: 'C', oldPath: 'from.md', path: 'to.md' });
  });

  it('keeps modes for a mode-only change', () => {
    const [entry] = parseRaw(raw(':100644 100755 aaaaaaa aaaaaaa M', 'run.sh'));
    expect(entry).toMatchObject({ oldMode: '100644', newMode: '100755', oldSha: 'aaaaaaa' });
    expect(entry?.oldSha).toBe(entry?.newSha);
  });

  it('parses several records in one stream', () => {
    const text =
      raw(':100644 100644 aaaaaaa bbbbbbb M', 'a.ts') +
      raw(':100644 100644 ccccccc ddddddd R090', 'b.ts', 'c.ts') +
      raw(':000000 100644 0000000 eeeeeee A', 'd.ts');
    expect(parseRaw(text).map((e) => e.path)).toEqual(['a.ts', 'c.ts', 'd.ts']);
  });

  it('keeps paths containing spaces intact', () => {
    const [entry] = parseRaw(raw(':100644 100644 aaaaaaa bbbbbbb M', 'docs/WEBSITE DESIGN.md'));
    expect(entry?.path).toBe('docs/WEBSITE DESIGN.md');
  });

  it('returns nothing for empty output', () => {
    expect(parseRaw('')).toEqual([]);
  });

  it('ignores a truncated record', () => {
    expect(parseRaw(':100644 100644 aaaaaaa bbbbbbb R100\0only-one-path\0')).toEqual([]);
  });

  it('ignores a malformed metadata line', () => {
    expect(parseRaw(':100644 100644 M\0a.ts\0')).toEqual([]);
  });
});

describe('toPathspecs', () => {
  it('marks excludes with pathspec magic', () => {
    expect(toPathspecs(['src'], ['src/vendor'])).toEqual(['src', ':(exclude)src/vendor']);
  });

  it('is empty when nothing is scoped', () => {
    expect(toPathspecs()).toEqual([]);
  });
});

describe('getStagedEntries', () => {
  it('asks git for a copy-aware raw diff and omits `--` when unscoped', async () => {
    const calls: string[][] = [];
    await getStagedEntries([], undefined, async (args) => {
      calls.push(args);
      return '';
    });
    // Harder detection, not --find-copies: plain -C only considers files the
    // same diff modified, so `cp a b && git add b` comes back as a plain add.
    expect(calls[0]).toEqual(['diff', '--cached', '--raw', '-z', '--find-copies-harder']);
  });

  it('passes pathspecs after `--`', async () => {
    const calls: string[][] = [];
    await getStagedEntries(['src', ':(exclude)dist'], '/repo', async (args) => {
      calls.push(args);
      return '';
    });
    expect(calls[0]?.slice(-3)).toEqual(['--', 'src', ':(exclude)dist']);
  });
});

describe('hasUnstagedMatch', () => {
  it('is true for a worktree modification', async () => {
    const run = async (args: string[]) => (args[0] === 'diff' ? 'a.ts\0' : '');
    expect(await hasUnstagedMatch('a.ts', undefined, run)).toBe(true);
  });

  it('is true for an untracked file', async () => {
    const run = async (args: string[]) => (args[0] === 'ls-files' ? 'new.ts\0' : '');
    expect(await hasUnstagedMatch('new.ts', undefined, run)).toBe(true);
  });

  it('is false when neither matches', async () => {
    expect(await hasUnstagedMatch('a.ts', undefined, async () => '')).toBe(false);
  });
});
