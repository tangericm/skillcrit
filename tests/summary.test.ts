import { describe, expect, it } from "vitest";
import { lint } from "../src/lint.ts";
import { formatSummary } from "../src/summary.ts";
import type { SkillRecord } from "../src/types.ts";

function rec(name: string, extra: Partial<SkillRecord> = {}): SkillRecord {
  return {
    name,
    skillDir: `/tmp/${name}`,
    skillFile: `/tmp/${name}/SKILL.md`,
    description: extra.description ?? `${name} unique skill for converting tables`,
    body: extra.body ?? name,
    pack: null,
    version: extra.version ?? "1.0.0",
    origin: extra.origin ?? "project",
    commands: [],
    hooks: false,
    alwaysOn: extra.alwaysOn ?? false,
    descriptionTokens: extra.descriptionTokens ?? 10,
    alwaysOnTokens: extra.alwaysOnTokens ?? 40,
    specIssues: extra.specIssues ?? [],
    ...extra
  };
}

describe("summary", () => {
  it("asks cleanup questions and compares tokens", () => {
    const a = rec("keep-me", {
      description: "write tests first for coverage reports only",
      version: "3.0.0",
      descriptionTokens: 10,
      alwaysOnTokens: 10
    });
    const b = rec("drop-me", {
      description: "write tests first then deploy docker images",
      version: "2.0.0",
      descriptionTokens: 10,
      alwaysOnTokens: 10
    });
    const report = lint([a, b]);
    expect(report.questions.some((q) => q.kind === "prefer-skill")).toBe(true);
    expect(report.tokens.alwaysOnNow).toBe(20);
    expect(report.tokens.afterCleanup).toBe(10);
    expect(report.tokens.saved).toBe(10);
    const text = formatSummary(report);
    expect(text).toMatch(/skillcrit summary/);
    expect(text).toMatch(/## questions/);
    expect(text).toMatch(/after recommended cleanup/);
  });
});
