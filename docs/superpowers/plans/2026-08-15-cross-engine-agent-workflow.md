# agent-loop Cross-Engine Agent Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a portable skill pack that gives Claude Code and Codex a shared, resumable working loop over any repository's plan, distributed as one git repository carrying both engines' manifests.

**Architecture:** Every deterministic decision lives in `lib/*.sh`, tested by bash fixtures that need neither engine nor network. `SKILL.md` files hold the procedure both engines read. Manifests carry no logic. Project-specific behaviour arrives through an optional `.agent/config.json` (machine-readable, consumed by the shell) and `.agent/rules.md` (prose, consumed by the model) in the *consuming* repository — never by editing the pack.

**Tech Stack:** Bash 3.2 (macOS system bash), `jq`, `git`, `awk`, `grep`. Claude Code plugin manifests, Codex plugin manifests, `codex exec`, `claude -p`.

## Global Constraints

- Target **bash 3.2** — the macOS system shell. No associative arrays, no `${var,,}`, no `readarray`.
- Depend only on tools present on a clean macOS install plus `jq` and `git`. **No `rg`, no GNU `sed`, no GNU `timeout`, no `grep -P`.** Use `grep -E`, `awk`, and `mktemp`.
- Never edit a file in place with `sed -i`. Write to `mktemp` and `mv`.
- Every `lib/*.sh` file is sourceable and side-effect free at source time. Functions only; no top-level work.
- Every function prefixed by its module: `cfg_`, `state_`, `plan_`, `gate_`, `vcs_`, `slice_`, `adv_`.
- **`/next` and `/auto` never commit while `HEAD` is the repository's default branch.** Not configurable.
- **`/auto` never merges and never pushes.** Not configurable.
- Missing counterpart engine, missing gate, or unprovable slice disjointness **fails loudly**. Never degrade silently.
- `.agent/state.md` and `.agent/journal.md` are gitignored in consuming repos; `.agent/config.json` and `.agent/rules.md` are committed.
- Shell files use 2-space indent. Markdown uses 2-space indent.
- Commit subjects: one line, imperative, lowercase after the prefix (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).

## File Structure

| Path | Responsibility |
|---|---|
| `plugins/agent-loop/lib/config.sh` | read `.agent/config.json` with defaults |
| `plugins/agent-loop/lib/detect.sh` | discover plan files and gate commands in an unconfigured repo |
| `plugins/agent-loop/lib/state.sh` | read/write `.agent/state.md`, notes cap, concurrent-writer lock |
| `plugins/agent-loop/lib/plan.sh` | locate next unchecked task, count tasks, tick a checkbox |
| `plugins/agent-loop/lib/gate.sh` | choose and run a gate level |
| `plugins/agent-loop/lib/vcs.sh` | default-branch refusal, `PATH` preflight, commit |
| `plugins/agent-loop/lib/slice.sh` | prove two work slices are disjoint |
| `plugins/agent-loop/lib/adversarial.sh` | route to the counterpart engine, reconcile verdicts |
| `plugins/agent-loop/schema/agent-config.schema.json` | validate `.agent/config.json` |
| `plugins/agent-loop/schema/findings.schema.json` | validate reviewer output |
| `plugins/agent-loop/skills/session-state/SKILL.md` | procedure for `/status` `/next` `/auto` `/handoff` |
| `plugins/agent-loop/skills/adversarial-review/SKILL.md` | procedure for `/adversarial` |
| `plugins/agent-loop/commands/*.md` | Claude-only shims naming the skill |
| `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json` | Claude packaging + hooks |
| `plugins/agent-loop/.codex-plugin/plugin.json` | Codex packaging |
| `tests/run.sh`, `tests/*_test.sh` | bash fixtures |

---

### Task 1: Test harness and repo scaffolding

**Files:**
- Create: `tests/run.sh`
- Create: `tests/helpers.sh`
- Create: `tests/harness_test.sh`

**Interfaces:**
- Consumes: nothing
- Produces: `assert_eq <expected> <actual> <label>`, `assert_fails <label> <cmd...>`, `assert_contains <haystack> <needle> <label>`, `mktemp_repo` (creates a throwaway git repo, echoes its path). Every later task's tests use these.

- [ ] **Step 1: Write the failing test**

`tests/harness_test.sh`:

```bash
#!/bin/bash
test_assert_eq_passes() {
  assert_eq "a" "a" "identical strings match"
}

test_mktemp_repo_is_a_git_repo() {
  local repo
  repo="$(mktemp_repo)"
  assert_eq "true" "$(git -C "$repo" rev-parse --is-inside-work-tree)" "mktemp_repo makes a repo"
  assert_eq "main" "$(git -C "$repo" rev-parse --abbrev-ref HEAD)" "default branch is main"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `tests/run.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

`tests/helpers.sh`:

```bash
#!/bin/bash
ASSERT_PASS=0
ASSERT_FAIL=0

assert_eq() {
  local expected="$1" actual="$2" label="$3"
  if [ "$expected" = "$actual" ]; then
    ASSERT_PASS=$((ASSERT_PASS + 1))
  else
    ASSERT_FAIL=$((ASSERT_FAIL + 1))
    printf '  FAIL: %s\n    expected: [%s]\n    actual:   [%s]\n' "$label" "$expected" "$actual" >&2
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" label="$3"
  case "$haystack" in
    *"$needle"*) ASSERT_PASS=$((ASSERT_PASS + 1)) ;;
    *)
      ASSERT_FAIL=$((ASSERT_FAIL + 1))
      printf '  FAIL: %s\n    [%s] does not contain [%s]\n' "$label" "$haystack" "$needle" >&2
      ;;
  esac
}

assert_fails() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    ASSERT_FAIL=$((ASSERT_FAIL + 1))
    printf '  FAIL: %s (command unexpectedly succeeded)\n' "$label" >&2
  else
    ASSERT_PASS=$((ASSERT_PASS + 1))
  fi
}

mktemp_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q --initial-branch=main
  git -C "$dir" config user.email "test@example.com"
  git -C "$dir" config user.name "Test"
  printf 'seed\n' > "$dir/README.md"
  git -C "$dir" add -A
  git -C "$dir" commit -q -m "chore: seed"
  printf '%s' "$dir"
}
```

`tests/run.sh`:

```bash
#!/bin/bash
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export AGENT_LOOP_LIB="$ROOT/plugins/agent-loop/lib"
. "$ROOT/tests/helpers.sh"

for file in "$ROOT"/tests/*_test.sh; do
  [ -e "$file" ] || continue
  printf '%s\n' "$(basename "$file")"
  . "$file"
  for fn in $(grep -oE '^test_[a-z0-9_]+' "$file"); do
    "$fn"
  done
done

printf '\n%d passed, %d failed\n' "$ASSERT_PASS" "$ASSERT_FAIL"
[ "$ASSERT_FAIL" -eq 0 ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — `3 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test: add bash fixture harness"
```

---

### Task 2: Configuration reader

**Files:**
- Create: `plugins/agent-loop/lib/config.sh`
- Create: `plugins/agent-loop/schema/agent-config.schema.json`
- Create: `tests/config_test.sh`

**Interfaces:**
- Consumes: `tests/helpers.sh` from Task 1
- Produces:
  - `cfg_get <dotted.key> <default>` — echoes the config value or the default. Arrays and objects echo as compact JSON.
  - `cfg_file` — echoes the config path, or empty when absent.
  - Both read `$AGENT_REPO` for the repository root.

- [ ] **Step 1: Write the failing test**

`tests/config_test.sh`:

```bash
#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"

test_cfg_get_returns_default_when_no_config() {
  AGENT_REPO="$(mktemp_repo)"
  assert_eq "- [ ]" "$(cfg_get plan.task_marker '- [ ]')" "default when file absent"
  assert_eq "" "$(cfg_file)" "cfg_file empty when absent"
}

test_cfg_get_reads_nested_value() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"vcs":{"branch_prefix":"codex/"}}\n' > "$AGENT_REPO/.agent/config.json"
  assert_eq "codex/" "$(cfg_get vcs.branch_prefix 'agent/')" "nested value"
}

test_cfg_get_falls_back_on_missing_key() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"vcs":{"branch_prefix":"codex/"}}\n' > "$AGENT_REPO/.agent/config.json"
  assert_eq "agent/" "$(cfg_get vcs.nope 'agent/')" "missing key falls back"
}

test_cfg_get_emits_json_for_arrays() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"preflight":["git-lfs","jq"]}\n' > "$AGENT_REPO/.agent/config.json"
  assert_eq '["git-lfs","jq"]' "$(cfg_get preflight '[]')" "array as compact json"
}

test_cfg_get_survives_malformed_json() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{not json\n' > "$AGENT_REPO/.agent/config.json"
  assert_eq "agent/" "$(cfg_get vcs.branch_prefix 'agent/')" "malformed json falls back"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `config.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

`plugins/agent-loop/lib/config.sh`:

```bash
#!/bin/bash
# Reads .agent/config.json from $AGENT_REPO. Every key is optional.

cfg_file() {
  local f="${AGENT_REPO:-.}/.agent/config.json"
  [ -f "$f" ] && printf '%s' "$f"
}

cfg_get() {
  local key="$1" default="${2-}" file val
  file="$(cfg_file)"
  if [ -z "$file" ]; then
    printf '%s' "$default"
    return 0
  fi
  val="$(jq -r --arg d "$default" \
    "try (.$key) catch null | if . == null then \$d elif (type == \"array\" or type == \"object\") then tojson else tostring end" \
    "$file" 2>/dev/null)"
  if [ -z "$val" ]; then
    printf '%s' "$default"
  else
    printf '%s' "$val"
  fi
}
```

`plugins/agent-loop/schema/agent-config.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "agent-loop agent config",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "plan": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "glob": { "type": "string" },
        "active": { "type": ["string", "null"] },
        "task_marker": { "type": "string" }
      }
    },
    "gates": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "focused": { "type": "string" },
        "suite": { "type": "string" },
        "full": { "type": "string" }
      }
    },
    "gate_policy": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "commit_requires": { "enum": ["focused", "suite", "full"] },
        "halt_requires": { "enum": ["focused", "suite", "full"] },
        "escalate_when": {
          "type": "object",
          "additionalProperties": { "enum": ["focused", "suite", "full"] }
        }
      }
    },
    "vcs": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "branch_prefix": { "type": "string" },
        "worktree_root": { "type": "string" },
        "auto_commit": { "type": "boolean" },
        "default_branch": { "type": "string" }
      }
    },
    "human_gate": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "glob": { "type": "string" },
        "marker": { "type": "string" }
      }
    },
    "modules": {
      "type": "object",
      "additionalProperties": { "type": "string" }
    },
    "preflight": { "type": "array", "items": { "type": "string" } },
    "review": {
      "type": "object",
      "additionalProperties": false,
      "properties": { "rules": { "type": "string" } }
    },
    "limits": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "max_tasks": { "type": "integer", "minimum": 1 },
        "max_minutes": { "type": "integer", "minimum": 1 }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — 5 new assertions green

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-loop/lib/config.sh plugins/agent-loop/schema/agent-config.schema.json tests/config_test.sh
git commit -m "feat: read optional .agent/config.json with defaults"
```

---

### Task 3: Plan and gate detection

**Files:**
- Create: `plugins/agent-loop/lib/detect.sh`
- Create: `tests/detect_test.sh`

**Interfaces:**
- Consumes: `cfg_get` from Task 2
- Produces:
  - `detect_plan` — echoes the active plan path, or empty. Honours `plan.active`, then `plan.glob`, then built-in locations. Ties break on most-recently-modified file containing an unchecked box.
  - `detect_gate <level>` — echoes a shell command for `focused`|`suite`|`full`, or empty when none can be found. Honours `gates.<level>` first.

- [ ] **Step 1: Write the failing test**

`tests/detect_test.sh`:

```bash
#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/detect.sh"

