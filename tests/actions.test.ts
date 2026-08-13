import { describe, expect, it } from 'vitest';
import { slotOf, sortItems, toItems } from '../src/actions.js';
import { DEFAULT_OPTIONS, parseActionOrder } from '../src/options.js';
import type { ActionKind, Item, RawEntry } from '../src/types.js';

function entry(over: Partial<RawEntry> & Pick<RawEntry, 'status' | 'path'>): RawEntry {
  return {
    oldMode: '100644',
    newMode: '100644',
    oldSha: 'aaaaaaa',
    newSha: 'bbbbbbb',
    ...over,
  };
}

/** Compact view of the produced actions, for readable assertions. */
function kinds(items: Item[]): string[] {
  return items.map((i) => `${i.kind} ${i.path}`);
}

describe('toItems', () => {
  it('maps an addition', () => {
    expect(kinds(toItems([entry({ status: 'A', path: 'a.ts' })]))).toEqual(['add a.ts']);
  });

  it('maps a copy as an addition', () => {
    expect(kinds(toItems([entry({ status: 'C', path: 'b.ts', oldPath: 'a.ts' })]))).toEqual([
      'add b.ts',
    ]);
  });

  it('maps a deletion', () => {
    expect(kinds(toItems([entry({ status: 'D', path: 'a.ts' })]))).toEqual(['remove a.ts']);
  });

  it('maps a content change', () => {
    expect(kinds(toItems([entry({ status: 'M', path: 'a.ts' })]))).toEqual(['update a.ts']);
  });

  it('maps a type change like a content change', () => {
    expect(kinds(toItems([entry({ status: 'T', path: 'link' })]))).toEqual(['update link']);
  });

  it('keeps both paths for a rename', () => {
    const [item] = toItems([
      entry({ status: 'R', path: 'new.md', oldPath: 'old.md', newSha: 'aaaaaaa' }),
    ]);
    expect(item).toEqual({ kind: 'rename', path: 'new.md', oldPath: 'old.md' });
  });

  it('reports a rename that also changed content as both', () => {
    const items = toItems([entry({ status: 'R', path: 'new.md', oldPath: 'old.md' })]);
    expect(kinds(items)).toEqual(['update new.md', 'rename new.md']);
  });

  it('reports a mode-only change as chmod alone', () => {
    const items = toItems([
      entry({ status: 'M', path: 'run.sh', newMode: '100755', newSha: 'aaaaaaa' }),
    ]);
    expect(kinds(items)).toEqual(['chmod+x run.sh']);
  });

  it('reports dropping the executable bit', () => {
    const items = toItems([
      entry({
        status: 'M',
        path: 'run.sh',
        oldMode: '100755',
        newMode: '100644',
        newSha: 'aaaaaaa',
      }),
    ]);
    expect(kinds(items)).toEqual(['chmod-x run.sh']);
  });

  it('reports a combined content and mode change as both actions', () => {
    const items = toItems([entry({ status: 'M', path: 'run.sh', newMode: '100755' })]);
    expect(kinds(items)).toEqual(['update run.sh', 'chmod+x run.sh']);
  });

  it('does not call a symlink transition a chmod', () => {
    const items = toItems([
      entry({ status: 'T', path: 'link', oldMode: '100644', newMode: '120000' }),
    ]);
    expect(kinds(items)).toEqual(['update link']);
  });

  it('orders by action slot, then by path', () => {
    const items = toItems([
      entry({ status: 'D', path: 'z.ts' }),
      entry({ status: 'A', path: 'b.ts' }),
      entry({ status: 'M', path: 'm.ts' }),
      entry({ status: 'A', path: 'a.ts' }),
    ]);
    expect(kinds(items)).toEqual(['add a.ts', 'add b.ts', 'update m.ts', 'remove z.ts']);
  });

  it('honours a custom action order', () => {
    const items = toItems(
      [entry({ status: 'A', path: 'a.ts' }), entry({ status: 'D', path: 'z.ts' })],
      parseActionOrder('remove,add'),
    );
    expect(kinds(items)).toEqual(['remove z.ts', 'add a.ts']);
  });

  it('is empty for no entries', () => {
    expect(toItems([])).toEqual([]);
  });
});

describe('sortItems', () => {
  it('keeps chmod +x ahead of chmod -x within the shared slot', () => {
    const items: Item[] = [
      { kind: 'chmod-x', path: 'a.sh' },
      { kind: 'chmod+x', path: 'z.sh' },
    ];
    expect(kinds(sortItems(items, DEFAULT_OPTIONS.actionOrder))).toEqual([
      'chmod+x z.sh',
      'chmod-x a.sh',
    ]);
  });

  it('does not mutate its input', () => {
    const items: Item[] = [
      { kind: 'remove', path: 'z.ts' },
      { kind: 'add', path: 'a.ts' },
    ];
    sortItems(items, DEFAULT_OPTIONS.actionOrder);
    expect(items[0]?.kind).toBe('remove');
  });
});

describe('slotOf', () => {
  it('folds both chmod kinds into one slot', () => {
    expect(slotOf('chmod+x')).toBe('chmod');
    expect(slotOf('chmod-x')).toBe('chmod');
  });

  it('passes other kinds through', () => {
    for (const kind of ['add', 'update', 'rename', 'remove'] as ActionKind[]) {
      expect(slotOf(kind)).toBe(kind);
    }
  });
});

describe('parseActionOrder', () => {
  it('appends unnamed slots in their default order', () => {
    expect(parseActionOrder('remove,add')).toEqual(['remove', 'add', 'update', 'rename', 'chmod']);
  });

  it('tolerates spaces', () => {
    expect(parseActionOrder(' add , update ').slice(0, 2)).toEqual(['add', 'update']);
  });

  it('rejects an unknown action', () => {
    expect(() => parseActionOrder('add,frobnicate')).toThrow(/unknown action/);
  });

  it('rejects a duplicate', () => {
    expect(() => parseActionOrder('add,add')).toThrow(/duplicate action/);
  });
});
