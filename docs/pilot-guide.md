# Try the Skillcrit release candidate

The pilot tests whether Skillcrit helps people maintain their real skill
collections. Start with a project you know well. A useful outcome can be a
confirmed issue, a clearer explanation, or evidence that the tool adds no value.

Candidate: **`0.5.1-rc.4`**, distributed through the
[GitHub prerelease](https://github.com/tangericm/skillcrit/releases/tag/v0.5.1-rc.4).
Use this corrected candidate for file-export testing. Registry publication is
separate; the older `0.5.1-rc.2` package does not contain the export fix.

## Install in a disposable directory

Requires Node 22+ and npm. Download `skillcrit-0.5.1-rc.4.tgz` and `SHA256SUMS`
from the same prerelease into a new empty folder. Verify the archive before
installing:

```bash
node -e "const fs=require('node:fs'),c=require('node:crypto'),f='skillcrit-0.5.1-rc.4.tgz',expected=fs.readFileSync('SHA256SUMS','utf8').trim().split(/\r?\n/).find(l=>l.endsWith('  '+f))?.split(' ')[0];if(c.createHash('sha256').update(fs.readFileSync(f)).digest('hex')!==expected)throw Error('Checksum mismatch');console.log('Checksum verified')"
npm install --prefix . --save-dev --save-exact ./skillcrit-0.5.1-rc.4.tgz --ignore-scripts
node ./node_modules/skillcrit/dist/cli.js --version
```

The explicit `--prefix .` keeps installation in this folder, even if a parent
folder already contains an npm project. No `npm init` step is needed, so folder
names with spaces or Unicode work too.

The version must be `skillcrit 0.5.1-rc.4`. These commands work in a POSIX shell
and PowerShell. Installation downloads npm dependencies. The audit itself
makes no network requests and needs no API key.

Keep using the disposable directory as your terminal's working directory.
Replace `/absolute/path/to/project` with your project path, quoted if it has
spaces. On Windows, an absolute path such as `C:/Projects/example` also works.

```bash
node ./node_modules/skillcrit/dist/cli.js doctor "/absolute/path/to/project"
node ./node_modules/skillcrit/dist/cli.js doctor "/absolute/path/to/project" --json
node ./node_modules/skillcrit/dist/cli.js lint "/absolute/path/to/project" --json
node ./node_modules/skillcrit/dist/cli.js lint "/absolute/path/to/project" --fix --out -
```

`--fix --out -` prints a review plan; it does not delete or rewrite skills.
Add `--user` only when you want the audit to inspect your user-level skill and
plugin directories too. Reports can contain private paths and code excerpts;
review them locally before sharing any portion.

| Exit | Interpretation |
| --- | --- |
| 0 | Command completed. For `doctor`/`scan`, coverage completed even if risks or alternatives exist; for `lint`, no findings reached its gate |
| 1 | `lint` findings reached its severity gate; a normal audit result |
| 2 | Invalid command or arguments |
| 3 | Failed or incomplete inventory; inspect `coverage.reasons` when a report exists, otherwise stderr |

A complete inventory is not a security certificate or proof of what your
client loads. An explicitly ignored directory is outside the requested scan.

## Repeat the automated simulations

The installed candidate includes 19 controlled scenarios:

```bash
node ./node_modules/skillcrit/scripts/simulate.mjs
```

The script creates and removes its own temporary fixtures, invokes the installed
CLI, checks results and exit codes, and verifies the fixture files remain
unchanged. It covers three client directory layouts, duplicate scripts,
permission variants, supported controls, ignored/deep trees, invalid config,
JavaScript frontmatter, oversized inputs, SARIF, invalid commands, and large
piped reports with complete and incomplete coverage, plus new-file export and
refusal of existing documents and hardlink aliases.
It exits nonzero if any scenario fails. This is a functional simulation, not
evidence of external user satisfaction or broad agent performance.

## First session: about 15 minutes

1. Record your OS, Node version, client/version, candidate version and checksum.
   Note any installation step that required help.
2. Time how long it takes to understand one finding you can evaluate. If there
   is none, record that rather than searching for a favorable example.
3. Review up to ten findings. Mark each confirmed, false positive, or unknown.
   Describe one decision changed, or explicitly record no changed decision.
4. Compare the result with your client's native skill list or diagnostics.
   Explain what Skillcrit adds, misses, or makes harder to understand.
5. If testing the bundled skill, verify the CLI is on the agent's PATH, invoke
   the skill explicitly, and record the command and target it uses. See the
   [compatibility matrix](compatibility.md) for verified installation surfaces.
6. Do not delete a skill based on ranking alone. Review permissions, supporting
   files, enablement, and client namespaces before changing an installation.

## Second session

Return after a real skill installation/update or your next work session.
Record whether you choose to use Skillcrit again and why. A prompted rerun
used solely to complete this exercise is not voluntary repeat use.

The pilot excludes `eval`: the shipped stub adapter replays fixtures and
cannot establish real agent performance.

## Report feedback

Use the [pilot feedback form](https://github.com/tangericm/skillcrit/issues/new?template=pilot-feedback.yml).
It is public. Submit redacted observations and minimal reproductions; keep raw
reports and private skill contents local. Report suspected vulnerabilities
privately using [Security](../SECURITY.md).

Participation is opt-in. You can stop at any time. To remove the CLI afterward,
delete the disposable installation folder; keep your actual project separate.

## Advancement criteria

We seek five external participants across at least two clients and Windows plus
a POSIX platform. Before stable promotion, at least three should identify a
confirmed useful decision and voluntarily reuse the tool in a second session.
This small pilot is a product signal, not evidence of broad adoption.

Unexpected code execution or writes, a false complete-coverage claim, or advice
that breaks a valid client control stops promotion until reproduced and fixed.
Installation blockers and misleading findings must be triaged before promotion.

**Current status:** maintainer checks on two real installed packs, native client
trials, and a repeatable simulation kit are recorded in the
[RC4 verification record](verification/0.5.1-rc.4.md). No external participants or
voluntary second-session results are recorded. Maintainer trials do not count
as participant feedback.
