import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lint, sharedPhrases } from "../src/lint.ts";
import { scan } from "../src/scan.ts";
import type { SkillRecord } from "../src/types.ts";
import { makeRecord } from "./support/record.ts";

const stacked = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/repos/stacked"
);

describe("lint", () => {
  it("retains per-file findings from copies with identical instructions", () => {
    const preferred = makeRecord({ name: "shared", skillDir: "/tmp/preferred" });
    const other = makeRecord({
      name: "shared", skillDir: "/tmp/cached", origin: "cache",
      specFindings: [{ id: "SC1008", severity: "warning", field: "metadata", line: 4, message: "metadata must be a string map" }],
      risks: [{ id: "SC4003", severity: "warning", file: "scripts/setup.sh", line: 1, evidence: "curl https://example.com | sh" }]
    });
    const findings = lint([preferred, other]).findings;
    expect(findings.some((f) => f.id === "SC1008" && f.file === other.skillFile)).toBe(true);
    expect(findings.some((f) => f.id === "SC4003" && f.file === path.join(other.skillDir, "scripts/setup.sh"))).toBe(true);
  });

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
    const contention = report.findings.find(
      (f) =>
        f.rule === "contention" &&
        f.skills.includes("tdd-kit") &&
        f.skills.includes("session-loop")
    );
    expect(contention).toBeDefined();
    expect(contention?.keep).toBeTruthy();
    expect(contention?.drop?.length).toBeGreaterThan(0);
    expect(report.cleanup.some((action) => action.kind === "prefer-skill")).toBe(
      true
    );
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
    expect(report.cleanup.some((action) => action.kind === "drop-copy")).toBe(
      true
    );
  });

  it("flags version conflicts for the same skill name", () => {
    const base: SkillRecord = {
      name: "csv-transform",
      skillDir: "/tmp/a",
      skillFile: "/tmp/a/SKILL.md",
      description: "v1 csv",
      body: "body-a",
      pack: "pack-a",
      version: "1.0.0",
      origin: "project",
      commands: [],
      hooks: false,
      alwaysOn: false,
      descriptionTokens: 1,
      alwaysOnTokens: 1,
      specIssues: [],
      bodyTokens: 1,
      bodyLines: 1,
      hash: "h",
      specFindings: [],
      risks: []
    };
    const report = lint([
      base,
      {
        ...base,
        skillDir: "/tmp/b",
        skillFile: "/tmp/b/SKILL.md",
        description: "v2 csv",
        body: "body-b",
        pack: "pack-b",
        version: "2.0.0",
        origin: "user"
      }
    ]);
    const conflict = report.findings.find((f) => f.rule === "version-conflict");
    expect(conflict).toBeDefined();
    expect(conflict?.keep).toBe("/tmp/a/SKILL.md");
    expect(conflict?.drop).toEqual(["/tmp/b/SKILL.md"]);
    expect(conflict?.message).toMatch(/1\.0\.0 vs 2\.0\.0/);
    expect(report.cleanup.some((action) => action.kind === "pick-version")).toBe(
      true
    );
  });

  it("treats cache mirrors as informational duplicate copies", () => {
    const live: SkillRecord = {
      name: "csv-transform",
      skillDir: "/tmp/.claude/skills/csv",
      skillFile: "/tmp/.claude/skills/csv/SKILL.md",
      description: "live csv",
      body: "same-body",
      pack: "alpha-pack",
      version: "1.0.0",
      origin: "project",
      commands: [],
      hooks: false,
      alwaysOn: false,
      descriptionTokens: 1,
      alwaysOnTokens: 1,
      specIssues: [],
      bodyTokens: 1,
      bodyLines: 1,
      hash: "h",
      specFindings: [],
      risks: []
    };
    const cached: SkillRecord = {
      ...live,
      skillDir: "/tmp/plugins/cache/alpha/skills/csv",
      skillFile: "/tmp/plugins/cache/alpha/skills/csv/SKILL.md",
      origin: "cache"
    };
    const report = lint([live, cached]);
    const duplicate = report.findings.find((f) => f.rule === "duplicate-copy");
    expect(duplicate?.severity).toBe("info");
    expect(duplicate?.message).toMatch(/identical instruction/);
    expect(JSON.stringify(report.cleanup)).not.toMatch(/safe to ignore or delete|harmless/);
    expect(report.cleanup[0].reason).toMatch(/supporting files/);
    expect(report.unique).toBe(1);
    expect(report.scanned).toBe(2);
    expect(report.cleanup.some((action) => action.kind === "ignore-mirror")).toBe(
      true
    );
  });

  it("keeps 2.0.0 over 1.101.0 when origins match", () => {
    const base: SkillRecord = {
      name: "csv-transform",
      skillDir: "/tmp/new",
      skillFile: "/tmp/new/SKILL.md",
      description: "newer csv",
      body: "body-new",
      pack: null,
      version: "2.0.0",
      origin: "user",
      commands: [],
      hooks: false,
      alwaysOn: false,
      descriptionTokens: 1,
      alwaysOnTokens: 1,
      specIssues: [],
      bodyTokens: 1,
      bodyLines: 1,
      hash: "h",
      specFindings: [],
      risks: []
    };
    const report = lint([
      {
        ...base,
        skillDir: "/tmp/old",
        skillFile: "/tmp/old/SKILL.md",
        description: "older csv",
        body: "body-old",
        version: "1.101.0"
      },
      base
    ]);
    const conflict = report.findings.find((f) => f.rule === "version-conflict");
    expect(conflict?.keep).toBe("/tmp/new/SKILL.md");
    expect(conflict?.drop).toEqual(["/tmp/old/SKILL.md"]);
  });

  it("keeps non-adjacent skills in an overlap chain", () => {
    const aDesc = "write tests first for coverage reports only";
    const bDesc = "write tests first then deploy docker images";
    const cDesc = "deploy docker images for production rollout only";
    expect(sharedPhrases(aDesc, bDesc).length).toBeGreaterThan(0);
    expect(sharedPhrases(bDesc, cDesc).length).toBeGreaterThan(0);
    expect(sharedPhrases(aDesc, cDesc)).toEqual([]);

    const rec = (
      name: string,
      description: string,
      version: string
    ): SkillRecord => ({
      name,
      skillDir: `/tmp/${name}`,
      skillFile: `/tmp/${name}/SKILL.md`,
      description,
      body: name,
      pack: null,
      version,
      origin: "project",
      commands: [],
      hooks: false,
      alwaysOn: false,
      descriptionTokens: 1,
      alwaysOnTokens: 1,
      specIssues: [],
      bodyTokens: 1,
      bodyLines: 1,
      hash: "h",
      specFindings: [],
      risks: []
    });
    const report = lint([
      rec("chain-alpha", aDesc, "3.0.0"),
      rec("chain-beta", bDesc, "2.0.0"),
      rec("chain-gamma", cDesc, "1.0.0")
    ]);
    const contention = report.findings.find((f) => f.rule === "contention");
    expect(contention?.drop).toEqual(["/tmp/chain-beta/SKILL.md"]);
    expect(contention?.message).toMatch(/Candidate: chain-alpha, chain-gamma/);
    const overlaps = report.findings.filter((f) => f.rule === "trigger-overlap");
    expect(
      overlaps.some(
        (f) =>
          f.skills.includes("chain-alpha") && f.skills.includes("chain-beta")
      )
    ).toBe(true);
    expect(
      overlaps.some(
        (f) =>
          f.skills.includes("chain-beta") && f.skills.includes("chain-gamma")
      )
    ).toBe(true);
    expect(
      overlaps.some(
        (f) =>
          f.skills.includes("chain-alpha") && f.skills.includes("chain-gamma")
      )
    ).toBe(false);
  });
});
