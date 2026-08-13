import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, type Io } from '../src/main.js';
import { parseConfig } from '../src/config.js';
import { runGit } from '../src/git.js';
import { resolveOptions } from '../src/options.js';

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
let configHome: string;
/** An empty XDG home, so a real ~/.config/gitcim/config.toml cannot reach these tests. */
let env: NodeJS.ProcessEnv;

async function git(...args: string[]): Promise<string> {
  return runGit(args, repo);
}

/**
 * One repository with a staged change of every kind, exercised through the real
 * git binary — the parsing code only pays off if it matches what git emits.
 */
beforeAll(async () => {
  repo = mkdtempSync(join(tmpdir(), 'gitcim-cli-'));
  configHome = mkdtempSync(join(tmpdir(), 'gitcim-xdg-'));
  env = { XDG_CONFIG_HOME: configHome };
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

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(configHome, { recursive: true, force: true });
});

describe('run', () => {
  it('describes every kind of staged change', async () => {
    const io = capture();
    expect(await run([], { io, cwd: repo, env })).toBe(0);
    expect(io.out).toBe(
      'add src/new.py, update "a file.md", update src/main.py, ' +
        'rename README.md to READYOU.md, remove src/old.py, chmod +x run.sh\n',
    );
  });

  it('reports a mode-only change as chmod alone, with no update', async () => {
    const io = capture();
    await run(['--include', 'run.sh'], { io, cwd: repo, env });
    expect(io.out).toBe('chmod +x run.sh\n');
  });

  it('applies formatting flags', async () => {
    const io = capture();
    await run(['--group=1', '--group-separator= - ', '--include', 'src'], { io, cwd: repo, env });
    expect(io.out).toBe('add: src/new.py - update: src/main.py - remove: src/old.py\n');
  });

  it('scopes with --include and --exclude', async () => {
    const io = capture();
    await run(['--include', 'src', '--exclude', 'src/new.py'], { io, cwd: repo, env });
    expect(io.out).toBe('update src/main.py, remove src/old.py\n');
  });

  it('spills past --overflow into a list', async () => {
    const io = capture();
    await run(['--overflow=30', '--include', 'src'], { io, cwd: repo, env });
    expect(io.out).toBe('add src/new.py\n\n    - update src/main.py, remove src/old.py\n');
  });

  it('refuses an --include path that is not staged', async () => {
    const io = capture();
    expect(await run(['--include', 'untracked.txt'], { io, cwd: repo, env })).toBe(2);
    expect(io.err).toBe('gitcim: untracked.txt is not staged\n');
    expect(io.out).toBe('');
  });

  it('refuses an --include path that matches nothing', async () => {
    const io = capture();
    expect(await run(['--include', 'nope.txt'], { io, cwd: repo, env })).toBe(2);
    expect(io.err).toMatch(/matches no staged changes/);
  });

  it('rejects an unknown flag with exit code 2', async () => {
    const io = capture();
    expect(await run(['--nope'], { io, cwd: repo, env })).toBe(2);
    expect(io.err).toMatch(/Unknown option/);
  });

  it('rejects a non-numeric count with exit code 2', async () => {
    const io = capture();
    expect(await run(['--overflow=abc'], { io, cwd: repo, env })).toBe(2);
    expect(io.err).toMatch(/--overflow must be a non-negative integer/);
  });

  it('prints help', async () => {
    const io = capture();
    expect(await run(['--help'], { io, cwd: repo, env })).toBe(0);
    expect(io.out).toMatch(/Usage:\n {4}gitcim \[OPTIONS\]/);
  });

  it('prints a version', async () => {
    const io = capture();
    expect(await run(['-v'], { io, cwd: repo, env })).toBe(0);
    expect(io.out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exits 1 with a message when nothing is staged', async () => {
    const clean = mkdtempSync(join(tmpdir(), 'gitcim-clean-'));
    await runGit(['init', '-q'], clean);
    const io = capture();
    expect(await run([], { io, cwd: clean, env })).toBe(1);
    expect(io.err).toBe('gitcim: no staged changes\n');
    rmSync(clean, { recursive: true, force: true });
  });

  it('exits 1 with a clear message outside a repository', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'gitcim-norepo-'));
    const io = capture();
    expect(await run([], { io, cwd: bare, env })).toBe(1);
    expect(io.err).toBe('gitcim: not a git repository\n');
    rmSync(bare, { recursive: true, force: true });
  });
});

