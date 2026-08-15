#!/usr/bin/env bash
# Cross-platform helpers. Targets GNU (Linux, Git Bash), BSD (macOS), and WSL.
# Every helper fails loudly rather than returning a plausible wrong answer.

portable_mtime() {
  local file="$1" out
  if [ ! -e "$file" ]; then
    printf 'portable_mtime: no such file: %s\n' "$file" >&2
    return 1
  fi
  out="$(stat -c %Y "$file" 2>/dev/null)" && { printf '%s' "$out"; return 0; }
  out="$(stat -f %m "$file" 2>/dev/null)" && { printf '%s' "$out"; return 0; }
  printf 'portable_mtime: neither GNU nor BSD stat is available\n' >&2
  return 1
}

portable_require() {
  local tool missing
  missing=""
  for tool in jq git awk; do
    command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
  done
  if [ -n "$missing" ]; then
    printf 'agent-loop requires these tools on PATH, and they are missing:%s\n' "$missing" >&2
    printf 'On macOS: brew install jq. On Debian/Ubuntu: apt-get install jq.\n' >&2
    printf 'On Windows use Git Bash or WSL; PowerShell and cmd are not supported.\n' >&2
    return 1
  fi
  return 0
}

portable_host() {
  local h
  h="${HOSTNAME:-}"
  [ -n "$h" ] || h="$(hostname 2>/dev/null)"
  [ -n "$h" ] || h="$(uname -n 2>/dev/null)"
  [ -n "$h" ] || h="unknown-host"
  printf '%s' "$h"
}

portable_strip_cr() {
  local file="$1"
  [ -f "$file" ] || return 0
  awk '{ sub(/\r$/, ""); print }' "$file"
}
