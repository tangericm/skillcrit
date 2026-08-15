#!/bin/bash
. "$ERICT_LIB/config.sh"
. "$ERICT_LIB/detect.sh"
. "$ERICT_LIB/state.sh"
. "$ERICT_LIB/portable.sh"

test_portable_mtime_returns_an_epoch_integer() {
  local repo f now
  repo="$(mktemp_repo)"
  f="$repo/README.md"
  now="$(portable_mtime "$f")"
  assert_eq "1" "$(printf '%s' "$now" | grep -cE '^[0-9]+$')" "mtime is an integer"
  assert_eq "1" "$([ "$now" -gt 1000000000 ] && printf 1 || printf 0)" "mtime is a plausible epoch"
}

test_portable_mtime_orders_two_files() {
  local repo older newer
  repo="$(mktemp_repo)"
  older="$repo/older.md"
  newer="$repo/newer.md"
  printf 'a\n' > "$older"
  sleep 1
  printf 'b\n' > "$newer"
  assert_eq "1" "$([ "$(portable_mtime "$newer")" -gt "$(portable_mtime "$older")" ] && printf 1 || printf 0)" \
    "newer file has a greater mtime"
}

test_portable_mtime_fails_loudly_on_a_missing_file() {
  assert_fails "missing file is an error" portable_mtime /nonexistent/path/xyz
}

test_portable_require_passes_when_tools_present() {
  portable_require
  assert_eq "0" "$?" "jq, git and awk are present in this environment"
}

test_portable_require_names_a_missing_tool() {
  local out
  out="$(PATH=/nonexistent portable_require 2>&1 || true)"
  assert_contains "$out" "jq" "names jq when PATH is empty"
}

test_portable_host_is_non_empty_and_stable() {
  local a b
  a="$(portable_host)"
  b="$(portable_host)"
  assert_eq "$a" "$b" "hostname is stable across calls"
  assert_eq "1" "$([ -n "$a" ] && printf 1 || printf 0)" "hostname is non-empty"
}

test_portable_strip_cr_removes_carriage_returns() {
  local repo f
  repo="$(mktemp_repo)"
  f="$repo/crlf.md"
  printf -- '- [ ] first\r\n- [ ] second\r\n' > "$f"
  assert_eq "0" "$(portable_strip_cr "$f" | grep -c $'\r')" "no carriage returns remain"
  assert_eq "2" "$(portable_strip_cr "$f" | grep -c 'first\|second')" "content survives"
}

test_state_lock_ignores_a_pid_from_another_host() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  state_write "p.md" 1 2 "b" "c" "s" "none" ""
  awk -v pid="$$" '{
    sub(/^engine: claude$/, "engine: codex")
    sub(/^pid: .*$/, "pid: " pid)
    sub(/^host: .*$/, "host: some-other-machine")
    print
  }' "$(state_path)" > "$(state_path).tmp" && mv "$(state_path).tmp" "$(state_path)"
  assert_fails "a live pid on another host is not proof of liveness" state_lock_ok
}

test_state_records_this_host() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  state_write "p.md" 1 2 "b" "c" "s" "none" ""
  assert_eq "$(portable_host)" "$(state_get host)" "host round-trips"
}

test_detect_plan_still_picks_the_newest() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/docs/plans"
  printf -- '- [ ] old\n' > "$AGENT_REPO/docs/plans/a.md"
  sleep 1
  printf -- '- [ ] new\n' > "$AGENT_REPO/docs/plans/b.md"
  assert_eq "$AGENT_REPO/docs/plans/b.md" "$(detect_plan)" "newest plan still wins after the mtime change"
}
