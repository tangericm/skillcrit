# Interpreting a result

## The cleanup model

Doctor recommends a copy per name for human cleanup review. It does not resolve
client namespaces, enablement, or frontmatter acceptance. Report runtime
selection as unknown, even when one copy ranks above another.

Ranking prefers project > user > marketplace > cache; higher numeric version;
not flagged always-on; longer description (capped at 400 characters); then path
order. This is a cleanup preference, not client precedence.

Equal SKILL.md bytes mean identical instructions only. Scripts, references, and
assets are not compared; inspect them and client usage before proposing deletion.
Other copies are alternatives, not proven inactive or shadowed skills.

## Token accounting

Doctor's `recommendedCatalogTokens` and `recommendedAlwaysOnTokens` estimate
a hypothetical recommended set using character counts and always-on heuristics.
They are not tokenizer measurements, billing figures, or observed session usage.
Risk inventory covers all scanned copies, not just recommendations.

## Writing up a result

Lead with the answer to the question that was asked, then the evidence:

> Cleanup ranking prefers `report-writer` v2.0.0 in `.agents/skills`.
> The `.claude/skills` copy is an alternative. Actual client selection is unknown.

Then, if relevant:

- Errors first, then warnings, then info. Quote rule IDs and `file:line`.
- Group repeats by skill rather than listing twenty near-identical lines.
- Label context costs as estimates for the recommended set.
- If `--fix` was run, show the plan and ask before anything is deleted.

## What not to claim

- Do not report a clean risk inventory as "this skill is safe". Say the
  inventory found no matching patterns and that a human still owns the call.
- Do not present eval numbers from the `stub` adapter as evidence about a real
  agent. It replays fixtures.
- Do not invent a score or grade. Report what skillcrit printed.
- Do not describe exit 1 as a failure or a crash. It means findings at or above
  the gate.

## When a skill "isn't loading"

Work down this list:

1. `skillcrit roots [path] --user` — does a known skill directory exist?
2. `skillcrit scan [path] --user` — was the file found at all?
3. `skillcrit doctor [path] --user` — are there other copies to investigate?
4. `skillcrit lint <skill-dir>` — inspect missing descriptions (`SC1005`) and
   parsing errors (`SC1011`), then verify acceptance in the target client.
5. If all of that is clean, the description is the suspect: `SC1012` and
   `SC3003`/`SC3004` cover a description that never matches, or one that
   competes with another skill for the same trigger.
