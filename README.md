# skillcrit

Lint stacked [Agent Skills](https://agentskills.io) packs and eval a pack **on vs off**.

[![skills.sh](https://skills.sh/b/tangericm/skillcrit)](https://skills.sh/tangericm/skillcrit)

## Install

```bash
npx skills add tangericm/skillcrit
```

That is the same install path as [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) and [anthropics/skills](https://github.com/anthropics/skills). It places `skills/skillcrit` (SKILL.md + LICENSE) where Claude Code, Cursor, Codex, and the other supported agents look.

**CLI** (Node 22+, macOS / Linux / Windows):

```bash
npm i -g skillcrit
skillcrit --version
```

From a clone (`prepublishOnly` builds `dist/` for `npx skillcrit`):

```bash
git clone https://github.com/tangericm/skillcrit.git
cd skillcrit
npm install
npm test
npm run build
npm link
skillcrit roots
```

**Claude Code marketplace** (local path must start with `./`):

```bash
claude plugin marketplace add ./
claude plugin install skillcrit@skillcrit
```

Or `claude plugin marketplace add tangericm/skillcrit`. Put the CLI on PATH (`npm i -g` or `npm link`).

## Use when

- "Do my installed skills conflict?"
- "How many always-on tokens am I paying?"
- "Where do Qwen / Hermes / Pi / Codex skills live?"
- "Does this pack help on vs off?"

```bash
skillcrit roots
skillcrit lint . --user --fix
skillcrit eval path/to/pack --agent stub
```

TTY runs write `[skillcrit] …` counts to stderr. `--json` stays quiet. Exit code `1` means findings (warnings or errors), not a crash.

## What it does

```
skillcrit roots [path]             # project + user skill/plugin locations
skillcrit scan [path] [--user]     # inventory of SKILL.md + plugin manifests
skillcrit lint [path] [--user]     # conflicts, duplicates, versions, tokens
skillcrit lint [path] --fix        # dry-run cleanup plan + questions
skillcrit eval <pack>              # frozen tasks, pack on vs off
```

| Command | Scope |
|---|---|
| `skillcrit lint .` | This project |
| `skillcrit lint . --user` | Project plus user-level installs |
| `skillcrit roots` | Known dirs and whether they exist |

Discovery follows [agentskills.io](https://agentskills.io/client-implementation/adding-skills-support) (`.agents/skills` + `.<client>/skills`) plus first-party docs:

| Harness | Project | User / admin |
|---|---|---|
| Cross-client | `.agents/skills/` | `~/.agents/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/`, `~/.claude/plugins/` |
| Cursor | `.cursor/skills/` | `~/.cursor/skills/`, `~/.cursor/plugins/` (also loads Claude/Codex dirs) |
| Codex | `.codex/skills/` (legacy) | `~/.agents/skills/`, `~/.codex/skills/`, `~/.codex/plugins/`, `/etc/codex/skills` |
| Qwen Code | `.qwen/skills/` | `~/.qwen/skills/` |
| Gemini CLI | `.gemini/skills/` | `~/.gemini/skills/` |
| Hermes | `.hermes/skills/` | `~/.hermes/skills/` |
| Pi | `.pi/skills/` | `~/.pi/agent/skills/` |
| OpenCode | `.opencode/skills/` | `~/.config/opencode/skills/`, `~/.opencode/skills/` |
| Copilot | `.github/skills/` | `~/.copilot/skills/` |
| Continue / Goose / DeepSeek | `.<client>/skills/` | `~/.<client>/skills/` |

`--user` walks those home trees. `cache/` and `marketplaces/` copies are tagged and collapsed when the body matches. `fixtures/` and `node_modules/` are skipped. Directory symlinks are followed; cycles are skipped.

Identical copies in `.agents/skills` and `.claude/skills` are a `duplicate-copy` warning. Cache/marketplace mirrors of the same body are info.

Version is **0.4.0** from `package.json` only (do not duplicate it in `SKILL.md`). Claude `plugin.json` omits `version` so git-marketplace installs track the commit SHA.

## Lint rules

When copies contend, rank is **project > user > marketplace > cache**, then newer semver, then more specific descriptions. An overlap chain (A–B, B–C) keeps A and C.

| Rule | Meaning |
|---|---|
| `spec` | `name` / `description` violate the Agent Skills spec |
| `trigger-overlap` | two distinct skills share a distinctive description phrase |
| `contention` | overlap cluster plus a keep/disable order |
| `duplicate-command` | two packs register the same slash command |
| `duplicate-copy` | the same skill body at more than one path |
| `version-conflict` | the same skill name exists as more than one body/version |
| `always-on` | plugin hooks or `ACTIVE EVERY RESPONSE` / `every turn` bodies |
| `always-loaded-tokens` | estimate (`chars / 4`) of unique frontmatter plus always-on bodies |

`--fix` is a dry-run (`keep` / `rm` / `ignore` / `disable`). It does not delete files. After lint it prints unique vs scanned, tokens now vs after cleanup vs description-only, then numbered questions. JSON includes `cleanup[]`, `questions[]`, and `tokens`.

## Eval

Frozen tasks under `fixtures/tasks/` with `on/` vs overbuilt `off/` overlays. `--agent stub` (default) needs no API key. Real Claude / Codex adapters are not in v0.4.

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

const report = lint(scan("."));
console.log(formatSummary(report));
```

## License

MIT License. See [LICENSE](LICENSE). The same terms are bundled in [`skills/skillcrit/LICENSE`](skills/skillcrit/LICENSE) so they travel with `npx skills add`.
