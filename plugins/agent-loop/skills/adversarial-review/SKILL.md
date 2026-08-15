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

```bash
AGENT_LOOP_LIB="$(dirname "$(find ~/.claude/plugins ~/.codex/plugins \
  -path '*agent-loop*' -name env.sh 2>/dev/null | head -1)")"
[ -n "$AGENT_LOOP_LIB" ] || { echo "agent-loop lib not found"; exit 1; }
. "$AGENT_LOOP_LIB/env.sh" && erict_env claude   # or: erict_env codex
adv_check_counterpart "$AGENT_ENGINE" || exit 1
```

**Never proceed when `adv_check_counterpart` fails.** A single-engine review
wearing this command's name is worse than no review, because it claims a
confidence it did not earn.

**Engine identity is always passed explicitly, never sniffed.** `AGENT_ENGINE`
comes only from the `erict_env claude` / `erict_env codex` call above, and
both `adv_check_counterpart` and `adv_counterpart_cmd` take it as an
argument. An engine that inferred its own identity from the environment
could end up reviewing its own work by accident; passing it explicitly
guarantees the counterpart is always the other engine.

## 1. Assemble the brief

- Target diff: `git diff "$(git merge-base HEAD "$(vcs_default_branch)")"...HEAD`
- Criteria: the exit gate or acceptance section of `$(state_get plan)`, or the
  whole plan when it declares none.
- Rules: `$(cfg_get review.rules '.agent/rules.md')`, falling back to
  `AGENTS.md`, then `CLAUDE.md`.
- Schema: `$AGENT_LOOP_LIB/../schema/findings.schema.json` — interpolate this
  absolute path into the brief text. A bare relative path does not resolve
  once the reviewer's working directory is the target repo, not the plugin.

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
- **The counterpart leg** — run `adv_counterpart_cmd "$AGENT_ENGINE" <prompt> <out>`
  with the exit-gate-skeptic lens: does this satisfy the criteria, or merely
  satisfy the tests?

Both legs are read-only, but not enforced identically. The Codex counterpart
is sandboxed read-only by `-s read-only`. The Claude-side legs — the local
`refuter` subagent and the `claude -p` counterpart — have no equivalent
sandbox flag; they are constrained by tool restriction
(`agents/refuter.md` grants `Read, Grep, Glob` only, never `Bash`) and by
instruction, not by a technical sandbox. Neither leg may edit the working
tree regardless of engine.

## 3. Reconcile

```bash
adv_reconcile "$this_engine_out" "$counterpart_out"
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
