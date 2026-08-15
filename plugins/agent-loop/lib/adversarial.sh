#!/bin/bash
# Cross-engine refutation review. Never averages verdicts into a consensus.

adv_key() {
  printf '%s' "$1" | jq -r '"\(.file):\(.line):\(.category)"'
}

adv_reconcile() {
  local a="$1" b="$2"
  jq -n --slurpfile A "$a" --slurpfile B "$b" '
    def key: "\(.file):\(.line):\(.category)";
    ($A[0] // []) as $ca | ($B[0] // []) as $cb |
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
