#!/bin/bash
. "$ERICT_LIB/config.sh"
. "$ERICT_LIB/detect.sh"
. "$ERICT_LIB/gate.sh"

_gate_repo() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  cat > "$AGENT_REPO/.agent/config.json" <<'EOF'
{
  "gates": { "focused": "echo focused", "suite": "echo suite", "full": "echo full" },
  "gate_policy": {
    "commit_requires": "focused",
    "escalate_when": { "src/domain/*": "suite", "src/persistence/*": "full" }
  }
}
EOF
}

test_gate_level_defaults_to_commit_requires() {
  _gate_repo
  assert_eq "focused" "$(gate_level_for src/ui/button.ts)" "unmatched path uses floor"
}

test_gate_level_escalates_on_match() {
  _gate_repo
  assert_eq "suite" "$(gate_level_for src/domain/kernel.gd)" "domain escalates to suite"
}

test_gate_level_takes_highest_of_several() {
  _gate_repo
  assert_eq "full" "$(gate_level_for src/ui/a.ts src/domain/b.gd src/persistence/c.gd)" "highest wins"
}

test_gate_run_executes_configured_command() {
  _gate_repo
  assert_eq "suite" "$(gate_run suite)" "runs the suite command"
}

test_gate_run_fails_loudly_without_a_command() {
  AGENT_REPO="$(mktemp_repo)"
  assert_fails "no gate is an error" gate_run suite
}

test_gate_level_rejects_an_unknown_configured_level() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"gate_policy":{"commit_requires":"ful"}}\n' > "$AGENT_REPO/.agent/config.json"
  assert_fails "typo'd gate level fails loudly" gate_level_for src/a.ts
}

test_gate_level_rejects_an_unknown_escalation_level() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"gate_policy":{"escalate_when":{"src/*":"complete"}}}\n' > "$AGENT_REPO/.agent/config.json"
  assert_fails "typo'd escalation level fails loudly" gate_level_for src/a.ts
}

test_gate_level_matches_a_pattern_containing_spaces() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"gate_policy":{"escalate_when":{"my src/*":"full"}}}\n' > "$AGENT_REPO/.agent/config.json"
  assert_eq "full" "$(gate_level_for 'my src/kernel.gd')" "space in pattern still escalates"
}
