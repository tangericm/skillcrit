# Compatibility and evidence

Skillcrit inventories files. It does not reproduce a client's enabled-skill set,
resolve runtime precedence, or measure whether a skill improves an agent's work.

## Verified surfaces

Evidence recorded September 4, 2026, for the `0.5.1-rc.1` candidate. The exact
release commit, archive checksums, and final CI link travel with the
[GitHub prerelease](https://github.com/tangericm/skillcrit/releases/tag/v0.5.1-rc.1).

| Surface | Evidence | Boundary |
| --- | --- | --- |
| CLI on Linux, macOS, Windows; Node 22 and 24 | Build, tests, packaged installation and audit run in the CI matrix | This tests Skillcrit, not those platforms' agent clients |
| Claude Code 2.1.260, macOS | Strict validation; isolated marketplace install; one discovered skill; two explicit live skill invocations on controlled projects | Automatic triggering, runtime precedence, broad reliability and usefulness remain untested |
| Codex CLI 0.147.0, macOS | Native `skills/list` discovers an enabled repo skill; two explicit live invocations via the plain skill route | Plugin marketplace installation, automatic triggering, runtime precedence and broad reliability remain untested |
| Cursor | Repository supplies `.cursor-plugin/plugin.json` and root Agent Plugins manifest; structure checked against current documentation | No live Cursor installation, discovery, or activation test yet |
| Other listed clients | Recognized filesystem locations and generic SKILL.md parsing | No native installation or runtime compatibility claim |

All skill/plugin routes need the CLI separately. A skill-only installation does
not contain a built executable. Use the [pilot installation](pilot-guide.md)
before invoking the skill from an agent.

In each client's two live trials, the prompt supplied the installed executable
path. The agent audited the intended project, distinguished `Read`/`Bash`
frontmatter variants, and refused to treat depth-limited coverage as sufficient
for cleanup. Fixture hashes were unchanged. These are four observed controlled
invocations, not an activation-rate or agent-performance benchmark. See the
[verification record](verification/0.5.1-rc.1.md).

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
