# gitcim

Writes a commit message that says exactly what you staged. No LLM, no network, no
guessing at intent — `gitcim` reads `git diff --cached` and reports the mechanics.

```console
$ git add -A && gitcim
add src/parser.ts, update src/main.ts

- remove legacy.ts, rename old.md to new.md, chmod +x run.sh
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

`gitcim --help` lists every flag with its default; `gitcim --version` prints the
version.

## Actions

| staged change          | message                 |
| ---------------------- | ----------------------- |
| new file               | `add <path>`            |
| modified               | `update <path>`         |
| deleted                | `remove <path>`         |
| renamed                | `rename <old> to <new>` |
| copied                 | `copy <old> to <new>`   |
| executable bit set     | `chmod +x <path>`       |
| executable bit cleared | `chmod -x <path>`       |

A change can produce two actions: editing a file _and_ flipping its executable bit
reports both `update` and `chmod +x`. A chmod that changes nothing produces nothing,
because git does not stage it. A rename subsumes any content edits made during the
move, while a copy that was also edited reports the `copy` first and the `update`
after it, whatever `--action-order` says, since the new path does not exist until
then. A renamed file can still report a separate `chmod` action.

Renames and copies come from git's own detection, asked for explicitly so the message
does not depend on the repository's `diff.renames`. Copies are looked for the thorough
way (`--find-copies-harder`), because the ordinary `cp a b && git add b` is invisible
to anything less.

## Options

### Wording

| flag                              | default                               | effect                                                            |
| --------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| `--group=N`, `--no-group`         | off                                   | Collapse a run of N or more same-action items into `update: a, b` |
| `--and`, `--no-and`               | off                                   | Join the last item with `and`                                     |
| `--oxford-and`, `--no-oxford-and` | on                                    | Use serial comma before `"and"`                                   |
| `--item-separator=S`              | `", "`                                | Between items                                                     |
| `--group-separator=S`             | `"; "`                                | Between groups                                                    |
| `--item-action-suffix=S`          | `" "`                                 | After an item's action                                            |
| `--group-action-suffix=S`         | `": "`                                | After a group's action                                            |
| `--rename-separator=S`            | `" to "`                              | Between a rename's or copy's paths                                |
| `--quote-char=C`                  | `"`                                   | Quotes paths containing whitespace                                |
| `--action-order=A,B,...`          | `add,update,remove,rename,copy,chmod` | Order actions appear in                                           |

### Layout

| flag                       | default   | effect                                          |
| -------------------------- | --------- | ----------------------------------------------- |
| `--summarize[=MODE]`       | never     | Summarize on overflow, always, or never         |
| `--exclude-body`           | off       | Keep only the generated message's first line    |
| `--group-group[=S]`        | off       | Group body paths; S prefixes continuation lines |
| `--group-group-cont=S`     | `""`      | After each grouped body line that continues     |
| `--group-group-item-sep=S` | `", "`    | Between paths on one grouped body line          |
| `--overflow=N`             | 50        | Spill past N columns into a bulleted list       |
| `--list-overflow=N`        | 72        | Max width of a list line                        |
| `--list-indent=N`          | 0         | Spaces before each bullet                       |
| `--list-max-items=N`       | unlimited | Max items per list line                         |
| `--list-max-groups=N`      | unlimited | Max groups per list line                        |

```console
$ gitcim --group=1 --overflow=0
add: src/new_module.py; update: src/main.py, src/subcommand.py; remove: src/old_module.py

$ gitcim
add src/new_module.py, update src/main.py

- update src/subcommand.py, update src/util/utils.py
- remove src/old_module.py
```

Packing is greedy and measures the line it is about to print. A single item is never
broken, so an unusually long path simply overruns the limit.

Bare `--group-group` groups each action in the body and prefixes wrapped operands with
`"  - "`. An explicit value replaces that prefix. `--group-group-cont` is appended to
every nonfinal line in an action group, while `--group-group-item-sep` joins operands
that fit on the same physical line. These strings are used exactly as supplied.

### Summaries

Bare `--summarize` means `--summarize=overflow`: summarize only when the ordinary
one-line message would exceed `--overflow`. `always` always summarizes and `never`
never does. When summarization engages, line one is the summary and the body still
contains every detailed action:

