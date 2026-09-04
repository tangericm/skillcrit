---
name: skillcrit
description: >
  Lint stacked Agent Skills packs and eval a pack on vs off. Use when the user
  asks whether installed skills conflict, how many always-on tokens they add,
  whether a skill pack helps, or to run skillcrit / skill-pack evals.
license: MIT
compatibility: Requires Node 22+ and the skillcrit CLI on PATH.
---

# skillcrit

Do not guess about stacked skills. Run the CLI as a process. Do not import
`main` from a scratchpad.

Do not `cd` into the skillcrit git clone unless that clone is the project the
user has open. Default `[path]` is the session cwd.

Every Bash call is a fresh process. Prefer `skillcrit` on PATH (`npm i -g skillcrit`
or `npm link` after `npm run build`). Fallbacks: `node <checkout>/dist/cli.js`,
then `npx tsx <checkout>/src/cli.ts`.

Run **both** scopes when the user asks about installed skills in general:

```bash
skillcrit --version
skillcrit lint [path] --json
skillcrit lint [path] --user --json
skillcrit scan [path] --json
skillcrit eval <pack-dir> --agent stub --json
```

- Project lint (no `--user`) is the current repo: `.agents/skills`, `.claude/skills`, `.cursor/skills`, `.codex/skills`, `skills/`, `plugins/`.
- `--user` adds `~/.agents/skills` and Claude/Cursor/Codex plugin trees. It skips `cache/`, `marketplaces/`, `fixtures/`, and `node_modules/` so mirrored installs are not counted eight times.
- Identical copies of one skill (same name and body at two paths, e.g. `.agents` and `.claude`) are `duplicate-copy`, not trigger-overlap-with-self.
- `eval` uses bundled fixtures. Default `--agent stub` needs no API key.

Lint exit code 1 means findings (warnings or errors), not a crash. Print stdout. Do not average findings into a single score.
