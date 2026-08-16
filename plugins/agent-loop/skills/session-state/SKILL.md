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

**Every Bash tool call is a fresh process.** An agent's shell does not carry
state from one tool call to the next the way an interactive shell does —
variables, sourced functions, anything set in one call is gone by the next.
`AGENT_LOOP_LIB="..."` set in one command, or a function pulled into scope by
`. env.sh` in one command, will not exist in the command after it. So nothing
below may rely on a prior `source`, and nothing below may rely on a shell
variable surviving between commands either — that variable would be exactly
the same mistake in a different shape.

## Discover the entry point once

Run this once, at the start of the session:

```bash
find ~/.claude/plugins ~/.codex/plugins -path '*agent-loop*' -name agent-loop -type f -perm -u+x 2>/dev/null
```

It prints one absolute path to the `agent-loop` executable. From here on,
`` `<agent-loop>` `` in this document always means **that literal path,
written out as text** — not a variable reference, since a variable would not
survive to the next tool call. Every command below has the shape:

```bash
<agent-loop> claude <function> [args...]   # or: <agent-loop> codex ...
```

Each of those invocations is itself a self-contained fresh process, and that
is deliberate, not incidental: `agent-loop` re-sources the entire library
from scratch on every single call, so there is nothing to keep alive between
them and nothing lost by not keeping it alive. It exits non-zero exactly
when the underlying function does, and passes stdout through unchanged.

The same rule applies to every other value one command's output feeds into a
later command — most often the active plan's path. Wherever this document
writes `<plan path>` below, substitute the literal path text you read from
`state_get plan` or `detect_plan`, written out as text the same way you
write out `<agent-loop>` — never a shell variable like `"$plan"`. No shell
variable survives between Bash tool calls, so a command written as
`plan_counts "$plan"` runs with an empty argument: `plan_counts` sees `""`,
not the path.

Read `.agent/rules.md` (or whatever `review.rules` names) before implementing
anything. It holds the project's own discipline, and it overrides this file.

## Two rules that are never relaxed

1. Never commit while `HEAD` is the default branch. `vcs_can_commit`
   code-enforces it.
2. `/auto` never merges and never pushes. This rule is **instruction-enforced
   only** — no function in `lib/*.sh` runs `git merge` or `git push`, let
   alone blocks them. Nothing stops a merge or push commanded outside this
   procedure; the guarantee holds only as long as this document is followed.

## `.agent/state.md` is last-writer-wins within a host

`state_lock_ok` (called in `/next` step 1) detects only a **different
host's** claim on the state file. There is no pid check and nothing in this
runtime could make one work if there were: every Bash tool call is already
a dead process by the time anything reads the file back (see "Every Bash
tool call is a fresh process" above) — a stamped pid never corresponds to a
live process by the time it matters. Within a single host, whichever engine
writes `.agent/state.md` last wins; two engines racing on the same machine
are not detected or prevented. A passing `state_lock_ok` proves only that no
*other host* currently claims the file — do not read it as proof that no
one else on this machine is working.

## /plan

Creates a plan when none exists, so `/next` and `/auto` always have something to
navigate. **Never invents work** — the goal comes from the user.

1. Run `<agent-loop> claude detect_plan`. If it finds an open plan, report it
   and stop. Do not create a second one; competing plans are how a cursor
   goes stale.
2. If the user gave no goal, ask for one. One question, then proceed.
3. **Delegate when a real planning skill is installed.** Check for
   `superpowers:writing-plans` and use it — it produces far better plans than a
   template. Use `superpowers:brainstorming` first when the goal is vague enough
   that the design is not yet settled.
4. **Otherwise fall back** to
   `<agent-loop> claude plan_bootstrap "<dir>/<YYYY-MM-DD>-<slug>.md" "<goal>"`,
   where `<dir>` is the first existing path among `docs/superpowers/plans`,
   `docs/plans`, or the repository root. Then expand the skeleton into real
   checkbox steps in the same turn — a one-line plan is not a plan.
5. Report the path and the first task.

This pack does not reimplement planning. It only guarantees a plan exists.

## /status

Read-only. Never writes, never commits.

1. `<agent-loop> claude state_get plan` — if empty, run
   `<agent-loop> claude detect_plan` and report what you *would* adopt
   without adopting it. If that is also empty, say so and point at `/plan`.
2. `<agent-loop> claude plan_counts "<plan path>"` and
   `<agent-loop> claude plan_next_text "<plan path>"`.
3. Check the human gate: run `<agent-loop> claude cfg_get human_gate.glob ''`;
   if it prints a non-empty glob, grep those files for the marker from
   `<agent-loop> claude cfg_get human_gate.marker ''`.
4. Report position, next step, blockers, branch, and gate status in under ten
   lines. Compare the cursor's `task` (an ordinal: how many tasks are done,
   plus one) against `plan_counts`'s **first field plus one** — not against
   `plan_next_line`, which reports a raw file line number, a different unit
   entirely; comparing an ordinal to a line number reports "stale" on nearly
   every run even when nothing is wrong. If they disagree, say so — the plan
   was edited by hand (tasks checked or added outside `/next`) and the
   cursor is stale.

