import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lint } from "../src/lint.ts";
import { scan } from "../src/scan.ts";

const stacked = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/repos/stacked"
);

describe("lint", () => {
  it("flags overlapping trigger phrases across two skills", () => {
    const report = lint(scan(stacked));
    const overlap = report.findings.find(
      (f) =>
        f.rule === "trigger-overlap" &&
        f.skills.includes("tdd-kit") &&
        f.skills.includes("session-loop")
    );
    expect(overlap).toBeDefined();
    expect(overlap?.message).toMatch(/continue the plan/i);
  });

  it("flags the same slash command registered by two packs", () => {
    const report = lint(scan(stacked));
    const dup = report.findings.find(
      (f) => f.rule === "duplicate-command" && /status/.test(f.message)
    );
    expect(dup).toBeDefined();
    expect(dup?.skills).toEqual(
      expect.arrayContaining(["alpha-pack", "beta-pack"])
    );
  });

  it("reports always-on skills and a combined token estimate", () => {
    const report = lint(scan(stacked));
    const always = report.findings.filter((f) => f.rule === "always-on");
    expect(always.some((f) => f.skills.includes("noisy-senior"))).toBe(true);
    expect(report.alwaysOnTokens).toBeGreaterThan(0);
  });

  it("surfaces spec violations as findings", () => {
    const report = lint(scan(stacked));
    const spec = report.findings.find((f) => f.rule === "spec");
    expect(spec).toBeDefined();
  });

  it("does not flag unique-csv as overlapping the workflow pair", () => {
    const report = lint(scan(stacked));
    const csvHits = report.findings.filter(
      (f) =>
        f.rule === "trigger-overlap" && f.skills.includes("unique-csv")
    );
    expect(csvHits).toEqual([]);
  });

  it("flags identical copies as duplicate-copy, not self-overlap", () => {
    const stackedSkills = scan(stacked);
    const csv = stackedSkills.find((s) => s.name === "unique-csv");
    if (!csv) throw new Error("missing unique-csv");
    const twin = {
      ...csv,
      skillFile: csv.skillFile.replace("unique-csv", "unique-csv-copy"),
      skillDir: csv.skillDir.replace("unique-csv", "unique-csv-copy")
    };
    const report = lint([...stackedSkills, twin]);
    const copies = report.findings.filter((f) => f.rule === "duplicate-copy");
    expect(copies).toHaveLength(1);
    expect(copies[0]?.message).toMatch(/unique-csv/);
    const selfOverlap = report.findings.filter(
      (f) =>
        f.rule === "trigger-overlap" &&
        f.skills[0] === "unique-csv" &&
        f.skills[1] === "unique-csv"
    );
    expect(selfOverlap).toEqual([]);
    expect(report.scanned).toBe(stackedSkills.length + 1);
    expect(report.unique).toBe(stackedSkills.length);
  });
});
