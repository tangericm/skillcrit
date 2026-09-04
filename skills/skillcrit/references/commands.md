# Commands and flags

Inventory commands take an optional `[path]` (default: cwd) and read only,
except that `lint --fix` writes cleanup markdown. `eval` executes task code.

## doctor / inspect

```
skillcrit doctor [path] [--user] [--json]
```

Recommends a copy per name for cleanup review, with alternatives and identical
instruction files. Runtime selection is unknown. Token estimates describe the
recommended set; risk inventory includes every scanned copy.

`inspect` is an alias. Prefer `doctor` in what you show the user.

## lint

```
skillcrit lint [path] [--user] [--format <fmt>] [--fail-on <sev>] [--config <file>]
skillcrit lint [path] --fix [--out <file>]
```

Every finding with a rule ID, a `file:line`, and a remediation.

`--fix` prints a dry-run cleanup plan: per group, the **Keep** directory, then
**Orphans** to delete or disable, then numbered questions and a token
comparison. It writes `skillcrit-cleanup.md` by default. `--out -` skips the
write. `--out package.json`, `SKILL.md`, or `.env` is refused with exit 3. It
never deletes a skill file.

## scan

```
skillcrit scan [path] [--user] [--json]
```

Flat inventory: name, version, pack, origin, description tokens. No judgement.

## roots

```
skillcrit roots [path] [--user] [--json]
```

Every skill and plugin directory the supported clients read, at project, user,
and admin scope, and whether each exists. Use this when a skill "isn't loading"
and you need to know where the client is even looking.

## rules

```
skillcrit rules [--json]
```

The catalogue: ID, default severity, title, remediation.

## eval

```
skillcrit eval <pack-dir> [--tasks <dir>] [--agent <name>] [--repeat <n>] [--json]
skillcrit eval --agent list
```

Runs the task set with the pack on and off. Reports pass rate, tokens, wall
time, and the overbuild delta. The summary self-reports its limitations —
include them.

`--tasks` accepts executable task suites. Use only trusted suites: tests run
with the user's permissions, without a security sandbox, in temporary workspaces.

## Flags

| Flag | Effect |
| --- | --- |
| `--user` | Add the `$HOME` skill roots (and `/etc/codex/skills`) |
| `--json` | Machine-readable output |
| `--format <fmt>` | `text` (default), `json`, `markdown`, `sarif`, `github` |
| `--fail-on <sev>` | Gate at `error`, `warning` (default), or `info` |
| `--config <file>` | Use this `.skillcrit.json`; missing file is exit 3 |
| `--fix` | Cleanup plan (lint only) |
| `--out <file>` | Where the cleanup plan goes; `-` means stdout only |
| `--repeat <n>` | Repeat eval trials and report standard deviation |
| `--help`, `-h` | Usage; per-command with `skillcrit lint --help` |
| `--version`, `-V` | Version |

`--flag=value` is accepted everywhere `--flag value` is.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Clean, or only findings below the gate |
| 1 | Findings at or above the gate |
| 2 | Bad usage: unknown command, flag, or flag value |
| 3 | Could not run: missing config, refused write, unreadable root |

## Formats for CI

`--format github` prints workflow-command annotations that land on the diff.
`--format sarif` is SARIF 2.1.0 for code scanning upload. Run the annotator and
the gate as separate steps so a red job says which one failed:

```yaml
- run: npx skillcrit lint . --format github || [ $? -eq 1 ]
- run: npx skillcrit lint . --fail-on error
```

## Environment

`SKILLCRIT_HOME` overrides the home directory used for user-scope roots. It
exists because `os.homedir()` reads `USERPROFILE` on Windows and `HOME` on
POSIX, so there is no single portable variable for a CI fixture or container.
