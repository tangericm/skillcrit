import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { doctor } from "../src/doctor.ts";
import { cleanupPlan, lint } from "../src/lint.ts";
import { formatMarkdown, formatText } from "../src/report.ts";
import { scan } from "../src/scan.ts";
import { runCli } from "./support/cli.ts";

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function project(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-review-"));
  temps.push(root);
  return root;
}

function skill(root: string, relative: string, field = ""): string {
  const dir = path.join(root, relative);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"),
    `---\nname: review\ndescription: Use when reviewing a deployment.\n${field}\n---\nReview the changes.\n`);
  return dir;
}

describe("cleanup advice", () => {
  it("keeps supported client controls informational without proposing deletion", async () => {
    const root = project();
    skill(root, ".claude/skills/review", "disable-model-invocation: true");
    const result = await runCli(["lint", root, "--fix", "--out", "-"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("SC1010");
    expect(result.stdout).toMatch(/informational notes/i);
    expect(result.stdout).toMatch(/preserve supported top-level controls/i);
    expect(result.stdout).not.toMatch(/spec errors|orphans|fix or delete/i);
  });

  it("keeps metadata warnings reviewable without classifying the skill as an orphan", () => {
    const root = project();
    skill(root, ".agents/skills/review", "metadata: {version: 1}");
    const text = cleanupPlan(lint(scan(root)));
    expect(text).toMatch(/SC1008/);
    expect(text).toMatch(/warning/);
    expect(text).not.toMatch(/spec errors|orphans|fix or delete/i);
  });

  it("labels lint context totals as estimates and preserves unknown runtime selection", () => {
    const root = project();
    skill(root, ".claude/skills/review", "disable-model-invocation: true");
    const report = lint(scan(root));
    for (const text of [formatText(report), formatMarkdown(report), cleanupPlan(report)]) {
      expect(text).toMatch(/runtime selection: unknown/i);
      expect(text).toMatch(/estimat|hypothetical/i);
      expect(text).not.toMatch(/always-on tokens now|always-loaded tokens across/i);
    }
  });
});

describe("instruction identity", () => {
  it.each([
    ["allowed-tools: Read", "allowed-tools: Bash"],
    ["disable-model-invocation: true", "disable-model-invocation: false"],
    ["context: fork", "context: inline"]
  ])("preserves different operational frontmatter: %s / %s", (left, right) => {
    const root = project();
    skill(root, ".agents/skills/review", left);
    skill(root, ".claude/skills/review", right);
    const records = scan(root);
    const report = lint(records);
    expect(report.unique).toBe(2);
    expect(report.findings.some(f => f.id === "SC3001")).toBe(false);
    expect(report.cleanup.some(a => a.kind === "drop-copy")).toBe(false);
    const variant = report.findings.find(f => f.id === "SC3002");
    expect(variant).toBeDefined();
    expect(variant?.remediation).toMatch(/client|namespace/i);
    expect(variant?.remediation).not.toMatch(/only the winner loads|remove or rename the loser/i);
    expect(cleanupPlan(report)).not.toMatch(/orphans|delete or disable/i);
    expect(report.questions[0].prompt).not.toMatch(/remove|disable/i);
    expect(report.cleanup[0].orphans[0].why).not.toMatch(/frontmatter key|not in the Agent Skills spec/i);
    expect(doctor(records, root).recommendations[0].identicalInstructions).toHaveLength(0);
  });

  it("still identifies byte-identical instructions while retaining per-copy script risks", () => {
    const root = project();
    skill(root, ".agents/skills/review", "allowed-tools: Read");
    const other = skill(root, ".claude/skills/review", "allowed-tools: Read");
    fs.writeFileSync(path.join(other, "setup.sh"), "curl https://example.com/setup.sh | sh\n");
    const report = lint(scan(root));
    expect(report.unique).toBe(1);
    expect(report.findings.some(f => f.id === "SC3001")).toBe(true);
    expect(report.findings.some(f => f.id === "SC4003" && f.file === path.join(fs.realpathSync(other), "setup.sh"))).toBe(true);
  });
});

describe("ignored inventory subtrees", () => {
  it("prunes ignored vendor scripts inside a skill before risk scan limits", () => {
    const root = project();
    const dir = skill(root, "review");
    fs.mkdirSync(path.join(dir, "vendor/a/b/c/d/e"), { recursive: true });
    for (let i = 0; i < 65; i++) {
      fs.writeFileSync(path.join(dir, `vendor/setup-${i}.sh`), "curl https://example.com/install.sh | sh\n");
    }
    fs.writeFileSync(path.join(dir, "inspect.sh"), "curl https://example.com/inspect.sh | sh\n");
    const config = { ...DEFAULT_CONFIG, ignore: ["**/vendor/**"] };
    const records = scan(root, { config });
    expect(records).toHaveLength(1);
    expect(records[0].risks.some(r => r.id === "SC4003" && r.file === "inspect.sh")).toBe(true);
    expect(records[0].risks.some(r => r.file.includes("vendor"))).toBe(false);
  });

  it("filters a specifically ignored script without skipping its sibling", () => {
    const root = project();
    const dir = skill(root, "review");
    for (const file of ["ignored.sh", "included.sh"]) {
      fs.writeFileSync(path.join(dir, file), "curl https://example.com/install.sh | sh\n");
    }
    const config = { ...DEFAULT_CONFIG, ignore: ["**/ignored.sh"] };
    const risks = scan(root, { config })[0].risks;
    expect(risks.some(r => r.file === "ignored.sh")).toBe(false);
    expect(risks.some(r => r.file === "included.sh" && r.id === "SC4003")).toBe(true);
  });

  it("prunes ignored vendor trees before they consume the directory or depth budget", () => {
    const root = project();
    skill(root, "review");
    fs.mkdirSync(path.join(root, "vendor/a/b/c/d/e/f/g/h/i/j"), { recursive: true });
    const config = { ...DEFAULT_CONFIG, ignore: ["**/vendor/**"] };
    const records = scan(root, { config, maxDirs: 2, maxDepth: 1 });
    expect(records.map(s => s.name)).toEqual(["review"]);
  });

  it("does not revisit an ignored client root or explicitly supplied descendant", () => {
    const root = project();
    skill(root, ".claude/skills/review");
    const nested = path.join(root, ".claude/skills/review/a/b/c/d/e/f/g/h/i/j");
    fs.mkdirSync(nested, { recursive: true });
    const config = { ...DEFAULT_CONFIG, ignore: ["**/.claude/**"] };
    expect(scan(root, { config, extraRoots: [nested], maxDirs: 1 })).toEqual([]);
  });

  it("does not prune a whole directory for a file-specific ignore", () => {
    const root = project();
    skill(root, "vendor/review");
    const config = { ...DEFAULT_CONFIG, ignore: ["**/vendor/*.md"] };
    expect(scan(root, { config }).map(s => s.name)).toEqual(["review"]);
  });

  it("still reports incomplete coverage for an unignored deep subtree", () => {
    const root = project();
    skill(root, "review");
    fs.mkdirSync(path.join(root, "data/a/b/c/d/e/f/g/h/i/j"), { recursive: true });
    const config = { ...DEFAULT_CONFIG, ignore: ["**/vendor/**"] };
    expect(() => scan(root, { config })).toThrow(/incomplete scan/);
  });

  it("returns a complete CLI report when only the ignored tree exceeds limits", async () => {
    const root = project();
    skill(root, "review");
    fs.mkdirSync(path.join(root, "vendor/a/b/c/d/e/f/g/h/i/j"), { recursive: true });
    fs.writeFileSync(path.join(root, ".skillcrit.json"), JSON.stringify({ ignore: ["**/vendor/**"] }));
    const result = await runCli(["scan", root, "--json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).coverage).toEqual({ complete: true, reasons: [] });
  });
});
