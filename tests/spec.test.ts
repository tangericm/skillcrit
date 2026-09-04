import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { scan } from "../src/scan.ts";
import type { RuleId } from "../src/rules.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const estate = path.join(root, "fixtures/repos/estate");
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
  temps.length = 0;
});

function project(name: string, frontmatter: string, body = "# body\n"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-spec-"));
  temps.push(dir);
  const skillDir = path.join(dir, "skills", name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\n${frontmatter}\n---\n\n${body}`
  );
  return dir;
}

function ids(dir: string): RuleId[] {
  return scan(dir).flatMap((skill) => skill.specFindings.map((f) => f.id));
}

describe("Agent Skills spec conformance", () => {
  it("accepts a conformant skill with no findings", () => {
    const dir = project(
      "tidy-csv",
      [
        "name: tidy-csv",
        "description: Tidies messy CSV exports into RFC 4180. Use when the user asks to clean a CSV.",
        "license: MIT",
        "compatibility: Requires Node 22+",
        "metadata:",
        '  version: "1.2.0"'
      ].join("\n")
    );
    expect(ids(dir)).toEqual([]);
  });

  it("flags a missing description as an error, since clients skip the skill", () => {
    const dir = project("no-desc", "name: no-desc");
    const finding = scan(dir)[0].specFindings.find((f) => f.id === "SC1005");
    expect(finding?.severity).toBe("error");
  });

  it("warns rather than errors when the name does not match the folder", () => {
    const dir = project(
      "folder-name",
      "name: other-name\ndescription: Does a thing. Use when the user asks for it."
    );
    const finding = scan(dir)[0].specFindings.find((f) => f.id === "SC1002");
    expect(finding?.severity).toBe("warning");
  });

  it("catches non-string metadata and unrecognized frontmatter keys", () => {
    const found = ids(estate);
    expect(found).toContain("SC1008");
    expect(found).toContain("SC1010");
  });

  it("flags an over-long compatibility string", () => {
    const dir = project(
      "long-compat",
      `name: long-compat\ndescription: Does a thing. Use when the user asks for it.\ncompatibility: ${"x".repeat(600)}`
    );
    expect(ids(dir)).toContain("SC1007");
  });

  it("flags allowed-tools that is not a single string", () => {
    const dir = project(
      "tool-list",
      "name: tool-list\ndescription: Does a thing. Use when the user asks for it.\nallowed-tools:\n  - Read\n  - Bash"
    );
    expect(ids(dir)).toContain("SC1009");
  });

  it("reports a body over the instruction budget with the token count", () => {
    const dir = project(
      "fat-body",
      "name: fat-body\ndescription: Does a thing. Use when the user asks for it.",
      `${"lorem ipsum dolor sit amet ".repeat(1200)}\n`
    );
    const skill = scan(dir)[0];
    expect(skill.bodyTokens).toBeGreaterThan(5000);
    const finding = skill.specFindings.find((f) => f.id === "SC2001");
    expect(finding?.message).toMatch(/instruction budget/);
  });

  it("anchors a frontmatter finding to its line", () => {
    const dir = project(
      "bad-name-line",
      "name: Bad_Name\ndescription: Does a thing. Use when the user asks for it."
    );
    const finding = scan(dir)[0].specFindings.find((f) => f.id === "SC1004");
    expect(finding?.line).toBe(2);
  });

  it("loads a skill whose description contains an unquoted colon", () => {
    // js-yaml rejects this, but other clients accept it, so dropping the skill
    // would make the inventory wrong rather than strict.
    const skill = scan(estate).find((s) => s.name === "colon-desc");
    expect(skill).toBeDefined();
    expect(skill!.description).toMatch(/reconcile invoices/);
    expect(skill!.specFindings.map((f) => f.id)).not.toContain("SC1011");
  });

  it("records a content hash and body size for every skill", () => {
    for (const skill of scan(estate)) {
      expect(skill.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(skill.bodyLines).toBeGreaterThan(0);
    }
  });
});
