# Rules

Run `skillcrit rules` for the live catalogue with severities and remediations.
This file explains the families and how to configure them.

IDs are stable. An ID never changes meaning, and a retired check keeps its ID
reserved, so `.skillcrit.json` overrides and CI suppressions stay valid across
versions. Always quote the ID when you report a finding.

## SC1xxx — Agent Skills spec conformance

Does this SKILL.md match the base Agent Skills specification? Client support
and operational extensions must be checked separately.

- `SC1001` / `SC1005` are **errors** for missing required name or description
  fields. These diagnose base-spec conformance, not runtime acceptance.
- `SC1002` (name does not match the folder) is a **warning** about the base
  naming contract. Verify acceptance in the target client.
- `SC1008`–`SC1010` cover `metadata:` (a flat map of string to string),
  `allowed-tools:` (one space-separated string), and keys outside the spec.
  YAML turns `version: 1.0` into a number, which is why quoting is required.
  `SC1010` is an informational portability note: preserve supported controls
  such as `disable-model-invocation`. Cleanup plans do not classify these notes
  as errors or reasons to delete a skill.
- `SC1011` fires only when the YAML cannot be parsed even after repair.
  skillcrit retries an unquoted colon in a value with the value quoted, because
  dropping the skill would make the inventory wrong rather than strict.
- `SC1012` flags a description without recognized trigger wording. This is a
  wording heuristic; it does not measure activation reliability.

## SC2xxx — context budget

Estimates for a hypothetical set of skills, not measured session or billing data.

- `SC2001` (~5000 tokens) and `SC2002` (500 lines) apply to the body, which
  loads in full the moment the skill activates. The fix is `references/` files
  the agent reads on demand.
- `SC2003` flags body phrasing or plugin hooks for review. Neither proves that
  the skill body is always loaded.
- `SC2004` is an estimated total, informational by default and a warning when
  it exceeds `budget.alwaysOnTokens` in `.skillcrit.json`. Runtime selection
  remains unknown, including when the estimate exceeds a policy budget.

## SC3xxx — collisions

Which instruction files or descriptions deserve comparison.

- `SC3001` duplicate instruction files (equal SKILL.md bytes, including all
  frontmatter). Supporting scripts, references and assets may still differ.
- `SC3002` alternatives under one name: bodies or metadata differ. Inspect
  client namespaces, permissions and supporting files before changing a copy.
- `SC3003` / `SC3004` shared description phrases. These are heuristics, not
  evidence of runtime contention or proof that either skill should be disabled.
- `SC3005` two packs declaring the same command basename. Verify client
  namespaces before treating this as a command conflict.
- `SC3006` reserved for client-verified shadowing; cleanup ranking is not evidence.

Same-name copies are never reported as trigger contention; that is `SC3002`.

## SC4xxx — risk inventory

Deterministic pattern matches that route a human to lines worth reading. Not a
security verdict. A skill that trips nothing here is not thereby safe, and a
skill that trips several may be entirely legitimate.

- `SC4001` network reach, `SC4002` credential and secret reads, `SC4003`
  download-and-execute, `SC4004` destructive shell commands, `SC4005` unpinned
  installs, `SC4006` a broad `allowed-tools` grant.
- In SKILL.md only fenced code blocks are matched. Prose that warns *against*
  `rm -rf` is not a signal, and flagging it would teach readers to ignore the
  whole list.
- Bundled scripts next to SKILL.md are scanned to depth 3 and anchored to their
  own path and line.

## Configuration

`.skillcrit.json`, found by walking up from the scanned path:

```json
{
  "ignore": ["**/vendor/**"],
  "rules": { "SC1012": "off", "SC3001": "error" },
  "budget": { "alwaysOnTokens": 4000, "bodyTokens": 5000, "bodyLines": 500 },
  "failOn": "error"
}
```

A rule set to `"off"` is dropped from the findings rather than printed at a
lower severity. Subtree ignores such as `**/vendor/**` are pruned before walk
limits. Invalid configuration, including unknown keys or rule IDs, is diagnosed
and makes the CLI exit 3.
