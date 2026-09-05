# v0.5.0 release checklist

Historical checklist for the unpublished 0.5.0 preview. The current source
version is `0.5.1-rc.2`, which includes security and correctness fixes. Follow
the [current release process](releasing.md). Do not
publish the unpatched 0.5.0 candidate; use the current changelog and verify a
new release candidate before any npm publication.

This is a private preview. Do not present npm installation as available until
the package has been published and its registry install has been verified.

## Verified locally

- Build, strict TypeScript check, full test suite, and self-lint.
- Packed npm artifact installs in a clean temporary project; reference files
  and README assets are present and the installed CLI runs an audit.
- Native Claude Code 2.1.261 manifest validation passes without warnings.
- Native Claude marketplace add/install/list/details succeeds in an isolated
  `CLAUDE_CONFIG_DIR`; plugin version 0.5.0 exposes one skill.
- npm audit reports no known vulnerabilities, including development dependencies.

## Before publication

- Confirm the release branch CI passes on Ubuntu, macOS, and Windows with Node
  22 and 24. SARIF upload is optional for private repositories without code scanning.
- Review and merge the release PR; tag the reviewed commit as v0.5.0.
- Decide distribution visibility. The GitHub repository is currently private,
  and the public npm registry does not currently expose `skillcrit`.
- Obtain explicit authorization before publishing npm or changing repository
  visibility. Verify npm package ownership and publish credentials at that point.
- Publish the reviewed artifact, then test `npm i -g skillcrit@0.5.0` from a
  clean environment and verify `skillcrit --version` and `skillcrit doctor`.
- Update the README and bundled skill's private-preview wording in the public
  release; keep source-checkout instructions as a supported alternative.

## Known boundaries

Doctor provides cleanup recommendations, not client runtime resolution. Its
JSON reports `runtimeResolution: "unknown"`. Instruction equality does not
establish equivalent supporting files. Risk inventory is bounded pattern
matching, not a safety verdict. Eval remains a synthetic experimental adapter;
custom task suites execute code with the user's permissions and must be trusted.

## Rollback

There is no previously published npm release verified for this package. If the
first release is faulty, keep the repository private-preview instructions,
deprecate the faulty npm version with a clear reason, and publish a corrected
patch rather than silently replacing an immutable version. Do not delete users'
installed skills. For repository consumers, point to the last reviewed commit.
