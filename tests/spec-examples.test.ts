import { describe, expect, it } from 'vitest';
import { render } from '../src/render.js';
import { sortItems } from '../src/actions.js';
import { DEFAULT_OPTIONS } from '../src/options.js';
import type { ActionKind, Item, Options } from '../src/types.js';

/**
 * The examples from devdocs/PLAN.md, one case each.
 *
 * The item sets and flags are transcribed literally; the expected outputs are
 * ordered by the default `--action-order` (add, update, remove, rename, copy, chmod),
 * which differs from the ordering PLAN.md's prose happened to show.
 */

function item(kind: ActionKind, path: string, oldPath?: string): Item {
  return oldPath === undefined ? { kind, path } : { kind, path, oldPath };
}

const add = (p: string) => item('add', p);
const update = (p: string) => item('update', p);
const remove = (p: string) => item('remove', p);

/** The five-item set PLAN.md reuses across the grouping and overflow examples. */
const FIVE: Item[] = [
  update('src/main.py'),
  update('src/subcommand.py'),
  update('src/util/utils.py'),
  remove('src/old_module.py'),
  add('src/new_module.py'),
];

/** The six-item set used by the `--overflow=39` family. */
const SIX: Item[] = [
  update('src/main.py'),
  update('src/subcommand.py'),
  update('src/util/utils.py'),
  update('src/util/helper.py'),
  remove('src/old_module.py'),
  add('src/new_module.py'),
];

const LONG_NAME =
  'src/new_module_with_a_very_long_name_that_exceeds_the_list_overflow_limit_but_we_dont_separate_action_prefix_from_filenames_and_we_dont_break_inside_filenames.py';

const SPACED_LONG_NAME =
  'src/new_module_with_a_very_long_name with spaces that_exceeds_the_list_overflow_limit_but_we_dont_separate_action_prefix_from_filenames_and_we_dont_break_inside_filenames.py';

interface Case {
  name: string;
  items: Item[];
  opts?: Partial<Options>;
  expected: string;
}

