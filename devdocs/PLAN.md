# gitcim

command line tool kind of like ~/p/my/gitmsg except the messages are more mechanical

Every detailed-rendering example below is transcribed as a test case in
`tests/spec-examples.test.ts`; the summary ladder is covered by `tests/summary.test.ts`,
so this file and the implementation cannot drift apart silently.

Items are ordered by `--action-order`, which defaults to `add,update,remove,rename,copy,chmod`.
Within one action, paths sort in byte order.

## usage

```bash
gitcim [OPTIONS] [--include [FILES...]] [--exclude [FILES...]] # including unstaged files gives an error message on stderr
```

## example generated messages

```bash
# edited the content of README.md (git status = modified)
update README.md
```

```bash
# renamed README.md to README_NEW.md (git status = renamed)
rename README.md to README_NEW.md

# # ---------------------------------------------------------------

# renamed README.md to README_NEW.md (git status = renamed)
# --rename-separator=' -> '
rename README.md -> README_NEW.md
```

```bash
# copied README.md to README_COPY.md (git status = copied)
copy README.md to README_COPY.md

# # ---------------------------------------------------------------

# copied README.md to README_COPY.md, then edited README_COPY.md
# # the copy comes first: README_COPY.md does not exist until it happens
# --overflow=0
copy README.md to README_COPY.md, update README_COPY.md
```

A rename subsumes content edits made during the move, so an edited rename still
produces only `rename <old> to <new>`. Copies retain the follow-up `update`, because
it distinguishes an unchanged duplicate from one edited after it was made.

```bash
# # ls -l scripts/install.sh
# # -rw-r--r-- 1 user group 1234 Jun 1 12:34 scripts/install.sh
# chmod u+x scripts/install.sh
# --overflow=0
remove plans/COMPLETED.md, chmod +x scripts/install.sh

# # ---------------------------------------------------------------

# # ls -l scripts/install.sh
# # -rwxr--r-- 1 user group 1234 Jun 1 12:34 scripts/install.sh
# chmod u-x scripts/install.sh
# --overflow=0
remove plans/COMPLETED.md, chmod -x scripts/install.sh

# # ---------------------------------------------------------------

# # ls -l scripts/install.sh
# # -rwxr--r-- 1 user group 1234 Jun 1 12:34 scripts/install.sh
# chmod u+x scripts/install.sh
remove plans/COMPLETED.md
```

```bash
add README.md
```

```bash
# --and
update docs/DOCS.md and remove plans/PLAN.md
```

```bash
# --no-and # default behavior
# --overflow=0
add test/test.py, update docs/DOCS.md, remove plans/PLAN.md

# # ---------------------------------------------------------------

# --and
# --overflow=0
add test/test.py, update docs/DOCS.md, and remove plans/PLAN.md

# # ---------------------------------------------------------------

# --and --no-oxford-and
# --overflow=0
add test/test.py, update docs/DOCS.md and remove plans/PLAN.md
```

```bash
# --no-group
# --overflow=0
add src/new_module.py, update src/main.py, update src/subcommand.py, update src/util/utils.py, remove src/old_module.py

# # ---------------------------------------------------------------

# --no-group
# --item-separator=' '
# --overflow=0
add src/new_module.py update src/main.py update src/subcommand.py update src/util/utils.py remove src/old_module.py
```

```bash
# --no-group
# --overflow=0
add "docs/WEBSITE DESIGN.md", add src/new_module.py, update src/main.py, update src/subcommand.py, update src/util/utils.py, remove src/old_module.py

# # ---------------------------------------------------------------

# --no-group
# --item-separator=' '
# --overflow=0
add "docs/WEBSITE DESIGN.md" add src/new_module.py update src/main.py update src/subcommand.py update src/util/utils.py remove src/old_module.py
```

```bash
# --group=1 # group action-categories with 1 or more items
# --overflow=0
add: src/new_module.py; update: src/main.py, src/subcommand.py, src/util/utils.py; remove: src/old_module.py

# # ---------------------------------------------------------------

# --group=1 # group action-categories with 1 or more items
# --group-separator=' - '
# --overflow=0
add: src/new_module.py - update: src/main.py, src/subcommand.py, src/util/utils.py - remove: src/old_module.py

# --group=1 # group action-categories with 1 or more items
# --group-separator=' - '
# --group-action-suffix=' '
# --overflow=0
add src/new_module.py - update src/main.py, src/subcommand.py, src/util/utils.py - remove src/old_module.py
```

```bash
# --group=2 # group action-categories with 2 or more items
# --overflow=0
add src/new_module.py; update: src/main.py, src/subcommand.py, src/util/utils.py; remove src/old_module.py
```

```bash
# # in this example only two files were updated, so grouping is not used
# --group=3 # group categories with 3 or more items
update src/main.py, update src/subcommand.py

# # ---------------------------------------------------------------

# # in this example only two files were updated, so grouping is not used
# --group=3 # group categories with 3 or more items
# --and
update src/main.py and update src/subcommand.py
```

