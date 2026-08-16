# agent-loop

A cross-engine agent workflow pack for [Claude Code](https://claude.com/claude-code)
and [Codex](https://openai.com/codex/). It gives an agent a durable place to
stand between fresh processes: a session cursor it can read back after a
crash or a compaction, a one-task-at-a-time execution loop, an unattended
runner with real stop conditions, and a way to have the *other* engine
adversarially review its work before you trust it.

It ships as a single plugin, `agent-loop`, defined once and installed into
both hosts from the same source.

## What it does

Six commands, all backed by the same shell library
(`plugins/agent-loop/lib/*.sh`):

- **`/plan`** — create a plan when none exists. Never invents work; the goal
  comes from you. Delegates to `superpowers:writing-plans` when that skill is
  installed, otherwise bootstraps a checkbox skeleton.
- **`/status`** — read-only. Reports where the current plan stands, what the
  next task is, and whether a human gate is blocking progress.
- **`/next`** — execute exactly one task, then stop: preflight checks, gate
  the change, tick the checkbox, stage and commit, write the cursor.
- **`/auto`** — loop `/next` unattended until a real stop condition: an open
  human gate, the plan running out, two consecutive gate failures on the
  same task, a decision the plan doesn't specify, or a configured task/time
  limit. Always runs the full gate once before halting for any reason.
- **`/handoff [parallel]`** — emit a paste-ready resume prompt for another
  session, or (with `parallel`) propose a disjoint slice of work for a
  second agent to pick up.
- **`/adversarial`** — cross-engine refutation review. If you're running in
  Claude, the review is run once locally (by a `refuter` subagent) and once
  in Codex; if you're running in Codex, the roles swap. Findings are
  reconciled into **agreed** / **one-engine-only** / **contradictory**
  buckets — never averaged into a single verdict.

Every one of those commands is documented procedurally as a skill
(`plugins/agent-loop/skills/session-state/SKILL.md` and
`plugins/agent-loop/skills/adversarial-review/SKILL.md`), written for an
agent whose Bash tool calls are each a fresh, stateless process. Nothing in
either skill relies on a shell variable, an exported environment variable,
or a prior `source` surviving from one tool call to the next — that's what
`bin/agent-loop` is for: a single self-contained entry point that re-sources
the whole library and runs one function per invocation.

Works unconfigured in any repository — plans are detected by scanning for
`- [ ]` checkboxes in a handful of conventional locations, and gates are
detected from `package.json`, `Makefile`, `Cargo.toml`, `go.mod`, or
`pyproject.toml`/`pytest.ini`. A project shapes behavior further through
`.agent/config.json` and `.agent/rules.md`.

## Invoking it

The command names above are **trigger phrases, not harness-registered slash
commands.** Each skill lists them in its `description`; the model matches the
phrase and runs the matching procedure. That is what makes the same names
work under both hosts, and it is the route to reach for first:

```
/status
/next
/handoff parallel
```

Trigger matching depends on the model recognizing the phrase. When you want
determinism instead of recognition, name the skill directly.

**Claude Code namespaces every plugin component under the plugin name**, so
the six files in `plugins/agent-loop/commands/` are registered as skills
called `agent-loop:<command>` — never as a bare `/command`. Typing `/status`
alone will not resolve; `claude plugin details agent-loop@eric-tang-skills`
lists what is actually registered.

| You want | Invoke |
|---|---|
| `/plan`, `/status`, `/next`, `/auto`, `/handoff` | `agent-loop:session-state` |
| `/adversarial` | `agent-loop:adversarial-review` |
| one command explicitly | `agent-loop:status`, `agent-loop:next`, … |

The per-command entries are four-line wrappers that delegate to whichever
skill holds the procedure. `agent-loop:session-state` carries all five
session procedures itself, so naming it reaches any of them and skips a hop.

Installing from a git source means the marketplace serves the **pushed**
commit, not your working tree. After pushing a change, refresh the host:

```bash
claude plugin marketplace update eric-tang-skills   # then: claude plugin update agent-loop@eric-tang-skills
codex plugin marketplace upgrade
```

Both take effect on the next session start. Run `claude plugin validate .`
before pushing to catch a broken manifest without a round trip.

## The two safety rules

These are the pack's non-negotiables. Everything else in `.agent/config.json`
is a knob; these are not.

1. **Never commit while `HEAD` is the default branch.** Code-enforced —
   `vcs_can_commit` (`plugins/agent-loop/lib/vcs.sh`) checks the current
   branch against the resolved default branch (explicit config, then
   `origin/HEAD`, then `main`, then `master`) before every commit, and
   refuses loudly — rather than silently falling through to a guess — when
   a configured `vcs.default_branch` doesn't name a real ref.
2. **`/auto` never merges and never pushes.** **Instruction-enforced only.**
   No function anywhere in `lib/*.sh` runs or blocks `git merge`/`git push`.
   The guarantee holds exactly as long as the `/auto` procedure in
   `session-state/SKILL.md` is followed — nothing in code stops a merge or
   push commanded outside it.

## `.agent/config.json`

Every key is optional; an unconfigured repository still works by
autodetection. Validated against
`plugins/agent-loop/schema/agent-config.schema.json`.

| Key | Type | Meaning |
|---|---|---|
| `plan.glob` | string | Glob (relative to the repo) searched first for the active plan, before the built-in location list. |
| `plan.active` | string \| null | Pin a specific plan file, bypassing detection entirely. |
| `gates.focused` / `gates.suite` / `gates.full` | string | Shell command for each gate level. Overrides autodetection. |
| `gate_policy.commit_requires` | `focused` \| `suite` \| `full` | Minimum gate level required before `/next` commits. |
| `gate_policy.halt_requires` | `focused` \| `suite` \| `full` | Gate level `/auto` runs once before halting for any reason. |
| `gate_policy.escalate_when` | object | Glob → level map; a changed file matching a glob raises the required gate for that task. |
| `vcs.default_branch` | string | Explicit default-branch override. Must name a real local or `origin`-tracking branch, or `vcs_can_commit` refuses to commit at all. |
| `vcs.branch_prefix` | string | Prefix for `/handoff parallel`'s proposed branch names. Default `agent/`. |
| `vcs.worktree_root` | string | Root directory for `/handoff parallel`'s proposed worktrees. Default `.worktrees`. |
| `vcs.auto_commit` | boolean | Set `false` to make `vcs_can_commit` refuse unconditionally (a manual-commit-only mode). |
| `human_gate.glob` | string | Files that must contain `human_gate.marker` before `/next`/`/auto` proceed. |
| `human_gate.marker` | string | The literal marker text `/status`/`/next` grep for in those files. |
| `modules` | object | Glob → module-name map, used by `/handoff parallel` to prove two slices of work are disjoint. |
| `preflight` | array of strings | Tools that must be on `PATH` before a commit (or a `git merge`/`stash`/`checkout`/`rebase`/`pull`, via the `git_guard` hook) is allowed to proceed. |
| `review.rules` | string | Path to the project's rules file. Default `.agent/rules.md`, falling back to `AGENTS.md`, then `CLAUDE.md`. |
| `limits.max_tasks` | integer | `/auto` halts after this many tasks. |
| `limits.max_minutes` | integer | `/auto` halts after this many minutes. |

## Install

Same source, two hosts:

**Claude Code:**

```bash
claude plugin marketplace add <path>
claude plugin install agent-loop@eric-tang-skills
```

**Codex:**

```bash
codex plugin marketplace add <path>
codex plugin add agent-loop@eric-tang-skills
```

`<path>` is this repository — a local clone path or a git URL. The
marketplace name is `eric-tang-skills` (`.claude-plugin/marketplace.json`);
the plugin it publishes is `agent-loop`. See
`docs/development/installing.md` for a from-scratch walkthrough and how to
iterate on a local checkout without republishing.

## Verifying a machine

```bash
bash tests/run.sh
```

This is the **per-machine portability validator**, not just a CI check. The
library deliberately targets a bash 3.2 floor plus clean-macOS coreutils —
no GNU `sed`, no GNU `timeout`, no `grep -P`, no `rg` — because the two
hosts it runs under are shipped to very different machines. Run it on every
machine (and every shell) you plan to run `agent-loop` from before trusting
it there; a script that passes on a Linux CI box with GNU tools on `PATH`
is not proof it passes on a stock macOS install, and vice versa.

## Platform support

macOS and Linux are supported natively. **On Windows, this means Git Bash or
WSL only** — there is no `cmd.exe`/PowerShell-native path. The library is
POSIX-shell-and-`bash`-3.2 code invoked as `#!/bin/bash`; it has no route
into a non-POSIX shell.
