# Rules

Run `skillcrit rules` for the live catalogue with severities and remediations.
This file explains the families and how to configure them.

IDs are stable. An ID never changes meaning, and a retired check keeps its ID
reserved, so `.skillcrit.json` overrides and CI suppressions stay valid across
versions. Always quote the ID when you report a finding.

## SC1xxx — Agent Skills spec conformance

Does this SKILL.md match the specification the clients implement?

- `SC1001` / `SC1005` are **errors** because a conformant client skips a skill
  with no description, and collision handling keys on the name. A skill with
  either problem may simply never load.
- `SC1002` (name does not match the folder) is a **warning**, not an error:
  clients load the skill anyway.
- `SC1008`–`SC1010` cover `metadata:` (a flat map of string to string),
  `allowed-tools:` (one space-separated string), and keys outside the spec.
  YAML turns `version: 1.0` into a number, which is why quoting is required.
- `SC1011` fires only when the YAML cannot be parsed even after repair.
  skillcrit retries an unquoted colon in a value with the value quoted, because
  dropping the skill would make the inventory wrong rather than strict.
- `SC1012` flags a description with no trigger wording. The model matches on
  the description alone, so "Formats CSVs" activates far less reliably than
  "Formats CSVs. Use when the user asks to clean a CSV export."

## SC2xxx — context budget

What the skill costs whether or not it is used.

- `SC2001` (~5000 tokens) and `SC2002` (500 lines) apply to the body, which
  loads in full the moment the skill activates. The fix is `references/` files
  the agent reads on demand.
- `SC2003` flags always-on skills, which pay their body on every turn.
- `SC2004` is the estate total. It is informational by default and becomes a
  warning when it exceeds `budget.alwaysOnTokens` in `.skillcrit.json`.

## SC3xxx — collisions

Which copy wins, and which skills fight each other.

- `SC3001` duplicate copies (identical bytes in several roots).
- `SC3002` version conflict: one name, two different bodies. Only the winner
  loads.
- `SC3003` / `SC3004` trigger contention: distinct skills whose descriptions
  claim the same job, so activation is a coin flip.
- `SC3005` two packs registering the same slash command.
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

A rule set to `"off"` is dropped from the report entirely, not printed at a
lower severity. Unknown keys and unknown rule IDs are reported as warnings
rather than silently ignored, so a typo does not quietly disable a check.
