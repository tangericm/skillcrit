# Commands and flags

Inventory commands take an optional `[path]` (default: cwd) and read only,
except that explicit lint exports and `dismiss` create new output files. `eval` executes task code.

## doctor / inspect

```
skillcrit doctor [path] [--user] [--compare-files] [--json]
```

Recommends a copy per name for cleanup review, with alternatives and identical
instruction files. Runtime selection is unknown. Token estimates describe the
recommended set; risk inventory includes every scanned copy.

`--compare-files` compares bounded supporting-file bytes and permission bits.
Skipped content makes the comparison incomplete (exit 3); matching inspected
files do not establish runtime equivalence or justify deletion.

`inspect` is an alias. Prefer `doctor` in what you show the user.

## lint

```
skillcrit lint [path] [--user] [--format <fmt>] [--fail-on <sev>] [--config <file>]
skillcrit lint [path] --fix [--out <file>]
```

Every finding with a rule ID, a `file:line`, and a remediation.

`--fix` prints a dry-run cleanup plan: per group, the candidate **Keep** directory,
then **Alternatives** for review, numbered questions, and estimated token
comparisons. Informational notes and spec findings are shown separately with
their severity and remediation. It writes `skillcrit-cleanup.md` by default. `--out -` skips the
write. Output must be a new file: existing files and links are refused with
exit 3. Filesystems without hard-link support must use `--out -`; file export
fails closed there. `--out package.json`, `SKILL.md`, `LICENSE`, or `.env` is also refused. It
never deletes a skill file.

## Repeat audits and acknowledge findings

```
skillcrit lint [path] --save-baseline baseline.json
skillcrit lint [path] --baseline baseline.json --dismissals dismissals.json
skillcrit dismiss baseline.json --finding <fingerprint> --reason "Reviewed reason" --out dismissals.json
```

Save a complete baseline first. Use the same version, scope, and effective
configuration for comparison. Copy the exact 64-character finding fingerprint
from that audit. Dismiss only a finding the user has explicitly reviewed and
accepted with a reason; do not waive findings merely to make the gate pass.
Accepted findings remain visible. Changed evidence makes them active again.
Incomplete scans cannot establish resolution. All output filenames must be new.
To carry prior dismissals forward, add `--dismissals existing.json` to `dismiss`
and choose a new `--out` filename. Baselines contain finding paths/messages;
review them before sharing.

## setup

```
skillcrit setup [path] [--user] [--expect-version <version>] [--json]
```

Shows the actual CLI and Node paths/versions, discovery roots, and scan coverage.
A version mismatch exits 3. Finding a plugin directory does not establish native
client enablement or runtime selection.

## scan

```
skillcrit scan [path] [--user] [--json]
```

Flat inventory: name, version, pack, origin, description tokens. No judgement.

## roots

```
skillcrit roots [path] [--user] [--json]
```

Known skill and plugin discovery locations at project, user, and admin scope,
and whether each exists. Client support and enablement still need verification. Use this when a skill "isn't loading"
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
| 3 | Run failed or coverage is incomplete: invalid config, refused write, unreadable/skipped input, traversal limits |

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
