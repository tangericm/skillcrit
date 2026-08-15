#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/adversarial.sh"

_write_findings() {
  local path="$1"; shift
  printf '%s' "$1" > "$path"
}

test_reconcile_buckets_agreement() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks too","evidence":"e2","severity":"high","refuted":false}]'
  out="$(adv_reconcile "$a" claude "$b" codex)"
  assert_eq "1" "$(printf '%s' "$out" | jq '.agreed | length')" "one agreed finding"
  assert_eq "0" "$(printf '%s' "$out" | jq '.claude_only | length')" "nothing claude-only"
}

test_reconcile_buckets_single_engine_findings() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[{"file":"y.gd","line":3,"category":"spec","claim":"gate unmet","evidence":"e","severity":"medium","refuted":false}]'
  out="$(adv_reconcile "$a" claude "$b" codex)"
  assert_eq "1" "$(printf '%s' "$out" | jq '.claude_only | length')" "one claude-only"
  assert_eq "1" "$(printf '%s' "$out" | jq '.codex_only | length')" "one codex-only"
  assert_eq "0" "$(printf '%s' "$out" | jq '.agreed | length')" "nothing agreed"
}

test_reconcile_flags_contradiction() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[{"file":"x.gd","line":10,"category":"correctness","claim":"does not leak","evidence":"e2","severity":"high","refuted":true}]'
  out="$(adv_reconcile "$a" claude "$b" codex)"
  assert_eq "1" "$(printf '%s' "$out" | jq '.contradictory | length')" "one contradiction"
  assert_eq "0" "$(printf '%s' "$out" | jq '.agreed | length')" "not counted as agreement"
}

test_reconcile_handles_empty_input() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[]'
  _write_findings "$b" '[]'
  out="$(adv_reconcile "$a" claude "$b" codex)"
  assert_eq "0" "$(printf '%s' "$out" | jq '.agreed | length')" "empty reconciles cleanly"
}

test_reconcile_rejects_missing_refuted_both_sides() {
  local a b
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high"}]'
  _write_findings "$b" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks too","evidence":"e2","severity":"high"}]'
  assert_fails "rejects both sides missing refuted" adv_reconcile "$a" claude "$b" codex
}

test_reconcile_rejects_missing_refuted_one_side() {
  local a b
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks too","evidence":"e2","severity":"high"}]'
  assert_fails "rejects one side missing refuted" adv_reconcile "$a" claude "$b" codex
}

test_reconcile_rejects_missing_file() {
  local a b
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[]'
  assert_fails "rejects missing file" adv_reconcile "$a" claude "$b" codex
}

test_reconcile_rejects_missing_line() {
  local a b
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[]'
  assert_fails "rejects missing line" adv_reconcile "$a" claude "$b" codex
}

test_reconcile_rejects_missing_category() {
  local a b
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[]'
  assert_fails "rejects missing category" adv_reconcile "$a" claude "$b" codex
}

test_reconcile_valid_agreement_still_works() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks too","evidence":"e2","severity":"high","refuted":false}]'
  out="$(adv_reconcile "$a" claude "$b" codex)"
  assert_eq "1" "$(printf '%s' "$out" | jq '.agreed | length')" "valid agreement still works"
}

test_reconcile_valid_contradiction_still_works() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[{"file":"x.gd","line":10,"category":"correctness","claim":"does not leak","evidence":"e2","severity":"high","refuted":true}]'
  out="$(adv_reconcile "$a" claude "$b" codex)"
  assert_eq "1" "$(printf '%s' "$out" | jq '.contradictory | length')" "valid contradiction still works"
}

# --- host-direction (attribution) tests -------------------------------------
# The bug this guards against: adv_reconcile used to infer "first file is
# claude's, second is codex's" from argument position. Under a Codex host,
# the skill always passes "this engine's own output" first and "the
# counterpart's output" second -- which under Codex means codex's own
# findings arrive in the first argument. Position-based labeling would then
# bucket codex's own findings as claude_only and vice versa. These two tests
# hold the argument order fixed at (self, counterpart) -- exactly how the
# skill calls it -- and only swap which engine is self, proving the output
# buckets follow the label, not the slot.

test_reconcile_attributes_correctly_when_claude_is_self() {
  local self cp out
  self="$(mktemp)"; cp="$(mktemp)"
  _write_findings "$self" '[{"file":"x.gd","line":10,"category":"correctness","claim":"claude finding","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$cp" '[{"file":"y.gd","line":3,"category":"spec","claim":"codex finding","evidence":"e","severity":"medium","refuted":false}]'
  out="$(adv_reconcile "$self" claude "$cp" codex)"
  assert_eq "claude finding" "$(printf '%s' "$out" | jq -r '.claude_only[0].claim')" "claude's own leg lands in claude_only when claude is self"
  assert_eq "codex finding" "$(printf '%s' "$out" | jq -r '.codex_only[0].claim')" "codex's counterpart leg lands in codex_only when claude is self"
}

test_reconcile_attributes_correctly_when_codex_is_self() {
  local self cp out
  self="$(mktemp)"; cp="$(mktemp)"
  _write_findings "$self" '[{"file":"x.gd","line":10,"category":"correctness","claim":"codex finding","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$cp" '[{"file":"y.gd","line":3,"category":"spec","claim":"claude finding","evidence":"e","severity":"medium","refuted":false}]'
  # Same argument order as the test above (self first, counterpart second) --
  # only the labels swap, exactly as the skill's own call form does when
  # hosted under Codex. Before the fix this inverted claude_only/codex_only.
  out="$(adv_reconcile "$self" codex "$cp" claude)"
  assert_eq "codex finding" "$(printf '%s' "$out" | jq -r '.codex_only[0].claim')" "codex's own leg lands in codex_only when codex is self"
  assert_eq "claude finding" "$(printf '%s' "$out" | jq -r '.claude_only[0].claim')" "claude's counterpart leg lands in claude_only when codex is self"
}

test_reconcile_rejects_unknown_engine_label() {
  local a b
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[]'
  _write_findings "$b" '[]'
  assert_fails "unknown engine label rejected" adv_reconcile "$a" gemini "$b" codex
}

test_reconcile_rejects_same_engine_both_sides() {
  local a b
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[]'
  _write_findings "$b" '[]'
  assert_fails "same engine label on both sides rejected" adv_reconcile "$a" claude "$b" claude
}
