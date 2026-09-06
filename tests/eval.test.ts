import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stubAdapter } from "../src/adapters/stub.ts";
import { evalPack } from "../src/eval.ts";

const tasksDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/tasks"
);
const packDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/repos/stacked/.agents/skills/tdd-kit"
);

describe("evalPack", () => {
  it("scores skill on vs off for a frozen coding task", async () => {
    const summary = await evalPack({
      tasksDir,
      packDir,
      adapter: stubAdapter
    });

    expect(summary.results).toHaveLength(1);
    const row = summary.results[0];
    expect(row.task).toBe("add-greet");
    expect(row.off.testsPassed).toBe(true);
    expect(row.on.testsPassed).toBe(true);
    expect(row.on.linesAdded).toBeLessThan(row.off.linesAdded);
    expect(row.on.overbuild).toBeLessThan(row.off.overbuild);
  });

  it("summarizes whether the pack reduced overbuild", async () => {
    const summary = await evalPack({
      tasksDir,
      packDir,
      adapter: stubAdapter
    });
    expect(summary.overbuildDelta).toBeLessThan(0);
    expect(summary.testsOn).toBe(1);
    expect(summary.testsOff).toBe(1);
  });
});
