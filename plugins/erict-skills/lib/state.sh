#!/bin/bash
# Reads and writes .agent/state.md — a cursor, never a copy.

STATE_NOTES_MAX=40

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
  local file holder pid
  file="$(state_path)"
  [ -f "$file" ] || return 0
  holder="$(state_get engine)"
  pid="$(state_get pid)"
  [ -z "$holder" ] && return 0
  [ "$holder" = "${AGENT_ENGINE:-unknown}" ] && return 0
  [ -z "$pid" ] && return 0
  if kill -0 "$pid" 2>/dev/null; then
    printf 'refusing: %s (pid %s) holds %s\n' "$holder" "$pid" "$file" >&2
    return 1
  fi
  return 0
}

state_write() {
  local plan="$1" task="$2" total="$3" branch="$4" last_green="$5"
  local next_step="$6" blockers="$7" notes="$8"
  local file dir capped
  file="$(state_path)"
  dir="$(dirname "$file")"
  mkdir -p "$dir"
  capped="$(printf '%s\n' "$notes" | awk '
    { lines[n++] = $0 }
    END {
      first = -1
      last = -1
      for (i = 0; i < n; i++) {
        if (lines[i] ~ /[^[:space:]]/) {
          if (first == -1) first = i
          last = i
        }
      }
      if (first >= 0) {
        trimmed_n = last - first + 1
        if (trimmed_n > '"$STATE_NOTES_MAX"') {
          start = trimmed_n - '"$STATE_NOTES_MAX"'
        } else {
          start = 0
        }
        for (i = start; i <= last - first; i++) {
          window[w++] = lines[first + i]
        }
        w_first = -1
        w_last = -1
        for (i = 0; i < w; i++) {
          if (window[i] ~ /[^[:space:]]/) {
            if (w_first == -1) w_first = i
            w_last = i
          }
        }
        if (w_first >= 0) {
          for (i = w_first; i <= w_last; i++) print window[i]
        }
      }
    }
  ')"
  {
    printf -- '---\n'
    printf 'plan: %s\n' "$plan"
    printf 'task: %s\n' "$task"
    printf 'total_tasks: %s\n' "$total"
    printf 'branch: %s\n' "$branch"
    printf 'worktree: %s\n' "${AGENT_REPO:-.}"
    printf 'last_green: %s\n' "$last_green"
    printf 'engine: %s\n' "${AGENT_ENGINE:-unknown}"
    printf 'pid: %s\n' "$$"
    printf 'updated: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf -- '---\n\n'
    printf '## Next concrete step\n%s\n\n' "$next_step"
    printf '## Blockers\n%s\n\n' "$blockers"
    printf '## Working notes\n%s\n' "$capped"
  } > "$file"
}
