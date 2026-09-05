# Releasing Skillcrit

Distribute a release candidate before promoting a stable version. GitHub tags,
GitHub releases, and npm publication are separate operations; verify each one.

## Candidate gate

1. Synchronize the version in `package.json`, the root and package entries of
   `package-lock.json`, `plugin.json`, `.claude-plugin/plugin.json`,
   `.cursor-plugin/plugin.json`, and `skills/skillcrit/SKILL.md` metadata.
2. Update the changelog and installation status. Keep the CLI prerequisite and
   runtime limitations explicit in the README and bundled skill.
3. Run `npm ci`, `npm run build`, `npm test`, `npm audit`, and
   `node dist/cli.js lint . --fail-on error`. Investigate failures before release.
4. Complete the six OS/Node CI combinations and successful SARIF ingestion for
   the exact candidate. Obtain an independent review and merge the PR.
5. Repeat relevant native checks from [compatibility](compatibility.md). Record
   discovery separately from activation, precedence, and utility.

## Build the distributable

Use a fresh checkout of the reviewed commit. This excludes untracked pilot
reports, work notes, and stale build output. Build before packing: `npm pack`
does not run this project's `prepublishOnly` script.

```bash
npm ci
npm run build
npm pack --json
```

Inspect the returned file list. Confirm the CLI, declaration files, bundled
skill, its references/license, and README images are present. Check that no
credentials, local reports, or unrelated work files entered the archive.

Install the archive in a different initialized project:

```bash
npm init -y
npm install --save-dev --save-exact /absolute/path/to/skillcrit-0.5.1-rc.2.tgz --ignore-scripts
npm ci --ignore-scripts
node ./node_modules/skillcrit/dist/cli.js --version
node ./node_modules/skillcrit/dist/cli.js doctor /absolute/path/to/test-project --json
node ./node_modules/skillcrit/dist/cli.js lint /absolute/path/to/test-project --format github
node ./node_modules/skillcrit/dist/cli.js lint /absolute/path/to/test-project --format sarif
```

Use a controlled project with a valid skill. Require the expected version,
complete coverage, correct inventory, and successful exit codes. Also check
the installed executable through `node_modules/.bin/skillcrit` (or
`node_modules/.bin/skillcrit.cmd` on Windows). Retain package integrity,
SHA-256, source commit and verification results; do not include private paths.

## GitHub prerelease

Create annotated tag `v0.5.1-rc.2` at the reviewed, passing commit. Never move an
existing release tag to different code. Publish a GitHub prerelease with:

- `skillcrit-0.5.1-rc.2.tgz`, the exact archive tested above;
- `SHA256SUMS`, including the archive and verification report;
- `verification.json`, with source commit, version, checks and honest limits.

Link the pilot guide and matrix in the release notes. Keep the release marked
as a prerelease, not `latest`. Download the published assets and verify their
checksums once more. The automatically generated GitHub source archives are
source code; they are not the built npm package.

## npm prerelease

For the initial publication, the maintainer must be signed in to npm with an
account able to publish the package. Check `npm whoami` and existing package
ownership immediately before publishing. A registry 404 does not guarantee
the name can be claimed. Do not put access tokens in issues, chat, or git.

From the directory containing the verified archive:

```bash
npm publish ./skillcrit-0.5.1-rc.2.tgz --tag next --access public
npm view skillcrit@0.5.1-rc.2 version dist.integrity dist-tags --json
```

Compare registry integrity with the retained package integrity. In another
clean consumer project, install `skillcrit@0.5.1-rc.2`, repeat the version/audit
smoke tests, then update installation status in the README. Do not advertise a
registry install until it succeeds. Keep prereleases off npm's `latest` tag.

For later CI publishing, configure an npm trusted publisher for the exact
GitHub repository/workflow and use a supported npm CLI. Until that configuration
exists and is tested, do not create a workflow that implies publication works.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Stable promotion and recovery

First meet the [external pilot criteria](pilot-guide.md#advancement-criteria).
Record participant outcomes and remaining client limitations. Prepare a new
stable version, verify its new package, and publish that immutable artifact;
an RC archive cannot be relabeled as a different npm version.

If a release is faulty, mark it clearly, deprecate the affected npm version
with a reason, and publish a corrected version. Preserve tags and evidence.
There is no verified prior stable npm release to fall back to yet. Never
delete users' skills as part of rollback.
