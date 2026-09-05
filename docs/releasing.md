# Releasing Skillcrit

GitHub tags, downloadable releases and npm publication are separate operations.
Verify each against the same reviewed source and immutable package.

## Release gate

1. Synchronize versions in package.json, both package-lock entries, plugin.json,
   the Claude/Cursor manifests and skills/skillcrit/SKILL.md metadata.
2. Update the changelog and proposed installation guidance. Preserve the
   separate CLI prerequisite, coverage contract and runtime limitations.
3. From clean source, run npm ci, build, tests, dependency audit, self-lint and
   `npm run verify:package`. Investigate failures before publication.
4. Pass Windows, macOS and Linux on Node 22 and 24, including packed installs,
   lockfile reinstalls, executable/library checks and all shipped simulations.
   Require successful SARIF ingestion and independent review of the exact commit.
5. Run relevant controlled native workflows and audits of actual installed
   collections. Check input preservation and inspect findings in source context.
   Record versioned evidence and known heuristic limitations.

Unsafe writes, execution of audited content, false complete-coverage claims or
unresolved release-blocking defects stop publication. Maintainer validation is
the first stable release gate. External feedback is collected after launch under
[the feedback criteria](pilot-guide.md#advancement-criteria); simulated users do
not count as actual participants or voluntary reuse.

## Build and inspect the distributable

Build a clean source snapshot of the reviewed commit, excluding untracked work
notes, private reports and stale output:

```bash
npm ci
npm run build
npm test
npm audit
node dist/cli.js lint . --fail-on error
npm run verify:package
npm pack --json
```

Inspect the pack file list and retain source commit/tree, SHA-256 and npm
integrity. `npm pack` does not run this project's prepublishOnly build script.
The verifier checks required files and rejects private work-output directories.

In a different empty directory, install the exact archive:

```bash
npm install --prefix . --save-dev --save-exact /absolute/path/to/skillcrit-0.5.1.tgz --ignore-scripts
npm ci --ignore-scripts
node ./node_modules/skillcrit/dist/cli.js --version
node ./node_modules/skillcrit/dist/cli.js doctor /absolute/path/to/test-project --json
node ./node_modules/skillcrit/scripts/simulate.mjs
```

## Publish and verify

Confirm npm account ownership and authenticate through npm's normal account
flow. Keep credentials out of chat, issues, source and logs. Security-key
confirmation requires the account owner's interaction. Never reuse expired
authentication links or work around account security requirements.

Create an annotated tag `v0.5.1` at the reviewed, passing commit. Never move an
existing release tag. Publish the exact verified archive:

```bash
npm publish ./skillcrit-0.5.1.tgz --tag latest --access public --ignore-scripts
npm view skillcrit@0.5.1 version dist.integrity dist-tags --json
```

Use `--tag next` for prereleases. Compare registry integrity, download the npm
archive and compare its bytes, then test a fresh registry install and lockfile
reinstall. Do not advertise an available npm version until publication and
installation have succeeded. Merge the reviewed PR using its exact head and
verify the merge tree and main CI.

Publish a GitHub release with the tested archive, SHA256SUMS, verification.json
and sanitized evidence. Mark stable releases as latest; mark candidates as
prereleases. Download all assets again and verify bytes/checksums. Automatically
generated GitHub source archives are not built npm packages.

The initial RC2 npm publication unexpectedly assigned both latest and next.
An authenticated attempt to remove latest was rejected by the registry. Both
tags were subsequently moved to verified RC4 so default installs stopped
selecting the affected RC2 exporter. Stable publication advances latest to the
stable version; next can remain on the most recent candidate. Inspect actual
tags after every write instead of assuming registry behavior.

For future CI publishing, configure and test an npm trusted publisher for the
exact repository/workflow before adding a workflow that claims to publish.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Recovery

If a release is faulty, mark it clearly, deprecate the affected npm version with
an actionable reason, and publish a corrected version. Preserve immutable tags
and evidence. Recheck the exact fallback artifact before changing install tags;
RC4 is a tested prerelease fallback for the initial stable release. Never delete
or rewrite users' skills during rollback. Test package upgrade, reinstall and
removal in a separate consumer, preserving the audited project.
