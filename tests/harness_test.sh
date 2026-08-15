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

test_assert_contains_passes() {
  assert_contains "hello world" "world" "substring found"
}

test_assert_fails_passes() {
  assert_fails "false command fails" false
}

test_assert_eq_failure_increments_counter() {
  local before_pass before_fail after_fail_pass after_fail_fail
  before_pass="$ASSERT_PASS"
  before_fail="$ASSERT_FAIL"
  assert_eq "a" "b" "testing failure path" 2>/dev/null
  after_fail_pass="$ASSERT_PASS"
  after_fail_fail="$ASSERT_FAIL"
  assert_eq "$before_pass" "$after_fail_pass" "failure doesn't increment ASSERT_PASS"
  assert_eq "$((before_fail + 1))" "$after_fail_fail" "failure increments ASSERT_FAIL"
  ASSERT_PASS="$before_pass"
  ASSERT_FAIL="$before_fail"
}
