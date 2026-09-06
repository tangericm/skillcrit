import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "./support/cli.ts";

const dirs: string[] = [];
function fixture(body = "```sh\nrm -rf scratch\n```\n") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-history-")); dirs.push(root);
  const dir = path.join(root, ".agents/skills/example"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: example\ndescription: Convert astronomical catalogues to binary tables.\n---\n${body}`);
  return root;
}
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe("maintenance CLI", () => {
  it("saves a baseline exclusively and compares a relocated clone without waiving its gate", async () => {
    const root = fixture(); const baseline = path.join(root, "baseline.json");
    expect((await runCli(["lint", root, "--save-baseline", baseline, "--json"])).status).toBe(1);
    const original = fs.readFileSync(baseline, "utf8");
    expect((await runCli(["lint", root, "--save-baseline", baseline])).status).toBe(3);
    expect(fs.readFileSync(baseline, "utf8")).toBe(original);
    const clone = fixture();
    const result = await runCli(["lint", clone, "--baseline", baseline, "--json"]);
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.comparison.new).toEqual([]); expect(report.comparison.changed).toEqual([]);
    expect(report.comparison.unchanged.length).toBeGreaterThan(0);
  });

  it("dismisses one exact fingerprint with a reason, and changed evidence resurfaces with a stale entry", async () => {
    const root = fixture(); const baseline = path.join(root, "baseline.json"); const dismissals = path.join(root, "dismissals.json");
    const first = await runCli(["lint", root, "--save-baseline", baseline, "--json"]);
    const fingerprint = JSON.parse(first.stdout).findings.find((f: any) => f.id === "SC4004").fingerprint;
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect((await runCli(["dismiss", baseline, "--finding", fingerprint, "--out", dismissals])).status).toBe(2);
    expect((await runCli(["dismiss", baseline, "--finding", fingerprint, "--reason", "Reviewed scratch cleanup", "--out", dismissals])).status).toBe(0);
    const accepted = await runCli(["lint", root, "--dismissals", dismissals, "--json"]);
    expect(accepted.status).toBe(0);
    expect(JSON.parse(accepted.stdout).dismissals.applied[0].reason).toBe("Reviewed scratch cleanup");
    expect(JSON.parse(accepted.stdout).findings.find((f: any) => f.id === "SC4004").dismissal.reason).toBe("Reviewed scratch cleanup");
    fs.appendFileSync(path.join(root, ".agents/skills/example/SKILL.md"), "Additional instruction.\n");
    const changed = await runCli(["lint", root, "--baseline", baseline, "--dismissals", dismissals, "--json"]);
    expect(changed.status).toBe(1);
    expect(JSON.parse(changed.stdout).comparison.changed.length).toBeGreaterThan(0);
    expect(JSON.parse(changed.stdout).dismissals.stale).toHaveLength(1);
  });

  it("rejects invalid, oversized and incompatible history", async () => {
    const root = fixture(); const baseline = path.join(root, "baseline.json");
    await runCli(["lint", root, "--save-baseline", baseline]);
    const config = path.join(root, "custom.json"); fs.writeFileSync(config, JSON.stringify({ ignore: ["**/ignored/**"] }));
    expect((await runCli(["lint", root, "--baseline", baseline, "--config", config])).status).toBe(3);
    fs.writeFileSync(baseline, '{"__proto__":{"complete":true}}');
    expect((await runCli(["lint", root, "--baseline", baseline])).status).toBe(3);
    fs.writeFileSync(baseline, " ".repeat(4 * 1024 * 1024 + 1));
    expect((await runCli(["lint", root, "--baseline", baseline])).status).toBe(3);
  });

  it("reports setup evidence and explicit expected-version mismatch", async () => {
    const root = fixture();
    const result = await runCli(["setup", root, "--expect-version", "0.0.0", "--json"]);
    expect(result.status).toBe(3);
    const report = JSON.parse(result.stdout);
    expect(report.versionMatches).toBe(false); expect(report.runtimeResolution).toBe("unknown");
    expect(report.scanned).toBe(1); expect(report.nodeVersion).toBe(process.version);
  });
});

it("never reports a missing finding resolved through incomplete current or saved coverage", async () => {
  const root = fixture(); const baseline = path.join(root, "baseline.json");
  await runCli(["lint", root, "--save-baseline", baseline]);
  const skillDir = path.join(root, ".agents/skills/example");
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: example\ndescription: Use when converting stellar catalogs to CSV.\n---\nConvert the catalog.\n");
  fs.writeFileSync(path.join(skillDir, "huge.sh"), " ".repeat(512 * 1024 + 1));
  let result = await runCli(["lint", root, "--baseline", baseline, "--json"]);
  let report = JSON.parse(result.stdout);
  expect(result.status).toBe(3); expect(report.comparison.resolved).toEqual([]);
  expect(report.comparison.unverified.some((f: any) => f.id === "SC4004")).toBe(true);
  fs.unlinkSync(path.join(skillDir, "huge.sh"));
  result = await runCli(["lint", root, "--baseline", baseline, "--json"]);
  report = JSON.parse(result.stdout);
  expect(report.comparison.resolved.some((f: any) => f.id === "SC4004")).toBe(true);
  const saved = JSON.parse(fs.readFileSync(baseline, "utf8")); saved.coverage = { complete: false, reasons: ["old scan truncated"] };
  fs.writeFileSync(baseline, JSON.stringify(saved));
  report = JSON.parse((await runCli(["lint", root, "--baseline", baseline, "--json"])).stdout);
  expect(report.comparison.resolved).toEqual([]); expect(report.comparison.unverified.length).toBeGreaterThan(0);
});

it("invalidates script dismissals when source beyond the displayed match changes", async () => {
  const root = fixture("Read the script.\n"); const script = path.join(root, ".agents/skills/example/run.sh");
  const command = `rm -rf ${"a".repeat(180)}`;
  fs.writeFileSync(script, command + "1\n");
  const baseline = path.join(root, "baseline.json"); const dismissals = path.join(root, "dismissals.json");
  const first = JSON.parse((await runCli(["lint", root, "--save-baseline", baseline, "--json"])).stdout);
  const finding = first.findings.find((f: any) => f.id === "SC4004");
  expect((await runCli(["dismiss", baseline, "--finding", finding.fingerprint, "--reason", "Only scratch files", "--out", dismissals])).status).toBe(0);
  expect((await runCli(["lint", root, "--dismissals", dismissals])).status).toBe(0);
  fs.writeFileSync(script, command + "2\n");
  const result = await runCli(["lint", root, "--dismissals", dismissals, "--json"]);
  expect(result.status).toBe(1); expect(JSON.parse(result.stdout).dismissals.stale).toHaveLength(1);
});

it("rejects every maintenance option used on the wrong command and missing option values", async () => {
  const root = fixture();
  for (const flag of ["--baseline", "--save-baseline", "--dismissals", "--finding", "--reason", "--expect-version"]) {
    expect((await runCli(["scan", root, flag, "value"])).status).toBe(2);
    expect((await runCli(["lint", root, flag])).status).toBe(2);
  }
  expect((await runCli(["lint", root, "--compare-files"])).status).toBe(2);
});

it("keeps no-skill setup and version/location evidence accurate", async () => {
  const root = fixture(); fs.rmSync(path.join(root, ".agents"), { recursive: true });
  const report = JSON.parse((await runCli(["setup", root, "--json"])).stdout);
  expect(report.scanned).toBe(0); expect(report.notes.join(" ")).toContain("No skills found");
  expect(fs.existsSync(report.cliLocation)).toBe(true);
  expect((await runCli(["setup", root, "--expect-version", report.version])).status).toBe(0);
});

it("gives structural errors priority over warnings", async () => {
  const root = fixture();
  const file = path.join(root, ".agents/skills/example/SKILL.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("name: example", "name:"));
  const result = await runCli(["lint", root, "--json"]);
  const findings = JSON.parse(result.stdout).findings;
  expect(findings[0].severity).toBe("error"); expect(findings[0].rule).toBe("spec");
  const text = await runCli(["lint", root]); expect(text.stdout.indexOf("error SC")).toBeLessThan(text.stdout.indexOf("warning SC"));
});

it("keeps accepted findings auditable in every output format and in cleanup plans", async () => {
  const root = fixture(); const baseline = path.join(root, "baseline.json"); const dismissals = path.join(root, "dismissals.json");
  const first = JSON.parse((await runCli(["lint", root, "--save-baseline", baseline, "--json"])).stdout);
  const fingerprint = first.findings.find((f: any) => f.id === "SC4004").fingerprint;
  await runCli(["dismiss", baseline, "--finding", fingerprint, "--reason", "Approved scratch cleanup", "--out", dismissals]);
  const sarif = await runCli(["lint", root, "--dismissals", dismissals, "--format", "sarif"]);
  expect(sarif.status).toBe(0);
  expect(JSON.parse(sarif.stdout).runs[0].results.find((f: any) => f.ruleId === "SC4004").suppressions).toEqual([{ kind: "external", status: "accepted", justification: "Approved scratch cleanup" }]);
  const github = await runCli(["lint", root, "--dismissals", dismissals, "--format", "github"]);
  expect(github.status).toBe(0); expect(github.stdout).not.toContain("::warning"); expect(github.stdout).toContain("Dismissed: Approved scratch cleanup");
  const markdown = await runCli(["lint", root, "--dismissals", dismissals, "--format", "markdown"]);
  expect(markdown.stdout).toContain("Dismissed: Approved scratch cleanup");
  const fix = await runCli(["lint", root, "--dismissals", dismissals, "--fix", "--out", "-"]);
  expect(fix.stdout).toContain("Approved scratch cleanup"); expect(fix.stdout).toContain("warning SC4004");
});

it.each(["**/archive/**", "**/archive/**/SKILL.md"])("rejects relocated baseline and dismissals when ancestor-dependent ignore %s changes scope", async (pattern) => {
  const root = fixture();
  fs.writeFileSync(path.join(root, ".skillcrit.json"), JSON.stringify({ ignore: [pattern] }));
  const baseline = path.join(root, "baseline.json"); const dismissals = path.join(root, "dismissals.json");
  const saved = await runCli(["lint", root, "--save-baseline", baseline, "--json"]);
  expect(saved.status).toBe(1);
  const fingerprint = JSON.parse(saved.stdout).findings.find((f: any) => f.id === "SC4004").fingerprint;
  expect((await runCli(["dismiss", baseline, "--finding", fingerprint, "--reason", "Reviewed scratch cleanup", "--out", dismissals])).status).toBe(0);
  const sameLocation = await runCli(["lint", root, "--baseline", baseline, "--json"]);
  expect(sameLocation.status).toBe(1);
  expect(JSON.parse(sameLocation.stdout).comparison.resolved).toEqual([]);
  const destination = fixture(); const clone = path.join(destination, "archive", "clone");
  fs.cpSync(root, clone, { recursive: true });
  // The copied skill still exists, but these absolute-path patterns exclude it.
  expect(fs.existsSync(path.join(clone, ".agents/skills/example/SKILL.md"))).toBe(true);
  const inventory = await runCli(["scan", clone, "--json"]);
  expect(JSON.parse(inventory.stdout)).toMatchObject({ skills: [], coverage: { complete: true } });
  const compared = await runCli(["lint", clone, "--baseline", baseline, "--json"]);
  expect(compared.status).toBe(3);
  expect(compared.stderr).toContain("incompatible history");
  expect(compared.stdout).toBe("");
  const accepted = await runCli(["lint", clone, "--dismissals", dismissals, "--json"]);
  expect(accepted.status).toBe(3);
  expect(accepted.stderr).toContain("incompatible history");
});
