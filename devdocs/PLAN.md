# gitcim

command line tool kind of like ~/p/my/gitmsg except the messages are more mechanical

Every example below is transcribed as a test case in `tests/spec-examples.test.ts`, so
this file and the implementation cannot drift apart silently.

Items are ordered by `--action-order`, which defaults to `add,update,rename,remove,chmod`.
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
# # ls -l scripts/install.sh
# # -rw-r--r-- 1 user group 1234 Jun 1 12:34 scripts/install.sh
# chmod u+x scripts/install.sh
remove plans/COMPLETED.md, chmod +x scripts/install.sh

# # ---------------------------------------------------------------

# # ls -l scripts/install.sh
# # -rwxr--r-- 1 user group 1234 Jun 1 12:34 scripts/install.sh
# chmod u-x scripts/install.sh
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
add test/test.py, update docs/DOCS.md, remove plans/PLAN.md

# # ---------------------------------------------------------------

# --and
add test/test.py, update docs/DOCS.md, and remove plans/PLAN.md
```

```bash
# --no-group
add src/new_module.py, update src/main.py, update src/subcommand.py, update src/util/utils.py, remove src/old_module.py

# # ---------------------------------------------------------------

# --no-group
# --item-separator=' '
add src/new_module.py update src/main.py update src/subcommand.py update src/util/utils.py remove src/old_module.py
```

```bash
# --no-group
add "docs/WEBSITE DESIGN.md", add src/new_module.py, update src/main.py, update src/subcommand.py, update src/util/utils.py, remove src/old_module.py

# # ---------------------------------------------------------------

# --no-group
# --item-separator=' '
add "docs/WEBSITE DESIGN.md" add src/new_module.py update src/main.py update src/subcommand.py update src/util/utils.py remove src/old_module.py
```

```bash
# --group=1 # group action-categories with 1 or more items
add: src/new_module.py; update: src/main.py, src/subcommand.py, src/util/utils.py; remove: src/old_module.py

# # ---------------------------------------------------------------

# --group=1 # group action-categories with 1 or more items
# --group-separator=' - '
add: src/new_module.py - update: src/main.py, src/subcommand.py, src/util/utils.py - remove: src/old_module.py

# --group=1 # group action-categories with 1 or more items
# --group-separator=' - '
# --group-action-suffix=' '
add src/new_module.py - update src/main.py, src/subcommand.py, src/util/utils.py - remove src/old_module.py
```

```bash
# --group=2 # group action-categories with 2 or more items
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
# --overflow=50
add src/new_module.py, update src/main.py

    - update src/subcommand.py, update src/util/utils.py, remove src/old_module.py

# # --------------------------------------------------------------

# --overflow=50
# --list-overflow=72
add src/new_module.py, update src/main.py

    - update src/subcommand.py, update src/util/utils.py
    - remove src/old_module.py

# # --------------------------------------------------------------

# --overflow=50
# --list-overflow=72
# --list-indent=2
add src/new_module.py, update src/main.py

  - update src/subcommand.py, update src/util/utils.py
  - remove src/old_module.py
```

```bash
# --overflow=50
# --list-overflow=72
add src/new_module_with_a_very_long_name_that_exceeds_the_list_overflow_limit_but_we_dont_separate_action_prefix_from_filenames_and_we_dont_break_inside_filenames.py

    - update src/main.py, update src/subcommand.py
    - update src/util/utils.py, remove src/old_module.py
```

```bash
# --overflow=50
# --list-overflow=72
add "src/new_module_with_a_very_long_name with spaces that_exceeds_the_list_overflow_limit_but_we_dont_separate_action_prefix_from_filenames_and_we_dont_break_inside_filenames.py"

    - update src/main.py, update src/subcommand.py
    - update src/util/utils.py, remove src/old_module.py

# # --------------------------------------------------------------

# --overflow=50
# --list-overflow=72
# --quote-char="'"
add 'src/new_module_with_a_very_long_name with spaces that_exceeds_the_list_overflow_limit_but_we_dont_separate_action_prefix_from_filenames_and_we_dont_break_inside_filenames.py'

    - update src/main.py, update src/subcommand.py
    - update src/util/utils.py, remove src/old_module.py
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
- **`--and`** replaces the last separator of the last line, at whatever level that
  separator falls. Two segments read `a and b`; three or more keep the serial comma.
- **Quoting** applies to a path containing whitespace or the quote character itself;
  an embedded quote character is backslash-escaped.

## not yet implemented

```bash
gitcim --config-edit # open ~/.config/gitcim/config.toml in $GITCIM_EDITOR / $VISUAL / $EDITOR
gitcim --config-print # print the current configuration
gitcim --config-init # create a new config file with default values at ~/.config/gitcim/config.toml
gitcim --config-reset # reset the config file to default values
```
