# Release verification

The official [0.5.2 GitHub release](https://github.com/tangericm/skillcrit/releases/tag/v0.5.2)
attaches `verification.json`, `package-check.json`, `simulations.json`, the built
`skillcrit-0.5.2.tgz`, and `SHA256SUMS`. The verification record identifies the
single source commit, source tree, package hashes, CI run and independent review.
The checksums cover every other attachment. See the
[getting-started guide](pilot-guide.md) to verify and install the package.

The release gate includes build and unit tests, six OS/Node CI combinations,
isolated packed installation and lockfile reinstall, executable and library use,
Unicode paths, safe export and all 19 controlled simulations. The exact release
archive is tested separately, then downloaded again after publication to verify
that the published bytes match. These checks establish package behavior, not
public adoption or guaranteed absence of all defects.

The application source is unchanged from the previously tested 0.5.1 version.
Native-client observations in the [compatibility matrix](compatibility.md) remain
historical evidence from their stated client/package versions. They are not
new 0.5.2 native trials. Risk rules remain review signals, runtime selection is
unknown, tokens are estimates, and stub evaluation measures no real agent.

Version 0.5.2 is distributed on npm and GitHub. The verification attachment records
registry integrity and installed-package checks; both channels must serve identical
package bytes.
