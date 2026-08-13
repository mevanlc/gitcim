import type { ActionSlot, Options } from './types.js';

export const ACTION_SLOTS = [
  'add',
  'update',
  'remove',
  'rename',
  'copy',
  'chmod',
] as const satisfies readonly ActionSlot[];

/** Which `--help` section — and which config-file block — a flag belongs to. */
export type Section = 'Wording' | 'Layout';

export const SECTIONS: readonly Section[] = ['Wording', 'Layout'];

/** The Options fields of a given value type, so each spec's default is checked. */
type KeysOfType<T> = { [K in keyof Options]: Options[K] extends T ? K : never }[keyof Options];

interface SpecBase {
  /** Long flag name without dashes. Doubles as the config-file key. */
  flag: string;
  help: string;
  section: Section;
  /** How the default reads in help, when the raw value would not explain itself. */
  defaultLabel?: string;
}

/**
 * Every knob, once. Defaults, `parseArgs` wiring, `--help` and the config file
 * are all derived from this table, so a new option is one entry rather than an
 * edit in five places.
 *
 * A `negatable` flag resets its option to off: `false` for a switch, `0` for a
 * count.
 */
export type OptionSpec =
  | (SpecBase & {
      kind: 'string';
      key: KeysOfType<string>;
      default: string;
      placeholder: string;
    })
  | (SpecBase & {
      kind: 'count';
      key: KeysOfType<number>;
      default: number;
      placeholder: string;
      negatable?: string;
    })
  | (SpecBase & {
      kind: 'boolean';
      key: KeysOfType<boolean>;
      default: boolean;
      negatable?: string;
    })
  | (SpecBase & {
      kind: 'order';
      key: 'actionOrder';
      default: readonly ActionSlot[];
      placeholder: string;
    });

/**
 * Defaults are chosen so that every example in devdocs/PLAN.md reproduces from
 * the flags it names alone.
 */
export const OPTION_SPECS = [
  {
    kind: 'count',
    key: 'group',
    flag: 'group',
    negatable: 'no-group',
    placeholder: 'N',
    default: 0,
    defaultLabel: 'off',
    section: 'Wording',
    help: 'Collapse runs of N or more same-action items into "update: a, b"',
  },
  {
    kind: 'boolean',
    key: 'and',
    flag: 'and',
    negatable: 'no-and',
    default: false,
    defaultLabel: 'off',
    section: 'Wording',
    help: 'Join the last item with "and"',
  },
  {
    kind: 'boolean',
    key: 'oxfordAnd',
    flag: 'oxford-and',
    negatable: 'no-oxford-and',
    default: true,
    defaultLabel: 'on',
    section: 'Wording',
    help: 'Use serial comma before "and"',
  },
  {
    kind: 'string',
    key: 'itemSeparator',
    flag: 'item-separator',
    placeholder: 'S',
    default: ', ',
    section: 'Wording',
    help: 'Between items',
  },
  {
    kind: 'string',
    key: 'groupSeparator',
    flag: 'group-separator',
    placeholder: 'S',
    default: '; ',
    section: 'Wording',
    help: 'Between groups',
  },
  {
    kind: 'string',
    key: 'itemActionSuffix',
    flag: 'item-action-suffix',
    placeholder: 'S',
    default: ' ',
    section: 'Wording',
    help: "After an item's action",
  },
  {
    kind: 'string',
    key: 'groupActionSuffix',
    flag: 'group-action-suffix',
    placeholder: 'S',
    default: ': ',
    section: 'Wording',
    help: "After a group's action",
  },
  {
    kind: 'string',
    key: 'renameSeparator',
    flag: 'rename-separator',
    placeholder: 'S',
    default: ' to ',
    section: 'Wording',
    help: "Between a rename's or copy's paths",
  },
  {
    kind: 'string',
    key: 'quoteChar',
    flag: 'quote-char',
    placeholder: 'C',
    default: '"',
    defaultLabel: '"',
    section: 'Wording',
    help: 'Quotes paths containing whitespace',
  },
  {
    kind: 'order',
    key: 'actionOrder',
    flag: 'action-order',
    placeholder: 'A,B,...',
    default: ACTION_SLOTS,
    section: 'Wording',
    help: `Order of ${ACTION_SLOTS.join(', ')}`,
  },
  {
    kind: 'count',
    key: 'overflow',
    flag: 'overflow',
    placeholder: 'N',
    default: 0,
    defaultLabel: 'off',
    section: 'Layout',
    help: 'Spill past N columns into a list',
  },
  {
    kind: 'count',
    key: 'listOverflow',
    flag: 'list-overflow',
    placeholder: 'N',
    default: 0,
    defaultLabel: 'unlimited',
    section: 'Layout',
    help: 'Max width of a list line',
  },
  {
    kind: 'count',
    key: 'listIndent',
    flag: 'list-indent',
    placeholder: 'N',
    default: 4,
    section: 'Layout',
    help: 'Spaces before each list bullet',
  },
  {
    kind: 'count',
    key: 'listMaxItems',
    flag: 'list-max-items',
    placeholder: 'N',
    default: 0,
    defaultLabel: 'unlimited',
    section: 'Layout',
    help: 'Max items per list line',
  },
  {
    kind: 'count',
    key: 'listMaxGroups',
    flag: 'list-max-groups',
    placeholder: 'N',
    default: 0,
    defaultLabel: 'unlimited',
    section: 'Layout',
    help: 'Max groups per list line',
  },
] as const satisfies readonly OptionSpec[];

