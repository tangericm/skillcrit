import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SkillRecord } from "../src/types.ts";
import { cleanupPlan, lint } from "../src/lint.ts";
import { scan } from "../src/scan.ts";
import { makeRecord } from "./support/record.ts";
import { runCli } from "./support/cli.ts";

const stacked = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/repos/stacked"
);

function rec(
  name: string,
  dir: string,
  extra: Partial<SkillRecord> = {}
): SkillRecord {
  return makeRecord({ name, skillDir: dir, hash: `${name}:${dir}`, ...extra });
}

describe("cleanup markdown", () => {
  it("lists the preferred directory and alternatives for duplicate review", () => {
    const keep = rec("csv-transform", "/tmp/live", {
      origin: "project",
      version: "2.0.0",
      body: "same",
      hash: "same-skill-file"
    });
    const orphan = rec("csv-transform", "/tmp/old-copy", {
      origin: "user",
      version: "2.0.0",
      body: "same",
      hash: "same-skill-file"
    });
    const md = cleanupPlan(lint([keep, orphan]));
    expect(md).toMatch(/^# skillcrit cleanup/m);
    expect(md).toMatch(/dry-run/i);
    expect(md).toMatch(/\*\*Keep\*\*/);
    expect(md).toMatch(/\*\*Alternatives\*\*/);
    expect(md).toMatch(/\/tmp\/live/);
    expect(md).toMatch(/\/tmp\/old-copy/);
    expect(md).toMatch(/project/);
    expect(md).toMatch(/identical instructions/i);
    expect(md).not.toMatch(/no files deleted[\s\S]*rm /);
  });

  it("keeps the higher-rank version as super and labels the older orphan", () => {
    const md = cleanupPlan(
      lint([
        rec("csv-transform", "/tmp/v1", {
          version: "1.0.0",
          origin: "user",
          description: "v1 csv",
          body: "a"
        }),
        rec("csv-transform", "/tmp/v2", {
          version: "2.0.0",
          origin: "user",
          description: "v2 csv",
          body: "b"
        })
      ])
    );
    const keepAt = md.indexOf("/tmp/v2");
    const dropAt = md.indexOf("/tmp/v1");
    expect(keepAt).toBeGreaterThan(-1);
    expect(dropAt).toBeGreaterThan(-1);
    expect(keepAt).toBeLessThan(dropAt);
    expect(md).toMatch(/@2\.0\.0/);
    expect(md).toMatch(/older|@1\.0\.0/);
  });

  it("lists spec findings with their severity for review", () => {
    const md = cleanupPlan(lint(scan(stacked)));
    expect(md).toMatch(/## Spec findings to review/);
    expect(md).toMatch(/bad-name/);
  });

  it("writes only the markdown file and refuses to overwrite package.json", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-cleanup-doc-"));
    const out = path.join(dir, "skillcrit-cleanup.md");
    const pkg = path.join(dir, "package.json");
    fs.writeFileSync(pkg, '{"name":"app"}\n');
    const result = await runCli(["lint", stacked, "--fix", "--out", out]);
    expect(result.status).toBe(1);
    expect(fs.readFileSync(out, "utf8")).toMatch(/\*\*Keep\*\*/);
    expect(fs.readFileSync(out, "utf8")).toMatch(/\*\*Alternatives\*\*/);
    expect(fs.readFileSync(pkg, "utf8")).toBe('{"name":"app"}\n');

    // A refused write is a run failure (exit 3), reported on stderr — not a
    // rejected promise, so a caller can branch on the code.
    const refused = await runCli(["lint", stacked, "--fix", "--out", pkg]);
    expect(refused.status).toBe(3);
    expect(refused.stderr).toMatch(/refusing to write cleanup doc over package\.json/);
    expect(fs.readFileSync(pkg, "utf8")).toBe('{"name":"app"}\n');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
