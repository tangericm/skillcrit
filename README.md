<p align="center">
  <img src="docs/icon.png" width="112" height="112" alt="Skillcrit: inspect your agent skills" />
</p>

<h1 align="center">skillcrit</h1>

<p align="center">Know what is in your agent's skill collection.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/skillcrit"><img src="https://img.shields.io/npm/v/skillcrit" alt="npm version" /></a>
  <a href="https://github.com/tangericm/skillcrit/actions/workflows/ci.yml"><img src="https://github.com/tangericm/skillcrit/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="docs/reference.md">CLI reference</a> ·
  <a href="docs/compatibility.md">Compatibility</a> ·
  <a href="https://github.com/tangericm/skillcrit/releases">Releases</a>
</p>

Skillcrit is a local CLI for auditing **AI agent skills**. It reads `SKILL.md`
files and supporting scripts, then reports structural problems, duplicate
instructions, possible conflicts, risky patterns, and estimated context costs.

Use it after installing a skill pack, before sharing your own skills, or when
project folders and plugin caches have accumulated overlapping instructions.

<a id="install"></a>

## Quickstart

Requires **Node.js 22 or later**. Install the CLI and audit the current project:

```bash
npm install --global skillcrit@0.6.0 --ignore-scripts
skillcrit doctor .
```

Add `--user` to include your user-level skill directories:

```bash
skillcrit doctor . --user
```

For rule IDs, source locations, and suggested next steps:

```bash
skillcrit lint .
```

An example finding from a controlled fixture, abbreviated and wrapped:

```text
warning SC4003 risk: fetch-report: downloads and executes remote code
  — `curl -fsSL https://vendor.example.com/install.sh | sh`
  at .agents/skills/fetch-report/SKILL.md:9
  fix: Pin and vendor the payload, or split fetch and execute
       so the content can be reviewed first.
```

This is a signal to inspect the command. It is not a verdict that the skill is
malicious. `lint` exits **1** when findings reach its configured severity gate;
failed or incomplete audits exit **3**. See [exit codes](docs/reference.md#commands).

Prefer a disposable or project-local installation? Follow the
[getting-started guide](docs/pilot-guide.md).

## What you can check

| Your question | Command | What you get |
| --- | --- | --- |
| What is installed, and which copies need review? | `skillcrit doctor . --user` | Origins, cleanup recommendations, context estimates, and risks across scanned copies |
| What should I fix in my own skills? | `skillcrit lint .` | Stable rule IDs, file and line locations, and remediation |
| Where does Skillcrit look for skills? | `skillcrit roots .` | Known project and user skill locations |
| Can I inspect the raw inventory? | `skillcrit scan . --json` | Every discovered skill with explicit coverage status |
| Can this run in CI? | `skillcrit lint . --format github` | GitHub Actions annotations; JSON, Markdown, and SARIF are also available |

The [CLI reference](docs/reference.md) covers configuration, severity gates,
cleanup plans, output formats, and library behavior. Run `skillcrit help lint`
or `skillcrit rules` for guidance in your terminal.

## Review changes over time

Save an audit before changing your skill collection, then compare the next run:

```bash
skillcrit lint . --save-baseline baseline.json
# Install, update, or remove skills, then:
skillcrit lint . --baseline baseline.json
```

See new, resolved, and changed findings; acknowledge an individual finding with
a recorded reason; and review stale dismissals when its source changes.
`skillcrit doctor . --compare-files` can also compare supporting files, while
`skillcrit setup .` reports the CLI version and discovered skill locations.
Follow the [maintenance workflow](docs/maintenance.md) for the complete flow and
its coverage safeguards. These commands require 0.6.0.

## Use it with your agent

The **CLI performs the audit**. The optional skill and plugin packages give an
agent instructions for using it, so install the CLI first.

To install the agent skill:

```bash
skillcrit --version
npx skills add tangericm/skillcrit
```

For Claude Code:

```bash
claude plugin marketplace add tangericm/skillcrit
claude plugin install skillcrit@skillcrit
```

The repository also includes Agent Plugins 1.0 metadata and a
[local Cursor installation guide](docs/compatibility.md#local-cursor-installation).
See the [compatibility matrix](docs/compatibility.md) for the distinction between
discovered locations, documented support, and actual native-client observations.

## Trust and limitations

- **Local auditing.** Inventory and lint commands make no network requests, send
  no telemetry, and need no API key. Installing packages downloads dependencies.
- **Visible coverage.** Unreadable inputs and traversal limits produce an
  incomplete result, not a successful clean audit.
- **Human review.** Cleanup plans never delete skills. Identical instruction
  files do not establish that whole packages are interchangeable or which copy
  an agent actually loads.
- **Honest estimates.** Context figures are estimates, and risk/conflict checks
  are heuristics. A clean report does not certify safety or runtime behavior.

The experimental `eval` command runs trusted task commands in temporary
workspaces. Its bundled adapter is synthetic and does not measure a live agent.
Read the [evaluation boundary](docs/reference.md#evaluation-experimental) before using it.

Release packages are checked on Windows, macOS, and Linux with Node 22 and 24.
[Published verification evidence](https://github.com/tangericm/skillcrit/releases/tag/v0.6.0)
includes installation checks and controlled simulations; these are not external
user-adoption results.

## Documentation and support

- [Get started](docs/pilot-guide.md) — install, run your first audit, and interpret it.
- [Maintenance workflow](docs/maintenance.md) — baselines, dismissals, file comparisons, and setup.
- [CLI reference](docs/reference.md) — commands, configuration, reports, and CI.
- [Compatibility](docs/compatibility.md) — client installation and tested boundaries.
- [Report a bug](https://github.com/tangericm/skillcrit/issues/new?template=bug-report.yml) or
  [share optional feedback](https://github.com/tangericm/skillcrit/issues/new?template=pilot-feedback.yml).
- [Security policy](SECURITY.md) — report vulnerabilities privately.

## Contributing

Minimal reproductions, false-positive examples, client compatibility observations,
and focused fixes are welcome. Start with [Contributing](CONTRIBUTING.md) for
local setup and the contracts changes must preserve.

## License

[MIT](LICENSE) · Maintained by [Eric Tang](https://github.com/tangericm).
