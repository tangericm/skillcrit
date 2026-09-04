# skillcrit

Lint stacked [Agent Skills](https://agentskills.io) packs and eval a pack **on vs off**.

This repository used to be `agent-loop`, a Claude Code / Codex workflow plugin. GitHub Trending on 3 September 2026 was a skills gold rush with almost no independent quality signal and no composition analysis. **skillcrit** is the pytest of skills plus a conflict linter — not another methodology pack.

```
skillcrit --version
skillcrit scan [path] [--user]     # inventory of SKILL.md + plugin manifests
skillcrit lint [path] [--user]     # conflicts, duplicates, versions, always-on tokens
skillcrit lint [path] --fix        # dry-run cleanup plan (no deletes)
skillcrit eval <pack>              # frozen tasks, pack on vs off
```

Version is **0.3.0**, from `package.json` only (the Agent Skills spec / skillpm convention: do not duplicate version in `SKILL.md`). `skillcrit --version` prints it. Claude's `plugin.json` omits `version` so git-marketplace installs track the commit SHA. Cursor's `plugin.json` tracks `package.json`.

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
```

`prepublishOnly` runs the build, so a future `npm publish` ships `dist/` and `npx skillcrit` works without a local clone.

**Skill** (Claude Code / Cursor / anything that reads `SKILL.md`):

```bash
npx skills add tangericm/skillcrit --skill skillcrit
```

**Claude Code marketplace plugin** (local path must start with `./`):

```bash
claude plugin marketplace add ./
claude plugin install skillcrit@skillcrit
```

Or `claude plugin marketplace add tangericm/skillcrit`. Then put the CLI on PATH (`npm link` or `npm i -g`).

## Scopes

| Command | What it scans |
|---|---|
| `skillcrit lint .` | This project only |
| `skillcrit lint . --user` | This project **plus** user-level installs |

`--user` walks `~/.agents/skills`, `~/.claude/plugins`, `~/.cursor/plugins`, and `~/.codex/plugins`. `cache/` and `marketplaces/` copies are **tagged**, not skipped: they count toward `scanned` but collapse into one unique skill when the body matches. That is what used to inflate a run to 439 entries (the same plugin cached under Claude and Cursor, plus this repo's test fixtures inside the plugin cache). `fixtures/` and `node_modules/` are still skipped.

Identical copies in `.agents/skills` and `.claude/skills` are a real `duplicate-copy` (warning). Cache/marketplace mirrors of the same body are `duplicate-copy` at **info** severity so you can clean plugin folders without treating mirrors as conflicts.

## What `lint` looks at

Project dirs: `.agents/skills`, `.claude/skills`, `.cursor/skills`, `.codex/skills`, `skills/`, `plugins/*/skills`.

Each skill is tagged with an origin (`project` | `user` | `marketplace` | `cache`) and a version when one exists (`plugin.json`, `package.json`, `metadata.version`, or `@x.y.z` in the path). When several copies contend, skillcrit ranks **project > user > marketplace > cache**, then newer semver, then more specific descriptions, and penalizes always-on.

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

`--fix` prints a dry-run cleanup plan (`keep` / `rm` / `ignore` / `disable`). It does **not** delete files. JSON output includes a `cleanup[]` array with the same actions.

It does **not** parse private session stores or ECC-private config.

Exit code `1` when there is any error or warning (Claude Code's Bash panel will label that `Error` — it is not a crash). Info-only findings (harmless mirrors, token totals) do not fail the run.

## What `eval` measures

A frozen task suite under `fixtures/tasks/`. Each task has a starting `repo/`, a minimal `on/` overlay, and an overbuilt `off/` overlay.

`--agent stub` (default, used in CI) applies those overlays. It needs no API key. Real Claude / Codex adapters are not in v0.3.

Metrics per task: tests passed, source lines, overbuild vs the `on/` golden, wall time, tokens if the adapter reports them.

## Library

```ts
import { scan, lint, cleanupPlan, evalPack, stubAdapter } from "skillcrit";

const skills = scan(".");
const report = lint(skills);
console.log(cleanupPlan(report));
const summary = await evalPack({
  packDir: "path/to/some-skill",
  adapter: stubAdapter
});
```

## Non-goals (v0.3)

Another process kit. A hosted leaderboard. A cost-governor proxy. A merge queue. Auto-deleting skills from disk.

## License

MIT
