#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/portable.sh"
. "$AGENT_LOOP_LIB/detect.sh"

test_detect_plan_finds_todo_in_bare_repo() {
  AGENT_REPO="$(mktemp_repo)"
  printf '# Todo\n\n- [ ] first thing\n' > "$AGENT_REPO/TODO.md"
  assert_eq "$AGENT_REPO/TODO.md" "$(detect_plan)" "bare repo finds TODO.md"
}

test_detect_plan_prefers_superpowers_location() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/docs/superpowers/plans"
  printf -- '- [ ] real work\n' > "$AGENT_REPO/docs/superpowers/plans/2026-01-01-x.md"
  printf -- '- [ ] stale\n' > "$AGENT_REPO/TODO.md"
  assert_eq "$AGENT_REPO/docs/superpowers/plans/2026-01-01-x.md" "$(detect_plan)" "prefers plans dir"
}

test_detect_plan_skips_fully_checked_plan() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/docs/superpowers/plans"
  printf -- '- [x] done\n' > "$AGENT_REPO/docs/superpowers/plans/done.md"
  printf -- '- [ ] open\n' > "$AGENT_REPO/TODO.md"
  assert_eq "$AGENT_REPO/TODO.md" "$(detect_plan)" "skips completed plan"
}

test_detect_plan_honours_configured_active() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf -- '- [ ] pinned\n' > "$AGENT_REPO/pinned.md"
  printf '{"plan":{"active":"pinned.md"}}\n' > "$AGENT_REPO/.agent/config.json"
  assert_eq "$AGENT_REPO/pinned.md" "$(detect_plan)" "config pin wins"
}

test_detect_plan_selects_a_crlf_plan() {
  # _detect_has_open_task's grep is unanchored at end-of-line
  # (^[[:space:]]*- \[ \], no trailing $), so a CRLF-checked-out plan's
  # trailing \r never hides an open task from detect_plan. Exercised
  # through the real caller, not the regex in isolation.
  AGENT_REPO="$(mktemp_repo)"
  printf -- '# Plan\r\n\r\n- [ ] first\r\n' > "$AGENT_REPO/TODO.md"
  assert_eq "$AGENT_REPO/TODO.md" "$(detect_plan)" "CRLF plan is still detected as open"
}

test_detect_gate_reads_npm_test_script() {
  AGENT_REPO="$(mktemp_repo)"
  printf '{"scripts":{"test":"vitest run"}}\n' > "$AGENT_REPO/package.json"
  assert_eq "npm test" "$(detect_gate suite)" "npm project"
}

test_detect_gate_prefers_config() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"gates":{"suite":"./scripts/test.sh"}}\n' > "$AGENT_REPO/.agent/config.json"
  printf '{"scripts":{"test":"vitest run"}}\n' > "$AGENT_REPO/package.json"
  assert_eq "./scripts/test.sh" "$(detect_gate suite)" "config beats detection"
}

test_detect_gate_empty_when_nothing_found() {
  AGENT_REPO="$(mktemp_repo)"
  assert_eq "" "$(detect_gate suite)" "bare repo has no gate"
}

test_detect_gate_honours_an_explicitly_blank_gate() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"gates":{"suite":""}}\n' > "$AGENT_REPO/.agent/config.json"
  printf '{"scripts":{"test":"vitest run"}}\n' > "$AGENT_REPO/package.json"
  assert_eq "" "$(detect_gate suite)" "blank gate means none, not auto-detect"
}
