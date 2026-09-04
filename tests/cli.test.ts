import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { main } from "../src/command.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stacked = path.join(root, "fixtures/repos/stacked");

/**
 * Call main() in-process. The process entry (`src/cli.ts`) always invokes
 * main; tests import this module so they do not spawn tsx.
 */
async function run(args: string[]) {
  const captured = { stdout: "", stderr: "" };
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  const tap =
    (store: "stdout" | "stderr"): typeof process.stdout.write =>
    (chunk, encoding, cb) => {
      captured[store] += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      const done = typeof encoding === "function" ? encoding : cb;
      done?.();
      return true;
    };
  process.stdout.write = tap("stdout");
  process.stderr.write = tap("stderr");
  try {
    const status = await main(["node", "skillcrit", ...args]);
    return { status, stdout: captured.stdout, stderr: captured.stderr };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

describe("cli", () => {
  it("prints a JSON inventory for scan", async () => {
    const result = await run(["scan", stacked, "--json"]);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.skills.length).toBeGreaterThan(0);
    expect(payload.skills.map((s: { name: string }) => s.name)).toContain(
      "tdd-kit"
    );
  });

  it("prints lint findings as JSON", async () => {
    const result = await run(["lint", stacked, "--json"]);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.findings.length).toBeGreaterThan(0);
  });

  it("runs eval with the stub adapter", async () => {
    const pack = path.join(stacked, ".agents/skills/tdd-kit");
    const result = await run([
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
    const result = await run(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/skillcrit scan/);
  });

  it("prints the package version", async () => {
    const result = await run(["--version"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^skillcrit 0\.3\.0\n$/);
    const dashV = await run(["-V"]);
    expect(dashV.stdout).toBe(result.stdout);
  });

  it("prints a cleanup plan with --fix", async () => {
    const result = await run(["lint", stacked, "--fix"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/skillcrit cleanup plan/);
    expect(result.stdout).toMatch(/keep:/);
    expect(result.stdout).not.toMatch(/"findings"/);
  });

  it("includes cleanup actions in JSON lint output", async () => {
    const result = await run(["lint", stacked, "--json"]);
    const payload = JSON.parse(result.stdout);
    expect(Array.isArray(payload.cleanup)).toBe(true);
    expect(payload.cleanup.length).toBeGreaterThan(0);
    expect(payload.unique).toBeLessThanOrEqual(payload.scanned);
  });
});
