#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/vcs.sh"

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

test_can_commit_refuses_detached_head() {
  AGENT_REPO="$(mktemp_repo)"
  git -C "$AGENT_REPO" checkout -q HEAD
  assert_fails "detached HEAD blocks commit" vcs_can_commit
}

test_undeterminable_default_branch_refuses_commit() {
  AGENT_REPO="$(mktemp -d)"
  git -C "$AGENT_REPO" init -q --initial-branch=trunk
  git -C "$AGENT_REPO" config user.email "test@example.com"
  git -C "$AGENT_REPO" config user.name "Test"
  printf 'seed\n' > "$AGENT_REPO/README.md"
  git -C "$AGENT_REPO" add -A
  git -C "$AGENT_REPO" commit -q -m "chore: seed"
  git -C "$AGENT_REPO" checkout -q -b feature/x
  assert_fails "undeterminable default branch blocks commit" vcs_can_commit
}

test_default_branch_override_unblocks_commit() {
  AGENT_REPO="$(mktemp -d)"
  git -C "$AGENT_REPO" init -q --initial-branch=trunk
  git -C "$AGENT_REPO" config user.email "test@example.com"
  git -C "$AGENT_REPO" config user.name "Test"
  printf 'seed\n' > "$AGENT_REPO/README.md"
  git -C "$AGENT_REPO" add -A
  git -C "$AGENT_REPO" commit -q -m "chore: seed"
  git -C "$AGENT_REPO" checkout -q -b feature/x
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"vcs":{"default_branch":"trunk"}}\n' > "$AGENT_REPO/.agent/config.json"
  vcs_can_commit
  assert_eq "0" "$?" "explicit default_branch override permits commit"
}

test_default_branch_naming_nonexistent_ref_refuses_commit() {
  # Reproduces the reviewer's finding: a configured vcs.default_branch that
  # names no real ref must not silently disable the commit refusal. HEAD is
  # on "main", the repo's real default branch, and default_branch is
  # misconfigured to "trunk" (which does not exist) -- vcs_can_commit must
  # still refuse, not fall through to treating main as a non-default branch.
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"vcs":{"default_branch":"trunk"}}\n' > "$AGENT_REPO/.agent/config.json"
  assert_fails "configured default_branch naming no real ref refuses commit on the real default branch" vcs_can_commit
}
