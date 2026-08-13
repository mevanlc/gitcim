# gitcim

command line tool kind of like ~/p/my/gitmsg except the messages are more mechanical

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
chmod +x scripts/install.sh, remove plans/COMPLETED.md

# # ---------------------------------------------------------------

# # ls -l scripts/install.sh
# # -rwxr--r-- 1 user group 1234 Jun 1 12:34 scripts/install.sh
# chmod u-x scripts/install.sh
chmod -x scripts/install.sh, remove plans/COMPLETED.md

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
update docs/DOCS.md and remove plans/PLAN.md
```

```bash
# --no-and # default behavior
update docs/DOCS.md, remove plans/PLAN.md, add test/test.py

# # ---------------------------------------------------------------

# --and
update docs/DOCS.md, remove plans/PLAN.md, and add test/test.py
```

```bash
# --no-group
update src/main.py, update src/subcommand.py, update src/util/utils.py, remove src/old_module.py, add src/new_module.py

# # ---------------------------------------------------------------

# --no-group
# --item-separator=' '
update src/main.py update src/subcommand.py update src/util/utils.py remove src/old_module.py add src/new_module.py
```

```bash
# --no-group
update src/main.py, update src/subcommand.py, update src/util/utils.py, remove src/old_module.py, add src/new_module.py, add "docs/WEBSITE DESIGN.md"

# # ---------------------------------------------------------------

# --no-group
# --item-separator=' '
update src/main.py update src/subcommand.py update src/util/utils.py remove src/old_module.py add src/new_module.py add "docs/WEBSITE DESIGN.md"
```

```bash
# --group=1 # group action-categories with 1 or more items
update: src/main.py, src/subcommand.py, src/util/utils.py; remove: src/old_module.py; add: src/new_module.py

# # ---------------------------------------------------------------

# --group=1 # group action-categories with 1 or more items
# --group-separator=' - '
update: src/main.py, src/subcommand.py, src/util/utils.py - remove: src/old_module.py - add: src/new_module.py

# --group=1 # group action-categories with 1 or more items
# --group-separator=' - '
# --group-action-suffix=' '
update src/main.py, src/subcommand.py, src/util/utils.py - remove src/old_module.py - add src/new_module.py
```

```bash
# --group=2 # group action-categories with 2 or more items
update: src/main.py, src/subcommand.py, src/util/utils.py; remove src/old_module.py, add src/new_module.py
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
update src/main.py, update src/subcommand.py

    - update src/util/utils.py, remove src/old_module.py, add src/new_module.py

# # --------------------------------------------------------------

# --overflow=50
# --list-overflow=72
update src/main.py, update src/subcommand.py

    - update src/util/utils.py, remove src/old_module.py
    - add src/new_module.py

# # --------------------------------------------------------------

# --overflow=50
# --list-overflow=72
# --list-indent=2
update src/main.py, update src/subcommand.py

  - update src/util/utils.py, remove src/old_module.py
  - add src/new_module.py
```


```bash
# --overflow=50
# --list-overflow=72
update src/main.py, update src/subcommand.py

    - update src/util/utils.py, remove src/old_module.py
    - add src/new_module_with_a_very_long_name_that_exceeds_the_list_overflow_limit_but_we_dont_separate_action_prefix_from_filenames_and_we_dont_break_inside_filenames.py
```

```bash
# --overflow=50
# --list-overflow=72
update src/main.py, update src/subcommand.py

    - update src/util/utils.py, remove src/old_module.py
    - add "src/new_module_with_a_very_long_name with spaces that_exceeds_the_list_overflow_limit_but_we_dont_separate_action_prefix_from_filenames_and_we_dont_break_inside_filenames.py"

# # --------------------------------------------------------------

# --overflow=50
# --list-overflow=72
# --quote-char="'"
update src/main.py, update src/subcommand.py

    - update src/util/utils.py, remove src/old_module.py
    - add 'src/new_module_with_a_very_long_name with spaces that_exceeds_the_list_overflow_limit_but_we_dont_separate_action_prefix_from_filenames_and_we_dont_break_inside_filenames.py'
```

```bash
# --overflow=50
# --list-max-items=1
update src/main.py, update src/subcommand.py

    - update src/util/utils.py
    - remove src/old_module.py
    - add src/new_module.py
```

```bash
# --overflow=39
# --list-overflow=120
# --list-max-groups=1
# --group=1
update: src/main.py, src/subcommand.py

    - update: src/util/utils.py, src/util/helper.py
    - remove: src/old_module.py
    - add: src/new_module.py

# # --------------------------------------------------------------

# --overflow=39
# --list-overflow=120
# --list-max-groups=1
# --group=2
update: src/main.py, src/subcommand.py

    - update: src/util/utils.py, src/util/helper.py
    - remove src/old_module.py, add src/new_module.py

# # --------------------------------------------------------------

# --overflow=39
# --list-overflow=120
# --list-max-groups=1
# --group=3
update src/main.py, update src/subcommand.py

    - update src/util/utils.py, update src/util/helper.py
    - remove src/old_module.py, add src/new_module.py

# # --------------------------------------------------------------

# --overflow=39
# --list-overflow=120
# --list-max-groups=1
# --list-max-items=1
# --group=3
update src/main.py, update src/subcommand.py

    - update src/util/utils.py
    - update src/util/helper.py
    - remove src/old_module.py
    - add src/new_module.py

# # --------------------------------------------------------------

# --overflow=39
# --list-overflow=120
# --list-max-groups=1
# --list-max-items=1
# --group=3
# --item-action-suffix=':'
update:src/main.py, update:src/subcommand.py

    - update:src/util/utils.py
    - update:src/util/helper.py
    - remove:src/old_module.py
    - add:src/new_module.py
```

```bash
gitcim --config-edit # open ~/.config/gitcim/config.toml in $GITCIM_EDITOR / $VISUAL / $EDITOR
gitcim --config-print # print the current configuration
gitcim --config-init # create a new config file with default values at ~/.config/gitcim/config.toml
gitcim --config-reset # reset the config file to default values
```
