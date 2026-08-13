import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import {
  configLocation,
  configSchema,
  CONFIG_ENV,
  loadConfig,
  parseConfig,
  renderConfig,
  renderEffectiveConfig,
  resolveEditor,
  spawnEditor,
  writeOut,
} from '../src/config.js';
import { GitcimError } from '../src/errors.js';
import { DEFAULT_OPTIONS, OPTION_SPECS, resolveOptions } from '../src/options.js';

describe('configLocation', () => {
  it('takes the path the environment names', () => {
    expect(configLocation({ [CONFIG_ENV]: '/tmp/x.toml' })).toEqual({
      path: '/tmp/x.toml',
      explicit: true,
    });
  });

  it('treats "-" as a path like any other', () => {
    expect(configLocation({ [CONFIG_ENV]: '-' })).toEqual({ path: '-', explicit: true });
  });

  it('falls back to XDG, then to the home directory', () => {
    expect(configLocation({ XDG_CONFIG_HOME: '/xdg' })).toEqual({
      path: '/xdg/gitcim/config.toml',
      explicit: false,
    });
    expect(configLocation({})).toEqual({
      path: join(homedir(), '.config', 'gitcim', 'config.toml'),
      explicit: false,
    });
  });

  it('ignores an empty environment variable', () => {
    expect(configLocation({ [CONFIG_ENV]: '', XDG_CONFIG_HOME: '/xdg' }).explicit).toBe(false);
  });
});

describe('parseConfig', () => {
  it('maps flag names onto Options keys', () => {
    expect(parseConfig('item-separator = " "\nlist-max-items = 2\nand = true\n', 'x')).toEqual({
      itemSeparator: ' ',
      listMaxItems: 2,
      and: true,
    });
  });

  it('takes the action order as an array and fills in what is missing', () => {
    expect(parseConfig('action-order = ["chmod", "remove"]', 'x')).toEqual({
      actionOrder: ['chmod', 'remove', 'add', 'update', 'rename'],
    });
  });

  it('accepts an empty file', () => {
    expect(parseConfig('# nothing here\n', 'x')).toEqual({});
  });

  it.each([
    ['nope = 1', 'x: unknown setting "nope"'],
    ['group = "two"', 'x: group must be a non-negative integer'],
    ['group = -1', 'x: group must be a non-negative integer'],
    ['and = 1', 'x: and must be true or false'],
    ['item-separator = 4', 'x: item-separator must be a string'],
    ['action-order = "add"', 'x: action-order must be an array of action names'],
    ['action-order = ["nope"]', 'x: unknown action "nope"'],
    ['action-order = ["add", "add"]', 'x: duplicate action "add"'],
    ['group = 1\nbad line\n', 'x:2: expected "key = value"'],
  ])('rejects %j', (text, message) => {
    expect(() => parseConfig(text, 'x')).toThrow(message);
    try {
      parseConfig(text, 'x');
    } catch (err) {
      expect((err as GitcimError).code).toBe(2);
    }
  });
});

describe('loadConfig', () => {
  it('returns nothing when the default location has no file', async () => {
    expect(await loadConfig({ XDG_CONFIG_HOME: '/nonexistent-gitcim-xdg' })).toEqual({});
  });

  it('reads stdin for "-"', async () => {
    const config = await loadConfig(
      { [CONFIG_ENV]: '-' },
      { readStdin: () => Promise.resolve('group = 3\n') },
    );
    expect(config).toEqual({ group: 3 });
  });

  it('blames <stdin> when what was piped in does not parse', async () => {
    await expect(
      loadConfig({ [CONFIG_ENV]: '-' }, { readStdin: () => Promise.resolve('oops\n') }),
    ).rejects.toThrow('<stdin>:1: expected "key = value"');
  });
});

describe('file trouble', () => {
  const asRoot = process.getuid?.() === 0;

  it.skipIf(asRoot)('says when the config file cannot be read', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-perm-'));
    const path = join(dir, 'config.toml');
    writeFileSync(path, 'group = 1\n');
    chmodSync(path, 0o000);

    await expect(loadConfig({ [CONFIG_ENV]: path })).rejects.toThrow(
      `cannot read config file ${path}`,
    );

    chmodSync(path, 0o600);
    rmSync(dir, { recursive: true, force: true });
  });

  it('says when the destination cannot be written', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitcim-write-'));
    const blocked = join(dir, 'a-file');
    writeFileSync(blocked, 'x');

    await expect(
      writeOut(join(blocked, 'config.toml'), 'x', () => {}, { overwrite: true }),
    ).rejects.toThrow(/cannot write/);

    rmSync(dir, { recursive: true, force: true });
  });
});

