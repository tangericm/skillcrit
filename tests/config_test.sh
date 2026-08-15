#!/bin/bash
. "$ERICT_LIB/config.sh"

test_cfg_get_returns_default_when_no_config() {
  AGENT_REPO="$(mktemp_repo)"
  assert_eq "- [ ]" "$(cfg_get plan.task_marker '- [ ]')" "default when file absent"
  assert_eq "" "$(cfg_file)" "cfg_file empty when absent"
}

test_cfg_get_reads_nested_value() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"vcs":{"branch_prefix":"codex/"}}\n' > "$AGENT_REPO/.agent/config.json"
  assert_eq "codex/" "$(cfg_get vcs.branch_prefix 'agent/')" "nested value"
}

test_cfg_get_falls_back_on_missing_key() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"vcs":{"branch_prefix":"codex/"}}\n' > "$AGENT_REPO/.agent/config.json"
  assert_eq "agent/" "$(cfg_get vcs.nope 'agent/')" "missing key falls back"
}

test_cfg_get_emits_json_for_arrays() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"preflight":["git-lfs","jq"]}\n' > "$AGENT_REPO/.agent/config.json"
  assert_eq '["git-lfs","jq"]' "$(cfg_get preflight '[]')" "array as compact json"
}

test_cfg_get_survives_malformed_json() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{not json\n' > "$AGENT_REPO/.agent/config.json"
  assert_eq "agent/" "$(cfg_get vcs.branch_prefix 'agent/')" "malformed json falls back"
}
