import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS,
  formatDefault,
  negatedValue,
  OPTION_SPECS,
  resolveOptions,
  SPECS_BY_FLAG,
} from '../src/options.js';
import { buildFormat, COMMAND_SPECS, HELP, parseArgsOptions, parseCliArgs } from '../src/args.js';
import type { Options } from '../src/types.js';

describe('OPTION_SPECS', () => {
  it('is the single source of the defaults', () => {
    // Spelled out so a default cannot drift unnoticed: every PLAN.md example
    // that names no flags depends on these exact values.
    expect(DEFAULT_OPTIONS).toEqual({
      group: 0,
      and: false,
      oxfordAnd: true,
      itemSeparator: ', ',
      groupSeparator: '; ',
      itemActionSuffix: ' ',
      groupActionSuffix: ': ',
      renameSeparator: ' to ',
      quoteChar: '"',
      actionOrder: ['add', 'update', 'remove', 'rename', 'copy', 'chmod'],
      summarize: 'never',
      excludeBody: false,
      overflow: 50,
      listOverflow: 72,
      listIndent: 0,
      listMaxItems: 0,
      listMaxGroups: 0,
    } satisfies Options);
  });

  it('covers every Options field exactly once', () => {
    const keys = OPTION_SPECS.map((spec) => spec.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(keys)).toEqual(new Set(Object.keys(DEFAULT_OPTIONS)));
  });

  it('uses a distinct flag name per option', () => {
    const flags = OPTION_SPECS.flatMap((spec) => [
      spec.flag,
      ...('negatable' in spec && spec.negatable ? [spec.negatable] : []),
    ]);
    expect(new Set(flags).size).toBe(flags.length);
  });

  it('indexes specs by flag, the same key a config file would use', () => {
    expect(SPECS_BY_FLAG.get('item-separator')?.key).toBe('itemSeparator');
    expect(SPECS_BY_FLAG.get('nope')).toBeUndefined();
  });

  it('freezes the defaults against accidental mutation', () => {
    expect(() => {
      (DEFAULT_OPTIONS as { group: number }).group = 9;
    }).toThrow();
  });

  it('leaves the defaults alone when resolving overrides', () => {
    expect(resolveOptions({ group: 2 }).group).toBe(2);
    expect(DEFAULT_OPTIONS.group).toBe(0);
  });
});

describe('negatedValue', () => {
  it('turns a switch off and a count to zero', () => {
    const and = OPTION_SPECS.find((spec) => spec.key === 'and');
    const oxford = OPTION_SPECS.find((spec) => spec.key === 'oxfordAnd');
    const group = OPTION_SPECS.find((spec) => spec.key === 'group');
    expect(negatedValue(and!)).toBe(false);
    expect(negatedValue(oxford!)).toBe(false);
    expect(negatedValue(group!)).toBe(0);
  });
});

describe('formatDefault', () => {
  it('labels a zero that means something', () => {
    expect(formatDefault(SPECS_BY_FLAG.get('group')!)).toBe('off');
    expect(formatDefault(SPECS_BY_FLAG.get('list-max-items')!)).toBe('unlimited');
  });

  it('shows whitespace in a separator', () => {
    expect(formatDefault(SPECS_BY_FLAG.get('item-separator')!)).toBe('", "');
  });

  it('shows a plain number as itself', () => {
    expect(formatDefault(SPECS_BY_FLAG.get('overflow')!)).toBe('50');
    expect(formatDefault(SPECS_BY_FLAG.get('list-overflow')!)).toBe('72');
    expect(formatDefault(SPECS_BY_FLAG.get('list-indent')!)).toBe('0');
  });

  it('joins the action order', () => {
    expect(formatDefault(SPECS_BY_FLAG.get('action-order')!)).toBe(
      'add,update,remove,rename,copy,chmod',
    );
  });
});

