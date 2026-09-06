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

  it.each(["regular file", "hard link", "symbolic link", "dangling symbolic link"])(
    "preserves an existing output destination that is a %s",
    async (kind, context) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-output-alias-"));
      const target = path.join(dir, "package.json");
      const out = path.join(dir, "cleanup.md");
      const original = '{"name":"do-not-overwrite"}\n';
      try {
        if (kind !== "dangling symbolic link") fs.writeFileSync(target, original);
        if (kind === "regular file") fs.writeFileSync(out, "Existing user notes\n");
        else if (kind === "hard link") fs.linkSync(target, out);
        else {
          try {
            fs.symlinkSync(target, out, "file");
          } catch (error) {
            if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") {
              context.skip("Windows file symlinks require Developer Mode or elevation");
              return;
            }
            throw error;
          }
        }
        const before = fs.lstatSync(out);
        const result = await runCli(["lint", stacked, "--fix", "--out", out]);
        expect(result.status).toBe(3);
        expect(result.stderr).toMatch(/already exists|refusing to overwrite/i);
        expect(fs.lstatSync(out).ino).toBe(before.ino);
        if (kind === "dangling symbolic link") expect(fs.existsSync(target)).toBe(false);
        else expect(fs.readFileSync(target, "utf8")).toBe(original);
        if (kind === "regular file") expect(fs.readFileSync(out, "utf8")).toBe("Existing user notes\n");
        if (before.isSymbolicLink()) expect(fs.readlinkSync(out)).toBe(target);
        expect(fs.readdirSync(dir).sort()).toEqual(kind === "dangling symbolic link"
          ? ["cleanup.md"] : ["cleanup.md", "package.json"]);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  );

  it.each(["SKILL.md", "package.json", "LICENSE", ".env"])(
    "refuses to create a protected output named %s",
    async name => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-output-protected-"));
      try {
        const out = path.join(dir, name);
        const result = await runCli(["lint", stacked, "--fix", "--out", out]);
        expect(result.status).toBe(3);
        expect(fs.existsSync(out)).toBe(false);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  );

  it.runIf(process.platform === "win32").each([
    "package.json:cleanup.md", "new-file:cleanup.md", "package.json.", "LICENSE ", "NUL", "CON.md"
  ])("refuses Windows special output path %s", async name => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-output-windows-"));
    try {
      const pkg = path.join(dir, "package.json");
      const original = '{"name":"protected-project"}\n';
      fs.writeFileSync(pkg, original);
      const result = await runCli(["lint", stacked, "--fix", "--out", path.join(dir, name)]);
      expect(result.status).toBe(3);
      expect(fs.readFileSync(pkg, "utf8")).toBe(original);
      expect(fs.readdirSync(dir)).toEqual(["package.json"]);
      if (name.includes(":")) expect(fs.existsSync(path.join(dir, name))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
