#!/bin/bash
# The wrapper is the only supported way to call a library function at
# runtime: an agent's Bash tool calls do not share shell state, so every
# invocation must be a self-contained fresh process. These tests exercise
# that property directly, rather than through tests/run.sh's one long-lived
# shell (which sources every module once and would never have caught the
# defect this wrapper fixes).

AGENT_LOOP_BIN="$(cd "$AGENT_LOOP_LIB/../bin" && pwd)/agent-loop"

_entry_fixture_plan() {
  local repo; repo="$(mktemp_repo)"
  cat > "$repo/PLAN.md" <<'EOF'
# Plan

- [x] **Step 1: done already**
- [ ] **Step 2: write the test**
- [ ] **Step 3: make it pass**
EOF
  printf '%s' "$repo/PLAN.md"
}

test_wrapper_runs_a_function_from_a_fresh_process() {
  local plan out
  plan="$(_entry_fixture_plan)"
  # A command substitution here forks an entirely new process running
  # $AGENT_LOOP_BIN's own shebang interpreter. It inherits none of this
  # shell's sourced functions (bash does not export functions to child
  # processes unless told to with `export -f`), so this only succeeds if
  # the wrapper resources the whole library itself, on every call.
  out="$("$AGENT_LOOP_BIN" claude plan_counts "$plan")"
  assert_eq "1 3" "$out" "wrapper's plan_counts matches a direct call, from a fresh process"
}

test_wrapper_works_from_a_different_working_directory() {
  local plan out
  plan="$(_entry_fixture_plan)"
  out="$(cd / && "$AGENT_LOOP_BIN" claude plan_counts "$plan")"
  assert_eq "1 3" "$out" "cwd does not affect the wrapper's own self-discovery"
}

test_wrapper_works_when_the_calling_shell_is_zsh() {
  if ! command -v zsh >/dev/null 2>&1; then
    printf '  SKIP: zsh not available on this machine\n' >&2
    return 0
  fi
  local plan out
  plan="$(_entry_fixture_plan)"
  # The wrapper's own shebang is bash, so this proves a zsh *caller* (an
  # agent shell configured to zsh, as this pack's owner runs) can drive it
  # correctly, not that the wrapper itself runs under zsh.
  out="$(zsh -c "bash '$AGENT_LOOP_BIN' claude plan_counts '$plan'")"
  assert_eq "1 3" "$out" "zsh caller invoking the bash wrapper still gets the right answer"
}

test_sourcing_env_sh_directly_under_zsh_now_succeeds() {
  if ! command -v zsh >/dev/null 2>&1; then
    printf '  SKIP: zsh not available on this machine\n' >&2
    return 0
  fi
  local repo out
  repo="$(mktemp_repo)"
  # Direct sourcing, no wrapper involved: this is exactly the failure the
  # owner hit — ${BASH_SOURCE[0]} is empty under zsh. env.sh now captures
  # its own directory at top level (before erict_env, a function, ever
  # runs), which resolves correctly in zsh too.
  out="$(cd "$repo" && zsh -c ". '$AGENT_LOOP_LIB/env.sh' && erict_env claude && printf 'engine=%s repo=%s' \"\$AGENT_ENGINE\" \"\$AGENT_REPO\"" 2>&1)"
  assert_contains "$out" "engine=claude" "erict_env succeeded under zsh"
  assert_contains "$out" "$repo" "AGENT_REPO resolved under zsh"
}

test_adv_counterpart_cmd_resolves_an_absolute_schema_path_under_zsh() {
  if ! command -v zsh >/dev/null 2>&1; then
    printf '  SKIP: zsh not available on this machine\n' >&2
    return 0
  fi
  local repo out schema
  repo="$(mktemp_repo)"
  # adversarial.sh has its own independent BASH_SOURCE[0] resolution for the
  # findings schema path, separate from env.sh's. Sourcing env.sh directly
  # under zsh (proven supported above) makes adv_counterpart_cmd a live zsh
  # function reachable without ever touching bin/agent-loop, so it must be
  # just as caller-shell-agnostic as erict_env is. cd to a directory with no
  # relation to the plugin before calling it, so a wrong relative-path
  # resolution can't accidentally land on a real file.
  out="$(cd "$repo" && zsh -c ". '$AGENT_LOOP_LIB/env.sh' && erict_env claude && cd /tmp && adv_counterpart_cmd claude /tmp/prompt.txt /tmp/out.txt" 2>&1)"
  schema="$(printf '%s' "$out" | awk '{ for (i = 1; i <= NF; i++) if ($i == "--output-schema") print $(i + 1) }')"
  case "$schema" in
    /*) assert_eq "0" "0" "schema path is absolute" ;;
    *)  assert_eq "absolute path" "$schema" "schema path is absolute" ;;
  esac
  assert_eq "1" "$([ -n "$schema" ] && [ -f "$schema" ] && printf 1 || printf 0)" \
    "schema path points at a file that actually exists"
}

test_wrapper_rejects_an_unknown_engine() {
  local plan
  plan="$(_entry_fixture_plan)"
  assert_fails "unknown engine fails loudly rather than defaulting" \
    "$AGENT_LOOP_BIN" gemini plan_counts "$plan"
}

test_wrapper_unknown_engine_message_names_it() {
  local out
  out="$("$AGENT_LOOP_BIN" gemini plan_counts /tmp/nope.md 2>&1)"
  assert_contains "$out" "gemini" "error names the rejected engine"
}

test_wrapper_propagates_a_nonzero_exit_from_the_underlying_function() {
  local repo
  repo="$(mktemp_repo)"
  # vcs_can_commit refuses on the repository's default branch (main, here) —
  # a real non-zero exit from a real library function, not a wrapper-level
  # validation failure, must still come through the wrapper unmasked.
  assert_fails "vcs_can_commit's refusal on main propagates through the wrapper" \
    bash -c "cd '$repo' && '$AGENT_LOOP_BIN' claude vcs_can_commit"
}

test_wrapper_propagated_failure_message_is_preserved() {
  local repo out
  repo="$(mktemp_repo)"
  out="$(cd "$repo" && "$AGENT_LOOP_BIN" claude vcs_can_commit 2>&1)"
  assert_contains "$out" "refusing to commit on the default branch" "underlying stderr passes through unchanged"
}
