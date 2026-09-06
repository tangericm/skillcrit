# Repository history cleanup

On September 5, 2026, the maintainer authorized squashing all previous development
history into a single initial commit for Skillcrit 0.5.2. The old GitHub releases
and tags were withdrawn; private recovery backups preserve the earlier work.

The 0.5.2 GitHub release has new source provenance and fresh package verification.
Its application behavior is unchanged from 0.5.1; version metadata, installation
instructions and release documentation were updated. Historical native-client
observations remain labeled by the versions actually tested.

npm `skillcrit@0.5.1` remains published and unchanged. Its embedded historical
references describe the earlier repository. Install 0.5.2 from npm or the GitHub package; see the [getting-started guide](pilot-guide.md).

Use a fresh clone after the squash. Preserve local work before replacing an old
checkout, and do not merge old branches into the new history. GitHub may retain
read-only pull-request references and cached commit views outside branch/tag
history. A squash cannot erase other people's existing clones.
