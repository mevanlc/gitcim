/**
 * A deliberately small TOML reader.
 *
 * gitcim's configuration is a flat table of strings, non-negative integers,
 * booleans and one array of strings, so that is exactly what this parses.
 * Anything else — tables, floats, dates, multi-line strings — is reported as
 * unsupported rather than quietly mis-read, and every error names the line it
 * came from. The alternative is a runtime dependency for a dozen key-value
 * pairs.
 */

export type TomlValue = string | number | boolean | string[];

export class TomlError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(message);
    this.name = 'TomlError';
    this.line = line;
  }
}

const KEY_VALUE = /^([A-Za-z0-9_-]+)[ \t]*=[ \t]*/;
const INTEGER = /^[+-]?\d+$/;
const BARE_WORD = /^[^\s#,\]]+/;

/** Parse a flat TOML document into its key-value pairs. */
export function parseToml(text: string): Map<string, TomlValue> {
  const table = new Map<string, TomlValue>();

  const lines = text.replace(/^\uFEFF/, '').split('\n');
  for (const [index, raw] of lines.entries()) {
    const lineNo = index + 1;
    const line = raw.replace(/\r$/, '').trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('[')) throw new TomlError('tables are not supported', lineNo);

    const head = KEY_VALUE.exec(line);
    if (!head) throw new TomlError('expected "key = value"', lineNo);
    const key = head[1] ?? '';
    if (table.has(key)) throw new TomlError(`duplicate key "${key}"`, lineNo);

    const { value, rest } = parseValue(line.slice(head[0].length), lineNo);
    const trailing = rest.trim();
    if (trailing !== '' && !trailing.startsWith('#')) {
      throw new TomlError(`unexpected text after value: ${trailing}`, lineNo);
    }
    table.set(key, value);
  }

  return table;
}

interface Parsed<T> {
  value: T;
  rest: string;
}

function parseValue(src: string, lineNo: number): Parsed<TomlValue> {
  const s = src.trimStart();
  if (s.startsWith('"') || s.startsWith("'")) return parseString(s, lineNo);
  if (s.startsWith('[')) return parseArray(s, lineNo);

  const word = BARE_WORD.exec(s)?.[0] ?? '';
  if (word === 'true') return { value: true, rest: s.slice(word.length) };
  if (word === 'false') return { value: false, rest: s.slice(word.length) };
  if (INTEGER.test(word)) return { value: Number(word), rest: s.slice(word.length) };
  throw new TomlError(`unsupported value: ${word === '' ? s : word}`, lineNo);
}

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  f: '\f',
  b: '\b',
  '"': '"',
  "'": "'",
  '\\': '\\',
};

/** Basic strings honour escapes; literal (single-quoted) strings are taken as written. */
function parseString(s: string, lineNo: number): Parsed<string> {
  const quote = s[0];
  let out = '';
  let i = 1;

  while (i < s.length) {
    const ch = s[i] ?? '';
    if (ch === quote) return { value: out, rest: s.slice(i + 1) };

    if (quote === '"' && ch === '\\') {
      const esc = s[i + 1] ?? '';
      i += 2;
      if (esc === 'u') {
        const hex = s.slice(i, i + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new TomlError('bad \\u escape', lineNo);
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
        continue;
      }
      const mapped = ESCAPES[esc];
      if (mapped === undefined) throw new TomlError(`unsupported escape "\\${esc}"`, lineNo);
      out += mapped;
      continue;
    }

    out += ch;
    i += 1;
  }

  throw new TomlError('unterminated string', lineNo);
}

/** Single-line arrays of strings, which is the only array shape gitcim needs. */
function parseArray(s: string, lineNo: number): Parsed<string[]> {
  const items: string[] = [];
  let rest = s.slice(1);

  for (;;) {
    rest = rest.trimStart();
    if (rest.startsWith(']')) return { value: items, rest: rest.slice(1) };
    if (rest === '') throw new TomlError('unterminated array', lineNo);
    if (!rest.startsWith('"') && !rest.startsWith("'")) {
      throw new TomlError('arrays may only hold strings', lineNo);
    }

    const parsed = parseString(rest, lineNo);
    items.push(parsed.value);
    rest = parsed.rest.trimStart();
    if (rest.startsWith(',')) rest = rest.slice(1);
    else if (!rest.startsWith(']')) throw new TomlError('expected "," or "]"', lineNo);
  }
}
