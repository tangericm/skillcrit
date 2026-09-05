# Changelog

## 0.5.1 (first public stable release)

- Promote the verified RC4 CLI and plugin to stable without changing inventory or export behavior.
- Document npm installation, Cursor RC4 registration/export/coverage trials, three real installed collections, and the full maintainer inventory.
- Use maintainer engineering validation for the initial stable release; collect external adoption feedback after launch.
- Retain explicit limits for heuristic findings, client runtime selection, coverage, token estimates and experimental evaluation.

## 0.5.1-rc.4 (simulated-user follow-up)

- Fix the pilot installation instructions for Unicode folder names and existing parent npm projects.
- Verify first-time installation from an empty folder and preserve the parent project in every package CI job.
- Make budget rule advice and titles respect configured limits rather than quoting fixed defaults.
- Record five controlled user profiles, prompted follow-up sessions, upgrade and uninstall evidence; these are simulations, not external adoption.

## 0.5.1-rc.3 (corrected pilot candidate)

- Make cleanup export create a new file exclusively; existing files, hard links, symbolic links and dangling links are refused without changing their targets.
- Create new report files with owner-only permissions on POSIX systems. Concurrent exports to one path allow only one writer.
- Add regression tests for output aliases and protected names, plus three shipped export simulations (19 total).
- Reject Windows alternate data streams, reserved device output names, and protected-name aliases; test packed installations in all six CI combinations.
- Clarify the CLI and skill guidance for existing output files and older affected releases.

## 0.5.1-rc.2 (pilot release candidate)

- Flush pending report output before exiting. Large piped JSON reports could
  be truncated in rc.1; regression cases cover audit exit codes 0, 1, and 3.
- Expand the shipped simulations from 13 to 16 scenarios.
- Correct CLI help: doctor exit 0 means completed coverage, and installation
  guidance links to the current release status instead of an unavailable npm package.
- Clarify SC4005: a command that reads requirements may already resolve pinned
  versions; the text match does not inspect dependency resolution.
- Record independent inventories of two real installed packs and native
  activation/namespace checks. Keep external adoption and stable promotion open.

## 0.5.1-rc.1 (pilot release candidate)

- Keep projects inside agent-managed worktrees classified as project skills;
  user classification now matches actual skill/plugin roots, not every file
  below a client settings directory.
- Add a self-serve pilot guide, feedback and bug forms, contribution guidance,
  compatibility evidence, and an artifact-verification release runbook.
- Record native Claude installation/discovery, Codex plain skill discovery,
  and four controlled live skill invocations. Automatic triggering and external
  usefulness remain unverified.
- Clarify that aggregate findings have no source-file location.
- Recognize "when asked" activation wording and phrase unmatched descriptions
  as a heuristic review note, rather than proof of missing usage guidance.
- Ship 13 repeatable CLI simulations and run them across the CI matrix.
- Distribute a verified GitHub prerelease. npm publication remains a separate
  authenticated step; this candidate does not establish stable readiness.

## 0.5.1-dev.0 (unpublished development preview)

- Export aggregate SARIF findings as run metadata so GitHub accepts the report
  without fabricated file locations; require successful SARIF uploads in CI.
- Update the workflow to current Node 24-based GitHub Actions.

### Security

- Reject frontmatter engine selectors before either parsing path; scanning
  untrusted skills can no longer select gray-matter's JavaScript evaluator.
- Bound inventory file reads and reject invalid frontmatter field types without
  coercing untrusted objects.

### Changed

- Invalid discovered config, invalid directory targets, unreadable/oversized
  input and incomplete traversal now fail with exit 3. JSON includes coverage;
  SARIF reports unsuccessful execution. Partial scans cannot write cleanup plans.
- `scan()` now throws on partial coverage unless its caller explicitly supplies
  `onTruncated`. Script scanning exposes the same opt-in partial-result behavior.
- Enforce strict config types, nested budget keys and non-negative integer
  budgets. Loaded defaults no longer share nested mutable objects.
- Reject unsupported output formats; `rules --format json` now honors JSON.
- Replace quadratic overlap clustering with a phrase index. Above 20 cluster
  members, omit pair details and speculative cleanup ranking.
- Preserve client-specific operational frontmatter in remediation advice.

### Fixed

- Keep informational client-control notes separate from actionable spec
  findings in cleanup plans; report severities and preserve remediation advice.
- Compare complete SKILL.md bytes in lint duplicate detection, retaining
  differences in tool permissions and other operational frontmatter.
- Prune ignored subtrees before traversal limits, including separately
  discovered client roots; retain coverage failures for unignored input.
