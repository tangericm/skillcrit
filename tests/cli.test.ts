import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stacked = path.join(root, "fixtures/repos/stacked");
const cli = path.join(root, "src/cli.ts");

function run(args: string[]) {
  return spawnSync("npx", ["tsx", cli, ...args], {
    encoding: "utf8",
    cwd: root
  });
}

describe("cli", () => {
  it("prints a JSON inventory for scan", () => {
    const result = run(["scan", stacked, "--json"]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.skills.length).toBeGreaterThan(0);
    expect(payload.skills.map((s: { name: string }) => s.name)).toContain(
      "tdd-kit"
    );
  });

  it("prints lint findings as JSON", () => {
    const result = run(["lint", stacked, "--json"]);
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
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.results[0].task).toBe("add-greet");
  });
});
