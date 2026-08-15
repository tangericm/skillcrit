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
AGENT_LOOP_LIB="$(dirname "$(find ~/.claude/plugins ~/.codex/plugins \
  -path '*agent-loop*' -name env.sh 2>/dev/null | head -1)")"
[ -n "$AGENT_LOOP_LIB" ] || { echo "agent-loop lib not found"; exit 1; }
. "$AGENT_LOOP_LIB/env.sh" && erict_env claude   # or: erict_env codex
```

Neither engine guarantees a variable naming the skill's own directory, and the
pack lives under a different cache path in each. Discovery is the portable
answer; export `AGENT_LOOP_LIB` once and reuse it for the rest of the session.

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
6. **Record.** Edit the plan file directly: change the current task's
   `- [ ]` to `- [x]`, on the exact line `plan_next_line "$plan"` gave you in
   step 1. Match that line precisely and leave the surrounding text alone —
   this is a hand edit, not a search-and-replace across the file. Write the
   project's task report if it defines one.

   Then run `state_stamp` and use the Write tool to compose `.agent/state.md`
   yourself, substituting the six stamped lines verbatim and filling `plan`,
   `task`, and `total_tasks` from what you already hold (the active plan path
   from `detect_plan`, the task you just completed plus one, and
   `plan_counts`'s second field):

   ```markdown
   ---
   plan: <active plan path>
   task: <task number just completed, plus one>
   total_tasks: <plan_counts's second field>
   branch: <stamped>
   last_green: <stamped>
   engine: <stamped>
   pid: <stamped>
   host: <stamped>
   updated: <stamped>
   ---

   ## Next concrete step
   <one imperative sentence>

   ## Blockers
   <or "none">

   ## Working notes
   <working notes, oldest first, newest last>
   ```

   `state_get` and `state_section` read this back by key and heading, so the
   shape must match exactly: `---` as the literal first line, one
   `key: value` pair per frontmatter line, then `## Heading` lines with no
   blank line between a heading and the text that follows it. Cap Working
   notes at 40 lines — a documented convention, not something code enforces —
   and when notes exceed the cap, **keep the newest 40 lines and drop the
   oldest**.
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

On halt: compose `.agent/state.md` the same way as `/next` step 6 — `state_stamp`
plus the Write tool, from the same template — then append a halt record to
`.agent/journal.md`, then produce a `/handoff`. Report one summary, not
per-task narration.

## /handoff [parallel]

Default: emit a paste-ready prompt containing the state file, plan path, branch,
next step, the rules file path, and the gate commands. Keep it engine-neutral —
the same text must work in Claude or Codex.

`parallel`: also choose a slice and prove it disjoint from the current work,
by hand:

1. List the files the current work touches and the files the candidate slice
   touches.
2. Map each file to a module: if `.agent/config.json` has a `modules` map,
   use the name of the first entry whose glob matches the file; otherwise use
   the file's first two path components (or just the first, if the path has
   only one).
3. Compare the two module sets. If they share a module, **refuse rather than
   guess** — name the shared module in the refusal.

Only when the sets are disjoint: name a new branch
(`$(cfg_get vcs.branch_prefix agent/)<short-name>`) and worktree path
(`$(cfg_get vcs.worktree_root .worktrees)/<short-name>`), and state the file
ownership boundary explicitly.
