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
  assert_contains "$cmd" "jq -r" "extracts the result field from the single-result envelope"
  assert_contains "$cmd" ".result" "extracts specifically .result, not the whole envelope"
}

test_counterpart_cmd_claude_extracts_result_from_envelope() {
  # Fix 3: `claude -p --output-format json` returns a single-result
  # envelope object, not a bare findings array -- adv_reconcile's
  # --slurpfile expects the latter and dies with "finding missing a
  # required field" otherwise. Prove the echoed command actually turns a
  # fixture envelope into a bare array, without invoking a real claude
  # binary: ADV_CLAUDE_BIN points at a fake executable that just cats a
  # fixture envelope, standing in for claude's stdout.
  local fake_dir fake_bin envelope prompt_file out cmd
  fake_dir="$(mktemp -d)"
  fake_bin="$fake_dir/claude"
  envelope="$(mktemp)"
  prompt_file="$(mktemp)"
  out="$(mktemp)"
  printf '%s' '{"type":"result","subtype":"success","is_error":false,"result":"[{\"file\":\"x.gd\",\"line\":10,\"category\":\"correctness\",\"claim\":\"leaks\",\"evidence\":\"e\",\"severity\":\"high\",\"refuted\":false}]","session_id":"abc"}' \
    > "$envelope"
  {
    printf '#!/bin/bash\n'
    printf 'cat %q\n' "$envelope"
  } > "$fake_bin"
  chmod +x "$fake_bin"
  ADV_CLAUDE_BIN="$fake_bin"
  cmd="$(adv_counterpart_cmd codex "$prompt_file" "$out")"
  eval "$cmd"
  assert_eq "array" "$(jq -r 'type' "$out" 2>/dev/null)" "out file is a bare findings array, not an envelope"
  assert_eq "leaks" "$(jq -r '.[0].claim' "$out" 2>/dev/null)" "finding content survives envelope extraction"
}

test_check_counterpart_fails_loudly_when_absent() {
  ADV_CODEX_BIN=definitely-not-a-real-binary
  assert_fails "absent counterpart is an error" adv_check_counterpart claude
}

test_counterpart_bin_rejects_unknown_engine() {
  assert_fails "unknown engine rejected in adv_counterpart_bin" adv_counterpart_bin gemini
}

test_counterpart_cmd_rejects_unknown_engine_with_no_output() {
  local cmd
  cmd="$(adv_counterpart_cmd gemini /tmp/p.txt /tmp/o.json)" || true
  assert_eq "" "$cmd" "unknown engine produces no command output"
}

test_counterpart_cmd_fails_on_unknown_engine() {
  assert_fails "unknown engine causes failure" adv_counterpart_cmd gemini /tmp/p.txt /tmp/o.json
}

test_check_counterpart_fails_on_unknown_engine_with_clear_message() {
  local msg
  msg="$(adv_check_counterpart gemini 2>&1)" || true
  assert_contains "$msg" "unknown engine" "error message names the unknown engine"
}

test_counterpart_cmd_handles_paths_with_spaces_codex() {
  local cmd tmpfile
  tmpfile="$(mktemp)"
  ADV_CODEX_BIN="cat"
  cmd="$(adv_counterpart_cmd claude "/tmp/path with space/prompt.txt" "/tmp/path with space/out.json")"
  # printf %q produces backslash-escaped paths when they contain spaces
  # This prevents word-splitting when the command is eval'd
  assert_contains "$cmd" "/tmp/path\ with\ space/out.json" "output path is escaped for spaces"
  assert_contains "$cmd" "/tmp/path\ with\ space/prompt.txt" "input path is escaped for spaces"
}

test_counterpart_cmd_quoting_preserves_no_space_paths() {
  local cmd
  ADV_CODEX_BIN="cat"
  cmd="$(adv_counterpart_cmd claude "/tmp/p.txt" "/tmp/o.json")"
  # Paths without spaces should also be in the output
  assert_contains "$cmd" "/tmp/p.txt" "simple input path present"
  assert_contains "$cmd" "/tmp/o.json" "simple output path present"
}

test_counterpart_cmd_from_claude_happy_path_unchanged() {
  local cmd
  ADV_CODEX_BIN=codex
  cmd="$(adv_counterpart_cmd claude /tmp/p.txt /tmp/o.json)"
  assert_contains "$cmd" "codex exec" "still invokes codex exec"
  assert_contains "$cmd" "-s read-only" "still read-only"
}

test_counterpart_cmd_from_codex_happy_path_unchanged() {
  local cmd
  ADV_CLAUDE_BIN=claude
  cmd="$(adv_counterpart_cmd codex /tmp/p.txt /tmp/o.json)"
  assert_contains "$cmd" "claude -p" "still invokes claude"
  assert_contains "$cmd" "--output-format json" "still json format"
}
