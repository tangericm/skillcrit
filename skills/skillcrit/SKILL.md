---
name: skillcrit
description: >
  A linter for your skills. Use when the user
  asks whether installed skills conflict, how many always-on tokens they add,
  whether a skill pack helps, where Qwen/Hermes/Pi/Codex skills live, or to
  run skillcrit / skill-pack evals.
license: MIT
compatibility: Requires Node 22+ and the skillcrit CLI on PATH.
metadata:
  author: Eric Tang
  repo: https://github.com/tangericm/skillcrit
---

# skillcrit

Do not guess about stacked skills. Run the CLI as a process. Do not import
`main` from a scratchpad.

Do not `cd` into the skillcrit git clone unless that clone is the project the
user has open. Default `[path]` is the session cwd.

Every Bash call is a fresh process. Prefer `skillcrit` on PATH (`npm i -g skillcrit`
or `npm link` after `npm run build`). Fallbacks: `node <checkout>/dist/cli.js`,
then `npx tsx <checkout>/src/cli.ts`.

Progress goes to stderr (TTY only). Print stdout. Summaries and questions are
on stdout after findings. Do not invent a score.

```bash
skillcrit --version
skillcrit roots [path] --json
skillcrit lint [path] --json
skillcrit lint [path] --user --json
skillcrit lint [path] --user --fix --out skillcrit-cleanup.md
skillcrit scan [path] --json
skillcrit eval <pack-dir> --agent stub --json
```

- `skillcrit roots` lists project, user, and admin skill/plugin dirs for Claude,
  Cursor, Codex, Qwen, Gemini, Hermes, Pi, OpenCode, Copilot, Continue, Goose,
  and DeepSeek, and whether each path exists.
- Project lint walks the repo (`.agents/skills`, `.claude/skills`, `.cursor/skills`,
  `.codex/skills`, `.qwen/skills`, `.gemini/skills`, `.pi/skills`, `skills/`,
  `plugins/`, and the other harness folders). `--user` adds the matching
  `$HOME` trees plus `/etc/codex/skills`.
- Cache/marketplace copies are tagged and collapsed when the body matches.
- `--fix` is a dry-run markdown inventory: each group lists the **Keep**
  (super) directory — higher scope, newer version — then **Orphans** to
  delete or disable. It writes `skillcrit-cleanup.md` (`--out -` skips the
  write; `--out package.json` / `SKILL.md` / `.env` is refused). Then
  numbered questions and a token comparison. It never deletes skill files.
- `eval` uses bundled fixtures. Default `--agent stub` needs no API key.

Lint exit code 1 means findings (warnings or errors), not a crash.
