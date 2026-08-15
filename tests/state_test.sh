#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/portable.sh"
. "$AGENT_LOOP_LIB/vcs.sh"
. "$AGENT_LOOP_LIB/state.sh"

test_state_stamp_emits_machine_fields() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  local out
  out="$(cd "$AGENT_REPO" && state_stamp)"
  assert_contains "$out" "branch: main" "branch present"
  assert_contains "$out" "engine: claude" "engine present"
  assert_contains "$out" "host: $(portable_host)" "host present"
  assert_eq "1" "$(printf '%s\n' "$out" | grep -cE '^pid: [0-9]+$')" "pid is numeric"
  assert_eq "1" "$(printf '%s\n' "$out" | grep -cE '^updated: [0-9]{4}-')" "updated is a timestamp"
}

test_state_stamp_writes_no_file() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  ( cd "$AGENT_REPO" && state_stamp ) >/dev/null
  assert_eq "0" "$([ -f "$(state_path)" ] && printf 1 || printf 0)" "state_stamp does not write"
}

test_state_get_still_reads_a_model_written_file() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  mkdir -p "$AGENT_REPO/.agent"
  printf -- '---\nplan: docs/p.md\ntask: 4\nhost: %s\nengine: claude\npid: %s\n---\n\n## Next concrete step\nDo the thing\n' \
    "$(portable_host)" "$$" > "$(state_path)"
  assert_eq "docs/p.md" "$(state_get plan)" "reads a hand-written cursor"
  assert_eq "Do the thing" "$(state_section 'Next concrete step')" "reads a hand-written section"
  state_lock_ok
  assert_eq "0" "$?" "same engine and host is unlocked"
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
  mkdir -p "$AGENT_REPO/.agent"
  printf -- '---\nengine: codex\nhost: %s\npid: %s\n---\n\n## Next concrete step\nstep\n' \
    "$(portable_host)" "$$" > "$(state_path)"
  assert_fails "other live engine blocks write" state_lock_ok
}

test_state_lock_ignores_dead_pid() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  mkdir -p "$AGENT_REPO/.agent"
  printf -- '---\nengine: codex\nhost: %s\npid: 99999999\n---\n\n## Next concrete step\nstep\n' \
    "$(portable_host)" > "$(state_path)"
  state_lock_ok
  assert_eq "0" "$?" "dead pid does not block"
}

test_state_preserves_blank_lines_in_notes() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  mkdir -p "$AGENT_REPO/.agent"
  local notes
  notes="$(printf 'alpha\n\nbeta')"
  printf -- '---\nengine: claude\n---\n\n## Working notes\n%s\n' "$notes" > "$(state_path)"
  local read_notes
  read_notes="$(state_section 'Working notes')"
  assert_eq "$notes" "$read_notes" "blank line in notes preserved"
}

test_state_preserves_blank_lines_in_sections() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  mkdir -p "$AGENT_REPO/.agent"
  local step
  step="$(printf 'do this\n\nthen that')"
  printf -- '---\nengine: claude\n---\n\n## Next concrete step\n%s\n\n## Blockers\nnone\n' "$step" > "$(state_path)"
  local read_step
  read_step="$(state_section 'Next concrete step')"
  assert_eq "$step" "$read_step" "blank line in next step preserved"
}
