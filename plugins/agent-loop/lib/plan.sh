#!/bin/bash
# Navigates a markdown plan. The universal substrate is a "- [ ]" checkbox.

plan_next_line() {
  local plan="$1"
  [ -f "$plan" ] || return 0
  awk '/^[[:space:]]*- \[ \]/ { print NR; exit }' "$plan"
}

plan_next_text() {
  local plan="$1" line
  line="$(plan_next_line "$plan")"
  [ -n "$line" ] || return 0
  portable_strip_cr "$plan" | awk -v ln="$line" 'NR == ln {
    sub(/^[[:space:]]*- \[ \][[:space:]]*/, "")
    print
    exit
  }'
}

plan_counts() {
  local plan="$1" done_n total_n
  # Callers parse two fields, so a missing plan must still yield two numbers
  # rather than an empty string.
  [ -f "$plan" ] || { printf '0 0'; return 0; }
  done_n="$(awk '/^[[:space:]]*- \[[xX]\]/ { n++ } END { print n + 0 }' "$plan")"
  total_n="$(awk '/^[[:space:]]*- \[[ xX]\]/ { n++ } END { print n + 0 }' "$plan")"
  printf '%s %s' "$done_n" "$total_n"
}

plan_bootstrap() {
  local path="$1" goal="$2"
  if [ -e "$path" ]; then
    printf 'refusing to overwrite an existing plan at %s\n' "$path" >&2
    return 1
  fi
  mkdir -p "$(dirname "$path")"
  cat > "$path" <<EOF
# $goal

**Goal:** $goal

**Status:** skeleton. Replace the placeholder task below with real steps before
running /auto — an unattended loop over a one-line plan does nothing useful.

---

## Tasks

- [ ] Define the first concrete step toward: $goal
EOF
  printf '%s' "$path"
}
