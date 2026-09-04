import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { lint } from "../src/lint.ts";
import { loadConfig, matchesIgnore, severityFor } from "../src/config.ts";
import { scan } from "../src/scan.ts";
import { runCli } from "./support/cli.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const estate = path.join(root, "fixtures/repos/estate");
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
  temps.length = 0;
});

function withConfig(config: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-config-"));
  temps.push(dir);
  fs.writeFileSync(
    path.join(dir, ".skillcrit.json"),
    JSON.stringify(config, null, 2)
  );
  return dir;
}

describe("config", () => {
  it("falls back to defaults when no .skillcrit.json exists", () => {
    const { config } = loadConfig(path.join(os.tmpdir(), "no-such-dir-here"));
    expect(config.failOn).toBe("warning");
    expect(config.budget.bodyTokens).toBe(5000);
    expect(config.source).toBeNull();
  });

  it("re-grades and switches off rules by ID", () => {
    const dir = withConfig({ rules: { SC1010: "error", SC4001: "off" } });
    const { config } = loadConfig(dir);
    expect(severityFor(config, "SC1010")).toBe("error");
    expect(severityFor(config, "SC4001")).toBeNull();
  });

  it("warns about a typo instead of silently ignoring it", () => {
    const dir = withConfig({ rules: { SC9999: "error" }, failOnn: "error" });
    const { warnings } = loadConfig(dir);
    expect(warnings.join(" ")).toMatch(/SC9999/);
    expect(warnings.join(" ")).toMatch(/failOnn/);
  });

  it("drops a switched-off rule from the report entirely", () => {
    const dir = withConfig({ rules: { SC4001: "off", SC4005: "off" } });
    const { config } = loadConfig(dir);
    const report = lint(scan(estate), config);
    const ids = report.findings.map((f) => f.id);
    expect(ids).not.toContain("SC4001");
    expect(ids).not.toContain("SC4005");
    expect(ids).toContain("SC4003");
  });

  it("raises the always-on token budget to a warning when exceeded", () => {
    const dir = withConfig({ budget: { alwaysOnTokens: 1 } });
    const { config } = loadConfig(dir);
    const total = lint(scan(estate), config).findings.find(
      (f) => f.id === "SC2004"
    );
    expect(total?.severity).toBe("warning");
    expect(total?.message).toMatch(/over the configured budget/);
  });

  it("skips ignored paths during the scan", () => {
    const dir = withConfig({ ignore: ["**/risky-fetch/**"] });
    const { config } = loadConfig(dir);
    const names = scan(estate, { config }).map((s) => s.name);
    expect(names).not.toContain("risky-fetch");
    expect(names).toContain("report-writer");
  });

  it("matches ignore patterns on both path separators", () => {
    expect(matchesIgnore("C:\\home\\.claude\\skills\\foo\\SKILL.md", ["**/foo/**"])).toBe(
      true
    );
    expect(matchesIgnore("/home/.claude/skills/foo/SKILL.md", ["**/foo/**"])).toBe(true);
    expect(matchesIgnore("/home/.claude/skills/bar/SKILL.md", ["**/foo/**"])).toBe(false);
  });
});

describe("severity gate", () => {
  it("exits 1 on warnings by default and 0 with --fail-on error", async () => {
    const warned = await runCli(["lint", estate, "--format", "json"]);
    expect(warned.status).toBe(1);
    const gated = await runCli(["lint", estate, "--format", "json", "--fail-on", "error"]);
    expect(gated.status).toBe(0);
  });

  it("rejects an unknown --format or --fail-on with the usage code", async () => {
    expect((await runCli(["lint", estate, "--format", "xml"])).status).toBe(2);
    expect((await runCli(["lint", estate, "--fail-on", "loud"])).status).toBe(2);
  });

  it("fails the run when an explicitly named config is missing", async () => {
    const result = await runCli([
      "lint",
      estate,
      "--config",
      path.join(os.tmpdir(), "skillcrit-nope.json")
    ]);
    expect(result.status).toBe(3);
    expect(result.stderr).toMatch(/config not found/);
  });
});