```bash
# --list-overflow=0
add src/new_module.py, update src/main.py

- update src/subcommand.py, update src/util/utils.py, remove src/old_module.py

# # --------------------------------------------------------------

# defaults: --overflow=50, --list-overflow=72
add src/new_module.py, update src/main.py

- update src/subcommand.py, update src/util/utils.py
- remove src/old_module.py

# # --------------------------------------------------------------

# defaults: --overflow=50, --list-overflow=72
# --list-indent=2
add src/new_module.py, update src/main.py

  - update src/subcommand.py, update src/util/utils.py
  - remove src/old_module.py
```

```bash
# --overflow=50
# --list-overflow=72
add src/new_module_with_a_very_long_name_that_exceeds_the_list_overflow_limit_but_we_dont_separate_action_prefix_from_filenames_and_we_dont_break_inside_filenames.py

- update src/main.py, update src/subcommand.py, update src/util/utils.py
- remove src/old_module.py
```

```bash
# --overflow=50
# --list-overflow=72
add "src/new_module_with_a_very_long_name with spaces that_exceeds_the_list_overflow_limit_but_we_dont_separate_action_prefix_from_filenames_and_we_dont_break_inside_filenames.py"

- update src/main.py, update src/subcommand.py, update src/util/utils.py
- remove src/old_module.py

# # --------------------------------------------------------------

# --overflow=50
# --list-overflow=72
# --quote-char="'"
add 'src/new_module_with_a_very_long_name with spaces that_exceeds_the_list_overflow_limit_but_we_dont_separate_action_prefix_from_filenames_and_we_dont_break_inside_filenames.py'

- update src/main.py, update src/subcommand.py, update src/util/utils.py
- remove src/old_module.py
```

```bash
# --overflow=50
# --list-max-items=1
add src/new_module.py, update src/main.py

- update src/subcommand.py
- update src/util/utils.py
- remove src/old_module.py
```

```bash
# --overflow=39
# --list-overflow=120
# --list-max-groups=1
# --group=1
add: src/new_module.py

- update: src/main.py, src/subcommand.py, src/util/helper.py, src/util/utils.py
- remove: src/old_module.py

# # --------------------------------------------------------------

# --overflow=39
# --list-overflow=120
# --list-max-groups=1
# --group=2
add src/new_module.py

- update: src/main.py, src/subcommand.py, src/util/helper.py, src/util/utils.py
- remove src/old_module.py

# # --------------------------------------------------------------

# --overflow=39
# --list-overflow=120
# --list-max-groups=1
# --group=3
add src/new_module.py

- update: src/main.py, src/subcommand.py, src/util/helper.py, src/util/utils.py
- remove src/old_module.py

# # --------------------------------------------------------------

# --overflow=39
# --list-overflow=120
# --list-max-groups=1
# --list-max-items=1
# --group=3
add src/new_module.py

- update src/main.py
- update src/subcommand.py
- update src/util/helper.py
- update src/util/utils.py
- remove src/old_module.py

# # --------------------------------------------------------------

# --overflow=39
# --list-overflow=120
# --list-max-groups=1
# --list-max-items=1
# --group=3
# --item-action-suffix=':'
add:src/new_module.py

- update:src/main.py
- update:src/subcommand.py
- update:src/util/helper.py
- update:src/util/utils.py
- remove:src/old_module.py
```

## layout rules

The rules the examples above are generated by:

- **Chunks.** A line is scanned into maximal runs of the same action. A run of
  `--group` or more items collapses behind a shared label (`update: a, b`); shorter
  runs stay expanded (`update a, update b`), and adjacent expanded runs merge into a
  single comma-joined chunk. Chunks are joined by `--group-separator`.
  The threshold is measured against the items _on that line_, so a category split
  across the first line and a bullet can render collapsed in one place and expanded
  in the other.
- **Packing** is greedy and measures the string it is actually going to print. A line
  always carries at least one item, so a single long path overruns the limit rather
  than being broken.
- **Grouped body lines.** `--group-group[=S]` renders each contiguous body action run
  behind one label; its bare value is `"  - "`. Wrapped operand-only lines begin with S.
  `--group-group-cont` ends every nonfinal line in the run, and
  `--group-group-item-sep` joins operands on the same line. All three strings are used
  literally. Grouped lines still honor `--list-overflow` and `--list-max-items`.
- **`--and`** replaces the last separator of the last line, at whatever level that
  separator falls. Two segments read `a and b`; three or more keep the serial comma.
- **Quoting** applies to a path containing whitespace or the quote character itself;
  an embedded quote character is backslash-escaped.

## summaries

