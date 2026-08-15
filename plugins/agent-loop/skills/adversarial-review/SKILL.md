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

## 1. Assemble the brief

- Target diff: `git diff "$(git merge-base HEAD "$(vcs_default_branch)")"...HEAD`
- Criteria: the exit gate or acceptance section of `$(state_get plan)`, or the
  whole plan when it declares none.
- Rules: `$(cfg_get review.rules '.agent/rules.md')`, falling back to
  `AGENTS.md`, then `CLAUDE.md`.

Write the brief to a temp file. Both legs receive the same brief.

## 2. Run both legs

Instruct both to **refute, not assess**: "this work claims to satisfy the
following criteria — find why it does not."

- **This engine's leg** — dispatch the `refuter` agent with the invariant and
  rule-violation lens.
- **The counterpart leg** — run `adv_counterpart_cmd "$AGENT_ENGINE" <prompt> <out>`
  with the exit-gate-skeptic lens: does this satisfy the criteria, or merely
  satisfy the tests?

Both legs run read-only. Neither may edit the working tree.

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
