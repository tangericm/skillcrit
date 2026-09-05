import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { lint } from "../src/lint.ts";
import {
  formatGithub,
  formatMarkdown,
  formatSarif,
  formatText,
  isFormat
} from "../src/report.ts";
import { RULES, ruleIds } from "../src/rules.ts";
import { scan } from "../src/scan.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const estate = path.join(root, "fixtures/repos/estate");
const report = lint(scan(estate));

describe("rule catalogue", () => {
  it("gives every finding a known ID and a remediation", () => {
    expect(report.findings.length).toBeGreaterThan(0);
    for (const finding of report.findings) {
      expect(ruleIds()).toContain(finding.id);
      expect(finding.remediation).toBe(RULES[finding.id].remediation);
    }
  });

  it("anchors non-aggregate findings to a real file", () => {
    const anchored = report.findings.filter((f) => f.rule !== "always-loaded-tokens");
    expect(anchored.length).toBeGreaterThan(0);
    for (const finding of anchored) {
      expect(finding.file, finding.id).toBeTruthy();
      expect(path.isAbsolute(finding.file!)).toBe(true);
    }
  });

  it("points a bundled-script risk at the script, not at SKILL.md", () => {
    const script = report.findings.find(
      (f) => f.rule === "risk" && f.file?.replace(/\\/g, "/").endsWith("scripts/sync.sh")
    );
    expect(script).toBeDefined();
    expect(script!.line).toBeGreaterThan(0);
    // The message carries the evidence; the anchor carries the location, so
    // neither renderer has to print an absolute path twice.
    expect(script!.message).not.toContain("sync.sh");
  });
});

describe("output formats", () => {
  it("accepts only the documented format names", () => {
    expect(isFormat("sarif")).toBe(true);
    expect(isFormat("xml")).toBe(false);
  });

  it("prints rule ID, location and fix in text", () => {
    const text = formatText(report);
    expect(text).toMatch(/warning SC3002 version-conflict:/);
    expect(text).toMatch(/\n {2}at .*SKILL\.md/);
    expect(text).toMatch(/\n {2}fix: /);
    expect(text).toMatch(/# skillcrit summary/);
  });

  it("emits valid SARIF 2.1.0 with a rule entry per finding ID", () => {
    const sarif = JSON.parse(formatSarif(report)) as {
      version: string;
      runs: {
        tool: { driver: { name: string; rules: { id: string }[] } };
        results: { ruleId: string; level: string; locations: unknown[] }[];
      }[];
    };
    expect(sarif.version).toBe("2.1.0");
    const run = sarif.runs[0];
    expect(run.tool.driver.name).toBe("skillcrit");
    const declared = new Set(run.tool.driver.rules.map((r) => r.id));
    for (const result of run.results) {
      expect(declared.has(result.ruleId)).toBe(true);
      expect(["error", "warning", "note"]).toContain(result.level);
    }
  });

  it("emits GitHub annotations with escaped newlines", () => {
    const github = formatGithub(report);
    expect(github).toMatch(/^::(?:error|warning|notice) /m);
    expect(github).toMatch(/title=SC\d{4} /);
    for (const line of github.trim().split("\n")) {
      expect(line.startsWith("::")).toBe(true);
    }
  });

  it("exports located SARIF alerts and preserves aggregate budget findings as run metadata", () => {
    const config = { ...DEFAULT_CONFIG, budget: { ...DEFAULT_CONFIG.budget, alwaysOnTokens: 0 } };
    const budgetReport = lint(scan(estate), config, estate);
    const aggregates = budgetReport.findings.filter(f => !f.file);
    expect(aggregates.some(f => f.id === "SC2004" && f.severity === "warning")).toBe(true);
    const run = JSON.parse(formatSarif(budgetReport)).runs[0];
    expect(run.results).toHaveLength(budgetReport.findings.length - aggregates.length);
    expect(run.results.length).toBeGreaterThan(0);
    for (const result of run.results) {
      expect(result.locations).toHaveLength(1);
      expect(result.locations[0].physicalLocation.artifactLocation.uri).toBeTruthy();
    }
    expect(run.properties.aggregateFindings).toEqual(aggregates);
  });

  it("handles inventories with only aggregate findings without inventing file locations", () => {
    const empty = lint([]);
    empty.coverage = { complete: false, reasons: ["unreadable root"] };
    const run = JSON.parse(formatSarif(empty)).runs[0];
    expect(run.results).toEqual([]);
    expect(run.properties.aggregateFindings).toEqual(empty.findings);
    expect(run.properties.coverage).toEqual(empty.coverage);
    expect(run.invocations[0].executionSuccessful).toBe(false);
    expect(run.invocations[0].toolExecutionNotifications[0].message.text).toBe("unreadable root");
  });

  it("escapes GitHub property delimiters and cannot inject annotation lines through paths", () => {
    const file = path.join(estate, "odd,name:100%\r\n::error::injected", "SKILL.md");
    const special = { ...report, root: estate, findings: [{ ...report.findings[0], file }] };
    const output = formatGithub(special);
    expect(output.trim().split("\n")).toHaveLength(1);
    expect(output).toContain("file=odd%2Cname%3A100%25%0D%0A%3A%3Aerror%3A%3Ainjected/SKILL.md,");
  });

  it("encodes relative SARIF paths as URI references, not raw filenames", () => {
    const file = path.join(estate, "odd name#100%?é", "SKILL.md");
    const special = { ...report, root: estate, findings: [{ ...report.findings[0], file }] };
    const output = JSON.parse(formatSarif(special));
    const uri = output.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri;
    expect(uri).toBe("odd%20name%23100%25%3F%C3%A9/SKILL.md");
  });

  it("prints CI locations relative to the scanned root", () => {
    // GitHub matches an annotation to a diff by comparing this path to one in
    // the checkout, so an absolute path annotates nothing.
    const rooted = lint(scan(estate), DEFAULT_CONFIG, estate);
    for (const line of formatGithub(rooted).trim().split("\n")) {
      const file = /file=([^,:]*(?::[^,]*)?),/.exec(line)?.[1];
      if (!file) continue;
      expect(file.startsWith(".agents/") || file.startsWith(".claude/")).toBe(true);
    }
    const sarif = JSON.parse(formatSarif(rooted)) as {
      runs: { results: { locations: { physicalLocation: { artifactLocation: { uri: string } } }[] }[] }[];
    };
    for (const result of sarif.runs[0].results) {
      for (const loc of result.locations) {
        const uri = loc.physicalLocation.artifactLocation.uri;
        expect(uri).not.toMatch(/^file:/);
        expect(uri).not.toContain("\\");
      }
    }
    expect(formatText(rooted)).not.toContain(estate);
  });

  it("escapes table pipes in markdown", () => {
    const markdown = formatMarkdown(report);
    expect(markdown).toMatch(/\| Rule \| Severity \|/);
    expect(markdown).toMatch(/## How to fix/);
    const rows = markdown.split("\n").filter((l) => l.startsWith("| SC"));
    for (const row of rows) {
      expect(row.split(/(?<!\\)\|/).length).toBe(7);
    }
  });
});
