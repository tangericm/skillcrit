---
name: adversarial-review
description: >
  Cross-engine refutation review of current progress against a plan's exit
  criteria. Runs one reviewer in this engine and one in the other (Claude
  reviews via Codex, Codex reviews via Claude), then reconciles verdicts into
  agree / one-engine-only / contradictory buckets without averaging them.
  Trigger: "/adversarial", "adversarial review", "red team this", "review my
  progress with the other agent", "cross-check this work".
---

# Adversarial review

**Every Bash tool call is a fresh process.** An agent's shell does not carry
state from one tool call to the next — variables, sourced functions, and
anything else set in one command is gone by the next one. Nothing below may
rely on a prior `source`, and nothing below may rely on a shell variable
surviving between commands either, for the same reason.

## Discover the entry point once

Run this once, at the start of the review:

```bash
find ~/.claude/plugins ~/.codex/plugins -path '*agent-loop*' -name agent-loop -type f -perm -u+x 2>/dev/null
```

It prints one absolute path to the `agent-loop` executable. From here on,
`` `<agent-loop>` `` in this document always means **that literal path,
written out as text**, not a variable reference. Every command has the shape
`<agent-loop> claude <function> [args...]` (or `<agent-loop> codex ...`
under Codex) — `agent-loop` re-sources the whole library from scratch on
every single call, exits non-zero exactly when the underlying function does,
and passes stdout through unchanged.

Then check the counterpart engine is available before doing anything else:

```bash
<agent-loop> claude adv_check_counterpart claude   # or: <agent-loop> codex adv_check_counterpart codex
```

**Never proceed when `adv_check_counterpart` fails.** A single-engine review
wearing this command's name is worse than no review, because it claims a
confidence it did not earn.

**Engine identity is always passed explicitly, never sniffed.** It comes
only from the `claude`/`codex` word you write into every `<agent-loop>`
command above — both as the wrapper's own first argument and, for
`adv_check_counterpart` and `adv_counterpart_cmd`, as the function's first
argument too. An engine that inferred its own identity from the environment
could end up reviewing its own work by accident; writing it explicitly into
every command guarantees the counterpart is always the other engine.

## 1. Assemble the brief

- Target diff: get the default branch with `<agent-loop> claude vcs_default_branch`,
  then `git diff "$(git merge-base HEAD "<default branch>")"...HEAD`.
- Criteria: the exit gate or acceptance section of the plan at
  `<agent-loop> claude state_get plan`, or the whole plan when it declares none.
- Rules: the file at `<agent-loop> claude cfg_get review.rules '.agent/rules.md'`,
  falling back to `AGENTS.md`, then `CLAUDE.md`.
- Schema: `<the directory containing the discovered agent-loop path>/../schema/findings.schema.json`
  — interpolate this absolute path into the brief text. A bare relative path
  does not resolve once the reviewer's working directory is the target repo,
  not the plugin.

Write the brief to a temp file. Both legs receive the same brief.

## 2. Run both legs

Instruct both to **refute, not assess**: "this work claims to satisfy the
following criteria — find why it does not."

- **This engine's leg:**
  - **Under Claude**, dispatch the `refuter` subagent (`agents/refuter.md`)
    with the brief, using the invariant and rule-violation lens.
  - **Under Codex**, no subagent mechanism exists —
    `.codex-plugin/plugin.json` declares only `skills`, not `agents`. The
    host agent performs the refutation itself, following
    `agents/refuter.md`'s instructions inline against the same brief, and
    produces the same output contract.
- **The counterpart leg** — run
  `<agent-loop> claude adv_counterpart_cmd claude <prompt> <out>` (substituting
  your own engine, `claude` or `codex`, in both places) with the exit-gate-skeptic
  lens: does this satisfy the criteria, or merely satisfy the tests? This
  echoes a shell command; run the command it echoes as a separate step.

Both legs are read-only, but not enforced identically. The Codex counterpart
is sandboxed read-only by `-s read-only`. The Claude-side legs — the local
`refuter` subagent and the `claude -p` counterpart — have no equivalent
sandbox flag; they are constrained by tool restriction
(`agents/refuter.md` grants `Read, Grep, Glob` only, never `Bash`) and by
instruction, not by a technical sandbox. Neither leg may edit the working
tree regardless of engine.

## 3. Reconcile

```bash
<agent-loop> claude adv_reconcile "$this_engine_out" "$counterpart_out"
```

Report in exactly these buckets:

- **Both agree** — highest confidence. Act on these first.
- **One engine only** — needs adjudication. This bucket is the entire reason a
  second engine was involved; do not bury it.
- **Contradictory** — show both claims verbatim and say which you find better
  evidenced, without collapsing them.

**Never average the two verdicts into a consensus score.** Averaging destroys
exactly the signal the second engine was bought for.

Do not fix anything. This command reports; the user decides.
