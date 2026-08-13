import { describe, expect, it } from 'vitest';
import { chunkItems, quotePath, render, renderLine } from '../src/render.js';
import { resolveOptions } from '../src/options.js';
import type { Item, Options } from '../src/types.js';

const add = (path: string): Item => ({ kind: 'add', path });
const update = (path: string): Item => ({ kind: 'update', path });
const remove = (path: string): Item => ({ kind: 'remove', path });

function opts(over: Partial<Options> = {}): Options {
  return resolveOptions(over);
}

describe('quotePath', () => {
  it('leaves an ordinary path alone', () => {
    expect(quotePath('src/main.py', '"')).toBe('src/main.py');
  });

  it('quotes a path containing a space', () => {
    expect(quotePath('a b.md', '"')).toBe('"a b.md"');
  });

  it('quotes a path containing a tab', () => {
    expect(quotePath('a\tb.md', '"')).toBe('"a\tb.md"');
  });

  it('quotes and escapes an embedded quote char', () => {
    expect(quotePath('say"hi".md', '"')).toBe('"say\\"hi\\".md"');
  });

  it('quotes nothing when the quote char is empty', () => {
    expect(quotePath('a b.md', '')).toBe('a b.md');
  });
});

describe('chunkItems', () => {
  it('merges adjacent expanded runs into one chunk', () => {
    const chunks = chunkItems([remove('a'), add('b')], opts({ group: 2 }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.collapsed).toBe(false);
  });

  it('keeps a collapsed group separate from its neighbours', () => {
    const chunks = chunkItems([update('a'), update('b'), remove('c')], opts({ group: 2 }));
    expect(chunks.map((c) => c.collapsed)).toEqual([true, false]);
  });

  it('treats every run as one chunk when grouping is off', () => {
    const chunks = chunkItems([update('a'), remove('b'), add('c')], opts());
    expect(chunks).toHaveLength(1);
  });

  it('does not mutate the caller’s items', () => {
    const items = [update('a'), remove('b')];
    chunkItems(items, opts({ group: 1 }));
    expect(items).toHaveLength(2);
  });
});

describe('renderLine', () => {
  it('applies --and only on the last line', () => {
    const items = [update('a'), remove('b')];
    expect(renderLine(items, opts({ and: true }), false)).toBe('update a, remove b');
    expect(renderLine(items, opts({ and: true }), true)).toBe('update a and remove b');
  });

  it('leaves a single item untouched by --and', () => {
    expect(renderLine([update('a')], opts({ and: true }), true)).toBe('update a');
  });

  it('joins a group with --and at the group level', () => {
    const items = [update('a'), update('b'), remove('c')];
    expect(renderLine(items, opts({ and: true, group: 2 }), true)).toBe(
      'update: a, b and remove c',
    );
  });

  it('includes or omits Oxford comma based on oxfordAnd option', () => {
    const items = [add('a'), update('b'), remove('c')];
    expect(renderLine(items, opts({ and: true, oxfordAnd: true }), true)).toBe(
      'add a, update b, and remove c',
    );
    expect(renderLine(items, opts({ and: true, oxfordAnd: false }), true)).toBe(
      'add a, update b and remove c',
    );
    expect(renderLine(items, opts({ itemSeparator: ' ', and: true, oxfordAnd: true }), true)).toBe(
      'add a update b and remove c',
    );
    expect(renderLine(items, opts({ itemSeparator: '', and: true, oxfordAnd: true }), true)).toBe(
      'add aupdate b and remove c',
    );
    expect(
      renderLine(items, opts({ itemSeparator: '﹐', and: true, oxfordAnd: false }), true),
    ).toBe('add a﹐update b and remove c');
    expect(renderLine(items, opts({ itemSeparator: '﹐', and: true, oxfordAnd: true }), true)).toBe(
      'add a﹐update b﹐ and remove c',
    );
  });

  it('keeps a separator’s own whitespace in front of "and"', () => {
    const items = [add('a'), update('b'), remove('c')];
    // A newline separator has to stay a newline, not become ", \n" or " ".
    expect(renderLine(items, opts({ itemSeparator: ',\n', and: true }), true)).toBe(
      'add a,\nupdate b,\nand remove c',
    );
    expect(
      renderLine(items, opts({ itemSeparator: ',\n', and: true, oxfordAnd: false }), true),
    ).toBe('add a,\nupdate b\nand remove c');
    expect(renderLine(items, opts({ itemSeparator: ',\t', and: true }), true)).toBe(
      'add a,\tupdate b,\tand remove c',
    );
  });

  it('renders a rename with both paths', () => {
    const item: Item = { kind: 'rename', path: 'new.md', oldPath: 'old.md' };
    expect(renderLine([item], opts())).toBe('rename old.md to new.md');
  });

  it('renders a copy with both paths', () => {
    const item: Item = { kind: 'copy', path: 'new.md', oldPath: 'old.md' };
    expect(renderLine([item], opts())).toBe('copy old.md to new.md');
  });

  it('falls back to the single path when a rename has no source', () => {
    expect(renderLine([{ kind: 'rename', path: 'new.md' }], opts())).toBe('rename new.md');
  });

  it('quotes both sides of a rename', () => {
    const item: Item = { kind: 'rename', path: 'new one.md', oldPath: 'old one.md' };
    expect(renderLine([item], opts())).toBe('rename "old one.md" to "new one.md"');
  });

  it('labels both chmod directions', () => {
    const items: Item[] = [
      { kind: 'chmod+x', path: 'a.sh' },
      { kind: 'chmod-x', path: 'b.sh' },
    ];
    expect(renderLine(items, opts())).toBe('chmod +x a.sh, chmod -x b.sh');
  });

  it('groups the two chmod directions separately', () => {
    const items: Item[] = [
      { kind: 'chmod+x', path: 'a.sh' },
      { kind: 'chmod+x', path: 'b.sh' },
      { kind: 'chmod-x', path: 'c.sh' },
      { kind: 'chmod-x', path: 'd.sh' },
    ];
    expect(renderLine(items, opts({ group: 2 }))).toBe(
      'chmod +x: a.sh, b.sh; chmod -x: c.sh, d.sh',
    );
  });
});

describe('render', () => {
  it('is empty for no items', () => {
    expect(render([])).toBe('');
  });

  it('stays on one line when nothing overflows', () => {
    expect(render([update('a'), remove('b')], { overflow: 80 })).toBe('update a, remove b');
  });

  it('packs right up to the overflow limit', () => {
    // "update a, update b" is exactly 18 characters.
    expect(render([update('a'), update('b')], { overflow: 18 })).toBe('update a, update b');
    expect(render([update('a'), update('b')], { overflow: 17 })).toBe('update a\n\n    - update b');
  });

  it('keeps one item on the first line even when it overflows alone', () => {
    expect(render([update('a-very-long-name')], { overflow: 5 })).toBe('update a-very-long-name');
  });

  it('keeps one item per bullet even when it overflows alone', () => {
    const out = render([update('a'), update('bbbbbbbbbbbbbbbb')], {
      overflow: 8,
      listOverflow: 10,
    });
    expect(out).toBe('update a\n\n    - update bbbbbbbbbbbbbbbb');
  });

  it('treats listOverflow of 0 as unlimited', () => {
    const items = [update('a'), update('b'), update('c')];
    expect(render(items, { overflow: 8 })).toBe('update a\n\n    - update b, update c');
  });

  it('counts the indent and bullet against listOverflow', () => {
    const items = [update('a'), update('b'), update('c')];
    // "    - update b, update c" is 24 characters; one less forces a second bullet.
    expect(render(items, { overflow: 8, listOverflow: 24 })).toBe(
      'update a\n\n    - update b, update c',
    );
    expect(render(items, { overflow: 8, listOverflow: 23 })).toBe(
      'update a\n\n    - update b\n    - update c',
    );
  });

  it('applies --and to the last bullet, not the first line', () => {
    const items = [update('a'), update('b'), update('c')];
    expect(render(items, { overflow: 8, and: true })).toBe(
      'update a\n\n    - update b and update c',
    );
  });

  it('separates the first line from the list with a blank line', () => {
    expect(render([update('a'), update('b')], { overflow: 8 }).split('\n')[1]).toBe('');
  });
});