test_detect_plan_finds_todo_in_bare_repo() {
  AGENT_REPO="$(mktemp_repo)"
  printf '# Todo\n\n- [ ] first thing\n' > "$AGENT_REPO/TODO.md"
  assert_eq "$AGENT_REPO/TODO.md" "$(detect_plan)" "bare repo finds TODO.md"
}

test_detect_plan_prefers_superpowers_location() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/docs/superpowers/plans"
  printf -- '- [ ] real work\n' > "$AGENT_REPO/docs/superpowers/plans/2026-01-01-x.md"
  printf -- '- [ ] stale\n' > "$AGENT_REPO/TODO.md"
  assert_eq "$AGENT_REPO/docs/superpowers/plans/2026-01-01-x.md" "$(detect_plan)" "prefers plans dir"
}

test_detect_plan_skips_fully_checked_plan() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/docs/superpowers/plans"
  printf -- '- [x] done\n' > "$AGENT_REPO/docs/superpowers/plans/done.md"
  printf -- '- [ ] open\n' > "$AGENT_REPO/TODO.md"
  assert_eq "$AGENT_REPO/TODO.md" "$(detect_plan)" "skips completed plan"
}

test_detect_plan_honours_configured_active() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf -- '- [ ] pinned\n' > "$AGENT_REPO/pinned.md"
  printf '{"plan":{"active":"pinned.md"}}\n' > "$AGENT_REPO/.agent/config.json"
  assert_eq "$AGENT_REPO/pinned.md" "$(detect_plan)" "config pin wins"
}

test_detect_gate_reads_npm_test_script() {
  AGENT_REPO="$(mktemp_repo)"
  printf '{"scripts":{"test":"vitest run"}}\n' > "$AGENT_REPO/package.json"
  assert_eq "npm test" "$(detect_gate suite)" "npm project"
}

test_detect_gate_prefers_config() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"gates":{"suite":"./scripts/test.sh"}}\n' > "$AGENT_REPO/.agent/config.json"
  printf '{"scripts":{"test":"vitest run"}}\n' > "$AGENT_REPO/package.json"
  assert_eq "./scripts/test.sh" "$(detect_gate suite)" "config beats detection"
}

test_detect_gate_empty_when_nothing_found() {
  AGENT_REPO="$(mktemp_repo)"
  assert_eq "" "$(detect_gate suite)" "bare repo has no gate"
}

test_detect_gate_honours_an_explicitly_blank_gate() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"gates":{"suite":""}}\n' > "$AGENT_REPO/.agent/config.json"
  printf '{"scripts":{"test":"vitest run"}}\n' > "$AGENT_REPO/package.json"
  assert_eq "" "$(detect_gate suite)" "blank gate means none, not auto-detect"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `detect.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

`plugins/agent-loop/lib/detect.sh`:

```bash
#!/bin/bash
# Discovers plans and gates in a repository with no configuration.

DETECT_PLAN_LOCATIONS='docs/superpowers/plans docs/plans docs/tasks .'
DETECT_PLAN_ROOTFILES='PLAN.md TODO.md'

_detect_has_open_task() {
  grep -qE '^[[:space:]]*- \[ \]' "$1" 2>/dev/null
}

detect_plan() {
  local repo="${AGENT_REPO:-.}" pinned glob dir f newest newest_mtime mtime
  pinned="$(cfg_get plan.active '')"
  if [ -n "$pinned" ] && [ -f "$repo/$pinned" ]; then
    printf '%s' "$repo/$pinned"
    return 0
  fi

  newest=""
  newest_mtime=0

  glob="$(cfg_get plan.glob '')"
  if [ -n "$glob" ]; then
    for f in $(cd "$repo" 2>/dev/null && ls -1 $glob 2>/dev/null); do
      _detect_has_open_task "$repo/$f" || continue
      mtime="$(stat -f %m "$repo/$f" 2>/dev/null || echo 0)"
      if [ "$mtime" -ge "$newest_mtime" ]; then newest="$repo/$f"; newest_mtime="$mtime"; fi
    done
    [ -n "$newest" ] && { printf '%s' "$newest"; return 0; }
  fi

  for dir in $DETECT_PLAN_LOCATIONS; do
    [ -d "$repo/$dir" ] || continue
    for f in "$repo/$dir"/*.md; do
      [ -f "$f" ] || continue
      _detect_has_open_task "$f" || continue
      mtime="$(stat -f %m "$f" 2>/dev/null || echo 0)"
      if [ "$mtime" -ge "$newest_mtime" ]; then newest="$f"; newest_mtime="$mtime"; fi
    done
    [ -n "$newest" ] && { printf '%s' "$newest"; return 0; }
  done

  for f in $DETECT_PLAN_ROOTFILES; do
    [ -f "$repo/$f" ] || continue
    _detect_has_open_task "$repo/$f" || continue
    printf '%s' "$repo/$f"
    return 0
  done
}

detect_gate() {
  local level="$1" repo="${AGENT_REPO:-.}" configured
  # Sentinel default, so an explicitly configured empty string means "this
  # project has no gate at this level" and reaches gate_run, which fails
  # loudly — rather than silently falling through to auto-detection.
  configured="$(cfg_get "gates.$level" '@@UNSET@@')"
  if [ "$configured" != "@@UNSET@@" ]; then
    printf '%s' "$configured"
    return 0
  fi

  if [ -f "$repo/package.json" ] && jq -e '.scripts.test' "$repo/package.json" >/dev/null 2>&1; then
    printf 'npm test'
    return 0
  fi
  if [ -f "$repo/Makefile" ] && grep -qE '^test:' "$repo/Makefile"; then
    printf 'make test'
    return 0
  fi
  if [ -f "$repo/Cargo.toml" ]; then printf 'cargo test'; return 0; fi
  if [ -f "$repo/go.mod" ]; then printf 'go test ./...'; return 0; fi
  if [ -f "$repo/pyproject.toml" ] || [ -f "$repo/pytest.ini" ]; then printf 'pytest'; return 0; fi
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — 7 new assertions green

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-loop/lib/detect.sh tests/detect_test.sh
git commit -m "feat: detect plans and gates in unconfigured repositories"
```

---

### Task 4: State file read and write

**Files:**
- Create: `plugins/agent-loop/lib/state.sh`
- Create: `tests/state_test.sh`

**Interfaces:**
- Consumes: `cfg_get` from Task 2
- Produces:
  - `state_path` — echoes `$AGENT_REPO/.agent/state.md`.
  - `state_get <field>` — echoes a frontmatter field, or empty.
  - `state_section <name>` — echoes a body section by heading, e.g. `state_section "Working notes"`.
  - `state_write <plan> <task> <total> <branch> <last_green> <next_step> <blockers> <notes>` — writes the whole file, capping notes at 40 lines (keeping the newest).
  - `state_lock_ok` — returns 0 when safe to write, 1 when another live engine holds the file.

- [ ] **Step 1: Write the failing test**

`tests/state_test.sh`:

```bash
#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/state.sh"

test_state_round_trip() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  state_write "docs/p.md" 4 9 "agent/x" "abc123" "Do the thing" "none" "note one"
  assert_eq "docs/p.md" "$(state_get plan)" "plan round-trips"
  assert_eq "4" "$(state_get task)" "task round-trips"
  assert_eq "9" "$(state_get total_tasks)" "total round-trips"
  assert_eq "claude" "$(state_get engine)" "engine recorded"
  assert_eq "Do the thing" "$(state_section 'Next concrete step')" "next step round-trips"
  assert_eq "note one" "$(state_section 'Working notes')" "notes round-trip"
}

test_state_caps_notes_at_40_lines() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  local notes i
  notes=""
  i=1
  while [ "$i" -le 50 ]; do
    notes="$notes
line$i"
    i=$((i + 1))
  done
  state_write "p.md" 1 2 "b" "c" "s" "none" "$notes"
  assert_eq "40" "$(state_section 'Working notes' | grep -c '^line')" "capped to 40"
  assert_contains "$(state_section 'Working notes')" "line50" "keeps newest"
}

test_state_lock_ok_when_no_file() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  state_lock_ok
  assert_eq "0" "$?" "no file means unlocked"
}

test_state_lock_refuses_other_live_engine() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  state_write "p.md" 1 2 "b" "c" "s" "none" ""
  # rewrite the frontmatter to claim a different engine holding this live pid
  awk -v pid="$$" '{ sub(/^engine: claude$/, "engine: codex"); sub(/^pid: .*$/, "pid: " pid); print }' \
    "$(state_path)" > "$(state_path).tmp" && mv "$(state_path).tmp" "$(state_path)"
  AGENT_ENGINE=claude
  assert_fails "other live engine blocks write" state_lock_ok
}

test_state_lock_ignores_dead_pid() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  state_write "p.md" 1 2 "b" "c" "s" "none" ""
  awk '{ sub(/^engine: claude$/, "engine: codex"); sub(/^pid: .*$/, "pid: 99999999"); print }' \
    "$(state_path)" > "$(state_path).tmp" && mv "$(state_path).tmp" "$(state_path)"
  state_lock_ok
  assert_eq "0" "$?" "dead pid does not block"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `state.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

`plugins/agent-loop/lib/state.sh`:

```bash
#!/bin/bash
# Reads and writes .agent/state.md — a cursor, never a copy.

STATE_NOTES_MAX=40

state_path() {
  printf '%s' "${AGENT_REPO:-.}/.agent/state.md"
}

state_get() {
  local field="$1" file
  file="$(state_path)"
  [ -f "$file" ] || return 0
  awk -v f="$field" '
    NR == 1 && $0 == "---" { infm = 1; next }
    infm && $0 == "---" { exit }
    infm {
      idx = index($0, ": ")
      if (idx > 0 && substr($0, 1, idx - 1) == f) { print substr($0, idx + 2); exit }
    }
  ' "$file"
}

state_section() {
  local name="$1" file
  file="$(state_path)"
  [ -f "$file" ] || return 0
  awk -v h="## $name" '
    $0 == h { grab = 1; next }
    grab && /^## / { exit }
    grab { lines[n++] = $0 }
    END {
      last = -1
      for (i = 0; i < n; i++) if (lines[i] ~ /[^[:space:]]/) last = i
      for (i = 0; i <= last; i++) print lines[i]
    }
  ' "$file"
}

state_lock_ok() {
  local file holder pid
  file="$(state_path)"
  [ -f "$file" ] || return 0
  holder="$(state_get engine)"
  pid="$(state_get pid)"
  [ -z "$holder" ] && return 0
  [ "$holder" = "${AGENT_ENGINE:-unknown}" ] && return 0
  [ -z "$pid" ] && return 0
  if kill -0 "$pid" 2>/dev/null; then
    printf 'refusing: %s (pid %s) holds %s\n' "$holder" "$pid" "$file" >&2
    return 1
  fi
  return 0
}

state_write() {
  local plan="$1" task="$2" total="$3" branch="$4" last_green="$5"
  local next_step="$6" blockers="$7" notes="$8"
  local file dir capped
  file="$(state_path)"
  dir="$(dirname "$file")"
  mkdir -p "$dir"
  capped="$(printf '%s\n' "$notes" | awk '
    { lines[n++] = $0 }
    END {
      first = -1
      last = -1
      for (i = 0; i < n; i++) {
        if (lines[i] ~ /[^[:space:]]/) {
          if (first == -1) first = i
          last = i
        }
      }
      if (first >= 0) {
        trimmed_n = last - first + 1
        if (trimmed_n > '"$STATE_NOTES_MAX"') {
          start = trimmed_n - '"$STATE_NOTES_MAX"'
        } else {
          start = 0
        }
        for (i = start; i <= last - first; i++) {
          window[w++] = lines[first + i]
        }
        w_first = -1
        w_last = -1
        for (i = 0; i < w; i++) {
          if (window[i] ~ /[^[:space:]]/) {
            if (w_first == -1) w_first = i
            w_last = i
          }
        }
        if (w_first >= 0) {
          for (i = w_first; i <= w_last; i++) print window[i]
        }
      }
    }
  ')"
  {
    printf -- '---\n'
    printf 'plan: %s\n' "$plan"
    printf 'task: %s\n' "$task"
    printf 'total_tasks: %s\n' "$total"
    printf 'branch: %s\n' "$branch"
    printf 'worktree: %s\n' "${AGENT_REPO:-.}"
    printf 'last_green: %s\n' "$last_green"
    printf 'engine: %s\n' "${AGENT_ENGINE:-unknown}"
    printf 'pid: %s\n' "$$"
    printf 'updated: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf -- '---\n\n'
    printf '## Next concrete step\n%s\n\n' "$next_step"
    printf '## Blockers\n%s\n\n' "$blockers"
    printf '## Working notes\n%s\n' "$capped"
  } > "$file"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — 9 new assertions green

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-loop/lib/state.sh tests/state_test.sh
git commit -m "feat: read and write the session cursor with a writer lock"
```

---

### Task 5: Plan task navigation

**Files:**
- Create: `plugins/agent-loop/lib/plan.sh`
- Create: `tests/plan_test.sh`

**Interfaces:**
- Consumes: `cfg_get` from Task 2
- Produces:
  - `plan_next_line <plan>` — echoes the line number of the first unchecked task, or empty when none remain.
  - `plan_next_text <plan>` — echoes that task's text with the marker stripped.
  - `plan_counts <plan>` — echoes `<done> <total>`.
  - `plan_tick <plan> <lineno>` — rewrites that line's `- [ ]` to `- [x]`.
  - `plan_bootstrap <path> <goal>` — writes a minimal plan skeleton at `path` and
    echoes the path. Refuses and returns 1 when the file already exists, so it
    can never clobber real work.

- [ ] **Step 1: Write the failing test**

`tests/plan_test.sh`:

```bash
#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/plan.sh"

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `plan.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

`plugins/agent-loop/lib/plan.sh`:

```bash
#!/bin/bash
# Navigates a markdown plan. The universal substrate is a "- [ ]" checkbox.

plan_next_line() {
  local plan="$1"
  [ -f "$plan" ] || return 0
  awk '/^[[:space:]]*- \[ \]/ { print NR; exit }' "$plan"
}

plan_next_text() {
  local plan="$1" line
  line="$(plan_next_line "$plan")"
  [ -n "$line" ] || return 0
  awk -v ln="$line" 'NR == ln {
    sub(/^[[:space:]]*- \[ \][[:space:]]*/, "")
    print
    exit
  }' "$plan"
}