type SpeccedKey = (typeof OPTION_SPECS)[number]['key'];

/** Compile-time guard: an Options field with no spec fails the constraint here. */
export type AllOptionsSpecced<T extends never = Exclude<keyof Options, SpeccedKey>> = T;

/** Look a spec up by its flag name, which is also its config-file key. */
export const SPECS_BY_FLAG: ReadonlyMap<string, OptionSpec> = new Map(
  OPTION_SPECS.map((spec) => [spec.flag, spec]),
);

export const DEFAULT_OPTIONS: Options = Object.freeze(
  Object.fromEntries(OPTION_SPECS.map((spec) => [spec.key, spec.default])),
) as unknown as Options;

/** How a flag is written in help and in the config file: `--list-indent=N`, `--and, --no-and`. */
export function flagSyntax(spec: OptionSpec): string {
  const value = spec.kind === 'boolean' ? '' : `=${spec.placeholder}`;
  const negated = 'negatable' in spec && spec.negatable ? `, --${spec.negatable}` : '';
  return `--${spec.flag}${value}${negated}`;
}

/** What a `--no-…` flag resets its option to. */
export function negatedValue(spec: OptionSpec): boolean | number {
  return spec.kind === 'boolean' ? false : 0;
}

/**
 * How a default reads in `--help`. Presentational only — a generated config
 * file should serialise `spec.default` itself rather than this string.
 */
export function formatDefault(spec: OptionSpec): string {
  if (spec.defaultLabel !== undefined) return spec.defaultLabel;
  if (spec.kind === 'string') return JSON.stringify(spec.default);
  if (spec.kind === 'order') return spec.default.join(',');
  return String(spec.default);
}

export function resolveOptions(overrides: Partial<Options> = {}): Options {
  return { ...DEFAULT_OPTIONS, ...overrides };
}

/** Parse an `--action-order` value such as `add,update,remove,rename,copy,chmod`. */
export function parseActionOrder(value: string): ActionSlot[] {
  const slots = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const seen = new Set<string>();
  for (const slot of slots) {
    if (!ACTION_SLOTS.includes(slot as ActionSlot)) {
      throw new Error(`unknown action "${slot}" (expected one of ${ACTION_SLOTS.join(', ')})`);
    }
    if (seen.has(slot)) throw new Error(`duplicate action "${slot}" in --action-order`);
    seen.add(slot);
  }

  // Unnamed slots keep their default relative position, appended at the end.
  return [...(slots as ActionSlot[]), ...ACTION_SLOTS.filter((s) => !seen.has(s))];
}
