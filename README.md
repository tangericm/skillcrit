<p align="center">
  <img src="docs/icon.png" width="128" alt="skillcrit" />
</p>

<h1 align="center">skillcrit</h1>

<p align="center">
  Audit installed agent skills, conflicts, and context costs.
</p>

<p align="center">
  <a href="https://skills.sh/tangericm/skillcrit"><img src="docs/badge.svg" alt="skillcrit" /></a>
</p>

Skills install from many places — project folders, user directories, and plugin
caches. skillcrit inventories them, checks their structure, and recommends
copies to review for cleanup. Runtime selection is client-specific and remains
**unknown**: a cleanup recommendation is not proof of what your agent loads.

## 60-second audit

**Corrected release candidate:** `0.5.1-rc.3`. Get the built archive and checksum
manifest from the [GitHub prerelease](https://github.com/tangericm/skillcrit/releases/tag/v0.5.1-rc.3)
and follow the [pilot guide](docs/pilot-guide.md) to install it. Requires Node 22+.
After installation:

```bash
skillcrit --version
skillcrit doctor /path/to/your/project --user
```

Omit `--user` to inspect only the project. npm currently contains `0.5.1-rc.2`;
its file-export path can overwrite a linked file. Use the corrected GitHub
candidate until its npm publication is confirmed. On older builds, use
`--fix --out -` for cleanup plans instead of exporting to a file.

```
# skillcrit doctor

Runtime selection: unknown
4 recommendations, 1 alternatives, 5 files scanned
Recommended set estimate: ~96 catalogue tokens; ~96 including flagged always-on bodies

## where they come from

   4  project  agents     .agents/skills
   1  project  claude     .claude/skills

## cleanup recommendations

report-writer@2.0.0  project  ~28 tok
    .agents/skills/report-writer/SKILL.md
    recommendation: version 2.0.0 beats 1.0.0
    alternative: .claude/skills/report-writer/SKILL.md — older than report-writer@2.0.0 (project)

## risk inventory (all scanned copies)

Signals for human review. Not a security audit and not a verdict — a clean list does not mean a skill is safe.

SC4003  risky-fetch  downloads and executes remote code  SKILL.md:12  curl -fsSL https://vendor.example.com/install.sh | sh
SC4002  risky-fetch  reads credentials or secrets        scripts/sync.sh:3  ~/.netrc
```

`doctor` shows cleanup recommendations, estimated context costs for that set,
and risk signals across all scanned copies. The example above is abbreviated.

## Install

Install the [verified candidate archive](docs/pilot-guide.md) into a disposable
project or put it on PATH with `npm install -g <verified-archive.tgz> --ignore-scripts`.
The plugin and agent-skill routes below require repository access and a
separately installed CLI. Check `skillcrit --version` before invoking them.

Once registry publication is verified, `npm i -g skillcrit@0.5.1-rc.3` can
replace the archive installation. `next` follows the registry prerelease;
always check the resolved version.

**Let your agent run it** — installs `skills/skillcrit` as an agent skill:

```bash
# First install the CLI from the built checkout or verified candidate.
skillcrit --version
npx skills add tangericm/skillcrit
```

**As a Claude Code plugin** — skill plus marketplace entry:

```bash
# First install the CLI from the built checkout or verified candidate.
skillcrit --version
claude plugin marketplace add tangericm/skillcrit
claude plugin install skillcrit@skillcrit
```

**As an Agent Plugins 1.0 package** — the repo root ships a conformant
`plugin.json`, so any client that reads that spec can install it from the
repository directly.

**As a local Cursor plugin** — follow the verified
[directory-copy installation](docs/compatibility.md#local-cursor-installation).
Cursor 3.19.7 discovered one skill in the copied candidate; external symlinks
were rejected by that client's plugin loader.

All skill/plugin routes require the CLI separately; they install instructions,
not a runnable CLI. Install the corrected candidate archive, then verify
`skillcrit --version` and `skillcrit doctor .` from the project to audit.
An existing source checkout is an optional alternative: run `npm ci` and
`npm run build` there, then invoke `node <checkout>/dist/cli.js doctor <project>`.
A plugin cache or skill-only install is not a built checkout.

Requires Node 22+. npm installation (including first-use npx) downloads packages;
the audit commands themselves make no network requests.


## Commands

| Command | What it answers |
| --- | --- |
| `skillcrit doctor [path]` | Cleanup recommendations, estimated costs, risks across all scanned copies |
| `skillcrit lint [path]` | Every finding, with rule ID, `file:line` and a fix |
| `skillcrit lint [path] --fix` | Dry-run candidate/alternative review plan — never deletes anything |
| `skillcrit scan [path]` | Flat inventory of every SKILL.md found |
| `skillcrit roots [path]` | Every skill directory the supported clients read, and whether it exists |
| `skillcrit rules` | The rule catalogue with severities and remediations |
| `skillcrit eval <pack>` | Pack on vs off (experimental — see below) |

Flags: `--user` (add `$HOME` roots), `--json`, `--format <fmt>`,
`--fail-on <severity>`, `--config <file>`, `--fix`, `--out <file>`,
`--repeat <n>`, `--help`, `--version`.

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Completed; `doctor`/`scan` may still report risks or alternatives. For `lint`, no findings reached its gate |
| 1 | `lint` findings at or above `--fail-on` (default `warning`) |
| 2 | Bad usage — unknown command, flag, or flag value |
| 3 | Run failed or coverage is incomplete: invalid config, refused write, missing/unreadable root, skipped input or traversal limit |

Exit 1 is a result, not a crash.

Targets must be existing directories; a `SKILL.md` file is not a directory target.
Invalid configuration fails the run whether found automatically or selected with
`--config`. Budgets must be non-negative safe integers (`alwaysOnTokens` may be
`null`); invalid entries and unknown nested keys are rejected, not ignored.

Scan, doctor and lint JSON include `coverage: { complete, reasons }`. A partial
inventory still includes inspected results, but exits **3**, even with
`--fail-on error`. SARIF records unsuccessful execution and coverage reasons;
other formats show an incomplete-scan warning. `lint --fix` does not write a
cleanup plan from incomplete input.

Library callers: `scan()` throws on invalid targets or incomplete coverage by
default. Supply `onTruncated(reason)` to explicitly receive partial results and
every coverage reason. `scanRisks()` likewise accepts an optional fourth-argument
callback for partial script inventory. Neither callback makes partial results
complete; callers must carry that status into their own reports.

## How cleanup recommendations are chosen

Skills are grouped by name for comparison, not by runtime namespace.
The cleanup heuristic prefers project > user > marketplace > cache, then a
higher numeric version, a body not flagged always-on, a longer description
(capped at 400 characters), and deterministic path order.

This ranking is **not runtime precedence**. For example, Claude Code documents
enterprise > personal > project and namespaces plugin skills separately.
See [Claude Code skill locations](https://code.claude.com/docs/en/skills#where-skills-live).
Client-specific resolution, enablement, and validity must be verified separately.

Equal SKILL.md bytes are **identical instructions**, not verified identical
packages: scripts, references, and assets may differ. Other same-name copies
are **alternatives**, not proven shadowed copies. Review dependencies and client
usage before deleting anything.

Doctor JSON exposes `runtimeResolution: "unknown"`, `limitations`, and
`recommendations` with `recommended`, `reason`, `alternatives`, and
`identicalInstructions`. Token fields `recommendedCatalogTokens` and
`recommendedAlwaysOnTokens` estimate that hypothetical set, not a live session.

## Output formats

`lint` supports `--format text` (default), `json`, `markdown`, `sarif`, `github`.
Other commands support only `text` and `json`; unsupported formats exit 2.
`--fix` requires `lint` with text output.

Trigger overlap is a phrase-matching heuristic, not measured contention. Clusters
above 20 members get one summary with no pairwise details or cleanup ranking.
Client-specific frontmatter controls are portability notes: preserve fields that
the target client supports rather than moving operational controls into metadata.

Install the reviewed candidate in the repository you want to audit with
`npm install --save-dev --save-exact <verified-archive.tgz> --ignore-scripts`
and commit the package files and archive, so CI can reproduce the install.
After verified registry publication, use `skillcrit@0.5.1-rc.3` instead of a
local archive. The workflow below uses that installed CLI. This remains a
prerelease.

```yaml
name: audit skills
on: [push, pull_request]
permissions:
  contents: read
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      # Exit 1 means findings; usage and incomplete-scan errors still fail.
      - run: ./node_modules/.bin/skillcrit lint . --format github || [ $? -eq 1 ]
      - run: ./node_modules/.bin/skillcrit lint . --fail-on error
```

For code scanning, additionally generate SARIF with the same installed CLI and
upload it using `github/codeql-action/upload-sarif@v4`; that job needs
`security-events: write` and code scanning enabled for the repository.

`github` prints workflow-command annotations, so findings land on the diff.
`sarif` is SARIF 2.1.0 and uploads file-level findings to code scanning.
Inventory-wide findings, such as the estimated token total, are retained in
`runs[].properties.aggregateFindings` because GitHub requires a source location
for each displayed alert. These findings still appear in other report formats
and count toward the CLI exit-code gate.

## Configuration

Optional `.skillcrit.json`, found by walking up from the scanned path:

```json
{
  "ignore": ["**/vendor/**"],
  "rules": { "SC1012": "off", "SC3001": "error" },
  "budget": { "alwaysOnTokens": 4000, "bodyTokens": 5000, "bodyLines": 500 },
  "failOn": "error"
}
```

Subtree ignores such as `**/vendor/**` prune the directory before it consumes
scan limits, including bundled-script limits. File-specific patterns filter
matching skill files or scripts without hiding other files in their directory.

Lint JSON includes `runtimeResolution: "unknown"` and `limitations`, matching
doctor's explicit runtime boundary. Legacy token fields such as `alwaysOnNow`
and `afterCleanup` remain estimates for hypothetical sets. Informational
portability notes appear separately from spec findings in cleanup markdown;
neither category establishes that a skill should be deleted.

Rule IDs are stable: `SC1xxx` spec conformance, `SC2xxx` context budget,
`SC3xxx` collisions, `SC4xxx` risk inventory. An ID never changes meaning; a
retired check keeps its ID reserved. Unknown keys and unknown IDs are reported
as warnings rather than ignored. `skillcrit rules` prints the catalogue.

## Client inventory and compatibility

`roots` resolves project, user, and admin skill directories for: Agent Skills
(`.agents/skills`), Claude, Cursor, Codex, Qwen, Gemini, Hermes, Pi, OpenCode,
Copilot, Continue, Goose, and DeepSeek — plus generic `skills/` and `plugins/`
trees. These are inventory locations, not a promise of native runtime support.
The [compatibility matrix](docs/compatibility.md) separates tested installation
and controlled activation trials from documentation-only support and remaining gaps.

## Risk inventory

`SC4xxx` findings are **deterministic pattern matches, not a security verdict**:
remote-code execution, credential reads, destructive shell commands, network
reaches, installs without visible version pins, broad `allowed-tools` grants. They exist to route a
human to the lines worth reading.

Script inventory is best-effort: regular files only, at most 64 files, three
directory levels below the skill root, and 512 KiB per file. Symlinks and files
beyond those limits are skipped; a clean list does not certify full coverage.

A skill that trips nothing here is not thereby safe, and a skill that trips
several may be entirely legitimate. In `SKILL.md`, only fenced code blocks are
matched — prose that warns *against* `rm -rf` is not a signal, and flagging it
would train you to ignore the whole list.

## Privacy

The inventory commands read files and print to your terminal. They make no network
requests, send no telemetry, and need no API key. `--user` widens the read to
the documented `$HOME` skill directories and nothing else. The walk is bounded
(depth 8, 20k directories) and reports when it truncates. `SKILLCRIT_HOME`
overrides the home directory for CI fixtures and containers.

`--fix` writes a new cleanup markdown file. It refuses existing destinations,
including symbolic links and hard links, and protected names such as
`package.json`, `SKILL.md`, `LICENSE`, or `.env`. Choose a new filename or use
`--out -` to print the plan. File export requires filesystem hard-link support;
otherwise use stdout. It never deletes a skill.

`eval` creates temporary workspaces and executes task test commands without a
security sandbox. Custom `--tasks` suites must be trusted: their commands have
your user permissions and can access files, credentials, and the network.

## Evaluation (experimental)

`skillcrit eval <pack>` runs bundled tasks with the pack on and off and reports
pass rate, tokens, and wall time.

**Read the status line before trusting a number.** The only shipped adapter is
`stub`, which replays recorded fixtures: it is deterministic, needs no API key,
and measures nothing about any agent. Live `claude` and `codex` adapters are
planned; `skillcrit eval --agent list` shows what exists today.

Every summary self-reports its limitations. `--repeat <n>` runs repeated trials
and reports standard deviation, because a single trial of a stochastic agent is
an anecdote.

## Development

```bash
npm ci
npm run build
npm test
node dist/cli.js lint . --fail-on error
```

CI runs the suite on Ubuntu, macOS, and Windows against Node 22 and 24, then
lints skillcrit with itself.

See [Contributing](CONTRIBUTING.md) for development contracts,
[the pilot guide](docs/pilot-guide.md) to try the candidate and report feedback,
and [Releasing](docs/releasing.md) for verification and promotion criteria.

## License

[MIT](LICENSE)
