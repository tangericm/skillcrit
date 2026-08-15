#!/bin/bash
# Injects the session cursor when one exists. Silent otherwise.
set -u
repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
state="$repo/.agent/state.md"
[ -f "$state" ] || exit 0
printf 'Session cursor found at .agent/state.md:\n\n'
cat "$state"
exit 0
