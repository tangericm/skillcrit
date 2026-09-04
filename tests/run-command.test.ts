import { describe, expect, it } from "vitest";
import { runCommand } from "../src/run-command.ts";

function dep0190During(fn: () => void): string[] {
  const codes: string[] = [];
  const onWarning = (warning: Error & { code?: string }) => {
    if (warning.code === "DEP0190") codes.push(warning.code);
  };
  process.on("warning", onWarning);
  try {
    fn();
  } finally {
    process.off("warning", onWarning);
  }
  return codes;
}

describe("runCommand", () => {
  it("spawns npm (a .cmd shim on Windows) and returns an exit code", () => {
    let result: ReturnType<typeof runCommand> | undefined;
    const dep0190 = dep0190During(() => {
      result = runCommand("npm", ["--version"]);
    });
    expect(dep0190).toEqual([]);
    expect(result?.error).toBeUndefined();
    expect(result?.status).toBe(0);
    expect(result?.stdout).toMatch(/\d+\.\d+/);
  });

  it("spawns node without a shell and returns an exit code", () => {
    const result = runCommand(process.execPath, ["-e", "process.exit(0)"], {
      shell: false
    });
    expect(result.status).toBe(0);
  });

  it("does not emit DEP0190 when shell is true", () => {
    let result: ReturnType<typeof runCommand> | undefined;
    const dep0190 = dep0190During(() => {
      result = runCommand(process.execPath, ["-e", "process.exit(0)"], {
        shell: true
      });
    });
    expect(dep0190).toEqual([]);
    expect(result?.status).toBe(0);
  });
});
