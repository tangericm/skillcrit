#!/bin/bash
# Blocks git write commands when a configured preflight tool is missing from PATH.
# A missing git-lfs fails a merge partway through, leaving a half-written tree.
set -u
payload="$(cat)"
command_line="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null)"

case "$command_line" in
  *"git merge"*|*"git stash"*|*"git checkout"*|*"git rebase"*|*"git pull"*) ;;
  *) exit 0 ;;
esac

repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
config="$repo/.agent/config.json"
[ -f "$config" ] || exit 0

for tool in $(jq -r '.preflight[]? // empty' "$config" 2>/dev/null); do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Blocked: %s is not on PATH. This git operation can fail partway through and leave a half-written working tree.\n' "$tool" >&2
    exit 2
  fi
done
exit 0
