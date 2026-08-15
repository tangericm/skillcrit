# erict-skills — cross-engine agent workflow commands

Design date: 2026-08-15. Status: approved for planning.

A portable skill pack giving Claude Code and Codex a shared, resumable working
loop over any repository's plan. Distributed as one git repository carrying both
engines' manifests. Project-independent by default; projects layer their own
behaviour on top through configuration, never by forking the skills.

## Problem

Long agent sessions lose their place. A usage limit, a context compaction, a
crash, or simply closing the laptop severs the session, and the next one restarts
from an expensive re-derivation of "where were we". Handing work to a second
agent — a parallel Codex session, another machine — means writing that context by
hand every time.

Two engines make it worse. Claude Code and Codex read different instruction
surfaces, so anything written for one silently fails to bind the other. Rules
duplicated across both drift within days.

The existing skill packs (superpowers, mattpocock, caveman) supply process for
*doing* work. None supplies durable *position* — what plan is active, which task
is next, what has already been proven green, and what is blocking.

## Goals

1. Any session, in either engine, can answer "where are we and what is next" in
   under five tool calls.
2. Work survives session death without a graceful shutdown path.
3. One unit of work executes, verifies, and records itself without supervision.
4. A second agent can be handed a disjoint slice with no hand-written prompt.
5. Progress can be reviewed adversarially by the *other* engine.
6. All of the above work in a repository that has never heard of this pack.

## Non-goals

- A failure-mode ledger with distillation into project rules. Deferred; `/auto`
  records only its own halt reasons.
- Merging, pushing, or releasing. The loop stops at the integration boundary.
- Replacing superpowers' planning skills. This pack consumes plans; it does not
  author them.
- Any Godot, mobile, or game-specific behaviour. Those live in a consuming
  project's configuration.

## Core decision: cursor, not copy

State is a **cursor into artifacts that already exist**, never a duplicate of
them. Plans, task reports, and checklists live where the project already keeps
them. The state file records only position and irrecoverable reasoning.

Duplicated state goes stale, and stale state is worse than none — it is confidently
wrong. Every field in the state file is either a pointer or something that cannot
be recomputed by reading the repository.

## Architecture

### Distribution

One git repository, two manifests, one shared skills directory. This layout is
proven by the `caveman` pack, which serves both engines from a single source.

```
erict-skills/
├── .claude-plugin/
│   ├── marketplace.json                 Claude Code marketplace
│   └── plugin.json                      Claude hooks + metadata
├── plugins/erict-skills/
│   ├── .codex-plugin/plugin.json        Codex manifest; "skills": "./skills/"
│   ├── skills/
│   │   ├── session-state/SKILL.md       /status /next /auto /handoff
│   │   └── adversarial-review/SKILL.md  /adversarial
│   ├── commands/                        Claude-only shims, 3 lines each
│   ├── agents/                          Claude subagent definitions
│   ├── lib/*.sh                         engine-agnostic logic
│   └── schema/                          JSON Schemas for config and verdicts
├── docs/superpowers/specs/
└── tests/                               bash fixtures, no network, no engine
```

Both engines accept a local filesystem marketplace source, so the pack installs
from a path during development and from a GitHub remote once published.

**Logic lives in exactly one place per concern.** `SKILL.md` holds the procedure
both engines read. `lib/*.sh` holds every deterministic decision. Manifests carry
no behaviour, and the Claude `commands/` files do nothing but name the skill.

### The three layers of project knowledge

| Layer | File | Read by | Required |
|---|---|---|---|
| Generic engine | `lib/*.sh`, `SKILL.md` | both engines | ships with pack |
| Machine config | `.agent/config.json` | `lib/*.sh` via `jq` | optional |
| Prose rules | `.agent/rules.md` | the model, at command time | optional |

A repository with neither file gets working defaults through detection. A
repository with both gets fully project-shaped behaviour. Nothing about a
consuming project is ever hardcoded into the pack.

`config.json` answers questions a script can act on: which glob holds plans, what
command runs which gate, what branch prefix to use. `rules.md` answers questions
only the model can act on: which invariants a reviewer should hunt for, what
"done" means here, what never to touch.

## The state file

`.agent/state.md`, one per worktree, gitignored.

```markdown
---
plan: docs/superpowers/plans/2026-08-14-plan-3.md
task: 4
total_tasks: 9
branch: codex/kernel-hardening
worktree: .worktrees/kernel-hardening
last_green: 241007c
gate_level: suite
engine: claude
pid: 48213
updated: 2026-08-15T09:12:00Z
---

## Next concrete step
<one imperative sentence>

## Blockers
<or "none">

## Working notes
<capped at 40 lines>
```

