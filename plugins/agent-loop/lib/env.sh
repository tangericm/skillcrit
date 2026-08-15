#!/bin/bash
# Single entry point. Sources every module and establishes repo + engine.
#
# This directory is captured here, at the top level, the instant the file is
# sourced — not inside erict_env. ${BASH_SOURCE[0]} is empty under zsh, and
# inside a zsh *function* $0 is reset to the function's own name (zsh's
# FUNCTION_ARGZERO option, on by default), never the file that defined it —
# so neither one can be read correctly from inside erict_env itself. At top
# level, before any function has run, bash's BASH_SOURCE[0] and zsh's $0
# both correctly hold this file's own path, so capturing it right here,
# once, works in both shells. This is a bare path computation with no
# observable effect beyond the one variable it sets — no writes, no output —
# so it keeps the spirit of "sourceable and side-effect free" even though it
# runs outside a function.
_erict_env_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

erict_env() {
  local engine="${1:-unknown}" here="$_erict_env_lib_dir"
  AGENT_ENGINE="$engine"
  . "$here/portable.sh"
  portable_require || return 1
  AGENT_REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  export AGENT_ENGINE AGENT_REPO
  . "$here/config.sh"
  . "$here/detect.sh"
  . "$here/state.sh"
  . "$here/plan.sh"
  . "$here/gate.sh"
  . "$here/vcs.sh"
  . "$here/adversarial.sh"
}
