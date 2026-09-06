import { describe, expect, it } from "vitest";
import { lint } from "../src/lint.ts";
import { formatGithub, formatMarkdown, formatSarif, formatText } from "../src/report.ts";
import { makeRecord } from "./support/record.ts";

describe("bounded overlap diagnostics", () => {
  it.each([100, 1000, 10000])("summarizes %i related skills without pairwise output or a crash", n => {
    const skills = Array.from({ length: n }, (_, i) => makeRecord({
      name: `skill-${i}`, description: `Use when processing unique fixture ${i}`
    }));
    const report = lint(skills);
    expect(report.findings.length).toBeLessThanOrEqual(5);
    expect(report.findings.find(f => f.id === "SC3003")?.message).toMatch(/heuristic|review/i);
    expect(report.findings.find(f => f.id === "SC3003")?.remediation).not.toMatch(/coin flip|disable all/i);
    expect(report.cleanup.filter(a => a.kind === "prefer-skill")).toHaveLength(0);
  }, 20000);
});

describe("coverage in every lint format", () => {
  const report = { ...lint([]), coverage: { complete: false, reasons: ["walk stopped at depth 8"] } };
  it("marks SARIF execution unsuccessful and includes reasons", () => {
    const run = JSON.parse(formatSarif(report)).runs[0];
    expect(run.invocations[0].executionSuccessful).toBe(false);
    expect(run.properties.coverage).toEqual(report.coverage);
  });
  it("shows incomplete coverage in human output and workflow annotations", () => {
    expect(formatText(report)).toMatch(/incomplete/i);
    expect(formatMarkdown(report)).toMatch(/incomplete/i);
    expect(formatGithub(report)).toMatch(/::error.*incomplete/i);
  });
});
