import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli } from "./support/cli.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stacked = path.join(root, "fixtures/repos/stacked");
const estate = path.join(root, "fixtures/repos/estate");
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
) as { version: string };

describe("cli", () => {
  it.each(["--tasks", "--agent", "--out", "--format", "--fail-on", "--config", "--repeat"])(
    "rejects a missing value for %s before running a command", async (option) => {
      for (const suffix of [[option], [option, "--user"], [`${option}=`]]) {
        const result = await runCli(["lint", estate, ...suffix]);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain(`${option} requires a value`);
      }
    }
  );

  it("rejects values assigned to boolean flags", async () => {
    const result = await runCli(["scan", estate, "--user=false"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--user does not take a value");
  });

  it("prints a JSON inventory for scan", async () => {
    const result = await runCli(["scan", stacked, "--json"]);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.skills.length).toBeGreaterThan(0);
    expect(payload.skills.map((s: { name: string }) => s.name)).toContain(
      "tdd-kit"
    );
  });

  it("prints lint findings as JSON", async () => {
    const result = await runCli(["lint", stacked, "--json"]);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.findings.length).toBeGreaterThan(0);
  });

  it("runs eval with the stub adapter", async () => {
    const pack = path.join(stacked, ".agents/skills/tdd-kit");
    const result = await runCli([
      "eval",
      pack,
      "--tasks",
      path.join(root, "fixtures/tasks"),
      "--agent",
      "stub",
      "--json"
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.results[0].task).toBe("add-greet");
  });

  it("prints usage for --help and exits 0", async () => {
    const result = await runCli(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/skillcrit scan/);
  });

  it("prints the package version", async () => {
    const result = await runCli(["--version"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`skillcrit ${pkg.version}\n`);
    const dashV = await runCli(["-V"]);
    expect(dashV.stdout).toBe(result.stdout);
  });

  it("prints a cleanup plan with --fix", async () => {
    const result = await runCli(["lint", stacked, "--fix", "--out", "-"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/skillcrit cleanup/);
    expect(result.stdout).toMatch(/\*\*Keep\*\*/);
    expect(result.stdout).toMatch(/\*\*Orphans\*\*/);
    expect(result.stdout).toMatch(/skillcrit summary/);
    expect(result.stdout).toMatch(/## questions/);
    expect(result.stdout).not.toMatch(/"findings"/);
  });

  it("includes cleanup actions in JSON lint output", async () => {
    const result = await runCli(["lint", stacked, "--json"]);
    const payload = JSON.parse(result.stdout);
    expect(Array.isArray(payload.cleanup)).toBe(true);
    expect(payload.cleanup.length).toBeGreaterThan(0);
    expect(payload.cleanup[0].keepDirs.length).toBeGreaterThan(0);
    expect(Array.isArray(payload.cleanup[0].orphans)).toBe(true);
    expect(payload.unique).toBeLessThanOrEqual(payload.scanned);
    expect(payload.questions.length).toBeGreaterThan(0);
    expect(payload.tokens.alwaysOnNow).toBeGreaterThan(0);
    expect(payload.tokens.saved).toBeGreaterThanOrEqual(0);
  });

  it("lists harness skill locations", async () => {
    const result = await runCli(["roots", stacked, "--json"]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    const harnesses = payload.locations.map((l: { harness: string }) => l.harness);
    expect(harnesses).toEqual(
      expect.arrayContaining([
        "agents",
        "claude",
        "cursor",
        "codex",
        "qwen",
        "gemini",
        "hermes",
        "pi",
        "opencode",
        "deepseek"
      ])
    );
    expect(
      payload.locations.some(
        (l: { rel: string; exists: boolean }) =>
          l.rel === ".agents/skills" && l.exists
      )
    ).toBe(true);
  });
});
