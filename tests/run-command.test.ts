import { describe, expect, it } from "vitest";
import { runCommand } from "../src/run-command.ts";

describe("runCommand", () => {
  it("spawns npm (a .cmd shim on Windows) and returns an exit code", () => {
    const result = runCommand("npm", ["--version"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+/);
  });

  it("spawns node without a shell and returns an exit code", () => {
    const result = runCommand(
      process.execPath,
      ["-e", "process.exit(0)"],
      { shell: false }
    );
    expect(result.status).toBe(0);
  });
});
