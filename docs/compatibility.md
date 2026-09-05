# Compatibility and evidence

Skillcrit inventories files. It does not reproduce a client's enabled-skill set,
resolve runtime precedence, or measure whether a skill improves an agent's work.

## Verified surfaces

Evidence recorded September 4–5, 2026. Current candidate: `0.5.1-rc.3`.
The exact source commit, package checksums and final CI links accompany the
[GitHub prerelease](https://github.com/tangericm/skillcrit/releases/tag/v0.5.1-rc.3).

| Surface | Evidence | Boundary |
| --- | --- | --- |
| CLI on Linux, macOS, Windows; Node 22 and 24 | CI builds, tests and controlled simulations; separate packaged install checks | This tests Skillcrit, not those platforms' native agent clients |
| Claude Code 2.1.260, macOS | RC1 manifest/install/discovery checks; RC2 local plugin selected for two ordinary requests and unused for an unrelated control; two separate namespaces invoked | Few controlled observations; public marketplace and broad reliability unverified |
| Codex CLI 0.147.0, macOS | Plain skill discovered; selected for two ordinary requests and unused for an unrelated control; same-name ancestor/project entries both discovered | Plugin marketplace installation and runtime selection among duplicate names remain unverified |
| Cursor desktop 3.19.7, macOS | Plain skill discovered; explicit and automatic audits ran; incomplete coverage preserved; a copied local plugin registered version rc.2 and one skill | Local installation and plain-skill invocation tested; public marketplace approval remains open |
| Other listed clients | Recognized filesystem locations and generic SKILL.md parsing | No native installation or runtime compatibility claim |

All skill/plugin routes need the CLI separately. A skill-only installation does
not contain a built executable. Use the [pilot installation](pilot-guide.md)
before invoking the skill from an agent.

The candidate was also checked against two real installed skill packs with an
independent inventory and unchanged file hashes. Controlled native tests used
prepared fixtures and a CLI already available on PATH. These observations are
not an activation-rate, agent-performance, or external-adoption benchmark.
RC3 additionally verified new-file export and preservation of an existing linked
output in fresh Claude local-plugin and Codex plain-skill trials. A Codex login
shell initially selected the older global CLI; the candidate was retested with
its explicit installed path. Verify the executable version inside the agent.
Cursor RC3 files were copied locally, but a locked desktop prevented renewed
UI checks; its table evidence above remains from RC2.
See [RC3 verification](verification/0.5.1-rc.3.md), [RC2 verification](verification/0.5.1-rc.2.md), and the historical
[RC1 record](verification/0.5.1-rc.1.md).

## Inventory coverage is different from client discovery

`skillcrit roots <project> --user` lists configured inventory locations and
whether they exist. `scan` also recursively walks the chosen project tree, so
it can find a SKILL.md that no client would load.

| Family | Project inventory locations | User inventory locations |
| --- | --- | --- |
| Shared Agent Skills | `.agents/skills` | `~/.agents/skills` |
| Claude | `.claude/skills` | `~/.claude/skills`, `~/.claude/plugins` |
| Cursor | `.cursor/skills` | `~/.cursor/skills`, `~/.cursor/plugins` |
| Codex, including legacy layouts | `.codex/skills` | `~/.codex/skills`, `~/.codex/plugins`; `/etc/codex/skills` is an admin location |
| Qwen, Gemini, Hermes, Continue, Goose, DeepSeek | Respective `.<client>/skills` | Respective `~/.<client>/skills` |
| Pi | `.pi/skills` | `~/.pi/agent/skills` |
| OpenCode | `.opencode/skills` | `~/.opencode/skills`, `~/.config/opencode/skills` |
| Copilot | `.github/skills` | `~/.copilot/skills` |
| Generic | `skills`, `plugins` | No additional generic user roots |

Current Codex documentation specifies `.agents/skills`, including ancestors
from the working directory to the repository root. Skillcrit walks down from
its target instead: audit the repository root when you want ancestor content
included. `.codex/skills` is inventoried for existing installations; its presence
does not establish current native support. With `--user`, scanning also includes
`CODEX_HOME/skills` when that environment variable is set; `roots` currently
lists the static locations above. `SKILLCRIT_HOME` changes the home used by
Skillcrit, not the home used by a native client.

Coverage is bounded: depth 8, 20,000 directories, input-size limits, and a
separate bundled-script limit. An explicit ignore excludes inputs from the
requested inventory; reaching a limit on included inputs produces exit 3.
See [Security](../SECURITY.md) for the exact inspection boundary.

## Local Cursor installation

For Cursor 3.19.7, copy the plugin into a real
`~/.cursor/plugins/local/skillcrit` directory, including its manifest, `skills/`
and the referenced `docs/icon.png`. Reload the window and confirm **Skillcrit**,
the installed candidate version, and **Skills 1** in Customize. A symlink outside the local-plugin
root was rejected in this client version; do not change security settings to
work around that check. The CLI is still a separate prerequisite.

## Remaining native trials

Use a disposable project, record the exact client version, and install the CLI
first. Verify discovery in the client's skill selector, explicitly invoke
Skillcrit on that project, and inspect the command and target it actually used.
Confirm it preserves incomplete coverage and does not turn a recommendation
into deletion. Test two same-name skills in different namespaces before making
any statement about precedence. Record failed or unavailable checks as such.

These trials belong in [pilot feedback](pilot-guide.md#report-feedback), not in
the synthetic `eval --agent stub` results.

## Primary documentation

- [OpenAI: local skill discovery](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code: plugin components and validation](https://code.claude.com/docs/en/plugins-reference)
- [Cursor: plugin formats](https://prod.cursor.com/docs/reference/plugins)
- [Cursor: local plugin testing](https://prod.cursor.com/docs/plugins)

Documentation establishes intended support. The evidence table records what
was actually checked on this candidate.
