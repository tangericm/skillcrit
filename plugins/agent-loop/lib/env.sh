#!/bin/bash
# Single entry point. Sources every module and establishes repo + engine.

erict_env() {
  local engine="${1:-unknown}" here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
