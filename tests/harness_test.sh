#!/bin/bash
test_assert_eq_passes() {
  assert_eq "a" "a" "identical strings match"
}

test_mktemp_repo_is_a_git_repo() {
  local repo
  repo="$(mktemp_repo)"
  assert_eq "true" "$(git -C "$repo" rev-parse --is-inside-work-tree)" "mktemp_repo makes a repo"
  assert_eq "main" "$(git -C "$repo" rev-parse --abbrev-ref HEAD)" "default branch is main"
}