plan_counts() {
  local plan="$1" done_n total_n
  # Callers parse two fields, so a missing plan must still yield two numbers
  # rather than an empty string.
  [ -f "$plan" ] || { printf '0 0'; return 0; }
  done_n="$(awk '/^[[:space:]]*- \[[xX]\]/ { n++ } END { print n + 0 }' "$plan")"
  total_n="$(awk '/^[[:space:]]*- \[[ xX]\]/ { n++ } END { print n + 0 }' "$plan")"
  printf '%s %s' "$done_n" "$total_n"
}

plan_tick() {
  local plan="$1" line="$2" tmp
  tmp="$(mktemp)"
  awk -v ln="$line" 'NR == ln { sub(/- \[ \]/, "- [x]") } { print }' "$plan" > "$tmp" \
    && mv "$tmp" "$plan"
}

plan_bootstrap() {
  local path="$1" goal="$2"
  if [ -e "$path" ]; then
    printf 'refusing to overwrite an existing plan at %s\n' "$path" >&2
    return 1
  fi
  mkdir -p "$(dirname "$path")"
  cat > "$path" <<EOF
# $goal

**Goal:** $goal

**Status:** skeleton. Replace the placeholder task below with real steps before
running /auto — an unattended loop over a one-line plan does nothing useful.

---

## Tasks

- [ ] Define the first concrete step toward: $goal
EOF
  printf '%s' "$path"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — 7 new assertions green

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-loop/lib/plan.sh tests/plan_test.sh
git commit -m "feat: navigate and tick markdown plan checkboxes"
```

---

### Task 6: Gate selection and execution

**Files:**
- Create: `plugins/agent-loop/lib/gate.sh`
- Create: `tests/gate_test.sh`

**Interfaces:**
- Consumes: `cfg_get` from Task 2, `detect_gate` from Task 3
- Produces:
  - `gate_rank <level>` — echoes `1`, `2`, `3` for `focused`, `suite`, `full`.
  - `gate_level_for <file>...` — echoes the level to run: the higher of `gate_policy.commit_requires` and any `gate_policy.escalate_when` pattern matching a changed file.
  - `gate_run <level>` — runs the command for that level; returns its exit status. Returns 2 and prints to stderr when no command exists.

- [ ] **Step 1: Write the failing test**

`tests/gate_test.sh`:

```bash
#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/detect.sh"
. "$AGENT_LOOP_LIB/gate.sh"

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `gate.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

`plugins/agent-loop/lib/gate.sh`:

```bash
#!/bin/bash
# Chooses the narrowest gate that proves a change, then runs it.

gate_rank() {
  case "$1" in
    focused) printf '1' ;;
    suite)   printf '2' ;;
    full)    printf '3' ;;
    *)       printf '0' ;;
  esac
}

gate_name_for_rank() {
  case "$1" in
    1) printf 'focused' ;;
    2) printf 'suite' ;;
    3) printf 'full' ;;
    *)
      printf 'gate_name_for_rank: unknown rank %s\n' "$1" >&2
      return 1
      ;;
  esac
}

gate_level_for() {
  local floor best rank pattern level file rules
  floor="$(cfg_get gate_policy.commit_requires 'focused')"
  best="$(gate_rank "$floor")"
  if [ "$best" -eq 0 ]; then
    printf 'unknown gate level in gate_policy.commit_requires: %s\n' "$floor" >&2
    return 1
  fi

  rules="$(cfg_get gate_policy.escalate_when '{}')"
  for file in "$@"; do
    # A here-doc keeps this loop in the current shell — a pipe would run it in a
    # subshell and discard "best". read -r preserves patterns containing spaces.
    while IFS= read -r pattern; do
      [ -n "$pattern" ] || continue
      case "$file" in
        $pattern)
          level="$(printf '%s' "$rules" | jq -r --arg k "$pattern" '.[$k]')"
          rank="$(gate_rank "$level")"
          if [ "$rank" -eq 0 ]; then
            printf 'unknown gate level in gate_policy.escalate_when["%s"]: %s\n' "$pattern" "$level" >&2
            return 1
          fi
          [ "$rank" -gt "$best" ] && best="$rank"
          ;;
      esac
    done <<EOF
$(printf '%s' "$rules" | jq -r 'keys[]' 2>/dev/null)
EOF
  done
  gate_name_for_rank "$best"
}

gate_run() {
  local level="$1" cmd
  cmd="$(detect_gate "$level")"
  if [ -z "$cmd" ]; then
    printf 'no %s gate configured or detectable; refusing to proceed\n' "$level" >&2
    return 2
  fi
  ( cd "${AGENT_REPO:-.}" && eval "$cmd" )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — 5 new assertions green

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-loop/lib/gate.sh tests/gate_test.sh
git commit -m "feat: select and run the narrowest proving gate"
```

---

### Task 7: Version-control safety rails

**Files:**
- Create: `plugins/agent-loop/lib/vcs.sh`
- Create: `tests/vcs_test.sh`

**Interfaces:**
- Consumes: `cfg_get` from Task 2
- Produces:
  - `vcs_default_branch` — echoes the repository's default branch name.
  - `vcs_current_branch` — echoes the checked-out branch.
  - `vcs_on_default_branch` — returns 0 when they match.
  - `vcs_preflight` — returns 1 and names the tool when a `preflight` entry is missing from `PATH`.
  - `vcs_can_commit` — returns 0 only when not on the default branch **and** `vcs.auto_commit` is not `false`.
  - `vcs_commit <message>` — commits staged changes; refuses via `vcs_can_commit`.

- [ ] **Step 1: Write the failing test**

`tests/vcs_test.sh`:

```bash
#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/vcs.sh"

test_default_branch_is_main() {
  AGENT_REPO="$(mktemp_repo)"
  assert_eq "main" "$(vcs_default_branch)" "seeded repo defaults to main"
}

test_can_commit_is_false_on_default_branch() {
  AGENT_REPO="$(mktemp_repo)"
  assert_fails "refuses to commit on main" vcs_can_commit
}

test_can_commit_is_true_on_work_branch() {
  AGENT_REPO="$(mktemp_repo)"
  git -C "$AGENT_REPO" checkout -q -b agent/work
  vcs_can_commit
  assert_eq "0" "$?" "work branch permits commit"
}

test_can_commit_respects_auto_commit_false() {
  AGENT_REPO="$(mktemp_repo)"
  git -C "$AGENT_REPO" checkout -q -b agent/work
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"vcs":{"auto_commit":false}}\n' > "$AGENT_REPO/.agent/config.json"
  assert_fails "auto_commit false blocks commit" vcs_can_commit
}

test_preflight_fails_on_missing_tool() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"preflight":["definitely-not-a-real-tool"]}\n' > "$AGENT_REPO/.agent/config.json"
  assert_fails "missing preflight tool blocks" vcs_preflight
}

test_preflight_passes_when_tools_present() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/.agent"
  printf '{"preflight":["git","jq"]}\n' > "$AGENT_REPO/.agent/config.json"
  vcs_preflight
  assert_eq "0" "$?" "present tools pass"
}

