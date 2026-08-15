#!/bin/bash

test_erict_env_sets_repo_and_engine() {
  local repo; repo="$(mktemp_repo)"
  local out
  out="$(cd "$repo" && bash -c ". \"$AGENT_LOOP_LIB/env.sh\"; erict_env codex; printf '%s|%s' \"\$AGENT_REPO\" \"\$AGENT_ENGINE\"")"
  assert_contains "$out" "|codex" "engine exported"
  assert_contains "$out" "$(basename "$repo")" "repo toplevel exported"
}

test_erict_env_exposes_all_functions() {
  local repo; repo="$(mktemp_repo)"
  local out
  out="$(cd "$repo" && bash -c ". \"$AGENT_LOOP_LIB/env.sh\"; erict_env claude; type -t cfg_get state_stamp plan_next_line gate_run vcs_can_commit | tr '\n' ' '")"
  assert_eq "function function function function function " "$out" "all modules sourced"
}

test_erict_env_no_longer_exposes_removed_functions() {
  local repo; repo="$(mktemp_repo)"
  local out
  out="$(cd "$repo" && bash -c ". \"$AGENT_LOOP_LIB/env.sh\"; erict_env claude; type -t state_write plan_tick slice_disjoint slice_module | tr '\n' ' '")"
  assert_eq "" "$out" "removed functions are not sourced by env.sh"
}
