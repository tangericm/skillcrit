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

test_state_preserves_blank_lines_in_notes() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  local notes
  notes="$(printf 'alpha\n\nbeta')"
  state_write "p.md" 1 2 "b" "c" "s" "none" "$notes"
  local read_notes
  read_notes="$(state_section 'Working notes')"
  assert_eq "$notes" "$read_notes" "blank line in notes preserved"
}

test_state_preserves_blank_lines_in_sections() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  local step
  step="$(printf 'do this\n\nthen that')"
  state_write "p.md" 1 2 "b" "c" "$step" "none" "note"
  local read_step
  read_step="$(state_section 'Next concrete step')"
  assert_eq "$step" "$read_step" "blank line in next step preserved"
}

test_state_caps_40_lines_with_blanks() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  local notes i
  notes=""
  i=1
  while [ "$i" -le 50 ]; do
    notes="$notes
line$i"
    if [ "$i" -lt 50 ]; then
      notes="$notes
"
    fi
    i=$((i + 1))
  done
  state_write "p.md" 1 2 "b" "c" "s" "none" "$notes"
  local read_notes
  read_notes="$(state_section 'Working notes')"
  local line_count
  line_count="$(printf '%s\n' "$read_notes" | grep -c '^line')"
  assert_eq "20" "$line_count" "capped to 40 total lines (20 content + 20 blanks)"
  assert_contains "$read_notes" "line50" "keeps newest line after cap"
  assert_contains "$read_notes" "line31" "includes lines from middle range"
  local first_line last_line
  first_line="$(printf '%s\n' "$read_notes" | head -1)"
  last_line="$(printf '%s\n' "$read_notes" | tail -1)"
  assert_contains "$first_line" "line" "first line is content, not blank"
  assert_contains "$last_line" "line" "last line is content, not blank"
}
