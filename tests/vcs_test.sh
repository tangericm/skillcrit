#!/bin/bash
. "$ERICT_LIB/config.sh"
. "$ERICT_LIB/vcs.sh"

test_default_branch_is_main() {
  AGENT_REPO="$(mktemp_repo)"
  assert_eq "main" "$(vcs_default_branch)" "seeded repo defaults to main"
}

test_can_commit_is_false_on_default_branch() {
  AGENT_REPO="$(mktemp_repo)"
  assert_fails "refuses to commit on main" vcs_can_commit
}

test_can_commit_is_true_on_work_branch() {
  AGENT_REPO="$(mktemp_repo)"
  git -C "$AGENT_REPO" checkout -q -b agent/work
  vcs_can_commit
  assert_eq "0" "$?" "work branch permits commit"
}

test_can_commit_respects_auto_commit_false() {
  AGENT_REPO="$(mktemp_repo)"
  git -C "$AGENT_REPO" checkout -q -b agent/work
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"vcs":{"auto_commit":false}}\n' > "$AGENT_REPO/.agent/config.json"
  assert_fails "auto_commit false blocks commit" vcs_can_commit
}

test_preflight_fails_on_missing_tool() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"preflight":["definitely-not-a-real-tool"]}\n' > "$AGENT_REPO/.agent/config.json"
  assert_fails "missing preflight tool blocks" vcs_preflight
}

test_preflight_passes_when_tools_present() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"preflight":["git","jq"]}\n' > "$AGENT_REPO/.agent/config.json"
  vcs_preflight
  assert_eq "0" "$?" "present tools pass"
}

test_commit_refuses_on_default_branch() {
  AGENT_REPO="$(mktemp_repo)"
  printf 'change\n' >> "$AGENT_REPO/README.md"
  git -C "$AGENT_REPO" add -A
  assert_fails "commit blocked on main" vcs_commit "feat: nope"
  assert_eq "1" "$(git -C "$AGENT_REPO" rev-list --count HEAD)" "no new commit"
}