describe('config file', () => {
  /** A fresh GITCIM_CONFIG_FILE path in its own directory, never created. */
  function target(): { env: NodeJS.ProcessEnv; path: string } {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-conf-'));
    const path = join(dir, 'config.toml');
    return { env: { GITCIM_CONFIG_FILE: path }, path };
  }

  it('formats the message from the file it is pointed at', async () => {
    const { env: at, path } = target();
    writeFileSync(path, '## mine\ngroup = 1\ngroup-separator = " - "\n');

    const io = capture();
    expect(await run(['--include', 'src'], { io, cwd: repo, env: at })).toBe(0);
    expect(io.out).toBe('add: src/new.py - update: src/main.py - remove: src/old.py\n');
  });

  it('lets a flag override the file', async () => {
    const { env: at, path } = target();
    writeFileSync(path, 'group = 1\n');

    const io = capture();
    await run(['--no-group', '--include', 'src'], { io, cwd: repo, env: at });
    expect(io.out).toBe('add src/new.py, update src/main.py, remove src/old.py\n');
  });

  it('reads a config piped in under GITCIM_CONFIG_FILE=-', async () => {
    const io = capture();
    const code = await run(['--include', 'src'], {
      io,
      cwd: repo,
      env: { GITCIM_CONFIG_FILE: '-' },
      readStdin: () => Promise.resolve('item-separator = " | "\n'),
    });
    expect(code).toBe(0);
    expect(io.out).toBe('add src/new.py | update src/main.py | remove src/old.py\n');
  });

  it('refuses a config file that was named but is not there', async () => {
    const { env: at, path } = target();
    const io = capture();
    expect(await run([], { io, cwd: repo, env: at })).toBe(2);
    expect(io.err).toBe(`gitcim: config file not found: ${path}\n`);
  });

  it('reports the line a syntax error is on', async () => {
    const { env: at, path } = target();
    writeFileSync(path, 'group = 1\nand = yes\n');

    const io = capture();
    expect(await run([], { io, cwd: repo, env: at })).toBe(2);
    expect(io.err).toBe(`gitcim: ${path}:2: unsupported value: yes\n`);
  });

  it('names a setting it does not know', async () => {
    const { env: at, path } = target();
    writeFileSync(path, 'grope = 1\n');

    const io = capture();
    expect(await run([], { io, cwd: repo, env: at })).toBe(2);
    expect(io.err).toMatch(/unknown setting "grope"/);
  });

  it('ignores a missing file at the default location', async () => {
    const io = capture();
    expect(await run(['--include', 'run.sh'], { io, cwd: repo, env })).toBe(0);
    expect(io.out).toBe('chmod +x run.sh\n');
  });
});

describe('--config-init', () => {
  it('writes a file that gitcim reads back as the defaults', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-init-'));
    const path = join(dir, 'nested', 'config.toml');
    const at = { GITCIM_CONFIG_FILE: path };

    const write = capture();
    expect(await run(['--config-init'], { io: write, cwd: repo, env: at })).toBe(0);
    expect(write.out).toBe('');
    expect(write.err).toBe(`gitcim: wrote ${path}\n`);

    // The generated file is the defaults, so the message must not change.
    const bare = capture();
    await run([], { io: bare, cwd: repo, env });
    const configured = capture();
    await run([], { io: configured, cwd: repo, env: at });
    expect(configured.out).toBe(bare.out);

    rmSync(dir, { recursive: true, force: true });
  });

  it('will not overwrite an existing config', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-init-'));
    const path = join(dir, 'config.toml');
    writeFileSync(path, 'group = 4\n');

    const io = capture();
    expect(await run(['--config-init'], { io, cwd: repo, env: { GITCIM_CONFIG_FILE: path } })).toBe(
      2,
    );
    expect(io.err).toBe(`gitcim: refusing to overwrite ${path}\n`);
    expect(readFileSync(path, 'utf8')).toBe('group = 4\n');

    rmSync(dir, { recursive: true, force: true });
  });

  it('writes to stdout when the path is "-"', async () => {
    const io = capture();
    expect(await run(['--config-init'], { io, cwd: repo, env: { GITCIM_CONFIG_FILE: '-' } })).toBe(
      0,
    );
    expect(io.out).toMatch(/^## gitcim configuration\n/);
    expect(io.out).toMatch(/\ngroup = 0\n/);
    expect(io.err).toBe('');
  });

  it('comments out every setting with --config-init-unset', async () => {
    const io = capture();
    await run(['--config-init-unset'], { io, cwd: repo, env: { GITCIM_CONFIG_FILE: '-' } });
    expect(io.out).toMatch(/\n#group = 0\n/);
    expect(io.out).not.toMatch(/\n[a-z-]+ = /);
  });

  it('rejects both init flags at once', async () => {
    const io = capture();
    expect(
      await run(['--config-init', '--config-init-unset'], {
        io,
        cwd: repo,
        env: { GITCIM_CONFIG_FILE: '-' },
      }),
    ).toBe(2);
    expect(io.err).toMatch(/mutually exclusive/);
  });
});