## /next

Execute exactly one task, then stop.

1. **Preflight.** `<agent-loop> claude state_lock_ok` and
   `<agent-loop> claude vcs_preflight` must both pass. If a human gate is
   open, halt and say which document blocks. If
   `<agent-loop> claude detect_plan` is empty, run the `/plan` procedure
   above rather than failing, then continue. Get the active plan path —
   `<agent-loop> claude state_get plan`, or the path `detect_plan`/`/plan`
   just printed if no state file exists yet — and hold it as `<plan path>`
   for the rest of this task. Then run
   `<agent-loop> claude plan_next_line "<plan path>"` and hold onto that line
   number — step 5 must edit that exact line.
2. **Read** only the current task's section of the plan.
3. **Implement** following the project's testing discipline from the rules file.
4. **Gate.** `<agent-loop> claude gate_level_for <changed files>` to get the
   level, then `<agent-loop> claude gate_run "<level>"`.
5. **Record the task**, on green. Edit the plan file directly: change the
   current task's `- [ ]` to `- [x]`, on the exact line
   `plan_next_line "<plan path>"` gave you in step 1. Match that line
   precisely and leave the surrounding text alone — this is a hand edit, not
   a search-and-replace across the file. Write the project's task report if
   it defines one. Do this **before** staging — `vcs_commit` never runs
   `git add`, so whatever is staged when you commit is exactly what lands.
   Committing first and ticking the box afterward means the tick never
   makes it into that commit at all.
6. **Stage explicitly.** `git add` exactly the files this task touched: the
   files changed in step 3, the plan file just edited in step 5, and the
   task report file if you wrote one. Never `git add -a`/`-A` — that stages
   whatever other in-progress work happens to be sitting in the tree too.
