---
name: skillcrit
description: >
  Lint stacked Agent Skills packs and eval a pack on vs off. Use when the user
  asks whether installed skills conflict, how many always-on tokens they add,
  whether a skill pack helps, or to run skillcrit / skill-pack evals.
---

# skillcrit

Do not guess about stacked skills. Run the CLI.

Discover the repo (or the installed `skillcrit` binary) and run one self-contained command per question. Every Bash call is a fresh process.

```bash
npx skillcrit lint [path] --json
npx skillcrit scan [path] --json
npx skillcrit eval <pack-dir> --agent stub --json
```

- `lint` walks `SKILL.md` files and plugin manifests. It reports overlapping `description` triggers, duplicate slash commands, always-on hooks/bodies, spec violations, and an always-loaded token estimate. It does not read private session logs.
- `scan` prints the inventory `lint` and `eval` consume.
- `eval` runs the frozen task suite with the pack off, then on. Default `--agent stub` needs no API key. Do not invent a leaderboard.

Pass `--user` to include `~/.agents/skills`, `~/.claude/plugins`, `~/.cursor/plugins`, and `~/.codex/plugins`.

Report the CLI output. Do not average findings into a single score.
