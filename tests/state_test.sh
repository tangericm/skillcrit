#!/bin/bash
. "$ERICT_LIB/config.sh"
. "$ERICT_LIB/state.sh"

test_state_round_trip() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  state_write "docs/p.md" 4 9 "agent/x" "abc123" "Do the thing" "none" "note one"
  assert_eq "docs/p.md" "$(state_get plan)" "plan round-trips"
  assert_eq "4" "$(state_get task)" "task round-trips"
  assert_eq "9" "$(state_get total_tasks)" "total round-trips"
  assert_eq "claude" "$(state_get engine)" "engine recorded"
  assert_eq "Do the thing" "$(state_section 'Next concrete step')" "next step round-trips"
  assert_eq "note one" "$(state_section 'Working notes')" "notes round-trip"
}

test_state_caps_notes_at_40_lines() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  local notes i
  notes=""
  i=1
  while [ "$i" -le 50 ]; do
    notes="$notes
line$i"
    i=$((i + 1))
  done
  state_write "p.md" 1 2 "b" "c" "s" "none" "$notes"
  assert_eq "40" "$(state_section 'Working notes' | grep -c '^line')" "capped to 40"
  assert_contains "$(state_section 'Working notes')" "line50" "keeps newest"
}

test_state_lock_ok_when_no_file() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  state_lock_ok
  assert_eq "0" "$?" "no file means unlocked"
}

test_state_lock_refuses_other_live_engine() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  state_write "p.md" 1 2 "b" "c" "s" "none" ""
  # rewrite the frontmatter to claim a different engine holding this live pid
  awk -v pid="$$" '{ sub(/^engine: claude$/, "engine: codex"); sub(/^pid: .*$/, "pid: " pid); print }' \
    "$(state_path)" > "$(state_path).tmp" && mv "$(state_path).tmp" "$(state_path)"
  AGENT_ENGINE=claude
  assert_fails "other live engine blocks write" state_lock_ok
}

test_state_lock_ignores_dead_pid() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  state_write "p.md" 1 2 "b" "c" "s" "none" ""
  awk '{ sub(/^engine: claude$/, "engine: codex"); sub(/^pid: .*$/, "pid: 99999999"); print }' \
    "$(state_path)" > "$(state_path).tmp" && mv "$(state_path).tmp" "$(state_path)"
  state_lock_ok
  assert_eq "0" "$?" "dead pid does not block"
}
