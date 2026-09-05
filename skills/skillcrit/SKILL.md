---
name: skillcrit
description: Audit installed agent skills. Use when the user asks about skill conflicts or duplicates, context costs, skill locations, SKILL.md conformance, cleanup recommendations, or skill-pack evaluation.
license: MIT
compatibility: Requires Node 22+ and the skillcrit CLI reachable as a process.
metadata:
  author: Eric Tang
  repo: https://github.com/tangericm/skillcrit
  version: "0.5.1-rc.2"
---

# skillcrit

Run the CLI as a process and report what it prints. Do not guess about
installed skills, and do not import `main` from a scratchpad.

## Which command

| The user wants to know | Run |
| --- | --- |
| Which copies to review for cleanup (runtime selection remains unknown) | `skillcrit doctor [path]` |
| Estimated context cost of the recommended set | `skillcrit doctor [path]` |
| Every problem, with a fix per finding | `skillcrit lint [path]` |
| What to delete, as a reviewable plan | `skillcrit lint [path] --fix` |
| Whether one SKILL.md is spec-conformant | `skillcrit lint <skill-dir>` |
| Where skills live on this machine | `skillcrit roots [path]` |
| A flat list of what is installed | `skillcrit scan [path]` |
| What a rule ID means | `skillcrit rules` |
| Whether a skill pack helps | `skillcrit eval <pack-dir>` — read the caveats below |

Add `--user` whenever the question is about the machine rather than one repo.
Without it only the project tree is read.

Add `--json` when you need to compute over the result. Print the text form when
the user is reading it.

## When not to use this

- Authoring a new skill from scratch — skillcrit checks skills, it does not
  write them.
- "Is this skill safe?" — `SC4xxx` findings are signals for a human to read,
  not a verdict. Say so explicitly rather than reporting a clean run as safe.
- Anything about tool permissions, MCP servers, or subagents. Out of scope.

## Preflight

Skill/plugin installation provides instructions only; the CLI is a separate prerequisite.
Run `skillcrit --version`. If missing, explain that Node 22+ and
the CLI are required. This is release candidate 0.5.1-rc.2; npm publication is
still pending. A checksum-verified archive is available from the GitHub prerelease.
With an authorized source checkout, build it using `npm ci` and `npm run build`,
then use its `dist/cli.js` directly or install it with `npm install -g .`.
After prerelease publication, `npm i -g skillcrit@next` is an alternative. Obtain approval before
installing software; npm downloads packages. After installation, verify the
version and run `skillcrit doctor .` from the project being audited.

Only if a real source checkout already exists, use
`node <checkout>/dist/cli.js` after building it. Never assume a skill folder or
plugin cache contains a built CLI. Reuse the invocation that succeeded.

Default `[path]` is the session cwd. Do not `cd` into the skillcrit checkout
unless that checkout is the project the user has open.

## Reading the output

- Exit 1 means findings at or above the gate. It is a result, not a crash.
  Exit 2 is bad usage; exit 3 means the run failed or scan coverage is incomplete.
  Check `coverage.complete` and its reasons before treating a report as complete.
- Progress goes to stderr and only on a TTY. Everything you report is on
  stdout.
- Findings carry stable rule IDs (`SC1002`, `SC4003`) and remediation.
  Quote source locations when present. Aggregate findings such as token totals
  have no source-file location; never invent one.
- `doctor` reports cleanup recommendations, not runtime loading. Preserve
  `runtimeResolution: "unknown"` and the report limitations. Equal SKILL.md
  bytes mean identical instructions; scripts and references may differ.
  Verify the client's namespace, enablement, and precedence before explaining
  which copy loads. A recommendation is not permission to remove another copy.
- Do not invent a score, a grade, or a pass/fail that skillcrit did not print.

## Safety invariants

- Inventory commands only read files and write to stdout. They make no network
  calls and need no API key. `eval` executes task code in temporary workspaces;
  custom `--tasks` suites must be trusted and are not security-sandboxed.
- `--fix` is a dry run. It writes one markdown file and never deletes a skill.
  It refuses to write over `package.json`, `SKILL.md`, or `.env`.
- Deleting anything the plan recommends is the user's decision. Show the plan,
  then ask. Do not delete skill directories on their behalf.
- `--user` reads the documented `$HOME` skill directories. If the user has not
  asked about their machine, leave it off.

## Eval honesty

`eval` is experimental. The only shipped adapter is `stub`, which replays
recorded fixtures: deterministic, no API key, and it measures nothing about any
real agent. Run `skillcrit eval --agent list` before quoting any number, and
pass through the `limitations` section the summary prints. `--repeat <n>`
reports standard deviation; a single trial of a stochastic agent is an
anecdote.

## References

- `references/commands.md` — every command, flag, exit code, and output format.
- `references/rules.md` — what each rule family means and how to configure it.
- `references/interpreting.md` — the cleanup model, token accounting, and
  how to write up a result.
