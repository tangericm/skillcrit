# Try Skillcrit and report feedback

Skillcrit helps maintain installed agent skills by inventorying instructions,
reviewing alternatives and highlighting lines worth inspecting. A useful result
can also be evidence that no cleanup is needed.

Current stable release: **`0.5.1`**. The
[GitHub release](https://github.com/tangericm/skillcrit/releases/tag/v0.5.1)
contains the built archive, checksums and verification evidence.

## Install in a disposable directory

Requires Node 22+ and npm. In a new empty folder:

```bash
npm install --prefix . --save-dev --save-exact skillcrit@0.5.1 --ignore-scripts
node ./node_modules/skillcrit/dist/cli.js --version
```

The version must be `skillcrit 0.5.1`. The explicit `--prefix .` keeps the
installation in this folder even if an ancestor is an npm project. No `npm init`
is needed, so folder names with spaces or Unicode work too. These commands
work in a POSIX shell and PowerShell. Installation downloads dependencies; audit
commands make no network requests and need no API key.

Alternatively, download `skillcrit-0.5.1.tgz` and `SHA256SUMS` from the same
GitHub release into an empty folder. Verify before installing:

```bash
node -e "const fs=require('node:fs'),c=require('node:crypto'),f='skillcrit-0.5.1.tgz',expected=fs.readFileSync('SHA256SUMS','utf8').trim().split(/\r?\n/).find(l=>l.endsWith('  '+f))?.split(' ')[0];if(c.createHash('sha256').update(fs.readFileSync(f)).digest('hex')!==expected)throw Error('Checksum mismatch');console.log('Checksum verified')"
npm install --prefix . --save-dev --save-exact ./skillcrit-0.5.1.tgz --ignore-scripts
node ./node_modules/skillcrit/dist/cli.js --version
```

## First audit

Keep the disposable installation as your working directory. Quote your project
path if it has spaces; `C:/Projects/example` also works on Windows.

```bash
node ./node_modules/skillcrit/dist/cli.js doctor "/absolute/path/to/project"
node ./node_modules/skillcrit/dist/cli.js doctor "/absolute/path/to/project" --json
node ./node_modules/skillcrit/dist/cli.js lint "/absolute/path/to/project" --json
node ./node_modules/skillcrit/dist/cli.js lint "/absolute/path/to/project" --fix --out -
```

The last command prints a review plan without rewriting or deleting skills.
File export requires an unused destination and filesystem hard-link support.
Add `--user` only when you also want to inspect user-level skill/plugin roots.
Reports can contain private paths and excerpts; keep raw reports local.

| Exit | Interpretation |
| --- | --- |
| 0 | Completed; doctor/scan can still contain risks or alternatives; lint has no findings at its gate |
| 1 | Lint findings reached the severity gate; a normal audit result |
| 2 | Invalid command or arguments |
| 3 | Failed or incomplete inventory; inspect coverage reasons or stderr |

A complete inventory is not a security certificate or proof of what your client
loads. An explicit ignore is outside the requested scan. Risk rules can match
comments and defensive deny-list strings; inspect context before acting.

## Repeat the automated simulations

```bash
node ./node_modules/skillcrit/scripts/simulate.mjs
```

The 19 controlled scenarios create and remove their own fixtures. They cover
client layouts, duplicate scripts, permission variants, supported controls,
ignored/deep trees, invalid config, JavaScript frontmatter, oversized inputs,
SARIF, invalid commands, complete large piped reports, and safe cleanup export.
They check exit codes and unchanged input files. They are functional tests,
not measurements of user satisfaction or live agent performance.

## First session: about 15 minutes

1. Record OS, Node/client versions and the installed Skillcrit version. Note
   installation steps that needed help.
2. Review up to ten findings against a project you know. Mark confirmed,
   false-positive or unknown, including cases where no action was useful.
3. Compare the result with the client's native skill list. Record a changed
   decision, or explicitly say that no decision changed.
4. For the bundled skill/plugin, verify the CLI is reachable inside the agent,
   invoke Skillcrit explicitly and record the actual command and target. See
   [compatibility](compatibility.md) for tested surfaces.
5. Review permissions, supporting files, enablement and client namespaces before
   deleting any skill. Ranking alone is not permission to remove a copy.

## Second session

After a real skill change or another work session, record whether you choose
to use Skillcrit again and why. A prompted rerun is not voluntary repeat use.
The experimental stub `eval` adapter is excluded from product-effectiveness
claims because it measures no real agent performance.

## Report feedback

Use the public [feedback form](https://github.com/tangericm/skillcrit/issues/new?template=pilot-feedback.yml).
Share redacted observations and minimal reproductions; keep raw reports,
private paths and skill contents local. Use [Security](../SECURITY.md) for
suspected vulnerabilities. Participation is opt-in. Remove a disposable
installation by deleting that test folder, keeping the audited project separate.

## Advancement criteria

The first stable release uses maintainer engineering validation: reviewed code,
passing supported-platform tests and packaged installs, verified publication,
controlled native client workflows, and source review of real installed
collections. Unsafe writes, execution of audited content, false complete-coverage
claims, or unresolved release-blocking bugs prevent publication.

External adoption feedback is collected **after the first stable release**.
The outreach target remains five external participants across two clients and
Windows plus POSIX, with three useful decisions and voluntary second-session
use. These are product-learning goals, not retroactive release requirements.
Do not count maintainer simulations as participants or voluntary reuse.

Current maintainer evidence and remaining limits are recorded in the
[stable verification record](verification/0.5.1.md). No external participants
or voluntary second-session results are claimed.
