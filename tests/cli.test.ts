import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stacked = path.join(root, "fixtures/repos/stacked");

/**
 * Call main() in-process. Spawning the tsx CLI on Windows starts a wrapper
 * process that exits 0 with empty stdout; the real CLI runs as a child whose
 * pipes we never see (scan JSON is empty, lint looks like a clean 0).
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
});
