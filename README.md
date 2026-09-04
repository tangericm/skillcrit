# skillcrit

Lint stacked [Agent Skills](https://agentskills.io) packs and eval a pack **on vs off**.

This repository used to be `agent-loop`, a Claude Code / Codex workflow plugin. GitHub Trending on 3 September 2026 was a skills gold rush with almost no independent quality signal and no composition analysis. **skillcrit** is the pytest of skills plus a conflict linter — not another methodology pack.

```
skillcrit --version
skillcrit scan [path] [--user]     # inventory of SKILL.md + plugin manifests
skillcrit lint [path] [--user]     # conflicts, duplicates, always-on tokens
skillcrit eval <pack>              # frozen tasks, pack on vs off
```

Version is **0.2.0**, from `package.json` only (the Agent Skills spec / skillpm convention: do not duplicate version in `SKILL.md`). `skillcrit --version` prints it. Claude's `plugin.json` omits `version` so git-marketplace installs track the commit SHA.

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

`--user` walks `~/.agents/skills`, `~/.claude/plugins`, `~/.cursor/plugins`, and `~/.codex/plugins`, but skips `cache/`, `marketplaces/`, `fixtures/`, and `node_modules/`. That is what inflated the first run to 439 entries (the same plugin cached under Claude and Cursor, plus this repo's test fixtures inside the plugin cache).

Identical copies in `.agents/skills` and `.claude/skills` are a real `duplicate-copy`, not cache noise.

## What `lint` looks at

Project dirs: `.agents/skills`, `.claude/skills`, `.cursor/skills`, `.codex/skills`, `skills/`, `plugins/*/skills`.

| Rule | Meaning |
|---|---|
| `spec` | `name` / `description` violate the Agent Skills spec (folder match, charset, length) |
| `trigger-overlap` | two **distinct** skills share a distinctive `description` phrase |
| `duplicate-command` | two packs register the same slash command |
| `duplicate-copy` | the same skill body is installed at more than one path |
| `always-on` | plugin hooks or `ACTIVE EVERY RESPONSE` / `every turn` bodies |
| `always-loaded-tokens` | estimate (`chars / 4`) of unique skills' frontmatter plus always-on bodies |

It does **not** parse private session stores or ECC-private config.

Exit code `1` when there is any error or warning (Claude Code's Bash panel will label that `Error` — it is not a crash).

## What `eval` measures

A frozen task suite under `fixtures/tasks/`. Each task has a starting `repo/`, a minimal `on/` overlay, and an overbuilt `off/` overlay.

`--agent stub` (default, used in CI) applies those overlays. It needs no API key. Real Claude / Codex adapters are not in v0.2.

Metrics per task: tests passed, source lines, overbuild vs the `on/` golden, wall time, tokens if the adapter reports them.

## Library

```ts
import { scan, lint, evalPack, stubAdapter } from "skillcrit";

const skills = scan(".");
const report = lint(skills);
const summary = await evalPack({
  packDir: "path/to/some-skill",
  adapter: stubAdapter
});
```

## Non-goals (v0.2)

Another process kit. A hosted leaderboard. A cost-governor proxy. A merge queue.

## License

MIT
