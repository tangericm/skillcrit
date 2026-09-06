import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/scan.ts";
import { lint } from "../src/lint.ts";
import { RULES } from "../src/rules.ts";

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("scan coverage", () => {
  it("rejects missing and non-directory targets", () => {
    const root = fixture("---\nname: skill\n---\nBody");
    expect(() => scan(path.join(root, "absent"))).toThrow();
    expect(() => scan(path.join(root, "skill/SKILL.md"))).toThrow();
  });

  it("reports the actual directory bound and never silently returns partial data", () => {
    const root = fixture("---\nname: skill\n---\nBody");
    const reasons: string[] = [];
    expect(scan(root, { maxDirs: 1, onTruncated: r => reasons.push(r) })).toEqual([]);
    expect(reasons.join(" ")).toMatch(/after 1 directories/);
    expect(() => scan(root, { maxDirs: 1 })).toThrow(/incomplete/i);
  });

  it("does not count absent or already visited roots against an exact bound", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-hardening-"));
    temps.push(root);
    expect(scan(root, { maxDirs: 1, extraRoots: [root] })).toHaveLength(0);
  });

  it.each(["license: [MIT]", "license: 42", "license: null", "compatibility: {os: linux}"])("rejects non-string optional fields: %s", field => {
    const root = fixture(`---\nname: skill\ndescription: Use when testing\n${field}\n---\nBody`);
    expect(scan(root)[0].specFindings.some(f => f.severity === "error")).toBe(true);
  });

  it("bounds skill file reads and reports skipped oversized files", () => {
    const root = fixture("x".repeat(1024 * 1024 + 1));
    const reasons: string[] = [];
    expect(scan(root, { onTruncated: r => reasons.push(r) }).length).toBe(0);
    expect(reasons.join(" ")).toMatch(/size|bytes|large/i);
  });

  it("retains valid skills when commands is a file, reporting incomplete inventory", () => {
    const root = fixture("---\nname: skill\ndescription: Use when testing\n---\nBody");
    fs.writeFileSync(path.join(root, "plugin.json"), '{"name":"pack"}');
    fs.writeFileSync(path.join(root, "commands"), "not a directory");
    const reasons: string[] = [];
    expect(scan(root, { onTruncated: r => reasons.push(r) })).toHaveLength(1);
    expect(reasons.join(" ")).toMatch(/commands/);
  });

  it("reports malformed manifests instead of silently losing package metadata", () => {
    const root = fixture("---\nname: skill\ndescription: Use when testing\n---\nBody");
    fs.mkdirSync(path.join(root, ".claude-plugin"));
    fs.writeFileSync(path.join(root, ".claude-plugin/plugin.json"), "{");
    const reasons: string[] = [];
    expect(scan(root, { onTruncated: r => reasons.push(r) })).toHaveLength(1);
    expect(reasons.join(" ")).toMatch(/metadata|manifest/);
  });

  it("reports oversized bundled scripts in coverage", () => {
    const root = fixture("---\nname: skill\ndescription: Use when testing\n---\nBody");
    fs.writeFileSync(path.join(root, "skill/large.js"), " ".repeat(512 * 1024 + 1));
    const reasons: string[] = [];
    expect(scan(root, { onTruncated: r => reasons.push(r) })).toHaveLength(1);
    expect(reasons.join(" ")).toMatch(/script.*limit/);
  });

  it("marks a non-regular SKILL.md entry incomplete", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-hardening-"));
    temps.push(root);
    fs.mkdirSync(path.join(root, "SKILL.md"));
    const reasons: string[] = [];
    expect(scan(root, { onTruncated: r => reasons.push(r) })).toHaveLength(0);
    expect(reasons.join(" ")).toMatch(/regular|SKILL.md/);
  });

  it("completes exactly 64 scripts with trailing non-script files, but reports a 65th", () => {
    const root = fixture("---\nname: skill\ndescription: Use when testing\n---\nBody");
    for (let i = 0; i < 64; i++) fs.writeFileSync(path.join(root, `skill/a${i}.js`), "// empty");
    fs.writeFileSync(path.join(root, "skill/z-notes.txt"), "notes");
    expect(scan(root)).toHaveLength(1);
    fs.writeFileSync(path.join(root, "skill/z-extra.js"), "// empty");
    const reasons: string[] = [];
    expect(scan(root, { onTruncated: r => reasons.push(r) })).toHaveLength(1);
    expect(reasons.join(" ")).toMatch(/64 files/);
  });
});
function fixture(raw: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-hardening-"));
  temps.push(dir);
  fs.mkdirSync(path.join(dir, "skill"));
  fs.writeFileSync(path.join(dir, "skill/SKILL.md"), raw);
  return dir;
}

describe("data-only frontmatter", () => {
  it.each(["js", "javascript", " javascript", "json", "yaml"])("rejects engine selector %s without executing it", (tag) => {
    const marker = "__skillcritDataOnlyProbe";
    Reflect.set(globalThis, marker, false);
    try {
      const root = fixture(`---${tag}\n(globalThis.${marker} = true, {name: 'skill', description: 'Use when testing'})\n---\nRead input.`);
      const record = scan(root)[0];
      expect(Reflect.get(globalThis, marker)).toBe(false);
      expect(record.specFindings.some(f => f.id === "SC1011")).toBe(true);
    } finally {
      Reflect.deleteProperty(globalThis, marker);
    }
  });

  it.each(["null", "hello", "[one, two]", "name: {toString: invalid}\ndescription: Use when testing", "name: [skill]\ndescription: [Use when testing]"])("reports malformed metadata without coercion or a crash: %s", (yaml) => {
    const root = fixture(`---\n${yaml}\n---\nBody`);
    const first = scan(root);
    expect(first[0].specFindings.some(f => f.severity === "error")).toBe(true);
    expect(scan(root)).toEqual(first);
  });

  it("accepts BOM/CRLF YAML and reports unterminated frontmatter", () => {
    expect(scan(fixture("\uFEFF---\r\nname: skill\r\ndescription: Use when testing\r\n---\r\nBody"))[0].specFindings).toEqual([]);
    expect(scan(fixture("---\nname: skill\ndescription: Use when testing"))[0].specFindings.some(f => f.id === "SC1011")).toBe(true);
  });

  it("never recommends relocating executable client controls into metadata", () => {
    const report = lint(scan(fixture("---\nname: skill\ndescription: Use when testing\ncontext: fork\ndisable-model-invocation: true\n---\nBody")));
    expect(report.findings.filter(f => f.id === "SC1010")).toHaveLength(2);
    expect(RULES.SC1010.remediation).not.toMatch(/move.*metadata/i);
    expect(RULES.SC1010.remediation).toMatch(/client/i);
  });
});
