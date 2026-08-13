import { describe, expect, it } from 'vitest';
import { buildFormat, extractFileLists, parseCliArgs } from '../src/args.js';
import { GitcimError } from '../src/errors.js';

describe('extractFileLists', () => {
  it('collects the files after --include', () => {
    expect(extractFileLists(['--include', 'a.ts', 'b.ts'])).toEqual({
      include: ['a.ts', 'b.ts'],
      rest: [],
    });
  });

  it('stops collecting at the next flag', () => {
    const result = extractFileLists(['--include', 'a.ts', '--overflow', '50']);
    expect(result.include).toEqual(['a.ts']);
    expect(result.rest).toEqual(['--overflow', '50']);
  });

  it('handles both lists at once', () => {
    const result = extractFileLists(['--include', 'src', '--exclude', 'src/vendor', 'dist']);
    expect(result.include).toEqual(['src']);
    expect(result.exclude).toEqual(['src/vendor', 'dist']);
  });

  it('accepts the --include=value form', () => {
    const result = extractFileLists(['--include=a.ts', 'b.ts']);
    expect(result.include).toEqual(['a.ts']);
    expect(result.rest).toEqual(['b.ts']);
  });

  it('accumulates repeated flags into one list', () => {
    const result = extractFileLists(['--include', 'a.ts', '--include', 'b.ts']);
    expect(result.include).toEqual(['a.ts', 'b.ts']);
  });

  it('takes everything after -- literally', () => {
    const result = extractFileLists(['--include', '--', '-weird-name.ts']);
    expect(result.include).toEqual(['-weird-name.ts']);
  });

  it('leaves flags alone when no list is open', () => {
    expect(extractFileLists(['--and', '--group=2'])).toEqual({ rest: ['--and', '--group=2'] });
  });

  it('reports no lists when none were given', () => {
    expect(extractFileLists([]).include).toBeUndefined();
  });

  it('treats a bare - as a value', () => {
    expect(extractFileLists(['--include', '-']).include).toEqual(['-']);
  });
});

describe('parseCliArgs', () => {
  it('parses flags alongside a file list', () => {
    const { include, values } = parseCliArgs(['--include', 'src', '--group=2', '--and']);
    expect(include).toEqual(['src']);
    expect(values.group).toBe('2');
    expect(values.and).toBe(true);
  });

  it('accepts the short flags', () => {
    expect(parseCliArgs(['-h']).values.help).toBe(true);
    expect(parseCliArgs(['-v']).values.version).toBe(true);
  });

  it('rejects an unknown flag with exit code 2', () => {
    expect(() => parseCliArgs(['--nope'])).toThrow(GitcimError);
    try {
      parseCliArgs(['--nope']);
    } catch (err) {
      expect((err as GitcimError).code).toBe(2);
    }
  });

  it('rejects a stray positional', () => {
    expect(() => parseCliArgs(['stray.ts'])).toThrow(GitcimError);
  });
});

describe('buildFormat', () => {
  it('is empty when no formatting flags are given', () => {
    expect(buildFormat({})).toEqual({});
  });

  it('reads the string knobs', () => {
    expect(
      buildFormat({
        'item-separator': ' ',
        'group-separator': ' - ',
        'item-action-suffix': ':',
        'group-action-suffix': ' ',
        'rename-separator': ' -> ',
        'quote-char': "'",
      }),
    ).toEqual({
      itemSeparator: ' ',
      groupSeparator: ' - ',
      itemActionSuffix: ':',
      groupActionSuffix: ' ',
      renameSeparator: ' -> ',
      quoteChar: "'",
    });
  });

  it('reads the numeric knobs', () => {
    expect(
      buildFormat({
        overflow: '50',
        'list-overflow': '72',
        'list-indent': '2',
        'list-max-items': '1',
        'list-max-groups': '1',
        group: '3',
      }),
    ).toEqual({
      overflow: 50,
      listOverflow: 72,
      listIndent: 2,
      listMaxItems: 1,
      listMaxGroups: 1,
      group: 3,
    });
  });

  it('lets --no-group win over --group', () => {
    expect(buildFormat({ group: '2', 'no-group': true }).group).toBe(0);
  });

  it('lets --no-and win over --and', () => {
    expect(buildFormat({ and: true, 'no-and': true }).and).toBe(false);
  });

  it('accepts an explicit --and', () => {
    expect(buildFormat({ and: true }).and).toBe(true);
  });

  it('parses --action-order', () => {
    expect(buildFormat({ 'action-order': 'remove,add' }).actionOrder).toEqual([
      'remove',
      'add',
      'update',
      'rename',
      'chmod',
    ]);
  });

  it('rejects a bad --action-order with exit code 2', () => {
    try {
      buildFormat({ 'action-order': 'nope' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(GitcimError);
      expect((err as GitcimError).code).toBe(2);
    }
  });

  it.each([['abc'], ['-1'], ['1.5']])('rejects %s as a count', (raw) => {
    expect(() => buildFormat({ overflow: raw })).toThrow(/non-negative integer/);
  });
});
