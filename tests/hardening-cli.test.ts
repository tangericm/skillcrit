import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_WALK_DEPTH } from "../src/scan.ts";
import { runCli } from "./support/cli.ts";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
  temps.length = 0;
});

function tempDirectory(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-hardening-cli-"));
  temps.push(dir);
  return dir;
}

function writeSkill(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "SKILL.md");
  fs.writeFileSync(file, `---\nname: ${path.basename(dir)}\ndescription: Use when converting a table into CSV.\n---\nConvert the supplied table into CSV.\n`);
  return file;
}

describe("CLI input failures", () => {
  it.each(["scan", "lint", "doctor", "inspect", "roots"].flatMap(
    (command) => ["missing", "file"].map((kind) => ({ command, kind }))
  ))(
    "$command rejects a $kind target with run-failed status", async ({ command, kind }) => {
      const dir = tempDirectory();
      const target = kind === "missing" ? path.join(dir, "missing") : writeSkill(path.join(dir, "csv"));
      const result = await runCli([command, target, "--json"]);
      expect(result.status, `${command} ${target}`).toBe(3);
      expect(result.stderr).toContain(target);
      expect(result.stdout).toBe("");
    }
  );

  it.each(["scan", "lint", "doctor", "inspect"])(
    "%s fails when automatically discovered config is malformed", async (command) => {
      const dir = tempDirectory();
      fs.writeFileSync(path.join(dir, ".skillcrit.json"), "{");
      const result = await runCli([command, dir, "--json"]);
      expect(result.status).toBe(3);
      expect(result.stderr).toMatch(/config.*JSON/i);
      expect(result.stdout).toBe("");
    }
  );

  it.each(["scan", "doctor", "inspect", "roots", "rules"].flatMap(
    (command) => ["markdown", "sarif", "github"].map((format) => ({ command, format }))
  ))(
    "$command rejects unsupported format $format", async ({ command, format }) => {
      const dir = tempDirectory();
      const args = command === "rules" ? [command] : [command, dir];
      const result = await runCli([...args, "--format", format]);
      expect(result.status, `${command} --format ${format}`).toBe(2);
      expect(result.stderr).toContain(format);
      expect(result.stdout).toBe("");
    }
  );

  it("honors rules --format json consistently with --json", async () => {
    const result = await runCli(["rules", "--format", "json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).rules.length).toBeGreaterThan(0);
  });
});

describe("CLI scan coverage", () => {
  it("fails a truncated lint run and exposes its incomplete coverage in JSON", async () => {
    const dir = tempDirectory();
    const deep = path.join(dir, ...Array.from({ length: MAX_WALK_DEPTH + 2 }, () => "d"), "csv");
    writeSkill(deep);
    const result = await runCli(["lint", dir, "--json", "--fail-on", "error"]);
    expect(result.status).toBe(3);
    const report = JSON.parse(result.stdout);
    expect(report.coverage.complete).toBe(false);
    expect(report.coverage.reasons.length).toBeGreaterThan(0);
    expect(JSON.stringify(report.coverage.reasons)).toMatch(/depth/i);
    expect(result.stderr).toMatch(/depth/i);
  });

  it("marks a fully traversed lint result as complete", async () => {
    const result = await runCli(["lint", tempDirectory(), "--json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).coverage).toEqual({ complete: true, reasons: [] });
  });
});