```text
add 2 files, update CODE_OF_CONDUCT.md, remove 4 files, rename a.c to b.c, copy 2 files, chmod +x scripts/script.sh, chmod -x scripts/script2.sh

- add src/a.c, add src/b.c, update CODE_OF_CONDUCT.md, remove old-1.c
- remove old-2.c, remove old-3.c, remove old-4.c, rename a.c to b.c
- copy source-1.c to copy-1.c, copy source-2.c to copy-2.c
- chmod +x scripts/script.sh, chmod -x scripts/script2.sh
```

If the summary itself exceeds `--overflow`, gitcim progressively compresses from
right to left. It converts paths to counts, folds chmods into updates and copies into
adds, shortens labels and units, uses Git status letters, removes separators, and
finally falls back to the total action count. Representative forms are:

```text
add 2 files, update 1 file, remove 4 files, rename 1 file, copy 2 files, chmod 2 files
add 4 files, update 3 files, remove 4 files, rename 1 file
add 4, update 3, rm 4, mv 1
A 4, M 3, D 4, R 1
A4M3D4R1
12
```

If even the total does not fit, gitcim exits with a usage error. `--exclude-body` is
applied last and truncates either a summarized or ordinary message to its first line.

`devdocs/PLAN.md` carries the full set of worked examples; each one is a test case in
`tests/spec-examples.test.ts`.

## Configuration

Every option above can be set in a TOML file, using the flag's own name as the key.
Flags override the file, which overrides the defaults.

```bash
gitcim --config-init         # write a config file of defaults, fully commented
gitcim --config-init-unset   # the same file, with every setting commented out
gitcim --config-edit         # open the config file in an editor, then check it
gitcim --config-print        # print the settings this run would use, and their source
gitcim --config-reset        # overwrite the config file with the defaults
```

```toml
## Collapse runs of N or more same-action items into "update: a, b".
## A non-negative integer; 0 means off.
## Flag: --group=N, --no-group
group = 0
```

The prose uses `##` and a disabled setting uses a bare `#`, so turning one on in an
`--config-init-unset` file means deleting a single character.

The file lives at `${XDG_CONFIG_HOME:-~/.config}/gitcim/config.toml`. Set
`GITCIM_CONFIG_FILE` to use another path, or `-` to read the config from stdin and
to write generated files to stdout:

```bash
GITCIM_CONFIG_FILE=./release.toml gitcim
GITCIM_CONFIG_FILE=- gitcim --config-init > gitcim.toml
```

A file named by `GITCIM_CONFIG_FILE` must exist; the default path is optional.
`--config-init` will not overwrite an existing config — `--config-reset` is the
command that does. Unknown settings, wrong types and syntax errors are reported with
their line and stop the run rather than being skipped.

`--config-edit` opens the file in `$GITCIM_EDITOR`, `$VISUAL` or `$EDITOR`, creating
it commented-out first if it does not exist, and parses what comes back so a typo
surfaces while the editor is still open. `--config-print` writes the whole
configuration — defaults, then the file, then this run's flags — to stdout as a config
file, with each setting's source noted above it:

```toml
## Between items.
## A string.
## Flag: --item-separator=S
## Source: --item-separator
item-separator = " | "
```

`gitcim --config-write-schema PATH` (or `-`) writes a JSON Schema for the file,
generated from the same option table, for editors that check TOML against one.

Only a small TOML subset is read: one flat table of strings, non-negative integers,
booleans and arrays of strings. Sections, floats and dates are errors.

## Exit codes

| code | meaning                                                         |
| ---- | --------------------------------------------------------------- |
| 0    | Message written to stdout                                       |
| 1    | Nothing staged, or git failed                                   |
| 2    | Bad usage, a bad config file, or an `--include` path not staged |

## Library

```ts
import { generate } from 'gitcim';

const message = await generate({ include: ['src'], format: { group: 2, overflow: 72 } });
```

`generate` accepts an injectable git runner, so it can be driven without spawning git.
It does not read the config file — that is the CLI's job — but `loadConfig`,
`parseConfig`, `renderConfig` and `configSchema` are exported alongside `render`,
`toItems` and `parseRaw` for finer-grained use.

## Development

```bash
npm run typecheck && npm run lint && npm test
npm run build
```

## License

Apache-2.0