describe('renderConfig', () => {
  it('round-trips: what it writes parses back to the defaults', () => {
    expect(resolveOptions(parseConfig(renderConfig({ commented: false }), 'generated'))).toEqual(
      DEFAULT_OPTIONS,
    );
  });

  it('documents and sets every option', () => {
    const text = renderConfig({ commented: false });
    for (const spec of OPTION_SPECS) {
      expect(text, `missing ${spec.flag}`).toContain(`\n${spec.flag} = `);
      expect(text).toContain(`## ${spec.help}.`);
    }
  });

  it('sets nothing in the unset variant, while keeping the prose', () => {
    const text = renderConfig({ commented: true });
    expect(parseConfig(text, 'generated')).toEqual({});
    for (const spec of OPTION_SPECS) {
      expect(text, `missing ${spec.flag}`).toContain(`\n#${spec.flag} = `);
    }
    // Uncommenting a setting is deleting one character; the docs use "##".
    expect(text.replace(/^#(?=[a-z])/gm, '')).toBe(renderConfig({ commented: false }));
  });

  it('keeps comment lines readable', () => {
    for (const line of renderConfig({ commented: false }).split('\n')) {
      expect(line.length, line).toBeLessThanOrEqual(80);
    }
  });
});

describe('renderEffectiveConfig', () => {
  const options = resolveOptions({
    group: 2,
    itemSeparator: ' | ',
    actionOrder: ['chmod', 'add', 'update', 'rename', 'remove'],
  });

  it('round-trips: what it prints parses back to what it was given', () => {
    const text = renderEffectiveConfig(options, new Map());
    expect(resolveOptions(parseConfig(text, 'printed'))).toEqual(options);
  });

  it('attributes every setting, defaulting to "default"', () => {
    const text = renderEffectiveConfig(options, new Map([['group', '--group']]));
    expect(text).toContain('## Source: --group\ngroup = 2\n');
    expect(text).toContain('## Source: default\nlist-indent = 4\n');
    expect(text.match(/^## Source: /gm)?.length).toBe(OPTION_SPECS.length);
  });
});

describe('resolveEditor', () => {
  it('prefers GITCIM_EDITOR, then VISUAL, then EDITOR', () => {
    const all = { GITCIM_EDITOR: 'a', VISUAL: 'b', EDITOR: 'c' };
    expect(resolveEditor(all).command).toBe('a');
    expect(resolveEditor({ VISUAL: 'b', EDITOR: 'c' }).command).toBe('b');
    expect(resolveEditor({ EDITOR: 'c' }).command).toBe('c');
  });

  it('keeps the arguments an editor was given', () => {
    expect(resolveEditor({ EDITOR: '  code --wait  ' })).toEqual({
      command: 'code',
      args: ['--wait'],
    });
  });

  it('skips a variable set to nothing', () => {
    expect(resolveEditor({ VISUAL: '   ', EDITOR: 'vi' }).command).toBe('vi');
  });

  it('says which variables it looked at when there is no editor', () => {
    expect(() => resolveEditor({})).toThrow('no editor: set $GITCIM_EDITOR, $VISUAL or $EDITOR');
    try {
      resolveEditor({});
    } catch (err) {
      expect((err as GitcimError).code).toBe(2);
    }
  });
});

describe('spawnEditor', () => {
  it("resolves with the editor's exit status", async () => {
    await expect(spawnEditor('sh', ['-c', 'exit 0'])).resolves.toBe(0);
    await expect(spawnEditor('sh', ['-c', 'exit 3'])).resolves.toBe(3);
  });

  it('says when the editor cannot be run at all', async () => {
    await expect(spawnEditor('gitcim-no-such-editor', [])).rejects.toThrow(
      /cannot run gitcim-no-such-editor/,
    );
  });
});

describe('configSchema', () => {
  it('describes every setting, and nothing else', () => {
    const schema = configSchema() as {
      properties: Record<string, { type: string; default: unknown; description: string }>;
      additionalProperties: boolean;
    };

    expect(Object.keys(schema.properties)).toEqual(OPTION_SPECS.map((spec) => spec.flag));
    expect(schema.additionalProperties).toBe(false);
    for (const spec of OPTION_SPECS) {
      expect(schema.properties[spec.flag]?.description).toBe(spec.help);
      expect(schema.properties[spec.flag]?.default).toEqual(spec.default);
    }
  });

  it('constrains counts and the action order', () => {
    const properties = (configSchema() as { properties: Record<string, Record<string, unknown>> })
      .properties;
    expect(properties['list-indent']).toMatchObject({ type: 'integer', minimum: 0 });
    expect(properties['action-order']).toMatchObject({
      type: 'array',
      uniqueItems: true,
      items: { enum: ['add', 'update', 'rename', 'remove', 'chmod'] },
    });
  });

  it('is JSON, all the way down', () => {
    expect(() => JSON.stringify(configSchema())).not.toThrow();
  });
});
