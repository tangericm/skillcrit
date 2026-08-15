#!/bin/bash
# Proves two work slices touch no common module. Refuses when it cannot prove it.

slice_module() {
  local file="$1" modules name pattern
  modules="$(cfg_get modules '{}')"
  # here-doc, not a pipe: the loop must return from the calling shell, and
  # read -r keeps module names containing spaces intact.
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    pattern="$(printf '%s' "$modules" | jq -r --arg k "$name" '.[$k]')"
    case "$file" in
      $pattern) printf '%s' "$name"; return 0 ;;
    esac
  done <<EOF
$(printf '%s' "$modules" | jq -r 'keys[]' 2>/dev/null)
EOF
  printf '%s' "$file" | awk -F/ '{ if (NF >= 2) print $1 "/" $2; else print $1 }'
}

slice_disjoint() {
  local a_files="$1" b_files="$2" a b a_mods b_mod
  a_mods=""
  # File lists are newline-separated. Word-splitting would break any path
  # containing a space, so every loop here reads line by line.
  while IFS= read -r a; do
    [ -n "$a" ] || continue
    a_mods="$a_mods
$(slice_module "$a")"
  done <<EOF
$a_files
EOF
  while IFS= read -r b; do
    [ -n "$b" ] || continue
    b_mod="$(slice_module "$b")"
    if printf '%s\n' "$a_mods" | grep -Fxq -- "$b_mod"; then
      printf 'slices are not disjoint: both touch %s\n' "$b_mod" >&2
      return 1
    fi
  done <<EOF
$b_files
EOF
  return 0
}