test_commit_refuses_on_default_branch() {
  AGENT_REPO="$(mktemp_repo)"
  printf 'change\n' >> "$AGENT_REPO/README.md"
  git -C "$AGENT_REPO" add -A
  assert_fails "commit blocked on main" vcs_commit "feat: nope"
  assert_eq "1" "$(git -C "$AGENT_REPO" rev-list --count HEAD)" "no new commit"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `vcs.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

`plugins/agent-loop/lib/vcs.sh`:

```bash
#!/bin/bash
# Safety rails. Two rules here are deliberately not configurable:
# never commit on the default branch, and never merge or push.

_git() {
  git -C "${AGENT_REPO:-.}" "$@"
}

vcs_default_branch() {
  local ref explicit
  explicit="$(cfg_get vcs.default_branch '')"
  if [ -n "$explicit" ]; then
    printf '%s' "$explicit"
    return 0
  fi
  ref="$(_git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"
  if [ -n "$ref" ]; then
    printf '%s' "${ref#origin/}"
    return 0
  fi
  if _git show-ref --verify --quiet refs/heads/main; then printf 'main'; return 0; fi
  if _git show-ref --verify --quiet refs/heads/master; then printf 'master'; return 0; fi
}

vcs_current_branch() {
  _git rev-parse --abbrev-ref HEAD 2>/dev/null
}

vcs_on_default_branch() {
  local current default
  current="$(vcs_current_branch)"
  default="$(vcs_default_branch)"
  if [ "$current" = "HEAD" ]; then
    return 0
  fi
  if [ -z "$default" ]; then
    return 0
  fi
  [ "$current" = "$default" ]
}

vcs_preflight() {
  local tools tool
  tools="$(cfg_get preflight '[]')"
  for tool in $(printf '%s' "$tools" | jq -r '.[]' 2>/dev/null); do
    if ! command -v "$tool" >/dev/null 2>&1; then
      printf 'preflight failed: %s is not on PATH\n' "$tool" >&2
      return 1
    fi
  done
  return 0
}

vcs_can_commit() {
  local current default
  current="$(vcs_current_branch)"
  default="$(vcs_default_branch)"
  if [ "$current" = "HEAD" ]; then
    printf 'refusing to commit: repository is in detached HEAD state\n' >&2
    return 1
  fi
  if [ -z "$default" ]; then
    printf 'refusing to commit: default branch is undeterminable. Set vcs.default_branch in .agent/config.json\n' >&2
    return 1
  fi
  if [ "$current" = "$default" ]; then
    printf 'refusing to commit on the default branch (%s)\n' "$default" >&2
    return 1
  fi
  if [ "$(cfg_get vcs.auto_commit 'true')" = "false" ]; then
    printf 'refusing to commit: vcs.auto_commit is false\n' >&2
    return 1
  fi
  return 0
}

vcs_commit() {
  local message="$1"
  vcs_can_commit || return 1
  vcs_preflight || return 1
  _git commit -q -m "$message"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — 8 new assertions green

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-loop/lib/vcs.sh tests/vcs_test.sh
git commit -m "feat: add version-control safety rails"
```

---

### Task 8: Disjoint slice proof for parallel handoff

**Files:**
- Create: `plugins/agent-loop/lib/slice.sh`
- Create: `tests/slice_test.sh`

**Interfaces:**
- Consumes: `cfg_get` from Task 2
- Produces:
  - `slice_module <file>` — echoes the module name from `modules` whose glob matches, or the file's top two path components when no `modules` map exists.
  - `slice_disjoint <fileListA> <fileListB>` — arguments are newline-separated file lists. Returns 0 when the two share no module, 1 otherwise, printing the shared module to stderr.

- [ ] **Step 1: Write the failing test**

`tests/slice_test.sh`:

```bash
#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/slice.sh"

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `slice.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

`plugins/agent-loop/lib/slice.sh`:

```bash
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — 5 new assertions green

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-loop/lib/slice.sh tests/slice_test.sh
git commit -m "feat: prove work slices are disjoint before parallel handoff"
```

---

### Task 9: The session-state skill

**Files:**
- Create: `plugins/agent-loop/skills/session-state/SKILL.md`
- Create: `plugins/agent-loop/commands/status.md`
- Create: `plugins/agent-loop/commands/next.md`
- Create: `plugins/agent-loop/commands/auto.md`
- Create: `plugins/agent-loop/commands/handoff.md`
- Create: `plugins/agent-loop/commands/plan.md`
- Create: `plugins/agent-loop/lib/env.sh`
- Create: `tests/env_test.sh`

**Interfaces:**
- Consumes: every `lib/*.sh` from Tasks 2–8
- Produces: `erict_env` — sources every library and exports `AGENT_REPO` (git toplevel) and `AGENT_ENGINE`. Every skill invocation begins by sourcing `lib/env.sh` and calling `erict_env <engine>`.

- [ ] **Step 1: Write the failing test**

`tests/env_test.sh`:

```bash
#!/bin/bash

test_erict_env_sets_repo_and_engine() {
  local repo; repo="$(mktemp_repo)"
  local out
  out="$(cd "$repo" && bash -c ". \"$AGENT_LOOP_LIB/env.sh\"; erict_env codex; printf '%s|%s' \"\$AGENT_REPO\" \"\$AGENT_ENGINE\"")"
  assert_contains "$out" "|codex" "engine exported"
  assert_contains "$out" "$(basename "$repo")" "repo toplevel exported"
}

test_erict_env_exposes_all_functions() {
  local repo; repo="$(mktemp_repo)"
  local out
  out="$(cd "$repo" && bash -c ". \"$AGENT_LOOP_LIB/env.sh\"; erict_env claude; type -t cfg_get state_write plan_tick gate_run vcs_can_commit slice_disjoint | tr '\n' ' '")"
  assert_eq "function function function function function function " "$out" "all modules sourced"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `env.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

`plugins/agent-loop/lib/env.sh`:

```bash
#!/bin/bash
# Single entry point. Sources every module and establishes repo + engine.

erict_env() {
  local engine="${1:-unknown}" here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  AGENT_ENGINE="$engine"
  AGENT_REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  export AGENT_ENGINE AGENT_REPO
  . "$here/config.sh"
  . "$here/detect.sh"
  . "$here/state.sh"
  . "$here/plan.sh"
  . "$here/gate.sh"
  . "$here/vcs.sh"
  . "$here/slice.sh"
}
```

`plugins/agent-loop/skills/session-state/SKILL.md`:

```markdown
---
name: session-state
description: >
  Durable session position for any repository. Provides /plan (create a plan
  when none exists), /status (where are we, what is next), /next (execute one
  task and stop), /auto (execute the plan unattended until a stop condition),
  and /handoff (emit a resume or parallel prompt for another agent session).
  Works in an unconfigured repository by reading "- [ ]" checkboxes; projects
  shape behaviour through .agent/config.json and .agent/rules.md. Trigger:
  "/plan", "/status", "/next", "/auto", "/handoff", "where were we", "continue
  the plan", "hand this off".
---

# Session state

Every command begins by sourcing the library. Run this first, always:

```bash
AGENT_LOOP_LIB="$(dirname "$(find ~/.claude/plugins ~/.codex/plugins ~/Developer/erict-skills \
  -path '*agent-loop*' -name env.sh 2>/dev/null | head -1)")"
[ -n "$AGENT_LOOP_LIB" ] || { echo "agent-loop lib not found"; exit 1; }
. "$AGENT_LOOP_LIB/env.sh" && erict_env claude   # or: erict_env codex
```

Neither engine guarantees a variable naming the skill's own directory, and the
pack lives under a different cache path in each. Discovery is the portable
answer; export `AGENT_LOOP_LIB` once and reuse it for the rest of the session.

Read `.agent/rules.md` (or whatever `review.rules` names) before implementing
anything. It holds the project's own discipline, and it overrides this file.

## Two rules that are never relaxed

1. Never commit while `HEAD` is the default branch. `vcs_can_commit` enforces it.
2. `/auto` never merges and never pushes.

## /plan

Creates a plan when none exists, so `/next` and `/auto` always have something to
navigate. **Never invents work** — the goal comes from the user.

1. Run `detect_plan`. If it finds an open plan, report it and stop. Do not
   create a second one; competing plans are how a cursor goes stale.
2. If the user gave no goal, ask for one. One question, then proceed.
3. **Delegate when a real planning skill is installed.** Check for
   `superpowers:writing-plans` and use it — it produces far better plans than a
   template. Use `superpowers:brainstorming` first when the goal is vague enough
   that the design is not yet settled.
4. **Otherwise fall back** to `plan_bootstrap "<dir>/<YYYY-MM-DD>-<slug>.md" "<goal>"`,
   where `<dir>` is the first existing path among `docs/superpowers/plans`,
   `docs/plans`, or the repository root. Then expand the skeleton into real
   checkbox steps in the same turn — a one-line plan is not a plan.
5. Report the path and the first task.

This pack does not reimplement planning. It only guarantees a plan exists.

## /status

Read-only. Never writes, never commits.

1. `state_get plan` — if empty, run `detect_plan` and report what you *would*
   adopt without adopting it. If `detect_plan` is also empty, say so and point
   at `/plan`.
2. `plan_counts "$plan"` and `plan_next_text "$plan"`.
3. Check the human gate: if `human_gate.glob` is set, grep those files for
   `human_gate.marker`.
4. Report position, next step, blockers, branch, and gate status in under ten
   lines. If the cursor's `task` disagrees with `plan_next_line`, say so — the
   plan was edited by hand and the cursor is stale.

## /next

Execute exactly one task, then stop.

1. **Preflight.** `state_lock_ok` and `vcs_preflight` must both pass. If a human
   gate is open, halt and say which document blocks. If `detect_plan` is empty,
   run the `/plan` procedure above rather than failing, then continue.
2. **Read** only the current task's section of the plan.
3. **Implement** following the project's testing discipline from the rules file.
4. **Gate.** `gate_level_for <changed files>` then `gate_run <level>`.
5. **Commit** on green with `vcs_commit`.
6. **Record.** `plan_tick "$plan" "$line"`, where `$line` is the line number
   `plan_next_line "$plan"` gave you in step 1 — marks the task done. Write
   the project's task report if it defines one. Then call `state_write` with
   all eight positional arguments, in this fixed order. The function performs
   no validation: a transposed or short call corrupts the cursor silently
   instead of failing.

   ```bash
   state_write \
     "$plan" \                          # the active plan path, from detect_plan
     "$next_task_number" \              # the task you just completed, plus one
     "$total_tasks" \                   # plan_counts's SECOND field ("<done> <total>")
     "$(vcs_current_branch)" \
     "$(git rev-parse --short HEAD)" \  # the commit your gate just proved green
     "$next_step" \                     # one imperative sentence
     "$blockers" \                      # or "none"
     "$notes"                           # capped working notes
   ```
7. **Stop.** Report in under ten lines.

Write the cursor after *every* task, not at the end of the session. There is no
graceful shutdown path — usage limits, compaction, and crashes give no warning.

## /auto

Loop `/next`. Halt on any of:

- an open human gate
- `plan_next_line` returns empty (plan exhausted)
- two consecutive gate failures on the same task
- a decision the plan does not specify
- `limits.max_tasks` or `limits.max_minutes` reached

Before halting for any reason, run `gate_run "$(cfg_get gate_policy.halt_requires full)"`
**once** and record the result. Narrow per-task gates mean a chain of green
commits can still break the full suite.

Refuse to start when `detect_gate suite` is empty. Unattended commits without
verification are not a feature.

When `detect_plan` is empty, run `/plan` **and then stop** — do not roll straight
into unattended execution of a plan the user has not seen. `/auto` executes
approved intent; a plan written seconds ago by the same loop is not that.

On halt: call `state_write` with the same eight positional arguments as
`/next` step 6 — plan, task, total, branch, last_green, next_step, blockers,
notes, in that fixed order — then append a halt record to
`.agent/journal.md`, then produce a `/handoff`. Report one summary, not
per-task narration.

## /handoff [parallel]

Default: emit a paste-ready prompt containing the state file, plan path, branch,
next step, the rules file path, and the gate commands. Keep it engine-neutral —
the same text must work in Claude or Codex.

`parallel`: also choose a slice and prove it disjoint with
`slice_disjoint "<current files>" "<candidate files>"`. Name a new branch
(`$(cfg_get vcs.branch_prefix agent/)<short-name>`) and worktree path
(`$(cfg_get vcs.worktree_root .worktrees)/<short-name>`), and state the file
ownership boundary explicitly. **If `slice_disjoint` fails, refuse and say why.**
Do not guess.
```

`plugins/agent-loop/commands/status.md`:

```markdown
---
description: Report where the current plan stands and what the next concrete step is
---

Use the `session-state` skill and follow its `/status` procedure. Call
`erict_env claude`. Do not write any file.
```

`plugins/agent-loop/commands/next.md`:

```markdown
---
description: Execute the next concrete step in the plan, then stop
---

Use the `session-state` skill and follow its `/next` procedure. Call
`erict_env claude`. Execute exactly one task and stop.
```

`plugins/agent-loop/commands/auto.md`:

```markdown
---
description: Execute the plan unattended until a stop condition is reached
---

Use the `session-state` skill and follow its `/auto` procedure. Call
`erict_env claude`. Never merge, never push.
```

`plugins/agent-loop/commands/plan.md`:

```markdown
---
description: Create a plan when none exists, so /next and /auto have something to run
---

Use the `session-state` skill and follow its `/plan` procedure. Call
`erict_env claude`. Prefer `superpowers:writing-plans` when it is installed.
Never create a second plan when an open one already exists. Goal: $ARGUMENTS
```

`plugins/agent-loop/commands/handoff.md`:

```markdown
---
description: Emit a resume or parallel-work prompt for another Claude or Codex session
---

Use the `session-state` skill and follow its `/handoff` procedure. Call
`erict_env claude`. Pass `parallel` through when the user supplied it: $ARGUMENTS
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — 3 new assertions green

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-loop/lib/env.sh plugins/agent-loop/skills/session-state/ plugins/agent-loop/commands/ tests/env_test.sh
git commit -m "feat: add the session-state skill and command shims"
```

---

### Task 10: Dual-engine packaging

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `.claude-plugin/plugin.json`
- Create: `plugins/agent-loop/.codex-plugin/plugin.json`
- Create: `plugins/agent-loop/hooks/session_start.sh`
- Create: `plugins/agent-loop/hooks/git_guard.sh`
- Create: `tests/packaging_test.sh`

**Interfaces:**
- Consumes: `lib/env.sh` from Task 9
- Produces: installable plugin in both engines. Hooks read `AGENT_REPO` from the invoking directory.

- [ ] **Step 1: Write the failing test**

`tests/packaging_test.sh`:

```bash
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `.claude-plugin/marketplace.json: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

`.claude-plugin/marketplace.json`:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "erict",
  "description": "Cross-engine agent workflow commands: durable session position, one-task execution, unattended plan runs, and adversarial review across Claude Code and Codex.",
  "owner": { "name": "Eric Tang" },
  "plugins": [
    {
      "name": "agent-loop",
      "description": "Durable session position and cross-engine review for any repository.",
      "source": "./plugins/agent-loop",
      "category": "workflow"
    }
  ]
}
```

`.claude-plugin/plugin.json`:

```json
{
  "name": "agent-loop",
  "description": "Durable session position, unattended plan execution, and cross-engine adversarial review.",
  "author": { "name": "Eric Tang" },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/session_start.sh\"",
            "timeout": 5,
            "statusMessage": "Loading session cursor..."
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/git_guard.sh\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

`plugins/agent-loop/.codex-plugin/plugin.json`:

```json
{
  "name": "agent-loop",
  "version": "0.1.0",
  "description": "Durable session position, unattended plan execution, and cross-engine adversarial review.",
  "author": { "name": "Eric Tang" },
  "license": "MIT",
  "keywords": ["workflow", "planning", "review", "automation"],
  "skills": "./skills/",
  "interface": {
    "displayName": "Erict Skills",
    "shortDescription": "Know where you left off. Execute the plan. Review it with the other engine.",
    "longDescription": "Durable session position for any repository: /status, /next, /auto, /handoff, and /adversarial. Works unconfigured by reading markdown checkboxes; projects shape behaviour through .agent/config.json and .agent/rules.md.",
    "developerName": "Eric Tang",
    "category": "Productivity",
    "capabilities": ["Read", "Write"]
  }
}
```

`plugins/agent-loop/hooks/session_start.sh`:

```bash
#!/bin/bash
# Injects the session cursor when one exists. Silent otherwise.
set -u
repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
state="$repo/.agent/state.md"
[ -f "$state" ] || exit 0
printf 'Session cursor found at .agent/state.md:\n\n'
cat "$state"
exit 0
```

`plugins/agent-loop/hooks/git_guard.sh`:

```bash
#!/bin/bash
# Blocks git write commands when a configured preflight tool is missing from PATH.
# A missing git-lfs fails a merge partway through, leaving a half-written tree.
set -u
payload="$(cat)"
command_line="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null)"

case "$command_line" in
  *"git merge"*|*"git stash"*|*"git checkout"*|*"git rebase"*|*"git pull"*) ;;
  *) exit 0 ;;
esac

repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
config="$repo/.agent/config.json"
[ -f "$config" ] || exit 0

for tool in $(jq -r '.preflight[]? // empty' "$config" 2>/dev/null); do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Blocked: %s is not on PATH. This git operation can fail partway through and leave a half-written working tree.\n' "$tool" >&2
    exit 2
  fi
done
exit 0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — new packaging assertions green

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/ plugins/agent-loop/.codex-plugin/ plugins/agent-loop/hooks/ tests/packaging_test.sh
git commit -m "feat: package for both Claude Code and Codex"
```

---

### Task 11: Findings schema and verdict reconciliation

**Files:**
- Create: `plugins/agent-loop/schema/findings.schema.json`
- Create: `plugins/agent-loop/lib/adversarial.sh`
- Create: `tests/reconcile_test.sh`

**Interfaces:**
- Consumes: `cfg_get` from Task 2
- Produces:
  - `adv_key <finding-json>` — echoes a normalized dedup key: `<file>:<line>:<category>`.
  - `adv_reconcile <fileA> <fileB>` — reads two findings JSON arrays, echoes one object with `agreed`, `claude_only`, `codex_only`, and `contradictory` arrays.

- [ ] **Step 1: Write the failing test**

`tests/reconcile_test.sh`:

```bash
#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/adversarial.sh"

_write_findings() {
  local path="$1"; shift
  printf '%s' "$1" > "$path"
}

test_reconcile_buckets_agreement() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks too","evidence":"e2","severity":"high","refuted":false}]'
  out="$(adv_reconcile "$a" "$b")"
  assert_eq "1" "$(printf '%s' "$out" | jq '.agreed | length')" "one agreed finding"
  assert_eq "0" "$(printf '%s' "$out" | jq '.claude_only | length')" "nothing claude-only"
}

test_reconcile_buckets_single_engine_findings() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[{"file":"y.gd","line":3,"category":"spec","claim":"gate unmet","evidence":"e","severity":"medium","refuted":false}]'
  out="$(adv_reconcile "$a" "$b")"
  assert_eq "1" "$(printf '%s' "$out" | jq '.claude_only | length')" "one claude-only"
  assert_eq "1" "$(printf '%s' "$out" | jq '.codex_only | length')" "one codex-only"
  assert_eq "0" "$(printf '%s' "$out" | jq '.agreed | length')" "nothing agreed"
}

test_reconcile_flags_contradiction() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[{"file":"x.gd","line":10,"category":"correctness","claim":"leaks","evidence":"e","severity":"high","refuted":false}]'
  _write_findings "$b" '[{"file":"x.gd","line":10,"category":"correctness","claim":"does not leak","evidence":"e2","severity":"high","refuted":true}]'
  out="$(adv_reconcile "$a" "$b")"
  assert_eq "1" "$(printf '%s' "$out" | jq '.contradictory | length')" "one contradiction"
  assert_eq "0" "$(printf '%s' "$out" | jq '.agreed | length')" "not counted as agreement"
}

test_reconcile_handles_empty_input() {
  local a b out
  a="$(mktemp)"; b="$(mktemp)"
  _write_findings "$a" '[]'
  _write_findings "$b" '[]'
  out="$(adv_reconcile "$a" "$b")"
  assert_eq "0" "$(printf '%s' "$out" | jq '.agreed | length')" "empty reconciles cleanly"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `adversarial.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

`plugins/agent-loop/schema/findings.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Adversarial review findings",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["file", "line", "category", "claim", "evidence", "severity", "refuted"],
    "additionalProperties": false,
    "properties": {
      "file": { "type": "string" },
      "line": { "type": "integer", "minimum": 0 },
      "category": { "enum": ["correctness", "spec", "invariant", "security", "test-gap"] },
      "claim": { "type": "string" },
      "evidence": { "type": "string" },
      "severity": { "enum": ["high", "medium", "low"] },
      "refuted": {
        "type": "boolean",
        "description": "true when the reviewer concludes the work does NOT satisfy the criterion"
      }
    }
  }
}
```

`plugins/agent-loop/lib/adversarial.sh`:

```bash
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — 7 new assertions green

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-loop/schema/findings.schema.json plugins/agent-loop/lib/adversarial.sh tests/reconcile_test.sh
git commit -m "feat: reconcile cross-engine verdicts without averaging"
```

---

### Task 12: Counterpart-engine routing

**Files:**
- Modify: `plugins/agent-loop/lib/adversarial.sh` (append)
- Create: `tests/routing_test.sh`

**Interfaces:**
- Consumes: `adv_reconcile` from Task 11
- Produces:
  - `adv_counterpart <self>` — echoes `codex` when self is `claude`, `claude` when self is `codex`. Any other input returns 1.
  - `adv_counterpart_cmd <self> <prompt-file> <out-file>` — echoes the command line to run the counterpart. Honours `$ADV_CODEX_BIN` and `$ADV_CLAUDE_BIN` so tests can stub them.
  - `adv_check_counterpart <self>` — returns 1 with a loud message when the counterpart binary is absent.

- [ ] **Step 1: Write the failing test**

`tests/routing_test.sh`:

```bash
#!/bin/bash
. "$AGENT_LOOP_LIB/config.sh"
. "$AGENT_LOOP_LIB/adversarial.sh"

test_counterpart_of_claude_is_codex() {
  assert_eq "codex" "$(adv_counterpart claude)" "claude routes to codex"
}

test_counterpart_of_codex_is_claude() {
  assert_eq "claude" "$(adv_counterpart codex)" "codex routes to claude"
}

test_counterpart_never_returns_self() {
  assert_eq "" "$(adv_counterpart claude | grep claude)" "claude never reviews itself"
  assert_eq "" "$(adv_counterpart codex | grep codex)" "codex never reviews itself"
}

test_counterpart_rejects_unknown_engine() {
  assert_fails "unknown engine rejected" adv_counterpart gemini
}

test_counterpart_cmd_from_claude_uses_read_only_codex() {
  local cmd
  ADV_CODEX_BIN=codex
  cmd="$(adv_counterpart_cmd claude /tmp/p.txt /tmp/o.json)"
  assert_contains "$cmd" "codex exec" "invokes codex exec"
  assert_contains "$cmd" "-s read-only" "reviewer cannot write"
  assert_contains "$cmd" "--output-schema" "structured verdict"
}

test_counterpart_cmd_from_codex_uses_claude_print() {
  local cmd
  ADV_CLAUDE_BIN=claude
  cmd="$(adv_counterpart_cmd codex /tmp/p.txt /tmp/o.json)"
  assert_contains "$cmd" "claude -p" "invokes claude headless"
  assert_contains "$cmd" "--output-format json" "structured verdict"
}

test_check_counterpart_fails_loudly_when_absent() {
  ADV_CODEX_BIN=definitely-not-a-real-binary
  assert_fails "absent counterpart is an error" adv_check_counterpart claude
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `adv_counterpart: command not found`

- [ ] **Step 3: Write minimal implementation**

Append to `plugins/agent-loop/lib/adversarial.sh`:

```bash
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — 11 new assertions green (original 8 plus 3 error-handling and path-quoting tests)

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-loop/lib/adversarial.sh tests/routing_test.sh
git commit -m "feat: route adversarial review to the counterpart engine"
```

---

### Task 13: The adversarial-review skill

**Files:**
- Create: `plugins/agent-loop/skills/adversarial-review/SKILL.md`
- Create: `plugins/agent-loop/commands/adversarial.md`
- Create: `plugins/agent-loop/agents/refuter.md`
- Modify: `plugins/agent-loop/lib/env.sh` (source `adversarial.sh`)
- Modify: `tests/env_test.sh` (assert the new function is exposed)

**Interfaces:**
- Consumes: everything from Tasks 11 and 12
- Produces: the `/adversarial` command in both engines.

- [ ] **Step 1: Write the failing test**

Replace `test_erict_env_exposes_all_functions` in `tests/env_test.sh`:

```bash
test_erict_env_exposes_all_functions() {
  local repo; repo="$(mktemp_repo)"
  local out
  out="$(cd "$repo" && bash -c ". \"$AGENT_LOOP_LIB/env.sh\"; erict_env claude; type -t cfg_get state_write plan_tick gate_run vcs_can_commit slice_disjoint adv_reconcile adv_counterpart | tr '\n' ' '")"
  assert_eq "function function function function function function function function " "$out" "all modules sourced"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `adv_reconcile` reports empty instead of `function`

- [ ] **Step 3: Write minimal implementation**

Add to `erict_env` in `plugins/agent-loop/lib/env.sh`, after the `slice.sh` line:

```bash
  . "$here/adversarial.sh"
```

`plugins/agent-loop/agents/refuter.md`:

```markdown
---
name: refuter
description: Adversarial reviewer that hunts for reasons work does NOT satisfy its stated criteria. Use only from the adversarial-review skill.
tools: Read, Grep, Glob, Bash
---

You are a refuter, not an assessor. You are shown work and the criteria it
claims to satisfy. Your job is to find the reason it does not.

Default to `refuted: true` when uncertain. An assessor asked for an opinion
returns an opinion; a refuter asked for a defect returns evidence.

Every finding needs a concrete failure scenario: specific inputs or state
leading to a specific wrong outcome. "This could be fragile" is not a finding.
"Calling advance() twice with the same timestamp double-awards the reward
because the draw counter is not incremented on the second call" is a finding.

Return a JSON array matching `schema/findings.schema.json`. Nothing else — no
prose before or after.
```

`plugins/agent-loop/skills/adversarial-review/SKILL.md`:

```markdown
---
name: adversarial-review
description: >
  Cross-engine refutation review of current progress against a plan's exit
  criteria. Runs one reviewer in this engine and one in the other (Claude
  reviews via Codex, Codex reviews via Claude), then reconciles verdicts into
  agree / one-engine-only / contradictory buckets without averaging them.
  Trigger: "/adversarial", "adversarial review", "red team this", "review my
  progress with the other agent", "cross-check this work".
---

# Adversarial review

```bash
AGENT_LOOP_LIB="$(dirname "$(find ~/.claude/plugins ~/.codex/plugins ~/Developer/erict-skills \
  -path '*agent-loop*' -name env.sh 2>/dev/null | head -1)")"
[ -n "$AGENT_LOOP_LIB" ] || { echo "agent-loop lib not found"; exit 1; }
. "$AGENT_LOOP_LIB/env.sh" && erict_env claude   # or: erict_env codex
adv_check_counterpart "$AGENT_ENGINE" || exit 1
```

**Never proceed when `adv_check_counterpart` fails.** A single-engine review
wearing this command's name is worse than no review, because it claims a
confidence it did not earn.

## 1. Assemble the brief

- Target diff: `git diff "$(git merge-base HEAD "$(vcs_default_branch)")"...HEAD`
- Criteria: the exit gate or acceptance section of `$(state_get plan)`, or the
  whole plan when it declares none.
- Rules: `$(cfg_get review.rules '.agent/rules.md')`, falling back to
  `AGENTS.md`, then `CLAUDE.md`.

Write the brief to a temp file. Both legs receive the same brief.

## 2. Run both legs

Instruct both to **refute, not assess**: "this work claims to satisfy the
following criteria — find why it does not."

- **This engine's leg** — dispatch the `refuter` agent with the invariant and
  rule-violation lens.
- **The counterpart leg** — run `adv_counterpart_cmd "$AGENT_ENGINE" <prompt> <out>`
  with the exit-gate-skeptic lens: does this satisfy the criteria, or merely
  satisfy the tests?

Both legs run read-only. Neither may edit the working tree.

## 3. Reconcile

```bash
adv_reconcile "$this_engine_out" "$counterpart_out"
```

Report in exactly these buckets:

- **Both agree** — highest confidence. Act on these first.
- **One engine only** — needs adjudication. This bucket is the entire reason a
  second engine was involved; do not bury it.
- **Contradictory** — show both claims verbatim and say which you find better
  evidenced, without collapsing them.

**Never average the two verdicts into a consensus score.** Averaging destroys
exactly the signal the second engine was bought for.

Do not fix anything. This command reports; the user decides.
```

`plugins/agent-loop/commands/adversarial.md`:

```markdown
---
description: Adversarially review current progress using both Claude and Codex
---

Use the `adversarial-review` skill and follow its procedure. Call
`erict_env claude`, so the counterpart leg runs in Codex. Report only; do not
apply fixes. Arguments: $ARGUMENTS
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — all assertions green

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-loop/skills/adversarial-review/ plugins/agent-loop/commands/adversarial.md plugins/agent-loop/agents/refuter.md plugins/agent-loop/lib/env.sh tests/env_test.sh
git commit -m "feat: add the cross-engine adversarial review skill"
```

---

### Task 14: Install into both engines and prove project-independence

**Files:**
- Create: `README.md`
- Create: `docs/development/installing.md`

**Interfaces:**
- Consumes: the complete pack
- Produces: verified installation in both engines. **This task is the real test of project-independence: it runs against a repository with no `.agent/` directory at all.**

- [ ] **Step 1: Write the failing test**

There is no bash fixture for this task; it is a manual verification whose evidence gets recorded in `docs/development/installing.md`. Create the throwaway repository the verification runs against:

```bash
BARE="$(mktemp -d)"
git -C "$BARE" init -q --initial-branch=main
printf '# Scratch\n\n- [ ] first task\n- [ ] second task\n' > "$BARE/TODO.md"
printf '{"scripts":{"test":"echo ok"}}\n' > "$BARE/package.json"
git -C "$BARE" add -A && git -C "$BARE" -c user.email=t@e.c -c user.name=T commit -q -m "chore: seed"
echo "$BARE"
```

Expected before installation: `/status` is not a recognized command in either engine.

- [ ] **Step 2: Run the full fixture suite**

Run: `bash tests/run.sh`
Expected: PASS — every assertion from Tasks 1–13 green. Do not install a failing pack.

- [ ] **Step 3: Install into both engines**

```bash
# Claude Code
claude plugin marketplace add ~/Developer/erict-skills
claude plugin install agent-loop@erict

# Codex
codex plugin marketplace add ~/Developer/erict-skills
codex plugin add agent-loop
```

Record the exact commands that worked in `docs/development/installing.md`, along with a `README.md` covering what the pack does, the `.agent/config.json` keys, and the two non-configurable safety rules.

- [ ] **Step 4: Verify against the bare repository**

In the throwaway repo from Step 1, from **both** engines:

| Check | Expected |
|---|---|
| `/status` | reports `TODO.md`, `0 of 2` tasks, next step `first task` |
| `/status` again | still read-only — no `.agent/` directory created |
| `/plan` with `TODO.md` present | reports the existing plan, creates nothing |
| `/plan` after `rm TODO.md` | asks for a goal, then writes a real plan |
| `/auto` after `rm TODO.md` | runs `/plan` and **stops** — does not execute an unreviewed plan |
| `/next` | refuses: `HEAD` is the default branch |
| `git checkout -b agent/x` then `/next` | executes one task, ticks the box, commits, writes `.agent/state.md` |
| `/auto` in a repo with `package.json` removed | refuses: no gate detectable |
| `/handoff` | emits a prompt naming `TODO.md` and the branch |
| `/handoff parallel` | refuses — a two-task `TODO.md` has no provably disjoint slice |
| `/adversarial` with the counterpart binary renamed | fails loudly, does not degrade to one reviewer |

**If any check needs a `.agent/config.json` to pass, the layering is wrong.** Fix the pack, not the fixture.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/development/installing.md
git commit -m "docs: record installation and bare-repository verification"
```

---

### Task 15: Onboard idle-rpg-mobile as the first consumer

**Files:**
- Create: `/Users/etang/Developer/idle-rpg-mobile/.agent/config.json`
- Create: `/Users/etang/Developer/idle-rpg-mobile/.agent/rules.md`
- Modify: `/Users/etang/Developer/idle-rpg-mobile/.gitignore`
- Modify: `/Users/etang/Developer/idle-rpg-mobile/AGENTS.md`

**Interfaces:**
- Consumes: the installed pack from Task 14
- Produces: project-shaped behaviour with **zero changes to the pack**. Any pack edit needed here is a layering defect — fix it in the pack generically, not in this task.

- [ ] **Step 1: Write the failing test**

From `~/Developer/idle-rpg-mobile`, run `/status` before adding any config.

Expected: it finds a plan under `docs/superpowers/plans/` via built-in detection and reports a position, but reports **no** human gate — because `docs/testing/alpha-0.1-milestone-1-checklist.md` carries `HUMAN_CHECKLIST_PENDING` and nothing has told the pack to look for it. That gap is what this task closes.

- [ ] **Step 2: Add the configuration**

`.agent/config.json`:

```json
{
  "plan": { "glob": "docs/superpowers/plans/*.md", "task_marker": "- [ ]" },
  "gates": {
    "focused": "MOBILE_TEST_FILE=$FILE ./scripts/test_mobile_scripts.sh",
    "suite": "./scripts/test.sh",
    "full": "./scripts/verify.sh"
  },
  "gate_policy": {
    "commit_requires": "focused",
    "halt_requires": "full",
    "escalate_when": {
      "game/src/domain/*": "suite",
      "game/src/domain/persistence/*": "full",
      "game/src/application/*": "suite"
    }
  },
  "vcs": { "branch_prefix": "codex/", "worktree_root": ".worktrees", "auto_commit": true },
  "human_gate": { "glob": "docs/testing/*.md", "marker": "HUMAN_CHECKLIST_PENDING" },
  "modules": {
    "domain": "game/src/domain/*",
    "application": "game/src/application/*",
    "infrastructure": "game/src/infrastructure/*",
    "presentation": "game/src/presentation/*",
    "scripts": "scripts/*"
  },
  "preflight": ["git-lfs", "jq"],
  "review": { "rules": ".agent/rules.md" },
  "limits": { "max_tasks": 6, "max_minutes": 120 }
}
```

`.agent/rules.md`:

```markdown
# Agent rules for idle-rpg-mobile

`AGENTS.md` is the contract. Read it before changing anything. This file names
the parts an automated loop and a reviewer must apply on every task.

## Refute against these first

The ten non-negotiable invariants in `AGENTS.md`. In review, hunt specifically:

1. Gameplay truth outside the domain kernel.
2. A `SimulationKernel` path that mutates caller-owned state.
3. Presentation awarding resources or computing rewards.
4. Floating-point money, XP, durations, or drop rolls.
5. A 64-bit integer crossing the JSON boundary as anything but a canonical
   decimal string.
6. Randomness not drawn from a counted `DeterministicRNG` stream.
7. An elapsed-time command without both an offline result and an ordered
   live sequence that `SimulationEquivalence.compare` accepts.
8. A raw `frontier:` ID rendering instead of a localization key.
9. Any Jagex name, asset, formula, UI composition, or style prompt.
10. A shipped binary asset with no rights basis and hash.

## Testing discipline

One focused failing test before the production change. The kernel, persistence,
and RNG suites are the frozen contract layer — changing their expectations needs
a decision recorded in the plan, not an incidental edit.

Verify content through traces and property tests, never a new example test per
authored item.

## Blocked-acceptance rule

While any document under `docs/testing/` carries `HUMAN_CHECKLIST_PENDING`, do
not open a new plan, spec, or research document. Bug fixes, focused tests,
refactors, and tooling that shortens the blocked gate are permitted.

## Do not

- Add content to `game/src/domain/content/starter_content.gd`. Migrate to data
  files first, or ask.
- Run two agents in one checkout.
- Build for a phone to discover a failure a headless fixture could prove.
```

- [ ] **Step 3: Ignore the volatile files**

Append to `/Users/etang/Developer/idle-rpg-mobile/.gitignore`:

```gitignore
.agent/state.md
.agent/journal.md
```

`.agent/config.json` and `.agent/rules.md` stay committed — a new worktree must inherit them.

- [ ] **Step 4: Verify the human gate now blocks**

Run `/status` from `~/Developer/idle-rpg-mobile`.
Expected: reports `docs/testing/alpha-0.1-milestone-1-checklist.md` as an open human gate.

Run `/auto`.
Expected: refuses to start, naming that checklist. This is the blocked-acceptance rule enforced by tooling rather than by an agent's discretion.

Confirm `git -C ~/Developer/erict-skills status --short` is **empty** — onboarding a consumer must require no pack changes.

- [ ] **Step 5: Commit**

In `~/Developer/idle-rpg-mobile`:

```bash
git checkout -b chore/agent-config
git add .agent/config.json .agent/rules.md .gitignore
git commit -m "chore: configure agent-loop agent workflow"
```

Add a pointer under **Where things are** in `AGENTS.md`:

```markdown
- Agent loop config: `.agent/config.json`; agent rules: `.agent/rules.md`
```

```bash
git add AGENTS.md
git commit -m "docs: point AGENTS.md at the agent loop configuration"
```

---

### Task 16: Cross-platform portability and environment preflight

> **Execution order:** run this immediately after Task 9 and before Task 10. It
> changes `lib/*.sh` that Tasks 11 and 12 build on. Numbered 16 only to avoid
> renumbering briefs already generated for Tasks 10–15.

**Files:**
- Create: `plugins/agent-loop/lib/portable.sh`
- Create: `.gitattributes`
- Create: `tests/portable_test.sh`
- Modify: `plugins/agent-loop/lib/detect.sh` (replace both `stat -f %m` calls)
- Modify: `plugins/agent-loop/lib/state.sh` (hostname in the lock)
- Modify: `plugins/agent-loop/lib/env.sh` (source `portable.sh` first, run the dependency check)
- Modify: `plugins/agent-loop/skills/session-state/SKILL.md` (drop the machine-specific discovery path)
- Modify: `plugins/agent-loop/lib/plan.sh` (wire `portable_strip_cr` into `plan_next_text` —
  this is `portable_strip_cr`'s one production call site; without it the helper
  is defined and unit-tested but never actually used)
- Modify: `tests/plan_test.sh` (source `portable.sh`; add CRLF regression tests)

**Interfaces:**
- Consumes: everything from Tasks 1–9
- Produces:
  - `portable_mtime <file>` — echoes the file's modification time as a Unix
    epoch integer on GNU, BSD, and Git Bash. Returns 1 and prints to stderr when
    no supported `stat` exists, rather than echoing a silent `0`.
  - `portable_require` — verifies `jq`, `git`, and `awk` are on `PATH`. Returns 1
    naming every missing tool. **Must not use `jq`**, since `jq` is one of the
    tools it checks.
  - `portable_host` — echoes a stable machine identifier.
  - `portable_strip_cr <file>` — echoes the file's contents with trailing
    carriage returns removed, for CRLF-checked-out plans.

**Scope note:** "Windows" here means Git Bash or WSL, not PowerShell or `cmd`.
The pack is bash; that is the honest boundary and the README must say so.

- [ ] **Step 1: Write the failing test**

`tests/portable_test.sh`:

```bash
#!/bin/bash
. "$AGENT_LOOP_LIB/portable.sh"

test_portable_mtime_returns_an_epoch_integer() {
  local repo f now
  repo="$(mktemp_repo)"
  f="$repo/README.md"
  now="$(portable_mtime "$f")"
  assert_eq "1" "$(printf '%s' "$now" | grep -cE '^[0-9]+$')" "mtime is an integer"
  assert_eq "1" "$([ "$now" -gt 1000000000 ] && printf 1 || printf 0)" "mtime is a plausible epoch"
}

test_portable_mtime_orders_two_files() {
  local repo older newer
  repo="$(mktemp_repo)"
  older="$repo/older.md"
  newer="$repo/newer.md"
  printf 'a\n' > "$older"
  sleep 1
  printf 'b\n' > "$newer"
  assert_eq "1" "$([ "$(portable_mtime "$newer")" -gt "$(portable_mtime "$older")" ] && printf 1 || printf 0)" \
    "newer file has a greater mtime"
}

test_portable_mtime_fails_loudly_on_a_missing_file() {
  assert_fails "missing file is an error" portable_mtime /nonexistent/path/xyz
}

test_portable_require_passes_when_tools_present() {
  portable_require
  assert_eq "0" "$?" "jq, git and awk are present in this environment"
}

test_portable_require_names_a_missing_tool() {
  local out
  out="$(PATH=/nonexistent portable_require 2>&1 || true)"
  assert_contains "$out" "jq" "names jq when PATH is empty"
}

test_portable_host_is_non_empty_and_stable() {
  local a b
  a="$(portable_host)"
  b="$(portable_host)"
  assert_eq "$a" "$b" "hostname is stable across calls"
  assert_eq "0" "$([ -z "$a" ] && printf 0 || printf 1)" "hostname is non-empty" 2>/dev/null
  assert_eq "1" "$([ -n "$a" ] && printf 1 || printf 0)" "hostname is non-empty"
}

test_portable_strip_cr_removes_carriage_returns() {
  local repo f
  repo="$(mktemp_repo)"
  f="$repo/crlf.md"
  printf -- '- [ ] first\r\n- [ ] second\r\n' > "$f"
  assert_eq "0" "$(portable_strip_cr "$f" | grep -c $'\r')" "no carriage returns remain"
  assert_eq "2" "$(portable_strip_cr "$f" | grep -c 'first\|second')" "content survives"
}

test_state_lock_ignores_a_pid_from_another_host() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  state_write "p.md" 1 2 "b" "c" "s" "none" ""
  awk -v pid="$$" '{
    sub(/^engine: claude$/, "engine: codex")
    sub(/^pid: .*$/, "pid: " pid)
    sub(/^host: .*$/, "host: some-other-machine")
    print
  }' "$(state_path)" > "$(state_path).tmp" && mv "$(state_path).tmp" "$(state_path)"
  assert_fails "a live pid on another host is not proof of liveness" state_lock_ok
}

test_state_records_this_host() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  state_write "p.md" 1 2 "b" "c" "s" "none" ""
  assert_eq "$(portable_host)" "$(state_get host)" "host round-trips"
}

test_detect_plan_still_picks_the_newest() {
  AGENT_REPO="$(mktemp_repo)"
  mkdir -p "$AGENT_REPO/docs/plans"
  printf -- '- [ ] old\n' > "$AGENT_REPO/docs/plans/a.md"
  sleep 1
  printf -- '- [ ] new\n' > "$AGENT_REPO/docs/plans/b.md"
  assert_eq "$AGENT_REPO/docs/plans/b.md" "$(detect_plan)" "newest plan still wins after the mtime change"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `portable.sh: No such file or directory`

- [ ] **Step 3: Write minimal implementation**

`plugins/agent-loop/lib/portable.sh`:

```bash
#!/usr/bin/env bash
# Cross-platform helpers. Targets GNU (Linux, Git Bash), BSD (macOS), and WSL.
# Every helper fails loudly rather than returning a plausible wrong answer.

portable_mtime() {
  local file="$1" out
  if [ ! -e "$file" ]; then
    printf 'portable_mtime: no such file: %s\n' "$file" >&2
    return 1
  fi
  out="$(stat -c %Y "$file" 2>/dev/null)" && { printf '%s' "$out"; return 0; }
  out="$(stat -f %m "$file" 2>/dev/null)" && { printf '%s' "$out"; return 0; }
  printf 'portable_mtime: neither GNU nor BSD stat is available\n' >&2
  return 1
}

portable_require() {
  local tool missing
  missing=""
  for tool in jq git awk; do
    command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
  done
  if [ -n "$missing" ]; then
    printf 'agent-loop requires these tools on PATH, and they are missing:%s\n' "$missing" >&2
    printf 'On macOS: brew install jq. On Debian/Ubuntu: apt-get install jq.\n' >&2
    printf 'On Windows use Git Bash or WSL; PowerShell and cmd are not supported.\n' >&2
    return 1
  fi
  return 0
}

portable_host() {
  local h
  h="${HOSTNAME:-}"
  [ -n "$h" ] || h="$(hostname 2>/dev/null)"
  [ -n "$h" ] || h="$(uname -n 2>/dev/null)"
  [ -n "$h" ] || h="unknown-host"
  printf '%s' "$h"
}

portable_strip_cr() {
  local file="$1"
  [ -f "$file" ] || return 0
  awk '{ sub(/\r$/, ""); print }' "$file"
}
```

`.gitattributes` at the repository root — without this, a Windows checkout with
`core.autocrlf=true` gives every `.sh` file carriage returns and bash dies with
`$'\r': command not found`:

```gitattributes
*.sh text eol=lf
*.md text eol=lf
*.json text eol=lf
```

In `plugins/agent-loop/lib/detect.sh`, replace both occurrences of

```bash
mtime="$(stat -f %m "$f" 2>/dev/null || echo 0)"
```

with

```bash
mtime="$(portable_mtime "$f" 2>/dev/null)" || mtime=0
```

(the first occurrence uses `"$repo/$f"`; keep its path expression unchanged).

In `plugins/agent-loop/lib/state.sh`, add `host` to the frontmatter written by
`state_write`, immediately after the `engine` line:

```bash
    printf 'host: %s\n' "$(portable_host)"
```

and gate the liveness check in `state_lock_ok` on the host matching, since a pid
from another machine proves nothing:

```bash
  holder_host="$(state_get host)"
  if [ -n "$holder_host" ] && [ "$holder_host" != "$(portable_host)" ]; then
    printf 'refusing: %s holds %s from host %s; liveness cannot be checked across machines\n' \
      "$holder" "$file" "$holder_host" >&2
    return 1
  fi
```

Place that block after the same-engine early return and before the `kill -0`
check, so a different engine holding the file from another host refuses rather
than testing a meaningless local pid. This is what makes the lock correct on a
cloud-synced worktree.

In `plugins/agent-loop/lib/env.sh`, source `portable.sh` **first** and run the
dependency check before anything else can call `cfg_get`:

```bash
  . "$here/portable.sh"
  portable_require || return 1
```

In `plugins/agent-loop/skills/session-state/SKILL.md`, drop
`~/Developer/erict-skills` from the discovery `find`, leaving `~/.claude/plugins`
and `~/.codex/plugins`. A developer working from a local checkout can export
`AGENT_LOOP_LIB` themselves; a machine-specific path does not belong in a
distributable pack.

`portable_strip_cr` needs a caller, or the CRLF capability this task claims
does not exist. `plan_next_text` is the one reader whose output escapes into
another file: the session-state skill records it verbatim into
`.agent/state.md`'s `next_step` field, so a trailing `\r` from a
CRLF-checked-out plan would ride straight into the cursor file. In
`plugins/agent-loop/lib/plan.sh`, read the plan through `portable_strip_cr`
before extracting the line:

```bash
plan_next_text() {
  local plan="$1" line
  line="$(plan_next_line "$plan")"
  [ -n "$line" ] || return 0
  portable_strip_cr "$plan" | awk -v ln="$line" 'NR == ln {
    sub(/^[[:space:]]*- \[ \][[:space:]]*/, "")
    print
    exit
  }'
}
```

This creates an ordering dependency: `plan.sh` now needs `portable.sh` sourced
first. `env.sh` already sources `portable.sh` before everything else, so this
holds at runtime; `tests/plan_test.sh` needs `. "$AGENT_LOOP_LIB/portable.sh"`
added alongside its existing `config.sh`/`plan.sh` sourcing for the same
reason.

Leave `plan_next_line`, `plan_counts`, and `_detect_has_open_task` alone —
their regexes are unanchored at end-of-line, so a trailing `\r` never affects
matching or counting. Add a test proving that claim rather than assuming it,
using a CRLF fixture written with an explicit
`printf -- '...\r\n...\r\n'` (not dependent on git's checkout behavior).

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — tally grows, `0 failed`

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-loop/lib/portable.sh plugins/agent-loop/lib/detect.sh \
  plugins/agent-loop/lib/state.sh plugins/agent-loop/lib/env.sh \
  plugins/agent-loop/lib/plan.sh \
  plugins/agent-loop/skills/session-state/SKILL.md .gitattributes \
  tests/portable_test.sh tests/plan_test.sh
git commit -m "feat: make the pack portable across macOS, Linux, Git Bash, and synced folders"
```

