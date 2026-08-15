#!/bin/bash
# Chooses the narrowest gate that proves a change, then runs it.

gate_rank() {
  case "$1" in
    focused) printf '1' ;;
    suite)   printf '2' ;;
    full)    printf '3' ;;
    *)       printf '0' ;;
  esac
}

gate_name_for_rank() {
  case "$1" in
    1) printf 'focused' ;;
    2) printf 'suite' ;;
    3) printf 'full' ;;
    *)
      printf 'gate_name_for_rank: unknown rank %s\n' "$1" >&2
      return 1
      ;;
  esac
}

gate_level_for() {
  local floor best rank pattern level file rules
  floor="$(cfg_get gate_policy.commit_requires 'focused')"
  best="$(gate_rank "$floor")"
  if [ "$best" -eq 0 ]; then
    printf 'unknown gate level in gate_policy.commit_requires: %s\n' "$floor" >&2
    return 1
  fi

  rules="$(cfg_get gate_policy.escalate_when '{}')"
  for file in "$@"; do
    # A here-doc keeps this loop in the current shell — a pipe would run it in a
    # subshell and discard "best". read -r preserves patterns containing spaces.
    while IFS= read -r pattern; do
      [ -n "$pattern" ] || continue
      case "$file" in
        $pattern)
          level="$(printf '%s' "$rules" | jq -r --arg k "$pattern" '.[$k]')"
          rank="$(gate_rank "$level")"
          if [ "$rank" -eq 0 ]; then
            printf 'unknown gate level in gate_policy.escalate_when["%s"]: %s\n' "$pattern" "$level" >&2
            return 1
          fi
          [ "$rank" -gt "$best" ] && best="$rank"
          ;;
      esac
    done <<EOF
$(printf '%s' "$rules" | jq -r 'keys[]' 2>/dev/null)
EOF
  done
  gate_name_for_rank "$best"
}

gate_run() {
  local level="$1" cmd
  cmd="$(detect_gate "$level")"
  if [ -z "$cmd" ]; then
    printf 'no %s gate configured or detectable; refusing to proceed\n' "$level" >&2
    return 2
  fi
  ( cd "${AGENT_REPO:-.}" && eval "$cmd" )
}