describe('derived parseArgs table', () => {
  it('declares every flag, with counts and strings taking values', () => {
    const options = parseArgsOptions();
    for (const spec of OPTION_SPECS) {
      expect(options[spec.flag]?.type).toBe(spec.kind === 'boolean' ? 'boolean' : 'string');
      if ('negatable' in spec && spec.negatable) {
        expect(options[spec.negatable]?.type).toBe('boolean');
      }
    }
  });

  it('declares every command, with only the value-taking ones taking values', () => {
    const options = parseArgsOptions();
    for (const spec of COMMAND_SPECS) {
      expect(options[spec.flag]?.type).toBe(spec.placeholder ? 'string' : 'boolean');
      expect(options[spec.flag]?.short).toBe(spec.short);
    }
  });

  it('keeps the short flags', () => {
    const options = parseArgsOptions();
    expect(options.help?.short).toBe('h');
    expect(options.version?.short).toBe('v');
  });

  it('accepts every flag on the command line', () => {
    for (const spec of OPTION_SPECS) {
      const value = spec.kind === 'choice' ? spec.values[0] : '1';
      const argv = spec.kind === 'boolean' ? [`--${spec.flag}`] : [`--${spec.flag}=${value}`];
      expect(() => parseCliArgs(argv)).not.toThrow();
    }
  });
});

describe('derived help', () => {
  it('documents every flag and its default', () => {
    for (const spec of OPTION_SPECS) {
      expect(HELP).toContain(`--${spec.flag}`);
      expect(HELP).toContain(`(default: ${formatDefault(spec)})`);
      if ('negatable' in spec && spec.negatable) expect(HELP).toContain(`--${spec.negatable}`);
    }
  });

  it('documents every command and the config environment variable', () => {
    for (const spec of COMMAND_SPECS) expect(HELP).toContain(`--${spec.flag}`);
    expect(HELP).toContain('GITCIM_CONFIG_FILE');
  });

  it('groups flags under their section', () => {
    expect(HELP).toMatch(/Wording:\n/);
    expect(HELP).toMatch(/Layout:\n/);
    expect(HELP.indexOf('--item-separator')).toBeLessThan(HELP.indexOf('Layout:'));
    expect(HELP.indexOf('--list-indent')).toBeGreaterThan(HELP.indexOf('Layout:'));
  });

  it('lines the descriptions up in one column', () => {
    const columns = HELP.split('\n')
      .filter((line) => line.startsWith('    --') || line.startsWith('    -v'))
      .map((line) => line.indexOf('  ', 6) + line.slice(line.indexOf('  ', 6)).search(/\S/));
    expect(new Set(columns).size).toBe(1);
  });
});

describe('README', () => {
  it('documents every flag', async () => {
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
    for (const spec of OPTION_SPECS) {
      expect(readme, `README.md is missing --${spec.flag}`).toContain(`--${spec.flag}`);
      if ('negatable' in spec && spec.negatable) {
        expect(readme, `README.md is missing --${spec.negatable}`).toContain(`--${spec.negatable}`);
      }
    }
    for (const spec of COMMAND_SPECS) {
      expect(readme, `README.md is missing --${spec.flag}`).toContain(`--${spec.flag}`);
    }
  });
});

describe('buildFormat over the spec table', () => {
  it('maps each flag to its Options key', () => {
    for (const spec of OPTION_SPECS) {
      const raw =
        spec.kind === 'boolean'
          ? true
          : spec.kind === 'order'
            ? 'remove'
            : spec.kind === 'choice'
              ? spec.values[0]
              : '3';
      const format = buildFormat({ [spec.flag]: raw });
      expect(Object.keys(format)).toEqual([spec.key]);
    }
  });

  it('applies every negation', () => {
    for (const spec of OPTION_SPECS) {
      if (!('negatable' in spec) || !spec.negatable) continue;
      expect(buildFormat({ [spec.negatable]: true })[spec.key]).toBe(negatedValue(spec));
    }
  });

  it('ignores a switch that was not passed', () => {
    expect(buildFormat({ and: false })).toEqual({});
  });
});
