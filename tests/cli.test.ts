import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, type Io } from '../src/main.js';
import { runGit } from '../src/git.js';

/** Collects what the CLI wrote, so assertions can look at both streams. */
function capture(): Io & { out: string; err: string } {
  const io = {
    out: '',
    err: '',
    stdout: (text: string) => (io.out += text),
    stderr: (text: string) => (io.err += text),
  };
  return io;
}

let repo: string;

async function git(...args: string[]): Promise<string> {
  return runGit(args, repo);
}

/**
 * One repository with a staged change of every kind, exercised through the real
 * git binary — the parsing code only pays off if it matches what git emits.
 */
beforeAll(async () => {
  repo = mkdtempSync(join(tmpdir(), 'gitcim-cli-'));
  await git('init', '-q');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test');
  await git('config', 'commit.gpgsign', 'false');

  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src/main.py'), 'a\n');
  writeFileSync(join(repo, 'src/old.py'), 'b\n');
  writeFileSync(join(repo, 'README.md'), 'c\n');
  writeFileSync(join(repo, 'run.sh'), 'd\n');
  writeFileSync(join(repo, 'a file.md'), 'e\n');
  await git('add', '-A');
  await git('commit', '-qm', 'base');

  writeFileSync(join(repo, 'src/main.py'), 'a2\n');
  writeFileSync(join(repo, 'src/new.py'), 'new\n');
  unlinkSync(join(repo, 'src/old.py'));
  await git('mv', 'README.md', 'READYOU.md');
  chmodSync(join(repo, 'run.sh'), 0o755);
  writeFileSync(join(repo, 'a file.md'), 'e2\n');
  await git('add', '-A');

  // Left dirty on purpose: --include has to reject it.
  writeFileSync(join(repo, 'untracked.txt'), 'x\n');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('run', () => {
  it('describes every kind of staged change', async () => {
    const io = capture();
    expect(await run([], io, repo)).toBe(0);
    expect(io.out).toBe(
      'add src/new.py, update "a file.md", update src/main.py, ' +
        'rename README.md to READYOU.md, remove src/old.py, chmod +x run.sh\n',
    );
  });

  it('reports a mode-only change as chmod alone, with no update', async () => {
    const io = capture();
    await run(['--include', 'run.sh'], io, repo);
    expect(io.out).toBe('chmod +x run.sh\n');
  });

  it('applies formatting flags', async () => {
    const io = capture();
    await run(['--group=1', '--group-separator= - ', '--include', 'src'], io, repo);
    expect(io.out).toBe('add: src/new.py - update: src/main.py - remove: src/old.py\n');
  });

  it('scopes with --include and --exclude', async () => {
    const io = capture();
    await run(['--include', 'src', '--exclude', 'src/new.py'], io, repo);
    expect(io.out).toBe('update src/main.py, remove src/old.py\n');
  });

  it('spills past --overflow into a list', async () => {
    const io = capture();
    await run(['--overflow=30', '--include', 'src'], io, repo);
    expect(io.out).toBe('add src/new.py\n\n    - update src/main.py, remove src/old.py\n');
  });

  it('refuses an --include path that is not staged', async () => {
    const io = capture();
    expect(await run(['--include', 'untracked.txt'], io, repo)).toBe(2);
    expect(io.err).toBe('gitcim: untracked.txt is not staged\n');
    expect(io.out).toBe('');
  });

  it('refuses an --include path that matches nothing', async () => {
    const io = capture();
    expect(await run(['--include', 'nope.txt'], io, repo)).toBe(2);
    expect(io.err).toMatch(/matches no staged changes/);
  });

  it('rejects an unknown flag with exit code 2', async () => {
    const io = capture();
    expect(await run(['--nope'], io, repo)).toBe(2);
    expect(io.err).toMatch(/Unknown option/);
  });

  it('rejects a non-numeric count with exit code 2', async () => {
    const io = capture();
    expect(await run(['--overflow=abc'], io, repo)).toBe(2);
    expect(io.err).toMatch(/--overflow must be a non-negative integer/);
  });

  it('prints help', async () => {
    const io = capture();
    expect(await run(['--help'], io, repo)).toBe(0);
    expect(io.out).toMatch(/Usage:\n {4}gitcim \[OPTIONS\]/);
  });

  it('prints a version', async () => {
    const io = capture();
    expect(await run(['-v'], io, repo)).toBe(0);
    expect(io.out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exits 1 with a message when nothing is staged', async () => {
    const clean = mkdtempSync(join(tmpdir(), 'gitcim-clean-'));
    await runGit(['init', '-q'], clean);
    const io = capture();
    expect(await run([], io, clean)).toBe(1);
    expect(io.err).toBe('gitcim: no staged changes\n');
    rmSync(clean, { recursive: true, force: true });
  });

  it('exits 1 with a clear message outside a repository', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'gitcim-norepo-'));
    const io = capture();
    expect(await run([], io, bare)).toBe(1);
    expect(io.err).toBe('gitcim: not a git repository\n');
    rmSync(bare, { recursive: true, force: true });
  });
});
