import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommand } from "../src/run-command.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "src/cli.ts");

describe("cli process entry", () => {
  it("prints usage when executed as a process", () => {
    const result = runCommand(
      process.execPath,
      ["--import", "tsx", cli, "--help"],
      { cwd: root, shell: false }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/skillcrit scan/);
  });

  it("scan writes inventory to stdout", () => {
    const stacked = path.join(root, "fixtures/repos/stacked");
    const result = runCommand(
      process.execPath,
      ["--import", "tsx", cli, "scan", stacked],
      { cwd: root, shell: false }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/tdd-kit/);
    expect(result.stdout).not.toBe("");
  });
});