`--summarize[=overflow|always|never]` defaults to `never`; the bare flag supplies
`overflow`. Overflow mode engages when the ordinary one-line rendering is wider than
`--overflow`, while always mode engages unconditionally. A summary replaces the first
line but does not discard information: every action is rendered again in a bulleted
body using the ordinary list limits. `--exclude-body` is a final postprocessing step
that keeps only the first line of either message form.

The initial summary retains paths for singleton actions and uses counts for repeated
actions:

```text
add 2 files, update CODE_OF_CONDUCT.md, remove 4 files, rename a.c to b.c, copy 2 files, chmod +x scripts/script.sh, chmod -x scripts/script2.sh
```

If that exceeds `--overflow`, the following candidates are tried in order. Each
right-to-left step preserves more information than the ones below it:

```text
add 2 files, update 1 file, remove 4 files, rename 1 file, copy 2 files, chmod 2 files
add 2 files, update 3 files, remove 4 files, rename 1 file, copy 2 files
add 4 files, update 3 files, remove 4 files, rename 1 file
add 4 files, update 3 files, remove 4 files, mv 1 file
add 4 files, update 3 files, rm 4 files, mv 1 file
add 4 files, update 3 files, rm 4 files, mv 1
add 4 files, update 3 files, rm 4, mv 1
add 4 files, update 3, rm 4, mv 1
add 4, update 3, rm 4, mv 1
add 4, update 3, rm 4, R 1
add 4, update 3, D 4, R 1
add 4, M 3, D 4, R 1
A 4, M 3, D 4, R 1
A 4, M 3, D 4, R1
A 4, M 3, D4, R1
A 4, M3, D4, R1
A4, M3, D4, R1
A4 M3 D4 R1
A4M3D4R1
12
```

The folds are action counts, not unique-path counts: chmod joins update, copy joins
add, and the final number is the total number of actions. If its decimal representation
still does not fit, rendering fails with a usage error rather than exceeding the first
line limit.

## configuration

`OPTION_SPECS` in `src/options.ts` is the one place every knob is declared. Defaults,
the `parseArgs` table, `buildFormat`, `--help`, the generated config file and its JSON
schema are all derived from it: a spec's `flag` doubles as its config key. A
compile-time guard in the same file fails the build if an `Options` field is added
without a spec, so nothing can be introduced that the config file silently does not
know about.

Precedence runs defaults < config file < flags.

```bash
gitcim --config-init        # write a config file that sets every property to its default
gitcim --config-init-unset  # the same file, with every setter line commented out
gitcim --config-reset       # overwrite the config file with defaults
gitcim --config-edit        # open the config file in $GITCIM_EDITOR / $VISUAL / $EDITOR
gitcim --config-print       # print the configuration in effect
```

The `--config-*` commands are mutually exclusive: each ends the run, so two of them
cannot both be what was meant.

Both forms emit an explanatory comment block above each property. Prose uses `##`;
a disabled setter uses a bare `#`, so enabling one is a one-character edit.

```toml
## Between items.
## A string.
## Flag: --item-separator=S
item-separator = ", "
```

`$GITCIM_CONFIG_FILE` names the file, defaulting to
`${XDG_CONFIG_HOME:-~/.config}/gitcim/config.toml`. `-` means stdout when writing and
stdin when reading:

| command                                               | effect                             |
| ----------------------------------------------------- | ---------------------------------- |
| `GITCIM_CONFIG_FILE=- gitcim --config-init`           | config to stdout                   |
| `GITCIM_CONFIG_FILE=/tmp/t.toml gitcim --config-init` | config written to `/tmp/t.toml`    |
| `GITCIM_CONFIG_FILE=/tmp/t.toml gitcim`               | runs with `/tmp/t.toml`'s settings |
| `gitcim --config-write-schema <path\|->`              | JSON schema for the config file    |

A file the environment names must exist, be readable, parse, and match the schema —
each failure is an error with the offending line, not a silent fallback to defaults.
The default path is optional, since having no config is the normal state.
`--config-init` refuses to overwrite an existing config; `--config-write-schema`
overwrites freely, since the schema is derived and the path was just named.

`src/toml.ts` reads a deliberate subset — one flat table of strings, non-negative
integers, booleans and arrays of strings, which is the whole config surface. Tables,
floats and dates are errors rather than a runtime dependency.

### editing and printing

`--config-edit` creates the file from `--config-init-unset` when it does not exist —
commented out, so opening an editor and quitting leaves gitcim on its defaults,
including ones that change in a later version — then runs the editor and parses the
result, so a typo is reported while the editor is still in reach. The editor string is
split on whitespace (`code --wait` works); it is not run through a shell, so an editor
path containing a space needs a wrapper script, as it does for git's `core.editor`.
`GITCIM_CONFIG_FILE=-` has no file to edit and is an error.

`--config-print` renders the effective options — defaults, then the file, then this
run's flags — through the same generator, so its output is itself a valid config file.
Each setting carries a `## Source:` line naming `default`, the config file's path, or
the flag that set it (`--no-group` when that is what was passed).
