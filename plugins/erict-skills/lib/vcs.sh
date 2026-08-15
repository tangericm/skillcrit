#!/bin/bash
# Safety rails. Two rules here are deliberately not configurable:
# never commit on the default branch, and never merge or push.

_git() {
  git -C "${AGENT_REPO:-.}" "$@"
}

vcs_default_branch() {
  local ref
  ref="$(_git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"
  if [ -n "$ref" ]; then
    printf '%s' "${ref#origin/}"
    return 0
  fi
  if _git show-ref --verify --quiet refs/heads/main; then printf 'main'; return 0; fi
  if _git show-ref --verify --quiet refs/heads/master; then printf 'master'; return 0; fi
  printf 'main'
}

vcs_current_branch() {
  _git rev-parse --abbrev-ref HEAD 2>/dev/null
}

vcs_on_default_branch() {
  [ "$(vcs_current_branch)" = "$(vcs_default_branch)" ]
}

vcs_preflight() {
  local tools tool
  tools="$(cfg_get preflight '[]')"
  for tool in $(printf '%s' "$tools" | jq -r '.[]' 2>/dev/null); do
    if ! command -v "$tool" >/dev/null 2>&1; then
      printf 'preflight failed: %s is not on PATH\n' "$tool" >&2
      return 1
    fi
  done
  return 0
}

vcs_can_commit() {
  if vcs_on_default_branch; then
    printf 'refusing to commit on the default branch (%s)\n' "$(vcs_default_branch)" >&2
    return 1
  fi
  if [ "$(cfg_get vcs.auto_commit 'true')" = "false" ]; then
    printf 'refusing to commit: vcs.auto_commit is false\n' >&2
    return 1
  fi
  return 0
}

vcs_commit() {
  local message="$1"
  vcs_can_commit || return 1
  vcs_preflight || return 1
  _git commit -q -m "$message"
}
