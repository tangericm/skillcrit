# skillcrit

Lint stacked [Agent Skills](https://agentskills.io) packs and eval a pack **on vs off**.

This repository used to be `agent-loop`, a Claude Code / Codex workflow plugin. GitHub Trending on 3 September 2026 was a skills gold rush with almost no independent quality signal and no composition analysis. **skillcrit** is the pytest of skills plus a conflict linter — not another methodology pack.

```
skillcrit scan [path]     # inventory of SKILL.md + plugin manifests
skillcrit lint [path]     # overlapping triggers, duplicate commands, always-on tokens
skillcrit eval <pack>     # frozen tasks, pack on vs off: tests / overbuild / time
```

## Install

```bash
git clone https://github.com/tangericm/skillcrit.git
cd skillcrit
npm install
npm test
npx tsx src/cli.ts lint .
```

After `npm run build`, the `skillcrit` binary is `dist/cli.js`.

As a skill (Claude Code / Cursor / anything that reads `SKILL.md`):

```bash
npx skills add tangericm/skillcrit --skill skillcrit
```

Or install this repo as a Claude Code marketplace plugin:

```bash
claude plugin marketplace add <path-or-git-url>
claude plugin install skillcrit@skillcrit
```

## What `lint` looks at

It walks project skill dirs (`.agents/skills`, `.claude/skills`, `.cursor/skills`, `.codex/skills`, `skills/`, `plugins/*/skills`) and, with `--user`, the matching home-directory plugin trees.

Rules:

| Rule | Meaning |
|---|---|
| `spec` | `name` / `description` violate the Agent Skills spec (folder match, charset, length) |
| `trigger-overlap` | two `description` fields share a distinctive phrase (example: both fire on “continue the plan”) |
| `duplicate-command` | two packs register the same slash command |
| `always-on` | plugin hooks or `ACTIVE EVERY RESPONSE` / `every turn` bodies |
| `always-loaded-tokens` | estimate (`chars / 4`) of frontmatter descriptions plus always-on bodies |

It does **not** parse private session stores or ECC-private config.

Exit code `1` when there is any error or warning.

## What `eval` measures

A frozen task suite under `fixtures/tasks/`. Each task has a starting `repo/`, a minimal `on/` overlay, and an overbuilt `off/` overlay.

`--agent stub` (default, used in CI) applies those overlays. It needs no API key. Real Claude / Codex adapters are not in v0.1.

Metrics per task: tests passed, source lines, overbuild vs the `on/` golden, wall time, tokens if the adapter reports them.

## Library

```ts
import { scan, lint, evalPack, stubAdapter } from "skillcrit";

const skills = scan(".");
const report = lint(skills);
const summary = await evalPack({
  tasksDir: "fixtures/tasks",
  packDir: "path/to/some-skill",
  adapter: stubAdapter
});
```

## Non-goals (v0.1)

Another process kit. A hosted leaderboard. A cost-governor proxy. A merge queue.

## License

MIT
