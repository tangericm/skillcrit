#!/bin/bash
# Safety rails. vcs_can_commit code-enforces one non-configurable rule:
# never commit while HEAD is the default branch. "/auto never merges and
# never pushes" is the other non-configurable rule, but nothing in this
# file (or anywhere else in the pack) enforces it in code — see
# skills/session-state/SKILL.md, which states it is instruction-enforced
# only.

_git() {
  git -C "${AGENT_REPO:-.}" "$@"
}

vcs_default_branch() {
  local ref explicit
  explicit="$(cfg_get vcs.default_branch '')"
  if [ -n "$explicit" ]; then
    if _git show-ref --verify --quiet "refs/heads/$explicit" \
       || _git show-ref --verify --quiet "refs/remotes/origin/$explicit"; then
      printf '%s' "$explicit"
      return 0
    fi
    printf 'vcs.default_branch is set to "%s" but no such branch exists (checked refs/heads/%s and refs/remotes/origin/%s)\n' \
      "$explicit" "$explicit" "$explicit" >&2
    return 1
  fi
  ref="$(_git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"
  if [ -n "$ref" ]; then
    printf '%s' "${ref#origin/}"
    return 0
  fi
  if _git show-ref --verify --quiet refs/heads/main; then printf 'main'; return 0; fi
  if _git show-ref --verify --quiet refs/heads/master; then printf 'master'; return 0; fi
  return 1
}

vcs_current_branch() {
  _git rev-parse --abbrev-ref HEAD 2>/dev/null
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
  local current default rc explicit
  current="$(vcs_current_branch)"
  default="$(vcs_default_branch)"
  rc=$?
  if [ "$current" = "HEAD" ]; then
    printf 'refusing to commit: repository is in detached HEAD state\n' >&2
    return 1
  fi
  if [ $rc -ne 0 ] || [ -z "$default" ]; then
    explicit="$(cfg_get vcs.default_branch '')"
    if [ -n "$explicit" ]; then
      printf 'refusing to commit: vcs.default_branch is set to "%s" but that branch does not exist. Fix the config or remove the override; refusing to fall through to autodetection with an unproven setting.\n' \
        "$explicit" >&2
    else
      printf 'refusing to commit: default branch is undeterminable. Set vcs.default_branch in .agent/config.json\n' >&2
    fi
    return 1
  fi
  if [ "$current" = "$default" ]; then
    printf 'refusing to commit on the default branch (%s)\n' "$default" >&2
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