---

### Task 17: Rebalance to a thin core

> **Execution order:** run after Task 16 and before Task 10.

**Why:** the pack reached 484 lines of shell against 155 of prose, and every
Critical and Important code defect in this build came from that shell. Three
modules earn their weight — `gate.sh` (picks the narrowest proving gate, saving
real minutes on an expensive suite), `vcs.sh` (encodes the detached-HEAD and
non-standard-default-branch cases a model infers wrong), and the read-only plan
helpers (three greps instead of loading a 2,700-line plan into context each
`/status`). The rest is cheaper and safer as prose.

**Files:**
- Delete: `plugins/agent-loop/lib/slice.sh`, `tests/slice_test.sh`
- Modify: `plugins/agent-loop/lib/plan.sh` (remove `plan_tick`)
- Modify: `plugins/agent-loop/lib/state.sh` (replace `state_write` with `state_stamp`)
- Modify: `plugins/agent-loop/lib/env.sh` (stop sourcing `slice.sh`)
- Modify: `plugins/agent-loop/skills/session-state/SKILL.md` (prose replaces the removed calls)
- Modify: `tests/plan_test.sh`, `tests/state_test.sh`, `tests/env_test.sh`, `tests/portable_test.sh`

**Interfaces:**
- Removed: `plan_tick`, `state_write`, `slice_module`, `slice_disjoint`
- Retained unchanged: `cfg_get`, `cfg_file`, `detect_plan`, `detect_gate`,
  `state_path`, `state_get`, `state_section`, `state_lock_ok`, `plan_next_line`,
  `plan_next_text`, `plan_counts`, `plan_bootstrap`, `gate_rank`,
  `gate_level_for`, `gate_run`, all `vcs_*`, all `portable_*`