const CASES: Case[] = [
  {
    name: 'single modified file',
    items: [update('README.md')],
    expected: 'update README.md',
  },
  {
    name: 'rename',
    items: [item('rename', 'README_NEW.md', 'README.md')],
    expected: 'rename README.md to README_NEW.md',
  },
  {
    name: 'rename with --rename-separator',
    items: [item('rename', 'README_NEW.md', 'README.md')],
    opts: { renameSeparator: ' -> ' },
    expected: 'rename README.md -> README_NEW.md',
  },
  {
    name: 'copy',
    items: [item('copy', 'README_COPY.md', 'README.md')],
    expected: 'copy README.md to README_COPY.md',
  },
  {
    name: 'copy that was then edited',
    // Listed update-first on purpose: the sort is what puts the copy ahead of it.
    items: [update('README_COPY.md'), item('copy', 'README_COPY.md', 'README.md')],
    opts: { overflow: 0 },
    expected: 'copy README.md to README_COPY.md, update README_COPY.md',
  },
  {
    name: 'chmod +x alongside a removal',
    items: [item('chmod+x', 'scripts/install.sh'), remove('plans/COMPLETED.md')],
    opts: { overflow: 0 },
    expected: 'remove plans/COMPLETED.md, chmod +x scripts/install.sh',
  },
  {
    name: 'chmod -x alongside a removal',
    items: [item('chmod-x', 'scripts/install.sh'), remove('plans/COMPLETED.md')],
    opts: { overflow: 0 },
    expected: 'remove plans/COMPLETED.md, chmod -x scripts/install.sh',
  },
  {
    name: 'no-op chmod contributes nothing',
    items: [remove('plans/COMPLETED.md')],
    expected: 'remove plans/COMPLETED.md',
  },
  {
    name: 'single added file',
    items: [add('README.md')],
    expected: 'add README.md',
  },
  {
    name: 'two items with --and',
    items: [update('docs/DOCS.md'), remove('plans/PLAN.md')],
    opts: { and: true },
    expected: 'update docs/DOCS.md and remove plans/PLAN.md',
  },
  {
    name: 'three items, --no-and (default)',
    items: [update('docs/DOCS.md'), remove('plans/PLAN.md'), add('test/test.py')],
    opts: { overflow: 0 },
    expected: 'add test/test.py, update docs/DOCS.md, remove plans/PLAN.md',
  },
  {
    name: 'three items, --and keeps the serial comma',
    items: [update('docs/DOCS.md'), remove('plans/PLAN.md'), add('test/test.py')],
    opts: { and: true, overflow: 0 },
    expected: 'add test/test.py, update docs/DOCS.md, and remove plans/PLAN.md',
  },
  {
    name: 'three items, --and with --no-oxford-and omits serial comma',
    items: [update('docs/DOCS.md'), remove('plans/PLAN.md'), add('test/test.py')],
    opts: { and: true, oxfordAnd: false, overflow: 0 },
    expected: 'add test/test.py, update docs/DOCS.md and remove plans/PLAN.md',
  },
  {
    name: '--no-group',
    items: FIVE,
    opts: { overflow: 0 },
    expected:
      'add src/new_module.py, update src/main.py, update src/subcommand.py, ' +
      'update src/util/utils.py, remove src/old_module.py',
  },
  {
    name: '--no-group with --item-separator=" "',
    items: FIVE,
    opts: { itemSeparator: ' ', overflow: 0 },
    expected:
      'add src/new_module.py update src/main.py update src/subcommand.py ' +
      'update src/util/utils.py remove src/old_module.py',
  },
  {
    name: '--no-group with a path that needs quoting',
    items: [...FIVE, add('docs/WEBSITE DESIGN.md')],
    opts: { overflow: 0 },
    expected:
      'add "docs/WEBSITE DESIGN.md", add src/new_module.py, update src/main.py, ' +
      'update src/subcommand.py, update src/util/utils.py, remove src/old_module.py',
  },
  {
    name: '--no-group, quoted path, --item-separator=" "',
    items: [...FIVE, add('docs/WEBSITE DESIGN.md')],
    opts: { itemSeparator: ' ', overflow: 0 },
    expected:
      'add "docs/WEBSITE DESIGN.md" add src/new_module.py update src/main.py ' +
      'update src/subcommand.py update src/util/utils.py remove src/old_module.py',
  },
  {
    name: '--group=1 groups every action',
    items: FIVE,
    opts: { group: 1, overflow: 0 },
    expected:
      'add: src/new_module.py; update: src/main.py, src/subcommand.py, src/util/utils.py; ' +
      'remove: src/old_module.py',
  },
  {
    name: '--group=1 with --group-separator=" - "',
    items: FIVE,
    opts: { group: 1, groupSeparator: ' - ', overflow: 0 },
    expected:
      'add: src/new_module.py - update: src/main.py, src/subcommand.py, src/util/utils.py - ' +
      'remove: src/old_module.py',
  },
  {
    name: '--group=1 with --group-action-suffix=" "',
    items: FIVE,
    opts: { group: 1, groupSeparator: ' - ', groupActionSuffix: ' ', overflow: 0 },
    expected:
      'add src/new_module.py - update src/main.py, src/subcommand.py, src/util/utils.py - ' +
      'remove src/old_module.py',
  },
  {
    name: '--group=2 leaves single-item actions expanded',
    items: FIVE,
    opts: { group: 2, overflow: 0 },
    expected:
      'add src/new_module.py; update: src/main.py, src/subcommand.py, src/util/utils.py; ' +
      'remove src/old_module.py',
  },
  {
    name: '--group=3 with only two updates does not group',
    items: [update('src/main.py'), update('src/subcommand.py')],
    opts: { group: 3 },
    expected: 'update src/main.py, update src/subcommand.py',
  },
  {
    name: '--group=3 with only two updates, --and',
    items: [update('src/main.py'), update('src/subcommand.py')],
    opts: { group: 3, and: true },
    expected: 'update src/main.py and update src/subcommand.py',
  },
  {
    name: '--list-overflow=0 leaves overflow bullets unlimited',
    items: FIVE,
    opts: { listOverflow: 0 },
    expected: [
      'add src/new_module.py, update src/main.py',
      '',
      '- update src/subcommand.py, update src/util/utils.py, remove src/old_module.py',
    ].join('\n'),
  },
  {
    name: 'default overflow limits wrap the list',
    items: FIVE,
    expected: [
      'add src/new_module.py, update src/main.py',
      '',
      '- update src/subcommand.py, update src/util/utils.py',
      '- remove src/old_module.py',
    ].join('\n'),
  },
  {
    name: '--list-indent=2',
    items: FIVE,
    opts: { listIndent: 2 },
    expected: [
      'add src/new_module.py, update src/main.py',
      '',
      '  - update src/subcommand.py, update src/util/utils.py',
      '  - remove src/old_module.py',
    ].join('\n'),
  },
  {
    name: 'a long path is never broken, even past --list-overflow',
    items: [
      update('src/main.py'),
      update('src/subcommand.py'),
      update('src/util/utils.py'),
      remove('src/old_module.py'),
      add(LONG_NAME),
    ],
    opts: { overflow: 50, listOverflow: 72 },
    expected: [
      `add ${LONG_NAME}`,
      '',
      '- update src/main.py, update src/subcommand.py, update src/util/utils.py',
      '- remove src/old_module.py',
    ].join('\n'),
  },
  {
    name: 'a long path with spaces is quoted and still not broken',
    items: [
      update('src/main.py'),
      update('src/subcommand.py'),
      update('src/util/utils.py'),
      remove('src/old_module.py'),
      add(SPACED_LONG_NAME),
    ],
    opts: { overflow: 50, listOverflow: 72 },
    expected: [
      `add "${SPACED_LONG_NAME}"`,
      '',
      '- update src/main.py, update src/subcommand.py, update src/util/utils.py',
      '- remove src/old_module.py',
    ].join('\n'),
  },
  {
    name: "--quote-char='",
    items: [
      update('src/main.py'),
      update('src/subcommand.py'),
      update('src/util/utils.py'),
      remove('src/old_module.py'),
      add(SPACED_LONG_NAME),
    ],
    opts: { overflow: 50, listOverflow: 72, quoteChar: "'" },
    expected: [
      `add '${SPACED_LONG_NAME}'`,
      '',
      '- update src/main.py, update src/subcommand.py, update src/util/utils.py',
      '- remove src/old_module.py',
    ].join('\n'),
  },
  {
    name: '--list-max-items=1',
    items: FIVE,
    opts: { overflow: 50, listMaxItems: 1 },
    expected: [
      'add src/new_module.py, update src/main.py',
      '',
      '- update src/subcommand.py',
      '- update src/util/utils.py',
      '- remove src/old_module.py',
    ].join('\n'),
  },
  {
    name: '--list-max-groups=1 with --group=1',
    items: SIX,
    opts: { overflow: 39, listOverflow: 120, listMaxGroups: 1, group: 1 },
    expected: [
      'add: src/new_module.py',
      '',
      '- update: src/main.py, src/subcommand.py, src/util/helper.py, src/util/utils.py',
      '- remove: src/old_module.py',
    ].join('\n'),
  },
  {
    name: '--list-max-groups=1 with --group=2',
    items: SIX,
    opts: { overflow: 39, listOverflow: 120, listMaxGroups: 1, group: 2 },
    expected: [
      'add src/new_module.py',
      '',
      '- update: src/main.py, src/subcommand.py, src/util/helper.py, src/util/utils.py',
      '- remove src/old_module.py',
    ].join('\n'),
  },
  {
    name: '--list-max-groups=1 with --group=3',
    items: SIX,
    opts: { overflow: 39, listOverflow: 120, listMaxGroups: 1, group: 3 },
    expected: [
      'add src/new_module.py',
      '',
      '- update: src/main.py, src/subcommand.py, src/util/helper.py, src/util/utils.py',
      '- remove src/old_module.py',
    ].join('\n'),
  },
  {
    name: '--list-max-items=1 with --group=3',
    items: SIX,
    opts: { overflow: 39, listOverflow: 120, listMaxGroups: 1, listMaxItems: 1, group: 3 },
    expected: [
      'add src/new_module.py',
      '',
      '- update src/main.py',
      '- update src/subcommand.py',
      '- update src/util/helper.py',
      '- update src/util/utils.py',
      '- remove src/old_module.py',
    ].join('\n'),
  },
  {
    name: '--item-action-suffix=":"',
    items: SIX,
    opts: {
      overflow: 39,
      listOverflow: 120,
      listMaxGroups: 1,
      listMaxItems: 1,
      group: 3,
      itemActionSuffix: ':',
    },
    expected: [
      'add:src/new_module.py',
      '',
      '- update:src/main.py',
      '- update:src/subcommand.py',
      '- update:src/util/helper.py',
      '- update:src/util/utils.py',
      '- remove:src/old_module.py',
    ].join('\n'),
  },
];

/** Cases list items in PLAN.md's order; render() expects them already ordered. */
function sorted(items: Item[]): Item[] {
  return sortItems(items, DEFAULT_OPTIONS.actionOrder);
}

describe('PLAN.md examples', () => {
  for (const testCase of CASES) {
    it(testCase.name, () => {
      expect(render(sorted(testCase.items), testCase.opts)).toBe(testCase.expected);
    });
  }
});
