#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/adversarial.sh"

test_counterpart_of_claude_is_codex() {
  assert_eq "codex" "$(adv_counterpart claude)" "claude routes to codex"
}

test_counterpart_of_codex_is_claude() {
  assert_eq "claude" "$(adv_counterpart codex)" "codex routes to claude"
}

test_counterpart_never_returns_self() {
  assert_eq "" "$(adv_counterpart claude | grep claude)" "claude never reviews itself"
  assert_eq "" "$(adv_counterpart codex | grep codex)" "codex never reviews itself"
}

test_counterpart_rejects_unknown_engine() {
  assert_fails "unknown engine rejected" adv_counterpart gemini
}

test_counterpart_cmd_from_claude_uses_read_only_codex() {
  local cmd
  ADV_CODEX_BIN=codex
  cmd="$(adv_counterpart_cmd claude /tmp/p.txt /tmp/o.json)"
  assert_contains "$cmd" "codex exec" "invokes codex exec"
  assert_contains "$cmd" "-s read-only" "reviewer cannot write"
  assert_contains "$cmd" "--output-schema" "structured verdict"
}

test_counterpart_cmd_from_codex_uses_claude_print() {
  local cmd
  ADV_CLAUDE_BIN=claude
  cmd="$(adv_counterpart_cmd codex /tmp/p.txt /tmp/o.json)"
  assert_contains "$cmd" "claude -p" "invokes claude headless"
  assert_contains "$cmd" "--output-format json" "structured verdict"
}

test_check_counterpart_fails_loudly_when_absent() {
  ADV_CODEX_BIN=definitely-not-a-real-binary
  assert_fails "absent counterpart is an error" adv_check_counterpart claude
}