describe('--config-write-schema', () => {
  it('writes the schema to a file, overwriting a stale one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-schema-'));
    const path = join(dir, 'schema.json');
    writeFileSync(path, 'stale\n');

    const io = capture();
    expect(await run(['--config-write-schema', path], { io, cwd: repo, env })).toBe(0);
    expect(io.err).toBe(`gitcim: wrote ${path}\n`);
    expect(JSON.parse(readFileSync(path, 'utf8')).properties['item-separator'].type).toBe('string');

    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the schema to stdout for "-"', async () => {
    const io = capture();
    expect(await run(['--config-write-schema=-'], { io, cwd: repo, env })).toBe(0);
    expect(JSON.parse(io.out).title).toBe('gitcim configuration');
  });

  it('needs a path', async () => {
    const io = capture();
    expect(await run(['--config-write-schema='], { io, cwd: repo, env })).toBe(2);
    expect(io.err).toMatch(/needs a path/);
  });

  it('is a command like the others, so it cannot be combined with one', async () => {
    const io = capture();
    expect(await run(['--config-init', '--config-write-schema=-'], { io, cwd: repo, env })).toBe(2);
    expect(io.err).toMatch(/--config-init and --config-write-schema are mutually exclusive/);
  });
});

describe('--config-reset', () => {
  it('replaces an existing config with the defaults', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-reset-'));
    const path = join(dir, 'config.toml');
    writeFileSync(path, 'group = 4\n');

    const io = capture();
    const at = { GITCIM_CONFIG_FILE: path };
    expect(await run(['--config-reset'], { io, cwd: repo, env: at })).toBe(0);
    expect(io.err).toBe(`gitcim: wrote ${path}\n`);
    expect(readFileSync(path, 'utf8')).toMatch(/\ngroup = 0\n/);

    rmSync(dir, { recursive: true, force: true });
  });

  it('writes one where there was none', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-reset-'));
    const path = join(dir, 'config.toml');

    const io = capture();
    expect(
      await run(['--config-reset'], { io, cwd: repo, env: { GITCIM_CONFIG_FILE: path } }),
    ).toBe(0);
    expect(existsSync(path)).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });
});

