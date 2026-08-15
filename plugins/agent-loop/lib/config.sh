#!/bin/bash
# Reads .agent/config.json from $AGENT_REPO. Every key is optional.

cfg_file() {
  local f="${AGENT_REPO:-.}/.agent/config.json"
  [ -f "$f" ] && printf '%s' "$f"
}

cfg_get() {
  local key="$1" default="${2-}" file raw
  file="$(cfg_file)"
  if [ -z "$file" ]; then
    printf '%s' "$default"
    return 0
  fi
  raw="$(jq -r "try (.$key) catch null | if . == null then \"@@MISSING@@\" else \"@@V@@\" + (if (type == \"array\" or type == \"object\") then tojson else tostring end) end" \
    "$file" 2>/dev/null)"
  case "$raw" in
    "@@V@@"*) printf '%s' "${raw#@@V@@}" ;;
    *)        printf '%s' "$default" ;;
  esac
}
