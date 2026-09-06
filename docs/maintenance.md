# Repeat an audit and review what changed

[Back to Skillcrit](../README.md) · [CLI reference](reference.md)

The maintenance workflow is available in **0.6.0**. It turns a one-time audit
into a repeatable review without deleting or changing your skills.

## Save the starting point

Run a complete audit and save a baseline to a new filename:

```bash
skillcrit lint . --save-baseline baseline.json
```

A baseline can be saved even when lint finds warnings (exit 1). A failed or
incomplete scan exits 3 and cannot create a trusted complete baseline. Keep the
same CLI version, effective rules, budgets, ignores, and scan scope for later
comparisons. Add `--user` consistently if user-level skills belong in this audit.

After installing, updating, or removing skills:

```bash
skillcrit lint . --baseline baseline.json
skillcrit lint . --baseline baseline.json --json
```

The report separates new, resolved, changed, and unchanged findings. A missing
finding is **unverified** if coverage is incomplete; it is not declared resolved.
The default severity gate still checks every active finding, including unchanged
ones. Comparing against a baseline does not silently waive existing problems.

Project-relative identities survive moving a checkout when no ignore patterns
are configured. With ignores, the requested and canonical scan-root paths are
part of compatibility, because ancestor directory names can affect glob matching.
After moving or invoking that checkout through a different path, save a new
baseline rather than treating ignored findings as resolved. Findings outside the
project retain external paths; changing actual scan roots (including a custom
`CODEX_HOME`), effective scan options/configuration, or the CLI version requires
a new baseline. Review the new audit
before choosing a replacement snapshot. Changing only `--fail-on` does not alter
which findings were inspected and is compatible.

## Acknowledge one finding

Review the finding and its source first. Copy its full `fingerprint` from lint
JSON or text output, then create a dismissal file:

```bash
skillcrit dismiss baseline.json --finding <fingerprint> \
  --reason "Reviewed this exact command; it is required by our deployment task." \
  --out dismissals.json
skillcrit lint . --baseline baseline.json --dismissals dismissals.json
```

Replace `<fingerprint>` with the actual 64-character value. The command requires
a finding present in that baseline and a nonempty reason. It does not disable
the rule for other skills. Accepted findings remain auditable in JSON with their
reason and are excluded from the lint severity gate.

To add another acknowledgment, carry the prior entries into a **new** file:

```bash
skillcrit dismiss baseline.json --finding <another-fingerprint> \
  --reason "Reviewed and accepted this specific finding." \
  --dismissals dismissals.json --out dismissals-next.json
```

Changed source evidence produces a different fingerprint, so the finding becomes
active again. Entries that no longer match are listed as stale. Review or remove
stale entries rather than broadening a dismissal to an entire rule.

All output destinations must be new files. Existing files, links, and protected
names are refused. This also means updating a baseline or dismissal file is an
explicit review step: save a new file, inspect it, then manage the old file yourself.

## Compare duplicate packages more deeply

Equal `SKILL.md` bytes alone do not make two skill packages interchangeable.
Request the optional supporting-file comparison:

```bash
skillcrit doctor . --user --compare-files
```

The report compares inspected regular-file bytes and permission bits, including
supporting scripts, references, and assets. Its statuses are:

- `different`: at least one inspected difference was established.
- `equal-inspected`: inspected files match within the stated scope.
- `unknown`: skipped or unreadable content prevents a conclusion.

Even `equal-inspected` does not compare ACLs, external dependencies, or native
client enablement. It is never a deletion recommendation. Incomplete comparisons
remain visible and make the command exit 3.

Per copy, inspection is bounded to 128 files, 1,024 directory entries, three
subdirectory levels, 512 KiB per file, and 8 MiB total. Ignored content, symlinks,
nonregular files, and exceeded limits make the comparison incomplete. This is
stricter than ordinary configured inventory: ignoring a package subtree cannot
establish equality for the whole package.

## Check a client installation

Run this from the same environment that invokes your agent's CLI:

```bash
skillcrit setup . --user
skillcrit setup . --user --expect-version 0.6.0
```

It reports the actual CLI path and version, Node executable and version,
discovered locations, skill count, and coverage. An explicit version mismatch
exits 3. A complete scan that finds no skills reports that fact and exits 0.
Filesystem discovery does not prove that a native client enabled or loaded a
plugin; use the [compatibility guide](compatibility.md) for that distinction.

If `skillcrit` is not found, install the CLI first, then run this check in the
agent's terminal. Installing only the instruction skill/plugin does not install
the executable.

## Saved-file boundaries

Baselines and dismissals are validated JSON, never executable configuration.
Unknown fields, duplicate fingerprints, incompatible contexts, malformed entries,
and files over 4 MiB are rejected. Each file permits at most 10,000 findings or
dismissal entries; reasons are limited to 2,000 characters.

Snapshots contain finding messages and paths, which may reveal private skill
names, locations, or matched text. They do not store full source bodies. Keep
snapshots local unless you have reviewed their contents for sharing. The audit
commands upload nothing.

Library callers should build the context with
`historyContext(root, config, scanOptions)`, passing the same `user`, `extraRoots`,
`risks`, `maxDepth`, and `maxDirs` options used by `scan()`. The boolean third
argument remains shorthand for `user`. The CLI constructs this context for you.
