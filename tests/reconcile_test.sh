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
  out="$(adv_reconcile "$a" "$b")"
  assert_eq "1" "$(printf '%s' "$out" | jq '.agreed | length')" "one agreed finding"
  assert_eq "0" "$(printf '%s' "$out" | jq '.claude_only | length')" "nothing claude-only"
}

test_reconcile_buckets_single_engine_findings() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[{"file":"y.gd","line":3,"category":"spec","claim":"gate unmet","evidence":"e","severity":"medium","refuted":false}]'
  out="$(adv_reconcile "$a" "$b")"
  assert_eq "1" "$(printf '%s' "$out" | jq '.claude_only | length')" "one claude-only"
  assert_eq "1" "$(printf '%s' "$out" | jq '.codex_only | length')" "one codex-only"
  assert_eq "0" "$(printf '%s' "$out" | jq '.agreed | length')" "nothing agreed"
}

test_reconcile_flags_contradiction() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[{"file":"x.gd","line":10,"category":"correctness","claim":"does not leak","evidence":"e2","severity":"high","refuted":true}]'
  out="$(adv_reconcile "$a" "$b")"
  assert_eq "1" "$(printf '%s' "$out" | jq '.contradictory | length')" "one contradiction"
  assert_eq "0" "$(printf '%s' "$out" | jq '.agreed | length')" "not counted as agreement"
}

test_reconcile_handles_empty_input() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[]'
  _write_findings "$b" '[]'
  out="$(adv_reconcile "$a" "$b")"
  assert_eq "0" "$(printf '%s' "$out" | jq '.agreed | length')" "empty reconciles cleanly"
}
