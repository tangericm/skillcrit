#!/bin/bash

test_erict_env_sets_repo_and_engine() {
  local repo; repo="$(mktemp_repo)"
  local out
  out="$(cd "$repo" && bash -c ". \"$ERICT_LIB/env.sh\"; erict_env codex; printf '%s|%s' \"\$AGENT_REPO\" \"\$AGENT_ENGINE\"")"
  assert_contains "$out" "|codex" "engine exported"
  assert_contains "$out" "$(basename "$repo")" "repo toplevel exported"
}

test_erict_env_exposes_all_functions() {
  local repo; repo="$(mktemp_repo)"
  local out
  out="$(cd "$repo" && bash -c ". \"$ERICT_LIB/env.sh\"; erict_env claude; type -t cfg_get state_write plan_tick gate_run vcs_can_commit slice_disjoint | tr '\n' ' '")"
  assert_eq "function function function function function function " "$out" "all modules sourced"
}
