#!/bin/bash
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ERICT_LIB="$ROOT/plugins/erict-skills/lib"
. "$ROOT/tests/helpers.sh"

for file in "$ROOT"/tests/*_test.sh; do
  [ -e "$file" ] || continue
  printf '%s\n' "$(basename "$file")"
  . "$file"
  for fn in $(grep -oE '^test_[a-z0-9_]+' "$file"); do
    "$fn"
  done
done

printf '\n%d passed, %d failed\n' "$ASSERT_PASS" "$ASSERT_FAIL"
[ "$ASSERT_FAIL" -eq 0 ]
