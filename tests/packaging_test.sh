#!/bin/bash
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

test_manifests_are_valid_json() {
  assert_eq "0" "$(jq -e . "$ROOT_DIR/.claude-plugin/marketplace.json" >/dev/null 2>&1; echo $?)" "marketplace.json parses"
  assert_eq "0" "$(jq -e . "$ROOT_DIR/.claude-plugin/plugin.json" >/dev/null 2>&1; echo $?)" "claude plugin.json parses"
  assert_eq "0" "$(jq -e . "$ROOT_DIR/plugins/agent-loop/.codex-plugin/plugin.json" >/dev/null 2>&1; echo $?)" "codex plugin.json parses"
}

test_codex_manifest_points_at_shared_skills() {
  assert_eq "./skills/" "$(jq -r '.skills' "$ROOT_DIR/plugins/agent-loop/.codex-plugin/plugin.json")" "codex reads shared skills dir"
}

test_every_skill_has_name_and_description() {
  local f found
  found=0
  for f in "$ROOT_DIR"/plugins/agent-loop/skills/*/SKILL.md; do
    [ -f "$f" ] || continue
    found=$((found + 1))
    assert_eq "1" "$(head -1 "$f" | grep -c -- '---')" "$(basename "$(dirname "$f")") starts with frontmatter"
    assert_contains "$(head -20 "$f")" "name:" "$(basename "$(dirname "$f")") declares name"
    assert_contains "$(head -20 "$f")" "description:" "$(basename "$(dirname "$f")") declares description"
  done
  assert_eq "1" "$([ "$found" -gt 0 ] && printf 1 || printf 0)" "at least one SKILL.md was found"
}

test_git_guard_blocks_when_preflight_tool_missing() {
  local repo; repo="$(mktemp_repo)"
  mkdir -p "$repo/.agent"
  printf '{"preflight":["definitely-not-a-real-tool"]}\n' > "$repo/.agent/config.json"
  assert_fails "guard blocks missing tool" \
    bash -c "cd '$repo' && printf '{\"tool_input\":{\"command\":\"git merge x\"}}' | bash '$ROOT_DIR/plugins/agent-loop/hooks/git_guard.sh'"
}

test_git_guard_allows_non_git_commands() {
  local repo; repo="$(mktemp_repo)"
  mkdir -p "$repo/.agent"
  printf '{"preflight":["definitely-not-a-real-tool"]}\n' > "$repo/.agent/config.json"
  bash -c "cd '$repo' && printf '{\"tool_input\":{\"command\":\"ls -la\"}}' | bash '$ROOT_DIR/plugins/agent-loop/hooks/git_guard.sh'"
  assert_eq "0" "$?" "non-git command passes through"
}
