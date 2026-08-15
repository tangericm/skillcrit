#!/bin/bash
# Discovers plans and gates in a repository with no configuration.

DETECT_PLAN_LOCATIONS='docs/superpowers/plans docs/plans docs/tasks .'
DETECT_PLAN_ROOTFILES='PLAN.md TODO.md'

_detect_has_open_task() {
  grep -qE '^[[:space:]]*- \[ \]' "$1" 2>/dev/null
}

detect_plan() {
  local repo="${AGENT_REPO:-.}" pinned glob dir f newest newest_mtime mtime
  pinned="$(cfg_get plan.active '')"
  if [ -n "$pinned" ] && [ -f "$repo/$pinned" ]; then
    printf '%s' "$repo/$pinned"
    return 0
  fi

  newest=""
  newest_mtime=0

  glob="$(cfg_get plan.glob '')"
  if [ -n "$glob" ]; then
    for f in $(cd "$repo" 2>/dev/null && ls -1 $glob 2>/dev/null); do
      _detect_has_open_task "$repo/$f" || continue
      mtime="$(stat -f %m "$repo/$f" 2>/dev/null || echo 0)"
      if [ "$mtime" -ge "$newest_mtime" ]; then newest="$repo/$f"; newest_mtime="$mtime"; fi
    done
    [ -n "$newest" ] && { printf '%s' "$newest"; return 0; }
  fi

  for dir in $DETECT_PLAN_LOCATIONS; do
    [ -d "$repo/$dir" ] || continue
    local pattern
    if [ "$dir" = "." ]; then
      pattern="$repo/*.md"
    else
      pattern="$repo/$dir/*.md"
    fi
    for f in $pattern; do
      [ -f "$f" ] || continue
      _detect_has_open_task "$f" || continue
      mtime="$(stat -f %m "$f" 2>/dev/null || echo 0)"
      if [ "$mtime" -ge "$newest_mtime" ]; then newest="$f"; newest_mtime="$mtime"; fi
    done
    [ -n "$newest" ] && { printf '%s' "$newest"; return 0; }
  done

  for f in $DETECT_PLAN_ROOTFILES; do
    [ -f "$repo/$f" ] || continue
    _detect_has_open_task "$repo/$f" || continue
    printf '%s' "$repo/$f"
    return 0
  done
}

detect_gate() {
  local level="$1" repo="${AGENT_REPO:-.}" configured
  # Sentinel default, so an explicitly configured empty string means "this
  # project has no gate at this level" and reaches gate_run, which fails
  # loudly — rather than silently falling through to auto-detection.
  configured="$(cfg_get "gates.$level" '@@UNSET@@')"
  if [ "$configured" != "@@UNSET@@" ]; then
    printf '%s' "$configured"
    return 0
  fi

  if [ -f "$repo/package.json" ] && jq -e '.scripts.test' "$repo/package.json" >/dev/null 2>&1; then
    printf 'npm test'
    return 0
  fi
  if [ -f "$repo/Makefile" ] && grep -qE '^test:' "$repo/Makefile"; then
    printf 'make test'
    return 0
  fi
  if [ -f "$repo/Cargo.toml" ]; then printf 'cargo test'; return 0; fi
  if [ -f "$repo/go.mod" ]; then printf 'go test ./...'; return 0; fi
  if [ -f "$repo/pyproject.toml" ] || [ -f "$repo/pytest.ini" ]; then printf 'pytest'; return 0; fi
}
