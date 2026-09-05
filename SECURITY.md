# Security

## What skillcrit does to your machine

Inventory commands (`roots`, `scan`, `doctor`, `lint`, and `rules`) read files
and write to stdout. Evaluation has a separate execution boundary below.

- No network requests, no telemetry, no API key.
- The only audit output file it writes is the `--fix` cleanup markdown, and it refuses
  to write over `package.json`, `SKILL.md`, or `.env`.
- It never deletes a skill. `--fix` produces a plan for a human to act on.
- Skill discovery is scoped to the project tree. With `--user` it also searches
  the documented `$HOME` skill directories listed by `skillcrit roots`.
  Configuration is searched upward through project ancestors unless `--config`
  selects an explicit file; library callers can also supply extra skill roots.
- Directory walks are bounded to depth 8 and 20,000 directories. Partial scans
  exit 3 and report coverage reasons, including in machine-readable lint output.
- SKILL.md, configuration, and inspected metadata files are limited to 1 MiB
  each. Oversized/unreadable input is never silently reported as fully inspected.
- `SKILLCRIT_HOME` overrides the home directory used for user-scope roots.

Skill content is treated as data during inventory: skillcrit parses SKILL.md
without executing its instructions or scripts.
Only untagged `---` YAML frontmatter is accepted; engine selectors such as
`---js` are rejected before parsing. The `0.5.1-dev.0` and `0.5.1-rc.1` previews fix
an execution boundary violation in 0.5.0; do not use unpatched 0.5.0 builds to
scan untrusted skills.

`eval` creates and deletes temporary workspaces and executes task test commands.
It uses bundled tasks by default, but `--tasks` accepts a custom directory whose
code runs with your user permissions, without a security sandbox. Use only task
suites you trust. Those commands can access files, credentials, and the network;
the inventory commands' read-only/no-network guarantees do not apply to them.

## What the risk inventory is not

`SC4xxx` findings are deterministic pattern matches — `curl … | sh`, credential
environment variables, `rm -rf`, installs without visible version pins, broad `allowed-tools`
grants. They exist to route a human to the lines worth reading.

Bundled-script inventory skips symlinks and non-regular files. It checks at most
64 files, three directory levels below the skill root, and 512 KiB per file.
Hitting these bounds or failing to read an eligible script marks coverage
incomplete. Non-script assets, symlinks and intentionally excluded dependency
directories remain outside this text-pattern inventory. Complete coverage means
the supported inventory finished, not that every supporting file was analyzed.

They are **not a security verdict**:

- A skill that trips nothing may still be malicious. Obfuscation, indirection
  through a bundled binary, and prompt injection in prose all pass cleanly.
- A skill that trips several may be entirely legitimate. Plenty of useful
  skills install a package or delete a cache directory.

Treat a clean run as "no matching patterns found", never as "this skill is
safe". Review skills you install from sources you do not trust, the same way
you would review a dependency.

## Reporting a vulnerability

Open a security advisory on the repository:
<https://github.com/tangericm/skillcrit/security/advisories/new>

Please do not open a public issue for a vulnerability report. Include the
version (`skillcrit --version`), the platform, and a minimal reproduction.

Supported stable release: `0.5.1`. RC3 and RC4 also contain the cleanup-export safety fix; use the stable release for new installations.

### Cleanup export in older candidates

Before `0.5.1-rc.3`, `lint --fix --out <file>` could overwrite an existing file,
including a protected file reached through a symbolic link or hard link. The
corrected exporter exclusively creates a new file and refuses existing paths.
On older builds, use `--fix --out -` for stdout-only plans. Ordinary read-only
audit commands are unaffected by this output-writing issue.
