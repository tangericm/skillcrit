#!/bin/bash
# Cross-engine refutation review. Never averages verdicts into a consensus.

adv_key() {
  printf '%s' "$1" | jq -r '"\(.file):\(.line):\(.category)"'
}

adv_reconcile() {
  local a="$1" b="$2"
  jq -n --slurpfile A "$a" --slurpfile B "$b" '
    def require_fields:
      if (type == "object")
         and has("file") and has("line") and has("category") and has("refuted")
      then .
      else error("finding missing a required field (file, line, category, refuted): \(tojson)")
      end;
    def key: "\(.file):\(.line):\(.category)";
    ($A[0] // [] | map(require_fields)) as $ca | ($B[0] // [] | map(require_fields)) as $cb |
    ($ca | map({ (key): . }) | add // {}) as $ma |
    ($cb | map({ (key): . }) | add // {}) as $mb |
    ($ma | keys) as $ka | ($mb | keys) as $kb |
    {
      agreed: [ $ka[] | select($mb[.] != null)
                | select($ma[.].refuted == $mb[.].refuted)
                | { key: ., claude: $ma[.], codex: $mb[.] } ],
      contradictory: [ $ka[] | select($mb[.] != null)
                       | select($ma[.].refuted != $mb[.].refuted)
                       | { key: ., claude: $ma[.], codex: $mb[.] } ],
      claude_only: [ $ka[] | select($mb[.] == null) | $ma[.] ],
      codex_only: [ $kb[] | select($ma[.] == null) | $mb[.] ]
    }
  '
}

# --- counterpart routing -----------------------------------------------------
# Self-review is prevented by an explicit flag, never by sniffing the environment.

ADV_CODEX_BIN="${ADV_CODEX_BIN:-codex}"
ADV_CLAUDE_BIN="${ADV_CLAUDE_BIN:-claude}"

adv_counterpart() {
  case "$1" in
    claude) printf 'codex' ;;
    codex)  printf 'claude' ;;
    *)
      printf 'unknown engine: %s (expected claude or codex)\n' "$1" >&2
      return 1
      ;;
  esac
}

adv_counterpart_bin() {
  local other
  other="$(adv_counterpart "$1")" || return 1
  case "$other" in
    codex)  printf '%s' "$ADV_CODEX_BIN" ;;
    claude) printf '%s' "$ADV_CLAUDE_BIN" ;;
    *)      return 1 ;;
  esac
}

adv_check_counterpart() {
  local self="$1" bin
  bin="$(adv_counterpart_bin "$self")" || return 1
  if ! command -v "$bin" >/dev/null 2>&1; then
    printf 'counterpart engine %s is not available (looked for %s). Refusing to run a single-engine review.\n' \
      "$(adv_counterpart "$self")" "$bin" >&2
    return 1
  fi
  return 0
}

adv_counterpart_cmd() {
  local self="$1" prompt_file="$2" out_file="$3" schema other
  # BASH_SOURCE[0] is reliable here because this function is only ever
  # reached through bin/agent-loop (see erict_env in env.sh), and that entry
  # point always execs bash — never zsh — so bash's stack-based BASH_SOURCE
  # resolves correctly from inside a function regardless of caller shell.
  # (Contrast env.sh's erict_env, which a caller may also reach by sourcing
  # env.sh directly under zsh; that path needs the top-level $0 capture — see
  # env.sh's comment.)
  schema="$(cd "$(dirname "${BASH_SOURCE[0]}")/../schema" && pwd)/findings.schema.json"
  other="$(adv_counterpart "$self")" || return 1
  case "$other" in
    codex)
      printf '%s exec -s read-only -C %q --output-schema %q -o %q - < %q' \
        "$ADV_CODEX_BIN" "${AGENT_REPO:-.}" "$schema" "$out_file" "$prompt_file"
      ;;
    claude)
      printf '%s -p --output-format json < %q > %q' \
        "$ADV_CLAUDE_BIN" "$prompt_file" "$out_file"
      ;;
    *)
      return 1
      ;;
  esac
}
