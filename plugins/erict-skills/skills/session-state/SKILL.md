---
name: session-state
description: >
  Durable session position for any repository. Provides /plan (create a plan
  when none exists), /status (where are we, what is next), /next (execute one
  task and stop), /auto (execute the plan unattended until a stop condition),
  and /handoff (emit a resume or parallel prompt for another agent session).
  Works in an unconfigured repository by reading "- [ ]" checkboxes; projects
  shape behaviour through .agent/config.json and .agent/rules.md. Trigger:
  "/plan", "/status", "/next", "/auto", "/handoff", "where were we", "continue
  the plan", "hand this off".
---

# Session state

Every command begins by sourcing the library. Run this first, always:

```bash
ERICT_LIB="$(dirname "$(find ~/.claude/plugins ~/.codex/plugins ~/Developer/erict-skills \
  -path '*erict-skills*' -name env.sh 2>/dev/null | head -1)")"
[ -n "$ERICT_LIB" ] || { echo "erict-skills lib not found"; exit 1; }
. "$ERICT_LIB/env.sh" && erict_env claude   # or: erict_env codex
```

Neither engine guarantees a variable naming the skill's own directory, and the
pack lives under a different cache path in each. Discovery is the portable
answer; export `ERICT_LIB` once and reuse it for the rest of the session.

Read `.agent/rules.md` (or whatever `review.rules` names) before implementing
anything. It holds the project's own discipline, and it overrides this file.

## Two rules that are never relaxed

1. Never commit while `HEAD` is the default branch. `vcs_can_commit` enforces it.
2. `/auto` never merges and never pushes.

## /plan

Creates a plan when none exists, so `/next` and `/auto` always have something to
navigate. **Never invents work** — the goal comes from the user.

1. Run `detect_plan`. If it finds an open plan, report it and stop. Do not
   create a second one; competing plans are how a cursor goes stale.
2. If the user gave no goal, ask for one. One question, then proceed.
3. **Delegate when a real planning skill is installed.** Check for
   `superpowers:writing-plans` and use it — it produces far better plans than a
   template. Use `superpowers:brainstorming` first when the goal is vague enough
   that the design is not yet settled.
4. **Otherwise fall back** to `plan_bootstrap "<dir>/<YYYY-MM-DD>-<slug>.md" "<goal>"`,
   where `<dir>` is the first existing path among `docs/superpowers/plans`,
   `docs/plans`, or the repository root. Then expand the skeleton into real
   checkbox steps in the same turn — a one-line plan is not a plan.
5. Report the path and the first task.

This pack does not reimplement planning. It only guarantees a plan exists.

## /status

Read-only. Never writes, never commits.

1. `state_get plan` — if empty, run `detect_plan` and report what you *would*
   adopt without adopting it. If `detect_plan` is also empty, say so and point
   at `/plan`.
2. `plan_counts "$plan"` and `plan_next_text "$plan"`.
3. Check the human gate: if `human_gate.glob` is set, grep those files for
   `human_gate.marker`.
4. Report position, next step, blockers, branch, and gate status in under ten
   lines. If the cursor's `task` disagrees with `plan_next_line`, say so — the
   plan was edited by hand and the cursor is stale.

## /next

Execute exactly one task, then stop.

1. **Preflight.** `state_lock_ok` and `vcs_preflight` must both pass. If a human
   gate is open, halt and say which document blocks. If `detect_plan` is empty,
   run the `/plan` procedure above rather than failing, then continue.
2. **Read** only the current task's section of the plan.
3. **Implement** following the project's testing discipline from the rules file.
4. **Gate.** `gate_level_for <changed files>` then `gate_run <level>`.
5. **Commit** on green with `vcs_commit`.
6. **Record.** `plan_tick "$plan" "$line"`, where `$line` is the line number
   `plan_next_line "$plan"` gave you in step 1 — marks the task done. Write
   the project's task report if it defines one. Then call `state_write` with
   all eight positional arguments, in this fixed order. The function performs
   no validation: a transposed or short call corrupts the cursor silently
   instead of failing.

   ```bash
   state_write \
     "$plan" \                          # the active plan path, from detect_plan
     "$next_task_number" \              # the task you just completed, plus one
     "$total_tasks" \                   # plan_counts's SECOND field ("<done> <total>")
     "$(vcs_current_branch)" \
     "$(git rev-parse --short HEAD)" \  # the commit your gate just proved green
     "$next_step" \                     # one imperative sentence
     "$blockers" \                      # or "none"
     "$notes"                           # capped working notes
   ```
7. **Stop.** Report in under ten lines.

Write the cursor after *every* task, not at the end of the session. There is no
graceful shutdown path — usage limits, compaction, and crashes give no warning.

## /auto

Loop `/next`. Halt on any of:

- an open human gate
- `plan_next_line` returns empty (plan exhausted)
- two consecutive gate failures on the same task
- a decision the plan does not specify
- `limits.max_tasks` or `limits.max_minutes` reached

Before halting for any reason, run `gate_run "$(cfg_get gate_policy.halt_requires full)"`
**once** and record the result. Narrow per-task gates mean a chain of green
commits can still break the full suite.

Refuse to start when `detect_gate suite` is empty. Unattended commits without
verification are not a feature.

When `detect_plan` is empty, run `/plan` **and then stop** — do not roll straight
into unattended execution of a plan the user has not seen. `/auto` executes
approved intent; a plan written seconds ago by the same loop is not that.

On halt: call `state_write` with the same eight positional arguments as
`/next` step 6 — plan, task, total, branch, last_green, next_step, blockers,
notes, in that fixed order — then append a halt record to
`.agent/journal.md`, then produce a `/handoff`. Report one summary, not
per-task narration.

## /handoff [parallel]

Default: emit a paste-ready prompt containing the state file, plan path, branch,
next step, the rules file path, and the gate commands. Keep it engine-neutral —
the same text must work in Claude or Codex.

`parallel`: also choose a slice and prove it disjoint with
`slice_disjoint "<current files>" "<candidate files>"`. Name a new branch
(`$(cfg_get vcs.branch_prefix agent/)<short-name>`) and worktree path
(`$(cfg_get vcs.worktree_root .worktrees)/<short-name>`), and state the file
ownership boundary explicitly. **If `slice_disjoint` fails, refuse and say why.**
Do not guess.