7. **Commit** with `<agent-loop> claude vcs_commit "<message>"`.
8. **Write the cursor.** Run `<agent-loop> claude state_stamp` and use the
   Write tool to compose `.agent/state.md` yourself, substituting the five
   stamped lines verbatim and filling `plan`, `task`, and `total_tasks` from
   what you already hold (the active plan path from `detect_plan`, the task
   you just completed plus one, and `plan_counts`'s second field):

   ```markdown
   ---
   plan: <active plan path>
   task: <task number just completed, plus one>
   total_tasks: <plan_counts's second field>
   branch: <stamped>
   last_green: <stamped>
   engine: <stamped>
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

   `<agent-loop> claude state_get <field>` and
   `<agent-loop> claude state_section "<Heading>"` read this back by key and
   heading, so the shape must match exactly: `---` as the literal first
   line, one `key: value` pair per frontmatter line, then `## Heading` lines
   with no blank line between a heading and the text that follows it. Cap
   Working notes at 40 lines — a documented convention, not something code
   enforces — and when notes exceed the cap, **keep the newest 40 lines and
   drop the oldest**.
9. **Stop.** Report in under ten lines.

Write the cursor after *every* task, not at the end of the session. There is no
graceful shutdown path — usage limits, compaction, and crashes give no warning.

## /auto

Loop `/next`. Halt on any of:

- an open human gate
- `<agent-loop> claude plan_next_line "<plan path>"` returns empty (plan
  exhausted) — obtain `<plan path>` the same way as `/next` step 1, since
  each loop iteration is its own sequence of fresh Bash tool calls and
  nothing carries over from the last one
- two consecutive gate failures on the same task
- a decision the plan does not specify
- `limits.max_tasks` or `limits.max_minutes` reached

Before halting, run `<agent-loop> claude cfg_get gate_policy.halt_requires
full` to get the required level, then `<agent-loop> claude gate_run
"<level>"` **once** and record the result. Narrow per-task gates mean a
chain of green commits can still break the full suite.

**Skip that gate run entirely when this `/auto` invocation completed zero
tasks** — halted at preflight on an open human gate, an empty
`detect_plan`, an exhausted plan, or a `limits` value already reached
before the first task. The halt gate exists to catch what a chain of narrow
per-task gates let through; with no task run there is no such chain, the
working tree is whatever the last session already verified, and the full
suite is often the most expensive command in the repository. Report the
halt reason and skip it. The gate run is required only once at least one
task has been committed in this invocation.

Refuse to start when `<agent-loop> claude detect_gate suite` is empty.
Unattended commits without verification are not a feature.

When `<agent-loop> claude detect_plan` is empty, run `/plan` **and then
stop** — do not roll straight into unattended execution of a plan the user
has not seen. `/auto` executes approved intent; a plan written seconds ago
by the same loop is not that.

On halt: compose `.agent/state.md` the same way as `/next` step 8 — run
`<agent-loop> claude state_stamp`, then the Write tool, from the same
template — then append a halt record to `.agent/journal.md`, then produce a
`/handoff`. Report one summary, not per-task narration.

## /handoff [parallel]

Default: emit a paste-ready prompt containing the state file, plan path, branch,
next step, the rules file path, and the gate commands. Keep it engine-neutral —
the same text must work in Claude or Codex.

`parallel`: hand a **different** agent a **different** task. Not the current
task, and not any part of it. The receiving agent works at the same time as
this session, on work this session will never touch.

The most common way to get this wrong is to hand off the very thing the
current session is about to do — a prerequisite, a fix the current task
needs, the next step of the current task. That is not parallel work; it is
the same work, raced. Two agents then edit toward the same goal from two
branches. Before proposing any slice, ask: *if the receiving agent never
does this, does the current session still have to?* If yes, it is not a
parallel slice. Choose again.

A parallel slice is **downstream or sideways, never upstream**. Draw it from
the plan's later tasks, a separate module's backlog, or work the current
task's output feeds into — something whose absence does not block this
session and whose presence does not change what this session is doing.

Prove it disjoint from the current work, by hand:

1. List the files the current work touches. Include the files this session
   is *going to* touch, not only the ones already modified — a slice that
   collides with the next commit is not disjoint just because that commit
   has not landed. Then list the files the candidate slice touches. When the
   slice integrates existing commits, read their file lists (`git show
   --name-only`) rather than assuming.
2. Map each file to a module: if `.agent/config.json` has a `modules` map,
   use the name of the first entry whose glob matches the file; otherwise use
   the file's first two path components (or just the first, if the path has
   only one).
3. Compare the two module sets. If they share a module, **refuse rather than
   guess** — name the shared module in the refusal.
4. Check the shared resources neither module set names. Two file-disjoint
   tasks still collide over one booted emulator or device, one database, one
   bound port, one build directory, one external account, or one piece of
   hardware. Name each shared resource and say how the slice avoids it — a
   second emulator profile, a separate database, a different port — or
   refuse. A worktree isolates files; it does not isolate a simulator.
5. Verify the slice's preconditions actually hold right now, before handing
   it over. Branches named in a plan get deleted, referenced commits go
   unreachable, fixtures rot. Run the checks. When a precondition has already
   failed, that discovery belongs in the handoff as a known blocker with the
   evidence, not as a surprise for the receiving agent.

Only when all five pass: get the branch prefix via
`<agent-loop> claude cfg_get vcs.branch_prefix agent/` and the worktree root
via `<agent-loop> claude cfg_get vcs.worktree_root .worktrees`, then name a
new branch `<prefix><short-name>` and worktree path
`<worktree_root>/<short-name>`.

The emitted prompt states the ownership boundary in both directions: what the
receiving agent owns, and what it must not touch because this session is
editing it now. Tell it to stop and report rather than resolve, if a conflict
or a generated file ever puts a not-owned path in its diff.
