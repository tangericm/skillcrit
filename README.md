# skillcrit

Lint stacked [Agent Skills](https://agentskills.io) packs and eval a pack **on vs off**.

This repository used to be `agent-loop`, a Claude Code / Codex workflow plugin. GitHub Trending on 3 September 2026 was a skills gold rush with almost no independent quality signal and no composition analysis. **skillcrit** is the pytest of skills plus a conflict linter — not another methodology pack.

```
skillcrit --version
skillcrit roots [path]             # project + user skill/plugin locations
skillcrit scan [path] [--user]     # inventory of SKILL.md + plugin manifests
skillcrit lint [path] [--user]     # conflicts, duplicates, versions, tokens
skillcrit lint [path] --fix        # dry-run cleanup plan + questions
skillcrit eval <pack>              # frozen tasks, pack on vs off
```

Version is **0.4.0**, from `package.json` only (the Agent Skills spec / skillpm convention: do not duplicate version in `SKILL.md`). `skillcrit --version` prints it. Claude's `plugin.json` omits `version` so git-marketplace installs track the commit SHA. Cursor's `plugin.json` tracks `package.json`.

TTY runs write a short `[skillcrit] …` status line to stderr (counts, not fake percentages). `--json` stays quiet on stderr.

## Install

Node 22 or newer. macOS, Linux, and Windows (PowerShell or cmd) are supported.

**CLI (npm, the usual way to ship a Node binary):**

```bash
git clone https://github.com/tangericm/skillcrit.git
cd skillcrit
npm install
npm test
npm run build
npm link
skillcrit --version
skillcrit roots
```

`prepublishOnly` runs the build, so a future `npm publish` ships `dist/` and `npx skillcrit` works without a local clone.

**Skill** (Claude Code / Cursor / Codex / Qwen / anything that reads `SKILL.md`):

```bash
npx skills add tangericm/skillcrit --skill skillcrit
```

**Claude Code marketplace plugin** (local path must start with `./`):

```bash
claude plugin marketplace add ./
claude plugin install skillcrit@skillcrit
```

Or `claude plugin marketplace add tangericm/skillcrit`. Then put the CLI on PATH (`npm link` or `npm i -g`).

## Scopes and harness locations

| Command | What it scans |
|---|---|
| `skillcrit lint .` | This project only |
| `skillcrit lint . --user` | This project **plus** user-level installs |
| `skillcrit roots` | Lists known dirs and whether they exist |

`skillcrit roots` is the map. Discovery follows the [Agent Skills](https://agentskills.io/client-implementation/adding-skills-support) convention (`.agents/skills` + `.<client>/skills`) plus first-party docs:

| Harness | Project | User / admin |
|---|---|---|
| Cross-client | `.agents/skills/` | `~/.agents/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/`, `~/.claude/plugins/` |
| Cursor | `.cursor/skills/` | `~/.cursor/skills/`, `~/.cursor/plugins/` (also loads Claude/Codex dirs) |
| Codex | `.codex/skills/` (legacy) | `~/.agents/skills/`, `~/.codex/skills/`, `~/.codex/plugins/`, `/etc/codex/skills` |
| Qwen Code | `.qwen/skills/` | `~/.qwen/skills/` |
| Gemini CLI | `.gemini/skills/` | `~/.gemini/skills/` |
| Hermes | `.hermes/skills/` | `~/.hermes/skills/` (canonical library) |
| Pi | `.pi/skills/` | `~/.pi/agent/skills/` |
| OpenCode | `.opencode/skills/` | `~/.config/opencode/skills/`, `~/.opencode/skills/` |
| Copilot | `.github/skills/` | `~/.copilot/skills/` |
| Continue / Goose / DeepSeek | `.<client>/skills/` | `~/.<client>/skills/` |

`--user` walks those home trees. `cache/` and `marketplaces/` copies are **tagged**, not skipped: they count toward `scanned` but collapse into one unique skill when the body matches. `fixtures/` and `node_modules/` are still skipped. Directory symlinks are followed; cycles are skipped.

Identical copies in `.agents/skills` and `.claude/skills` are a real `duplicate-copy` (warning). Cache/marketplace mirrors of the same body are `duplicate-copy` at **info** severity.

## What `lint` looks at

Each skill is tagged with an origin (`project` | `user` | `marketplace` | `cache`) and a version when one exists (`plugin.json`, `package.json`, `metadata.version`, or `@x.y.z` in the path). When several copies contend, skillcrit ranks **project > user > marketplace > cache**, then newer semver (component by component), then more specific descriptions, and penalizes always-on. An overlap *chain* (A overlaps B, B overlaps C, A does not overlap C) keeps A and C.

| Rule | Meaning |
|---|---|
| `spec` | `name` / `description` violate the Agent Skills spec (folder match, charset, length) |
| `trigger-overlap` | two **distinct** skills share a distinctive `description` phrase |
| `contention` | a cluster of overlapping skills plus a suggested keep/disable order |
| `duplicate-command` | two packs register the same slash command |
| `duplicate-copy` | the same skill body is installed at more than one path |
| `version-conflict` | the same skill **name** exists as more than one body/version |
| `always-on` | plugin hooks or `ACTIVE EVERY RESPONSE` / `every turn` bodies |
| `always-loaded-tokens` | estimate (`chars / 4`) of unique skills' frontmatter plus always-on bodies |

`--fix` prints a dry-run cleanup plan (`keep` / `rm` / `ignore` / `disable`). It does **not** delete files. After the plan (and after ordinary lint) it prints a **summary**: unique vs scanned, always-on tokens now vs after recommended cleanup vs description-only, then numbered **questions** an agent or human can answer. JSON includes `cleanup[]`, `questions[]`, and `tokens`.

That summary shape matches how widely used skills report work: counts and a next-action menu, not a fake progress percentage. Progressive disclosure still applies — `name` + `description` stay always-loaded; bodies are the always-on tax.

Exit code `1` when there is any error or warning (Claude Code's Bash panel will label that `Error` — it is not a crash). Info-only findings do not fail the run.

## What `eval` measures

A frozen task suite under `fixtures/tasks/`. Each task has a starting `repo/`, a minimal `on/` overlay, and an overbuilt `off/` overlay.

`--agent stub` (default, used in CI) applies those overlays. It needs no API key. Real Claude / Codex adapters are not in v0.4.

Metrics per task: tests passed, source lines, overbuild vs the `on/` golden, wall time, tokens if the adapter reports them.

## Library

```ts
import {
  scan,
  lint,
  cleanupPlan,
  formatSummary,
  listSkillLocations,
  evalPack,
  stubAdapter
} from "skillcrit";

const skills = scan(".");
const report = lint(skills);
console.log(formatSummary(report));
console.log(listSkillLocations(".", { user: true }));
```

## Non-goals (v0.4)

Another process kit. A hosted leaderboard. A cost-governor proxy. A merge queue. Auto-deleting skills from disk.

## License

MIT