**Per worktree, because a worktree is one unit of work.** A committed state file
would conflict across concurrent branches and fill history with cursor churn. It
is lost when the worktree is removed, which is correct: by then the work has
landed and the durable record is the commits and the project's own task reports.

`engine` and `pid` exist so a second agent entering the same worktree detects the
collision and refuses rather than interleaving writes.

The `.agent/` directory is **partly committed**. Ignoring the whole directory
would ignore the configuration, so the consuming project's `.gitignore` names the
two volatile files only:

```gitignore
.agent/state.md
.agent/journal.md
```

`.agent/config.json` and `.agent/rules.md` are committed — they are project
contract, and a fresh clone or a new worktree must inherit them.

`Working notes` is the anti-compaction payload and the only free-form field. It
holds what would be expensive to re-derive — which file owns a behaviour, why an
approach was rejected, what a confusing test actually asserts. It is explicitly
*not* a summary of the diff, which git already stores. The 40-line cap is enforced
by `lib/state.sh` on write; overflow drops the oldest lines.

### Write discipline

The file is rewritten at the end of every task by `/next`, not at shutdown. This
is a crash-only design: there is no graceful exit path to depend on, because the
failure modes that matter — usage exhaustion, context compaction, process death —
provide no warning and no final turn.

Hooks are a backstop, not the mechanism:

| Hook | Engine | Action |
|---|---|---|
| `SessionStart` | Claude | inject `.agent/state.md` if present |
| `PreCompact` | Claude | emit a reminder to refresh state before compacting |
| `PreToolUse` | Claude | block git write commands when `preflight` tools are missing |

Codex has no equivalent hook surface in this design; its equivalent is the
`SKILL.md` instruction to read state first, which both engines follow.

## Commands

### `/status`

Read-only. Loads the cursor, greps only the active task's region of the plan,
checks for an open human gate, and reports position, next step, and blockers.
Never writes. Target: three tool calls.

If no state file exists, it runs plan detection and reports what it *would*
adopt, without adopting it.

### `/next`

Executes exactly one task, then stops.

1. **Preflight** — human gate open? `preflight` tools on `PATH`? working tree
   clean? another engine holding the state file? Any failure halts before work.
2. **Read** the current task from the plan. No other plan content enters context.
3. **Implement**, following the project's own testing discipline from `rules.md`.
4. **Gate** at the narrowest level that proves the change, floored at
   `gate_policy.commit_requires` and escalated when a changed path matches
   `gate_policy.escalate_when`.
5. **Commit** on green, never on the default branch.
6. **Record** — tick the plan checkbox, write the project's task report if it
   defines one, rewrite the cursor.
7. **Stop** and report in under ten lines.

### `/auto`

Loops `/next`. Commits on green. **Never merges, never pushes.**

Halts on any of:

- an open human gate
- the plan is exhausted
- two consecutive gate failures on the same task
- a decision the plan does not specify
- the token budget or wall-clock limit in config

Before halting for any reason, it runs the `full` gate **once** and records the
result. Per-task gates are deliberately narrow for speed, so a chain of
individually-green commits can still break the full suite; one full run per
session catches that without paying for it per commit.

On halt it rewrites the cursor, appends a halt record to `.agent/journal.md`, and
emits a handoff. It reports one summary, not per-task narration.

`/auto` refuses to run when no gate is configured or detectable. Unattended
commits without verification are not a feature.

### `/handoff [parallel]`

Default emits a paste-ready resume prompt: state file contents, plan path, branch,
next step, applicable rules, and gate commands. Engine-neutral — the same text
works pasted into Claude or Codex.

`parallel` additionally selects a slice disjoint from the current work, names a
new branch and worktree path, and states the file-ownership boundary explicitly.
Disjointness is decided by the config's declared module boundaries when present,
and by non-overlapping file sets otherwise. **It refuses rather than guessing**
when it cannot prove two slices are independent.

### `/adversarial`

Cross-engine refutation review of progress against the plan's exit criteria.

Both legs receive the same brief and are instructed to **refute, not assess**:
"this work claims to satisfy the following criteria — find why it does not."
Reviewers default to finding fault, because an assessor asked for an opinion
returns an opinion, while a refuter asked for a defect returns evidence.

- **Claude leg** — subagent, lens: rule and invariant violation, sourced from
  `rules.md`.
- **Codex leg** — `codex exec` with a read-only sandbox, lens: does the work
  satisfy the criteria, or merely satisfy the tests?

**Self-review is prevented by an explicit flag, not by environment sniffing.**
Each engine's shim invokes `lib/adversarial.sh --self <engine>`, and the script
runs the counterpart. From Claude that is `codex exec`; from Codex that is
`claude -p`. Both counterparts run read-only and require no write access.

Verdicts return as JSON validated against `schema/findings.schema.json`, so
reconciliation is a data merge rather than prose parsing.

