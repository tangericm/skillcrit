import type { SkillRecord } from "../../src/types.ts";

/**
 * A minimal valid `SkillRecord` for tests that fabricate one instead of
 * scanning a fixture.
 *
 * Every fabricated record goes through here so that adding a field to
 * `SkillRecord` is one edit rather than one per test file — the alternative
 * fails six suites at once with `specFindings is not iterable`.
 */
export function makeRecord(overrides: Partial<SkillRecord> = {}): SkillRecord {
  const name = overrides.name ?? "x";
  const skillDir = overrides.skillDir ?? `/tmp/${name}`;
  return {
    name,
    skillDir,
    skillFile: `${skillDir}/SKILL.md`,
    description: `${name} skill for converting tables to RFC 4180 CSV only.`,
    body: name,
    pack: null,
    version: null,
    origin: "project",
    commands: [],
    hooks: false,
    alwaysOn: false,
    descriptionTokens: 1,
    alwaysOnTokens: 1,
    specIssues: [],
    bodyTokens: 1,
    bodyLines: 1,
    hash: name,
    specFindings: [],
    risks: [],
    ...overrides
  };
}