- Label lint context costs and cleanup ranking as estimates with unknown
  runtime selection, and correct unsupported runtime claims in remediation.
- Use the consuming repository's installed CLI in the README CI example.
- Malformed metadata and non-directory command entries report incomplete
  coverage without discarding otherwise readable skill records.
- Unexpected CLI failures use exit 3 rather than the findings exit code.

Migration: scripts that tolerated invalid config or assumed empty/partial scans
were successful must handle exit 3. Non-lint commands accept text/JSON only.
The development version distinguishes these fixes from unpatched 0.5.0 builds.
No npm package or release tag has been published for this preview.

## 0.5.0

Audit installed agent skills, conflicts, and context costs. Runtime loading
remains unknown until client-specific resolution is implemented and verified.

### Added

- `skillcrit doctor` (alias `inspect`): cleanup recommendations, alternatives,
  identical instruction files, per-root attribution, estimated recommended-set
  token costs, and risk inventory for all scanned copies. JSON explicitly
  reports runtime resolution as unknown; no fields claim loaded/shadowed counts.
- Stable rule IDs on every finding: `SC1xxx` spec conformance, `SC2xxx` context
  budget, `SC3xxx` collisions, `SC4xxx` risk inventory. An ID never changes
  meaning; a retired check keeps its ID reserved. `skillcrit rules` prints the
  catalogue.
- Findings now carry a `file:line` anchor and a remediation, not just a message.
- Output formats: `--format text|json|markdown|sarif|github`. SARIF 2.1.0
  uploads to code scanning; `github` prints annotations that land on the diff.
- `.skillcrit.json`: `ignore` globs, per-rule severity overrides (including
  `"off"`), token and line budgets, and `failOn`. Unknown keys and unknown rule
  IDs are reported as warnings rather than silently ignored.
- Severity gate and a documented exit-code contract: 0 clean, 1 findings at or
  above the gate, 2 usage, 3 could not run.
- Risk inventory (`SC4xxx`) over SKILL.md fenced code and bundled scripts:
  download-and-execute, credential reads, destructive commands, network reaches,
  unpinned installs, broad `allowed-tools` grants. Framed throughout as signals
  for human review, not a verdict.
- Deeper spec conformance: `metadata` string-map checking, `allowed-tools`
  shape, `compatibility` length, unrecognized frontmatter keys, and a
  description-has-no-trigger check.
- Lenient frontmatter parsing: an unquoted colon in a value is repaired and the
  scanner retains it with a diagnostic; client acceptance is not inferred.
- `SKILLCRIT_HOME` for deterministic user-scope roots in CI and containers.
- Agent Plugins 1.0 `plugin.json` at the repo root.
- Cross-platform CI: Ubuntu, macOS, and Windows on Node 22 and 24, plus a job
  that lints skillcrit with itself.
- `--repeat <n>` for eval, reporting standard deviation across trials.

### Changed

- The bundled agent skill is now a decision router with `references/` files
  instead of one long instruction body.
- Eval output states its adapter, marks itself experimental, and self-reports
  its limitations. The `stub` adapter is labelled synthetic: it replays
  fixtures and measures nothing about any real agent.
- Walks are bounded (depth 8, 20,000 directories) and say so when truncated.
- Test timeouts are explicit, and eval tests run `node <file>` directly instead
  of shelling out to npm.

### Fixed

- Per-file spec and script-risk findings are retained for every scanned copy,
  even when its instruction text duplicates a higher-ranked copy.
- Bundled-script inventory excludes symlinks and other non-regular files.
- GitHub annotation properties and relative SARIF paths escape special characters.
- Missing option values and values assigned to boolean flags return usage errors.
- Lockfile and native Claude plugin versions match the package version; packaged
  README assets are included. Claude's native manifest validator passes cleanly.

- Cleanup output no longer claims client precedence or that identical SKILL.md
  files imply equivalent packages. Supporting files require separate review.
- Skill and plugin setup explicitly requires a separately installed CLI.

- gray-matter caches by file content *before* parsing, so a SKILL.md that threw
  once was served with empty frontmatter on every later parse in the same
  process. A repaired skill silently disappeared from the second scan and was
  then reported as missing its description.
- User-scope scans followed `HOME` on Windows, where `os.homedir()` reads
  `USERPROFILE`.
- Trigger contention no longer fires between two copies of one name; that is a
  version conflict.
- `metadata.version: 1.0` no longer renders as `@1` — a numeric version is
  reported as `SC1008` instead of being displayed wrong.
- Two replacement characters in `docs/banner.svg`.
- A refused `--fix` write returns exit 3 instead of rejecting the CLI's own
  entry point.