Output buckets findings into:

- **Both agree** — highest confidence, act on these.
- **One engine only** — needs adjudication; this bucket is the entire reason for
  a second engine.
- **Contradictory** — both claims shown verbatim.

Findings are never averaged or merged into a consensus score. Averaging two
models' judgements destroys exactly the signal the second engine was bought for.

If the counterpart engine is missing or unauthenticated, the command **fails
loudly** and does not silently degrade to a single reviewer.

## Configuration

`.agent/config.json`, validated against `schema/agent-config.schema.json`. Every
key is optional; the table gives the behaviour when absent.

| Key | Purpose | Default when absent |
|---|---|---|
| `plan.glob` | where plans live | detect: `docs/superpowers/plans/*.md`, `docs/plans/*.md`, `PLAN.md`, `TODO.md` |
| `plan.active` | pin one plan | most recently modified plan containing an unchecked box |
| `plan.task_marker` | task syntax | `- [ ]` |
| `gates.focused/suite/full` | verification commands | detect from `package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, `go.mod` |
| `gate_policy.commit_requires` | **floor** gate level before commit | `focused` |
| `gate_policy.escalate_when` | path patterns forcing a wider gate | `{}` |
| `gate_policy.halt_requires` | gate before `/auto` halts | `full` |
| `vcs.branch_prefix` | new branch naming | `agent/` |
| `vcs.worktree_root` | worktree location | `.worktrees` |
| `vcs.auto_commit` | may commit | `true`, except never on the default branch |
| `human_gate.glob` / `.marker` | blocking approvals | no human-gate check |
| `preflight` | tools required on `PATH` | `[]` |
| `review.rules` | prose rules for reviewers | `.agent/rules.md`, else `AGENTS.md`, else `CLAUDE.md` |
| `limits.max_tasks` / `.max_minutes` | `/auto` ceiling | 10 tasks, 120 minutes |

Two safety rules are **not** configurable, because they are the difference
between unattended work and unattended damage:

1. `/next` and `/auto` never commit while `HEAD` is the repository's default
   branch.
2. `/auto` never merges and never pushes.

### Generic operation

The universal plan substrate is a markdown file containing `- [ ]` checkboxes.
"The next concrete step" is the first unchecked box in the active plan. This holds
for superpowers plans, mattpocock plans, and an ordinary `TODO.md`, which is why
the pack works in a repository that has never been configured for it.

## Testing

Deterministic logic is bash and gets bash fixtures under `tests/`, runnable
without either engine, without network, and without an API key:

- state file round-trip, including the 40-line notes cap and overflow
- plan detection across each supported layout, and ambiguity handling
- next-task selection, including a plan with zero unchecked boxes
- gate detection across each supported project type
- gate escalation given a changed-file list
- default-branch commit refusal
- preflight failure when a required tool is absent from `PATH`
- concurrent-writer refusal when `engine`/`pid` disagree
- disjoint-slice rejection when two candidate slices share a module
- findings reconciliation into agree / one-only / contradictory buckets
- `--self` routing selects the counterpart engine, never itself

Prompt-driven behaviour is not unit-testable and is verified by running `/next`
against a real task in a consuming repository. The fixtures must not depend on
tools absent from a clean macOS install: no `rg`, no GNU `sed`, no GNU `timeout`.

## Rollout

1. Build the pack standalone with fixtures green and no consuming project.
2. Install into both engines from a local marketplace source; verify `/status`
   answers correctly in a repository with no `.agent/` directory at all.
3. Add `.agent/config.json` and `.agent/rules.md` to `idle-rpg-mobile` as the
   first consumer, and confirm nothing about that project leaked into the pack.
4. Publish to GitHub and switch both engines to the git source.

Step 2 is the real test of project-independence: if the pack needs a consuming
project to be useful, the layering is wrong.

## Risks

| Risk | Disposition |
|---|---|
| Narrow per-task gates pass; full suite breaks | `/auto` runs `full` once before halting |
| Two engines' copies of a rule drift | one `SKILL.md`, one `lib/`; manifests hold no logic |
| Pack accreted project-specific behaviour | rollout step 2 gates on a bare repository |
| `/adversarial` reviews itself | explicit `--self` flag from each shim |
| Missing `PATH` tool corrupts a git operation mid-write | `preflight` list plus `PreToolUse` guard |
| Two agents share a worktree | `engine` + `pid` in state; second writer refuses |
| Counterpart engine absent or unauthenticated | fail loudly; never degrade to one reviewer |
| Cursor drifts from reality after manual edits | every field is a pointer; `/status` re-derives and reports mismatch |
| `/auto` runs away | `limits.max_tasks`, `limits.max_minutes`, no merge, no push |
