#!/bin/bash
ASSERT_PASS=0
ASSERT_FAIL=0

assert_eq() {
  local expected="$1" actual="$2" label="$3"
  if [ "$expected" = "$actual" ]; then
    ASSERT_PASS=$((ASSERT_PASS + 1))
  else
    ASSERT_FAIL=$((ASSERT_FAIL + 1))
    printf '  FAIL: %s\n    expected: [%s]\n    actual:   [%s]\n' "$label" "$expected" "$actual" >&2
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" label="$3"
  case "$haystack" in
    *"$needle"*) ASSERT_PASS=$((ASSERT_PASS + 1)) ;;
    *)
      ASSERT_FAIL=$((ASSERT_FAIL + 1))
      printf '  FAIL: %s\n    [%s] does not contain [%s]\n' "$label" "$haystack" "$needle" >&2
      ;;
  esac
}

# assert_fails <label> <cmd...> - verify cmd exits non-zero; label is first, not final
assert_fails() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    ASSERT_FAIL=$((ASSERT_FAIL + 1))
    printf '  FAIL: %s (command unexpectedly succeeded)\n' "$label" >&2
  else
    ASSERT_PASS=$((ASSERT_PASS + 1))
  fi
}

mktemp_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q --initial-branch=main
  git -C "$dir" config user.email "test@example.com"
  git -C "$dir" config user.name "Test"
  printf 'seed\n' > "$dir/README.md"
  git -C "$dir" add -A
  git -C "$dir" commit -q -m "chore: seed"
  printf '%s' "$dir"
}
