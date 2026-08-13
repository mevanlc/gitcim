# gitcim

Writes a commit message that says exactly what you staged. No LLM, no network, no
guessing at intent — `gitcim` reads `git diff --cached` and reports the mechanics.

```console
$ git add -A && gitcim
add src/parser.ts, update src/main.ts, rename old.md to new.md, remove legacy.ts, chmod +x run.sh
```

For messages that infer _why_ a change was made, see
[gitmsg](https://github.com/razakadam74/gitmsg). `gitcim` deliberately does the
blunt half of that job.

## Install

```bash
npm install -g gitcim
# or, without installing
npx gitcim
```

Requires Node 20+ and git.

## Usage

```bash
gitcim [OPTIONS] [--include [FILES...]] [--exclude [FILES...]]
```

The message goes to stdout, so pipe it wherever you want:

```bash
git commit -m "$(gitcim)"
gitcim --overflow=72 | git commit -F -
```

`--include` and `--exclude` take git pathspecs, so globs and pathspec magic work:

```bash
gitcim --include src docs --exclude 'src/vendor/*'
```

Naming a path that has changes but has not been staged is an error, not a silent
omission — the message would otherwise describe less than you asked for.

## Actions

| staged change          | message             |
| ---------------------- | ------------------- |
| new file               | `add path`          |
| modified               | `update path`       |
| deleted                | `remove path`       |
| renamed                | `rename old to new` |
| executable bit set     | `chmod +x path`     |
| executable bit cleared | `chmod -x path`     |

A change can produce two actions: editing a file _and_ flipping its executable bit
reports both `update` and `chmod +x`. A chmod that changes nothing produces nothing,
because git does not stage it.

## Options

### Wording

| flag                      | default                          | effect                                                            |
| ------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `--group=N`, `--no-group` | off                              | Collapse a run of N or more same-action items into `update: a, b` |
| `--and`, `--no-and`       | off                              | Join the last item with `and`                                     |
| `--item-separator=S`      | `", "`                           | Between items                                                     |
| `--group-separator=S`     | `"; "`                           | Between groups                                                    |
| `--item-action-suffix=S`  | `" "`                            | After an item's action                                            |
| `--group-action-suffix=S` | `": "`                           | After a group's action                                            |
| `--rename-separator=S`    | `" to "`                         | Between a rename's paths                                          |
| `--quote-char=C`          | `"`                              | Quotes paths containing whitespace                                |
| `--action-order=A,B,...`  | `add,update,rename,remove,chmod` | Order actions appear in                                           |

### Layout

| flag                  | default   | effect                                    |
| --------------------- | --------- | ----------------------------------------- |
| `--overflow=N`        | off       | Spill past N columns into a bulleted list |
| `--list-overflow=N`   | unlimited | Max width of a list line                  |
| `--list-indent=N`     | 4         | Spaces before each bullet                 |
| `--list-max-items=N`  | unlimited | Max items per list line                   |
| `--list-max-groups=N` | unlimited | Max groups per list line                  |

```console
$ gitcim --group=1
add: src/new_module.py; update: src/main.py, src/subcommand.py; remove: src/old_module.py

$ gitcim --overflow=50 --list-overflow=72
add src/new_module.py, update src/main.py

    - update src/subcommand.py, update src/util/utils.py
    - remove src/old_module.py
```

Packing is greedy and measures the line it is about to print. A single item is never
broken, so an unusually long path simply overruns the limit.

`devdocs/PLAN.md` carries the full set of worked examples; each one is a test case in
`tests/spec-examples.test.ts`.

## Exit codes

| code | meaning                                              |
| ---- | ---------------------------------------------------- |
| 0    | Message written to stdout                            |
| 1    | Nothing staged, or git failed                        |
| 2    | Bad usage, or an `--include` path that is not staged |

## Library

```ts
import { generate } from 'gitcim';

const message = await generate({ include: ['src'], format: { group: 2, overflow: 72 } });
```

`generate` accepts an injectable git runner, so it can be driven without spawning git.
`render`, `toItems` and `parseRaw` are exported for finer-grained use.

## Development

```bash
npm run typecheck && npm run lint && npm test
npm run build
```

## License

MIT
