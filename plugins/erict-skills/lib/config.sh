#!/bin/bash
# Reads .agent/config.json from $AGENT_REPO. Every key is optional.

cfg_file() {
  local f="${AGENT_REPO:-.}/.agent/config.json"
  [ -f "$f" ] && printf '%s' "$f"
}

cfg_get() {
  local key="$1" default="${2-}" file val
  file="$(cfg_file)"
  if [ -z "$file" ]; then
    printf '%s' "$default"
    return 0
  fi
  val="$(jq -r --arg d "$default" \
    "try (.$key) catch null | if . == null then \$d elif (type == \"array\" or type == \"object\") then tojson else tostring end" \
    "$file" 2>/dev/null)"
  if [ -z "$val" ]; then
    printf '%s' "$default"
  else
    printf '%s' "$val"
  fi
}
