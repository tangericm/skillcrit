#!/bin/bash
. "$ERICT_LIB/config.sh"
. "$ERICT_LIB/slice.sh"

_slice_repo() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  cat > "$AGENT_REPO/.agent/config.json" <<'EOF'
{
  "modules": {
    "domain": "game/src/domain/*",
    "presentation": "game/src/presentation/*"
  }
}
EOF
}

test_slice_module_maps_configured_glob() {
  _slice_repo
  assert_eq "domain" "$(slice_module game/src/domain/kernel.gd)" "domain glob matches"
}

test_slice_module_falls_back_to_path_prefix() {
  AGENT_REPO="$(mktemp_repo)"
  assert_eq "src/api" "$(slice_module src/api/handler.ts)" "two-component fallback"
}

test_slice_disjoint_accepts_separate_modules() {
  _slice_repo
  slice_disjoint "game/src/domain/kernel.gd" "game/src/presentation/hud.gd"
  assert_eq "0" "$?" "different modules are disjoint"
}

test_slice_disjoint_rejects_shared_module() {
  _slice_repo
  assert_fails "shared module rejected" \
    slice_disjoint "game/src/domain/kernel.gd" "game/src/domain/rng.gd"
}

test_slice_disjoint_rejects_identical_file() {
  AGENT_REPO="$(mktemp_repo)"
  assert_fails "same file rejected" slice_disjoint "src/a/x.ts" "src/a/x.ts"
}

test_slice_module_handles_a_path_containing_spaces() {
  AGENT_REPO="$(mktemp_repo)"
  assert_eq "my src/core" "$(slice_module 'my src/core/x.ts')" "space in path keeps both components"
}

test_slice_disjoint_rejects_a_shared_module_across_paths_with_spaces() {
  AGENT_REPO="$(mktemp_repo)"
  assert_fails "shared module with spaces rejected" \
    slice_disjoint 'my src/core/a.ts' 'my src/core/b.ts'
}

test_slice_disjoint_accepts_separate_modules_with_spaces() {
  AGENT_REPO="$(mktemp_repo)"
  slice_disjoint 'my src/core/a.ts' 'my src/ui/b.ts'
  assert_eq "0" "$?" "different modules with spaces are disjoint"
}

test_slice_disjoint_reads_multi_file_lists() {
  AGENT_REPO="$(mktemp_repo)"
  assert_fails "overlap anywhere in the lists is rejected" \
    slice_disjoint 'src/a/x.ts
src/b/y.ts' 'src/c/z.ts
src/b/w.ts'
}
