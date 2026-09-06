# Contributing

Skillcrit helps people inspect installed agent skills. Useful contributions
include minimal reproductions, false-positive reports, client compatibility
observations, and small fixes with evidence.

Start with the [pilot guide](docs/pilot-guide.md) or
[compatibility matrix](docs/compatibility.md). Use the issue forms for a bug or
pilot result. Follow [Security](SECURITY.md) for vulnerabilities; do not include
credentials or private skill contents in a public issue.

## Local setup

Use Node 22 or 24, matching CI. Keep `node_modules` local to one OS; a dependency
tree synchronized from Windows is not a working macOS installation.

```bash
git clone https://github.com/tangericm/skillcrit.git
cd skillcrit
npm ci
npm run build
npm test
npm run simulate
node dist/cli.js lint . --fail-on error
```

Make a focused branch and include the problem, resulting behavior, and checks
run in the pull request. A behavior fix should have a regression case that
fails before the fix. Human documentation changes need checked examples and
links, not tests that assert prose contains a particular sentence.

## Contracts to preserve

- Inventory parses skill content as data; it does not execute it.
- Partial coverage is visible and exits 3. Do not hide skipped inputs to make
  an audit look successful.
- Cleanup output is advice. Same-name or byte-identical SKILL.md files do not
  prove interchangeable packages or runtime precedence.
- Token figures are estimates. The stub evaluation adapter measures no live agent.
- Keep existing rule IDs stable. Explain compatibility changes to JSON output
  and CLI exit codes in the changelog.
- A client directory in the inventory table is not proof of native support.
  Add source links and actual native observations to the compatibility matrix.

CI checks Node 22/24 on Linux, macOS, and Windows, including packaged installation.
The repository also audits its own skill and uploads SARIF to GitHub. Wait for
those checks and review before merging.

Release steps and candidate promotion criteria are in [Releasing](docs/releasing.md).