describe('--config-edit', () => {
  /** Stands in for the editor, recording its argv and doing `edit` to the file. */
  function editor(edit: (path: string) => void = () => {}, status = 0) {
    const calls: string[][] = [];
    return {
      calls,
      launch: (command: string, args: string[]) => {
        calls.push([command, ...args]);
        edit(args[args.length - 1] ?? '');
        return Promise.resolve(status);
      },
    };
  }

  function editing(path: string, edit: (text: string) => string) {
    return () => writeFileSync(path, edit(readFileSync(path, 'utf8')));
  }

  it('creates the file commented out, then opens it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-edit-'));
    const path = join(dir, 'config.toml');
    const at = { GITCIM_CONFIG_FILE: path, EDITOR: 'vi -f' };
    // What the "editor" does: enable one setting, the one-character edit.
    const ed = editor(editing(path, (text) => text.replace('\n#group = 0', '\ngroup = 1')));

    const io = capture();
    expect(await run(['--config-edit'], { io, cwd: repo, env: at, launchEditor: ed.launch })).toBe(
      0,
    );
    expect(ed.calls).toEqual([['vi', '-f', path]]);
    expect(io.err).toBe(`gitcim: wrote ${path}\n`);

    // The edit is what the next run uses.
    const next = capture();
    await run(['--include', 'src'], { io: next, cwd: repo, env: at });
    expect(next.out).toBe('add: src/new.py; update: src/main.py; remove: src/old.py\n');

    rmSync(dir, { recursive: true, force: true });
  });

  it('leaves an existing config alone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-edit-'));
    const path = join(dir, 'config.toml');
    writeFileSync(path, 'group = 4\n');
    const ed = editor();

    const io = capture();
    await run(['--config-edit'], {
      io,
      cwd: repo,
      env: { GITCIM_CONFIG_FILE: path, VISUAL: 'ed' },
      launchEditor: ed.launch,
    });
    expect(ed.calls).toEqual([['ed', path]]);
    expect(io.err).toBe('');
    expect(readFileSync(path, 'utf8')).toBe('group = 4\n');

    rmSync(dir, { recursive: true, force: true });
  });

  it('reports a typo before the next commit does', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-edit-'));
    const path = join(dir, 'config.toml');
    const ed = editor(editing(path, (text) => text.replace('\n#and = false', '\nand = maybe')));

    const io = capture();
    expect(
      await run(['--config-edit'], {
        io,
        cwd: repo,
        env: { GITCIM_CONFIG_FILE: path, EDITOR: 'vi' },
        launchEditor: ed.launch,
      }),
    ).toBe(2);
    expect(io.err).toMatch(/unsupported value: maybe/);

    rmSync(dir, { recursive: true, force: true });
  });

  it('passes on an editor that failed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-edit-'));
    const path = join(dir, 'config.toml');
    const ed = editor(() => {}, 3);

    const io = capture();
    expect(
      await run(['--config-edit'], {
        io,
        cwd: repo,
        env: { GITCIM_CONFIG_FILE: path, EDITOR: 'vi' },
        launchEditor: ed.launch,
      }),
    ).toBe(1);
    expect(io.err).toContain('gitcim: vi exited with status 3\n');

    rmSync(dir, { recursive: true, force: true });
  });

  it('needs an editor, and writes nothing without one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-edit-'));
    const path = join(dir, 'config.toml');

    const io = capture();
    expect(await run(['--config-edit'], { io, cwd: repo, env: { GITCIM_CONFIG_FILE: path } })).toBe(
      2,
    );
    expect(io.err).toMatch(/no editor: set \$GITCIM_EDITOR, \$VISUAL or \$EDITOR/);
    expect(existsSync(path)).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it('has nothing to edit when the config comes from stdin', async () => {
    const io = capture();
    expect(
      await run(['--config-edit'], {
        io,
        cwd: repo,
        env: { GITCIM_CONFIG_FILE: '-', EDITOR: 'vi' },
      }),
    ).toBe(2);
    expect(io.err).toMatch(/names no file to edit/);
  });
});

describe('--config-print', () => {
  it('reports every setting, and where its value came from', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-print-'));
    const path = join(dir, 'config.toml');
    writeFileSync(path, 'group = 1\n');

    const io = capture();
    expect(
      await run(['--config-print', '--item-separator= | ', '--no-group'], {
        io,
        cwd: repo,
        env: { GITCIM_CONFIG_FILE: path },
      }),
    ).toBe(0);

    // A flag beats the file it overrode, and says so.
    expect(io.out).toMatch(/## Source: --no-group\n#?group = 0\n/);
    expect(io.out).toMatch(/## Source: --item-separator\nitem-separator = " \| "\n/);
    expect(io.out).toMatch(/## Source: default\nlist-indent = 4\n/);
    expect(io.err).toBe('');

    rmSync(dir, { recursive: true, force: true });
  });

  it('credits the config file by name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-print-'));
    const path = join(dir, 'config.toml');
    writeFileSync(path, 'group = 3\n');

    const io = capture();
    await run(['--config-print'], { io, cwd: repo, env: { GITCIM_CONFIG_FILE: path } });
    expect(io.out).toContain(`## Source: ${path}\ngroup = 3\n`);

    rmSync(dir, { recursive: true, force: true });
  });

  it('prints a file gitcim reads back unchanged', async () => {
    const io = capture();
    await run(['--config-print', '--group=2', '--action-order=chmod'], { io, cwd: repo, env });
    expect(resolveOptions(parseConfig(io.out, 'printed'))).toEqual(
      resolveOptions({ group: 2, actionOrder: ['chmod', 'add', 'update', 'rename', 'remove'] }),
    );
  });

  it('reads a piped-in config like any other run does', async () => {
    const io = capture();
    await run(['--config-print'], {
      io,
      cwd: repo,
      env: { GITCIM_CONFIG_FILE: '-' },
      readStdin: () => Promise.resolve('and = true\n'),
    });
    expect(io.out).toContain('## Source: <stdin>\nand = true\n');
  });
});
