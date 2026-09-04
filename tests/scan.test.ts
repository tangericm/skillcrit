import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scan } from "../src/scan.ts";

const stacked = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/repos/stacked"
);

describe("scan", () => {
  it("finds SKILL.md files under project skill and plugin directories", () => {
    const skills = scan(stacked);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(
      [
        "Bad_Name",
        "alpha-status",
        "beta-status",
        "noisy-senior",
        "session-loop",
        "tdd-kit",
        "unique-csv"
      ].sort()
    );
  });

  it("marks always-on skills from body phrasing and plugin hooks", () => {
    const skills = scan(stacked);
    const noisy = skills.find((s) => s.name === "noisy-senior");
    const alpha = skills.find((s) => s.name === "alpha-status");
    const csv = skills.find((s) => s.name === "unique-csv");
    expect(noisy?.alwaysOn).toBe(true);
    expect(alpha?.hooks).toBe(true);
    expect(csv?.alwaysOn).toBe(false);
  });

  it("collects slash commands from plugin command files", () => {
    const skills = scan(stacked);
    const alpha = skills.find((s) => s.name === "alpha-status");
    const betaPackCommands = skills
      .filter((s) => s.pack === "beta-pack")
      .flatMap((s) => s.commands);
    expect(alpha?.commands).toContain("status");
    expect(betaPackCommands).toContain("status");
  });

  it("records spec issues when the name does not match the folder", () => {
    const skills = scan(stacked);
    const bad = skills.find((s) => s.skillDir.endsWith("bad-name"));
    expect(bad?.specIssues.some((issue) => /name/i.test(issue))).toBe(true);
  });

  it("estimates always-loaded tokens from the description", () => {
    const skills = scan(stacked);
    const csv = skills.find((s) => s.name === "unique-csv");
    expect(csv?.descriptionTokens).toBeGreaterThan(0);
    expect(csv?.descriptionTokens).toBe(
      Math.ceil((csv?.description.length ?? 0) / 4)
    );
  });

  it("does not attribute fixture skills to this repo's marketplace pack", () => {
    const tdd = scan(stacked).find((s) => s.name === "tdd-kit");
    const alpha = scan(stacked).find((s) => s.name === "alpha-status");
    expect(tdd?.pack).not.toBe("skillcrit");
    expect(alpha?.pack).toBe("alpha-pack");
  });

  it("does not walk node_modules when scanning", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-scan-"));
    const realDir = path.join(tmp, "skills", "real");
    const junkDir = path.join(tmp, "node_modules", "foo");
    fs.mkdirSync(realDir, { recursive: true });
    fs.mkdirSync(junkDir, { recursive: true });
    const body = `---
name: real
description: Unique skill for converting tables to RFC 4180 CSV only.
---
# real
`;
    fs.writeFileSync(path.join(realDir, "SKILL.md"), body);
    fs.writeFileSync(
      path.join(junkDir, "SKILL.md"),
      `---
name: foo
description: should not be scanned
---
`
    );
    const names = scan(tmp).map((s) => s.name);
    expect(names).toEqual(["real"]);
  });

  it("skips cache, marketplaces, and fixtures directories", () => {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      ".."
    );
    expect(scan(repoRoot).map((s) => s.name)).not.toContain("tdd-kit");
    expect(scan(repoRoot).some((s) => s.name === "skillcrit")).toBe(true);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-skip-"));
    const keep = path.join(tmp, "skills", "keep");
    const cache = path.join(tmp, "cache", "caveman");
    const market = path.join(tmp, "marketplaces", "caveman");
    fs.mkdirSync(keep, { recursive: true });
    fs.mkdirSync(cache, { recursive: true });
    fs.mkdirSync(market, { recursive: true });
    const body = `---
name: keep
description: Unique keep skill for converting tables to RFC 4180 CSV only.
---
`;
    const junk = `---
name: caveman
description: should not be scanned from cache
---
`;
    fs.writeFileSync(path.join(keep, "SKILL.md"), body);
    fs.writeFileSync(path.join(cache, "SKILL.md"), junk);
    fs.writeFileSync(path.join(market, "SKILL.md"), junk);
    expect(scan(tmp).map((s) => s.name)).toEqual(["keep"]);
  });
});
