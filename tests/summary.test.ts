import { describe, expect, it } from 'vitest';
import { GitcimError } from '../src/errors.js';
import { resolveOptions } from '../src/options.js';
import { render, summarizeItems } from '../src/render.js';
import type { Item } from '../src/types.js';

const SAMPLE: Item[] = [
  { kind: 'add', path: 'a1' },
  { kind: 'add', path: 'a2' },
  { kind: 'update', path: 'CODE_OF_CONDUCT.md' },
  { kind: 'remove', path: 'd1' },
  { kind: 'remove', path: 'd2' },
  { kind: 'remove', path: 'd3' },
  { kind: 'remove', path: 'd4' },
  { kind: 'rename', oldPath: 'a.c', path: 'b.c' },
  { kind: 'copy', oldPath: 'c1', path: 'c2' },
  { kind: 'copy', oldPath: 'c3', path: 'c4' },
  { kind: 'chmod+x', path: 'scripts/script.sh' },
  { kind: 'chmod-x', path: 'scripts/script2.sh' },
];

function summary(overflow: number): string {
  return summarizeItems(SAMPLE, resolveOptions({ overflow }));
}

describe('summarizeItems', () => {
  it('uses paths for single actions and counts for repeated actions', () => {
    expect(summary(0)).toBe(
      'add 2 files, update CODE_OF_CONDUCT.md, remove 4 files, rename a.c to b.c, ' +
        'copy 2 files, chmod +x scripts/script.sh, chmod -x scripts/script2.sh',
    );
  });

  it.each([
    [143, 'add 2 files, update 1 file, remove 4 files, rename 1 file, copy 2 files, chmod 2 files'],
    [85, 'add 2 files, update 3 files, remove 4 files, rename 1 file, copy 2 files'],
    [71, 'add 4 files, update 3 files, remove 4 files, rename 1 file'],
    [57, 'add 4 files, update 3 files, remove 4 files, mv 1 file'],
    [53, 'add 4 files, update 3 files, rm 4 files, mv 1 file'],
    [49, 'add 4 files, update 3 files, rm 4 files, mv 1'],
    [44, 'add 4 files, update 3 files, rm 4, mv 1'],
    [38, 'add 4 files, update 3, rm 4, mv 1'],
    [32, 'add 4, update 3, rm 4, mv 1'],
    [26, 'add 4, update 3, rm 4, R 1'],
    [25, 'add 4, update 3, D 4, R 1'],
    [24, 'add 4, M 3, D 4, R 1'],
    [19, 'A 4, M 3, D 4, R 1'],
    [17, 'A 4, M 3, D 4, R1'],
    [16, 'A 4, M 3, D4, R1'],
    [15, 'A 4, M3, D4, R1'],
    [14, 'A4, M3, D4, R1'],
    [13, 'A4 M3 D4 R1'],
    [10, 'A4M3D4R1'],
    [7, '12'],
  ])('uses the least-compressed form that fits %i columns', (overflow, expected) => {
    expect(summary(overflow)).toBe(expected);
  });

  it('errors when even the total action count does not fit', () => {
    expect(() => summary(1)).toThrow('cannot summarize 12 changes within --overflow=1');
    try {
      summary(1);
    } catch (err) {
      expect(err).toBeInstanceOf(GitcimError);
      expect((err as GitcimError).code).toBe(2);
    }
  });
});

describe('summary rendering', () => {
  it('keeps every detailed action in the body', () => {
    expect(render(SAMPLE, { summarize: 'always', overflow: 50 })).toBe(
      [
        'add 4 files, update 3 files, rm 4 files, mv 1 file',
        '',
        '- add a1, add a2, update CODE_OF_CONDUCT.md, remove d1, remove d2',
        '- remove d3, remove d4, rename a.c to b.c, copy c1 to c2, copy c3 to c4',
        '- chmod +x scripts/script.sh, chmod -x scripts/script2.sh',
      ].join('\n'),
    );
  });

  it('engages overflow mode only when the ordinary line is too wide', () => {
    const items: Item[] = [
      { kind: 'add', path: 'alpha' },
      { kind: 'update', path: 'beta' },
    ];
    expect(render(items, { summarize: 'overflow', overflow: 22 })).toBe('add alpha, update beta');
    expect(render(items, { summarize: 'overflow', overflow: 21 })).toBe(
      'add 1 file, update 1\n\n- add alpha, update beta',
    );
  });

  it('applies --exclude-body after generating either message form', () => {
    expect(render(SAMPLE, { summarize: 'always', overflow: 50, excludeBody: true })).toBe(
      'add 4 files, update 3 files, rm 4 files, mv 1 file',
    );
    expect(
      render(
        [
          { kind: 'update', path: 'a' },
          { kind: 'update', path: 'b' },
        ],
        { overflow: 8, excludeBody: true },
      ),
    ).toBe('update a');
  });
});
