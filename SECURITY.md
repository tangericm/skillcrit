# Security

## What skillcrit does to your machine

Inventory commands (`roots`, `scan`, `doctor`, `lint`, and `rules`) read files
and write to stdout. Evaluation has a separate execution boundary below.

- No network requests, no telemetry, no API key.
- The only audit output file it writes is the `--fix` cleanup markdown, and it refuses
  to write over `package.json`, `SKILL.md`, or `.env`.
- It never deletes a skill. `--fix` produces a plan for a human to act on.
- Without `--user` it reads the project tree only. With `--user` it also reads
  the documented `$HOME` skill directories listed by `skillcrit roots`, and
  nothing else.
- Directory walks are bounded to depth 8 and 20,000 directories, and report
  when they truncate.
- `SKILLCRIT_HOME` overrides the home directory used for user-scope roots.

Skill content is treated as data during inventory: skillcrit parses SKILL.md
without executing its instructions or scripts.

`eval` creates and deletes temporary workspaces and executes task test commands.
It uses bundled tasks by default, but `--tasks` accepts a custom directory whose
code runs with your user permissions, without a security sandbox. Use only task
suites you trust. Those commands can access files, credentials, and the network;
the inventory commands' read-only/no-network guarantees do not apply to them.

## What the risk inventory is not

`SC4xxx` findings are deterministic pattern matches — `curl … | sh`, credential
environment variables, `rm -rf`, unpinned installs, broad `allowed-tools`
grants. They exist to route a human to the lines worth reading.

Bundled-script inventory skips symlinks and non-regular files. It checks at most
64 files, three directory levels below the skill root, and 512 KiB per file.
These limits are best-effort coverage, not proof every supporting file was read.

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

Supported: the latest published minor version.
