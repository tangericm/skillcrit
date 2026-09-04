import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommand } from "../src/run-command.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stacked = path.join(root, "fixtures/repos/stacked");
const cli = path.join(root, "src/cli.ts");
const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));

function run(args: string[]) {
  // Spawn node + tsx directly. `npx` is a .cmd shim on Windows and
  // spawnSync("npx") returns status null without a shell.
  return runCommand(process.execPath, [tsxCli, cli, ...args], {
    cwd: root,
    shell: false
  });
}

describe("cli", () => {
  it("prints a JSON inventory for scan", () => {
    const result = run(["scan", stacked, "--json"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.skills.length).toBeGreaterThan(0);
    expect(payload.skills.map((s: { name: string }) => s.name)).toContain(
      "tdd-kit"
    );
  });

  it("prints lint findings as JSON", () => {
    const result = run(["lint", stacked, "--json"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload.findings.length).toBeGreaterThan(0);
  });

  it("runs eval with the stub adapter", () => {
    const pack = path.join(stacked, ".agents/skills/tdd-kit");
    const result = run([
      "eval",
      pack,
      "--tasks",
      path.join(root, "fixtures/tasks"),
      "--agent",
      "stub",
      "--json"
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.results[0].task).toBe("add-greet");
  });
});
