import { describe, expect, it } from 'vitest';
import { parseToml, TomlError } from '../src/toml.js';

/** Parse and throw away the Map wrapper, for readable assertions. */
function parse(text: string): Record<string, unknown> {
  return Object.fromEntries(parseToml(text));
}

describe('parseToml', () => {
  it('reads the value types gitcim uses', () => {
    expect(
      parse(`
        name = "value"
        count = 4
        flag = true
        off = false
        list = ["add", "update"]
      `),
    ).toEqual({
      name: 'value',
      count: 4,
      flag: true,
      off: false,
      list: ['add', 'update'],
    });
  });

  it('ignores blank lines, comments and a BOM', () => {
    expect(parse('\uFEFF# leading\n\n## doc\ngroup = 1 # trailing\n')).toEqual({ group: 1 });
  });

  it('keeps a # that is inside a string', () => {
    expect(parse('sep = " # "')).toEqual({ sep: ' # ' });
  });

  it('handles escapes in basic strings and none in literal ones', () => {
    expect(parse('a = "x\\ty"')).toEqual({ a: 'x\ty' });
    expect(parse('a = "\\u0041"')).toEqual({ a: 'A' });
    expect(parse('a = "say \\"hi\\""')).toEqual({ a: 'say "hi"' });
    expect(parse("a = 'x\\ty'")).toEqual({ a: 'x\\ty' });
  });

  it('accepts a signed integer and CRLF line endings', () => {
    expect(parse('a = -3\r\nb = +3\r\n')).toEqual({ a: -3, b: 3 });
  });

  it('accepts an array spread with a trailing comma', () => {
    expect(parse('list = [ "a", "b", ]')).toEqual({ list: ['a', 'b'] });
    expect(parse('list = []')).toEqual({ list: [] });
  });

  it.each([
    ['[table]\n', 'tables are not supported', 1],
    ['group\n', 'expected "key = value"', 1],
    ['group = 1\ngroup = 2\n', 'duplicate key "group"', 2],
    ['a = 1.5\n', 'unsupported value: 1.5', 1],
    ['a = "unclosed\n', 'unterminated string', 1],
    ['a = "x" y\n', 'unexpected text after value: y', 1],
    ['a = ["x",\n', 'unterminated array', 1],
    ['a = [1]\n', 'arrays may only hold strings', 1],
    ['a = ["x" "y"]\n', 'expected "," or "]"', 1],
    ['a = "\\q"\n', 'unsupported escape "\\q"', 1],
    ['a = "\\uZZZZ"\n', 'bad \\u escape', 1],
  ])('rejects %j', (text, message, line) => {
    expect(() => parseToml(text)).toThrow(TomlError);
    try {
      parseToml(text);
    } catch (err) {
      expect((err as TomlError).message).toBe(message);
      expect((err as TomlError).line).toBe(line);
    }
  });
});
