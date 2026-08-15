#!/bin/bash
# Reads .agent/state.md — a cursor, never a copy — and stamps the machine
# facts a model cannot read off. The model composes the file itself; see
# state_stamp below and the template in skills/session-state/SKILL.md.

state_path() {
  printf '%s' "${AGENT_REPO:-.}/.agent/state.md"
}

state_get() {
  local field="$1" file
  file="$(state_path)"
  [ -f "$file" ] || return 0
  awk -v f="$field" '
    NR == 1 && $0 == "---" { infm = 1; next }
    infm && $0 == "---" { exit }
    infm {
      idx = index($0, ": ")
      if (idx > 0 && substr($0, 1, idx - 1) == f) { print substr($0, idx + 2); exit }
    }
  ' "$file"
}

state_section() {
  local name="$1" file
  file="$(state_path)"
  [ -f "$file" ] || return 0
  awk -v h="## $name" '
    $0 == h { grab = 1; next }
    grab && /^## / { exit }
    grab { lines[n++] = $0 }
    END {
      last = -1
      for (i = 0; i < n; i++) if (lines[i] ~ /[^[:space:]]/) last = i
      for (i = 0; i <= last; i++) print lines[i]
    }
  ' "$file"
}

state_lock_ok() {
  # There is no liveness signal this runtime can produce: every Bash tool
  # call is a fresh, already-exited process by the time anyone reads the
  # stamped state back (see bin/agent-loop), so a stamped pid can never be
  # checked against a live process on the same host. The only fact worth
  # checking is whether the file was last written by a *different host*,
  # where even a live pid would be meaningless to compare against ours.
  # Within a single host, .agent/state.md is last-writer-wins.
  local file holder holder_host
  file="$(state_path)"
  [ -f "$file" ] || return 0
  holder="$(state_get engine)"
  [ -z "$holder" ] && return 0
  [ "$holder" = "${AGENT_ENGINE:-unknown}" ] && return 0
  holder_host="$(state_get host)"
  if [ -n "$holder_host" ] && [ "$holder_host" != "$(portable_host)" ]; then
    printf 'refusing: %s holds %s from host %s; liveness cannot be checked across machines\n' \
      "$holder" "$file" "$holder_host" >&2
    return 1
  fi
  return 0
}

state_stamp() {
  printf 'branch: %s\n' "$(vcs_current_branch)"
  printf 'last_green: %s\n' "$(git -C "${AGENT_REPO:-.}" rev-parse --short HEAD 2>/dev/null)"
  printf 'engine: %s\n' "${AGENT_ENGINE:-unknown}"
  printf 'host: %s\n' "$(portable_host)"
  printf 'updated: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
