#!/bin/bash
. "$ERICT_LIB/config.sh"
. "$ERICT_LIB/plan.sh"

_fixture_plan() {
  AGENT_REPO="$(mktemp_repo)"
  cat > "$AGENT_REPO/PLAN.md" <<'EOF'
# Plan

- [x] **Step 1: done already**
- [ ] **Step 2: write the test**
- [ ] **Step 3: make it pass**
EOF
  printf '%s' "$AGENT_REPO/PLAN.md"
}

test_plan_next_line_finds_first_unchecked() {
  local p; p="$(_fixture_plan)"
  assert_eq "4" "$(plan_next_line "$p")" "line 4 is first open task"
}

test_plan_next_text_strips_marker() {
  local p; p="$(_fixture_plan)"
  assert_eq "**Step 2: write the test**" "$(plan_next_text "$p")" "text without marker"
}

test_plan_counts() {
  local p; p="$(_fixture_plan)"
  assert_eq "1 3" "$(plan_counts "$p")" "one of three done"
}

test_plan_tick_checks_the_box() {
  local p; p="$(_fixture_plan)"
  plan_tick "$p" 4
  assert_eq "5" "$(plan_next_line "$p")" "next open task moved on"
  assert_eq "2 3" "$(plan_counts "$p")" "two of three done"
}

test_plan_next_line_empty_when_complete() {
  AGENT_REPO="$(mktemp_repo)"
  printf -- '- [x] all done\n' > "$AGENT_REPO/PLAN.md"
  assert_eq "" "$(plan_next_line "$AGENT_REPO/PLAN.md")" "no open tasks"
}

test_plan_counts_returns_two_fields_for_a_missing_plan() {
  AGENT_REPO="$(mktemp_repo)"
  assert_eq "0 0" "$(plan_counts "$AGENT_REPO/nope.md")" "missing plan still yields two numbers"
}

test_plan_tick_is_idempotent_on_checked_line() {
  local p; p="$(_fixture_plan)"
  plan_tick "$p" 3
  assert_eq "1 3" "$(plan_counts "$p")" "ticking a checked line changes nothing"
}

test_plan_bootstrap_creates_a_navigable_plan() {
  AGENT_REPO="$(mktemp_repo)"
  local out
  out="$(plan_bootstrap "$AGENT_REPO/docs/plans/new.md" "Ship the widget")"
  assert_eq "$AGENT_REPO/docs/plans/new.md" "$out" "echoes the path it created"
  assert_contains "$(cat "$out")" "Ship the widget" "goal recorded"
  assert_eq "0 1" "$(plan_counts "$out")" "skeleton has one open task"
}

test_plan_bootstrap_refuses_to_clobber() {
  AGENT_REPO="$(mktemp_repo)"
  printf -- '- [ ] real work\n' > "$AGENT_REPO/PLAN.md"
  assert_fails "refuses to overwrite" plan_bootstrap "$AGENT_REPO/PLAN.md" "whatever"
  assert_contains "$(cat "$AGENT_REPO/PLAN.md")" "real work" "original untouched"
}
