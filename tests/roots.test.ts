import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatRoots, listSkillLocations, LOCATION_SPECS } from "../src/roots.ts";

describe("roots", () => {
  it("documents project and user locations for major harnesses", () => {
    const harnesses = new Set(LOCATION_SPECS.map((s) => s.harness));
    for (const name of [
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
    ]) {
      expect(harnesses.has(name as never)).toBe(true);
    }
    expect(LOCATION_SPECS.some((s) => s.scope === "user" && s.rel === ".qwen/skills")).toBe(
      true
    );
    expect(
      LOCATION_SPECS.some((s) => s.scope === "user" && s.rel === ".hermes/skills")
    ).toBe(true);
    expect(
      LOCATION_SPECS.some((s) => s.scope === "user" && s.rel === ".pi/agent/skills")
    ).toBe(true);
    expect(
      LOCATION_SPECS.some((s) => s.scope === "admin" && s.rel === "/etc/codex/skills")
    ).toBe(true);
  });

  it("marks existing project skill dirs", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-roots-"));
    fs.mkdirSync(path.join(tmp, ".qwen", "skills"), { recursive: true });
    const locations = listSkillLocations(tmp, { user: true });
    const qwen = locations.find(
      (l) => l.scope === "project" && l.harness === "qwen"
    );
    expect(qwen?.exists).toBe(true);
    expect(qwen?.path).toBe(path.join(tmp, ".qwen", "skills"));
    const userQwen = locations.find(
      (l) => l.scope === "user" && l.harness === "qwen"
    );
    expect(userQwen?.path).toBe(path.join(os.homedir(), ".qwen", "skills"));
    expect(formatRoots(locations)).toMatch(/qwen/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
