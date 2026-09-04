---
name: skillcrit
description: >
  Lint stacked Agent Skills packs and eval a pack on vs off. Use when the user
  asks whether installed skills conflict, how many always-on tokens they add,
  whether a skill pack helps, or to run skillcrit / skill-pack evals.
---

# skillcrit

Do not guess about stacked skills. Run the CLI. Do not `cd` into the skillcrit
git clone unless that clone is the project the user has open.

Every Bash call is a fresh process. Prefer, in order:

1. `skillcrit` on PATH (`npm link` after `npm run build`)
2. `npx tsx <skillcrit-checkout>/src/cli.ts` if you know the checkout
3. `node <skillcrit-checkout>/dist/cli.js` after `npm run build` there

`npx skillcrit` is not published to npm in v0.1.

Default `[path]` is the user's current project (the session cwd), not the
skillcrit checkout.

```bash
skillcrit lint [path] --json
skillcrit scan [path] --json
skillcrit eval <pack-dir> --agent stub --json
```

- `lint` walks `SKILL.md` files and plugin manifests. It reports overlapping `description` triggers, duplicate slash commands, always-on hooks/bodies, spec violations, and an always-loaded token estimate. It does not read private session logs.
- `scan` prints the inventory `lint` and `eval` consume.
- `eval` runs the frozen task suite with the pack off, then on. Default `--agent stub` needs no API key. Do not invent a leaderboard.

Pass `--user` to include `~/.agents/skills`, `~/.claude/plugins`, `~/.cursor/plugins`, and `~/.codex/plugins`. Combine with an explicit project path: `skillcrit lint "C:\\path\\to\\project" --user --json`.

Print stdout. Empty stdout with exit 0 is a bug, not "no skills". Report the CLI output. Do not average findings into a single score.