- Produces: `state_stamp` — echoes the machine-derived frontmatter fields as
  `key: value` lines (`branch`, `last_green`, `engine`, `pid`, `host`,
  `updated`). It writes no file. The model composes `.agent/state.md` itself,
  substituting these lines into the template in `SKILL.md`.

`state_stamp` exists because those six values are machine facts a model cannot
read off, while the plan pointer and the three prose sections are things a model
already holds. Splitting on that line removes the 8-positional-argument trap that
produced this build's Task 9 defect, without asking the model to guess a pid.

- [ ] **Step 1: Write the failing test**

Replace `test_state_round_trip` and the capping tests in `tests/state_test.sh`
with tests against the new surface, and add to `tests/plan_test.sh`:

```bash
test_state_stamp_emits_machine_fields() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  local out
  out="$(cd "$AGENT_REPO" && state_stamp)"
  assert_contains "$out" "branch: main" "branch present"
  assert_contains "$out" "engine: claude" "engine present"
  assert_contains "$out" "host: $(portable_host)" "host present"
  assert_eq "1" "$(printf '%s\n' "$out" | grep -cE '^pid: [0-9]+$')" "pid is numeric"
  assert_eq "1" "$(printf '%s\n' "$out" | grep -cE '^updated: [0-9]{4}-')" "updated is a timestamp"
}

test_state_stamp_writes_no_file() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  ( cd "$AGENT_REPO" && state_stamp ) >/dev/null
  assert_eq "0" "$([ -f "$(state_path)" ] && printf 1 || printf 0)" "state_stamp does not write"
}

test_state_get_still_reads_a_model_written_file() {
  AGENT_REPO="$(mktemp_repo)"
  AGENT_ENGINE=claude
  mkdir -p "$AGENT_REPO/.agent"
  printf -- '---\nplan: docs/p.md\ntask: 4\nhost: %s\nengine: claude\npid: %s\n---\n\n## Next concrete step\nDo the thing\n' \
    "$(portable_host)" "$$" > "$(state_path)"
  assert_eq "docs/p.md" "$(state_get plan)" "reads a hand-written cursor"
  assert_eq "Do the thing" "$(state_section 'Next concrete step')" "reads a hand-written section"
  state_lock_ok
  assert_eq "0" "$?" "same engine and host is unlocked"
}

test_plan_tick_is_gone() {
  assert_eq "" "$(type -t plan_tick)" "plan_tick removed"
}

test_slice_functions_are_gone() {
  assert_eq "" "$(type -t slice_disjoint)" "slice_disjoint removed"
  assert_eq "" "$(type -t slice_module)" "slice_module removed"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `state_stamp: command not found`, and the `_gone` tests fail
because the functions still exist.

- [ ] **Step 3: Write minimal implementation**

Replace `state_write` in `plugins/agent-loop/lib/state.sh` with:

```bash
state_stamp() {
  printf 'branch: %s\n' "$(vcs_current_branch)"
  printf 'last_green: %s\n' "$(git -C "${AGENT_REPO:-.}" rev-parse --short HEAD 2>/dev/null)"
  printf 'engine: %s\n' "${AGENT_ENGINE:-unknown}"
  printf 'pid: %s\n' "$$"
  printf 'host: %s\n' "$(portable_host)"
  printf 'updated: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
```

Delete `plan_tick` from `plan.sh`, delete `lib/slice.sh` and `tests/slice_test.sh`,
and remove the `slice.sh` source line from `env.sh`.

Keep `STATE_NOTES_MAX` as a documented convention in `SKILL.md` rather than code:
the model caps its own notes at 40 lines when composing the file.

- [ ] **Step 4: Rewrite the affected `SKILL.md` procedures**

In `/next` step 6, replace the `state_write` invocation with: run `state_stamp`,
then use the Write tool to compose `.agent/state.md` from this template,
substituting the stamped lines verbatim and filling `plan`, `task`, and
`total_tasks` yourself. Show the full template, including the three body
sections, and state the 40-line notes cap and that the newest lines are kept.

Replace `plan_tick` with: edit the plan file directly, changing that task's
`- [ ]` to `- [x]`. Say to match the exact line and leave surrounding text alone.

In `/handoff parallel`, replace `slice_disjoint` with a prose instruction: list
the files the current work touches and the files the candidate slice touches,
map each to its module using the `modules` config when present or the first two
path components otherwise, and refuse when the two sets share a module. Preserve
the refusal rule verbatim — **refuse rather than guess** — and say the refusal
must name the shared module.

- [ ] **Step 5: Run test to verify it passes**

Run: `bash tests/run.sh`
Expected: PASS — `0 failed`. Report the true before and after tallies; the total
will **drop**, since `tests/slice_test.sh` is deleted. A falling tally is correct
here and must not be papered over.

- [ ] **Step 6: Commit**

```bash
git rm plugins/agent-loop/lib/slice.sh tests/slice_test.sh
git add -A
git commit -m "refactor: keep shell for gates, vcs and plan reads; move the rest to prose"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: distribution → 10; three
layers → 2, 9, 15; state file → 4; gitignore split → 10, 15; `/plan` `/status`
`/next` `/auto` `/handoff` → 5, 9; `/adversarial` → 11, 12, 13; configuration
table → 2, 3, 6, 7, 8; generic operation → 3, 5, 14; testing → every task;
rollout → 14, 15; risks → each has a task enforcing it.

**Added after the spec was written.** `/plan` and `plan_bootstrap` are not in
the design document — they close a real hole, since `/next` and `/auto` had no
defined behaviour in a repository with no plan at all. The spec's `/status`
section should be amended to mention `/plan` when the spec is next revised.

**Deferred, and consistent with the spec's non-goals.** `.agent/journal.md` is
written by `/auto` on halt (Task 9's SKILL.md) but no distillation pass exists —
the failure-mode ledger stays out of scope.

**Known gaps recorded rather than hidden.**

- `gate_level_for` uses `focused` as its floor, so a repo whose only detectable
  gate is `npm test` runs the full suite per task. Acceptable: correctness over
  speed until a project configures a narrower gate.
- `detect_plan` uses `stat -f %m`, which is BSD-only. Correct for macOS, and the
  fallback `|| echo 0` degrades to first-match ordering on Linux rather than
  failing.
- Task 14's verification is manual. There is no way to fixture-test that two
  separate engines resolve a plugin without installing them.
