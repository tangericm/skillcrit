# Installing agent-loop

This walks through installing the `agent-loop` plugin from a local checkout
of this repository, for either host, and how to verify the install actually
works on the machine you're on.

## 1. Get the repository

```bash
git clone <this repository's URL> erict-skills
cd erict-skills
```

A local clone path works too — `<path>` in the commands below can be
anything `claude`/`codex` can resolve to a directory: an absolute path, a
relative path, or a git URL.

## 2. Add the marketplace

Both hosts read the same `.claude-plugin/marketplace.json`, which declares
one marketplace, `eric-tang-skills`, publishing one plugin, `agent-loop`
(`plugins/agent-loop`).

**Claude Code:**

```bash
claude plugin marketplace add .
claude plugin install agent-loop@eric-tang-skills
```

**Codex:**

```bash
codex plugin marketplace add .
codex plugin add agent-loop@eric-tang-skills
```

Run both if you want to use `/adversarial` for real — its counterpart leg
needs the *other* engine's CLI (`claude` or `codex`) on `PATH`, and
`adv_check_counterpart` refuses to run a single-engine review pretending to
be a two-engine one when it isn't there.

## 3. Verify the install

Open (or restart) a session in the target repository you want to use the
plugin in, and confirm the commands are visible: `/plan`, `/status`,
`/next`, `/auto`, `/handoff`, `/adversarial`. Claude Code's `SessionStart`
hook (`hooks/session_start.sh`) should print the session cursor from
`.agent/state.md` automatically if one exists.

## 4. Run the portability validator

```bash
bash tests/run.sh
```

Do this **on every machine you plan to run agent-loop from**, not just once
in CI. The library is written to a deliberately narrow floor — bash 3.2,
clean-macOS coreutils, no GNU `sed`, no GNU `timeout`, no `grep -P`, no
`rg` — specifically because it has to work identically across whatever mix
of macOS, Linux, and Windows-via-Git-Bash/WSL the two hosts end up running
on. A pass on one machine is evidence about that machine, not a guarantee
about any other. `tests/run.sh` has no external dependencies beyond `bash`,
`git`, `jq`, and standard `awk`/`grep` — the same floor the library itself
targets — so it will tell you directly if something the plugin needs isn't
on `PATH` yet.

## Iterating on a local change without reinstalling

Both `claude plugin install` and `codex plugin add` resolve through the
marketplace entry back to `plugins/agent-loop` in your checkout, so editing
files there and re-running `bash tests/run.sh` is enough to validate a
change — there is no build step and nothing to republish for local
iteration. Re-run the marketplace add/install steps only if you change
`.claude-plugin/marketplace.json` or `plugins/agent-loop/.claude-plugin/plugin.json`
/ `plugins/agent-loop/.codex-plugin/plugin.json` themselves (renames, new
hooks, new declared capabilities).

## Windows

Git Bash or WSL only. There is no native `cmd.exe`/PowerShell path: every
script under `plugins/agent-loop/lib/*.sh` and `bin/agent-loop` is
`#!/bin/bash`, and `tests/run.sh` assumes the same. Install and run
`bash tests/run.sh` from inside Git Bash or a WSL shell, not from a native
Windows terminal.
