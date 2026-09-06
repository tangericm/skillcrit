import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createBaseline, compareBaseline, historyContext, createDismissals, readBaseline, readDismissals, serializeHistory, applyDismissals } from "../src/history.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { lint } from "../src/lint.ts";
import { makeRecord } from "./support/record.ts";
import { writeNewFile } from "../src/write.ts";
const temps: string[] = [];
function temp() { const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-state-")); temps.push(root); return fs.realpathSync(root); }
afterEach(() => { vi.unstubAllEnvs(); temps.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });
function snapshot(root: string, suffix = "") {
  const skills = [makeRecord({ name: "a", skillDir: path.join(root, "a"), hash: "a" + suffix })];
  const report = lint(skills, DEFAULT_CONFIG, root); report.coverage = { complete: true, reasons: [] };
  return { report, state: createBaseline(report, skills, historyContext(root, DEFAULT_CONFIG)) };
}
it("treats project/user, user-root, engine, rule and budget differences as incompatible, while gate/source paths do not matter", () => {
  const root = temp(); const a = snapshot(root).state;
  const b = structuredClone(a);
  b.context = historyContext(root, { ...DEFAULT_CONFIG, failOn: "error", source: "/different/config.json" });
  expect(compareBaseline(b, a).unchanged.length).toBeGreaterThan(0);
  for (const context of [historyContext(root, DEFAULT_CONFIG, true), historyContext(root, { ...DEFAULT_CONFIG, rules: { SC3001: "off" } }), historyContext(root, { ...DEFAULT_CONFIG, budget: { ...DEFAULT_CONFIG.budget, bodyLines: 2 } }), { ...a.context, engine: "0.0.0" }]) {
    b.context = context; expect(() => compareBaseline(b, a)).toThrow(/incompatible/);
  }
  vi.stubEnv("SKILLCRIT_HOME", path.join(root, "home-one")); const first = historyContext(root, DEFAULT_CONFIG, true);
  vi.stubEnv("SKILLCRIT_HOME", path.join(root, "home-two")); expect(historyContext(root, DEFAULT_CONFIG, true)).not.toEqual(first);
});
it("group identities include every participant and remain stable when the ranked anchor changes", () => {
  const root = temp(); const a = makeRecord({ name: "same", skillDir: path.join(root, "a"), hash: "same" });
  const b = makeRecord({ ...a, skillDir: path.join(root, "b"), skillFile: path.join(root, "b/SKILL.md") });
  const report = lint([a, b], DEFAULT_CONFIG, root); report.coverage = { complete: true, reasons: [] };
  const first = createBaseline(report, [a, b], historyContext(root, DEFAULT_CONFIG));
  const finding = report.findings.find(f => f.id === "SC3001")!;
  expect(finding.relatedFiles).toHaveLength(2);
  finding.file = b.skillFile;
  const second = createBaseline(report, [a, b], first.context);
  expect(second.findings.find(f => f.id === "SC3001")!.identity).toBe(first.findings.find(f => f.id === "SC3001")!.identity);
  finding.relatedFiles = [a.skillFile, path.join(root, "c/SKILL.md")];
  expect(createBaseline(report, [a, b], first.context).findings.find(f => f.id === "SC3001")!.identity).not.toBe(first.findings.find(f => f.id === "SC3001")!.identity);
});
it("keeps duplicate occurrences distinct and accepts only one exact occurrence", () => {
  const root = temp(); const { report, state } = snapshot(root);
  report.findings.push({ ...report.findings[0] });
  const current = createBaseline(report, [], state.context);
  expect(new Set(current.findings.map(f => f.fingerprint)).size).toBe(current.findings.length);
  const dismissal = createDismissals(current, current.findings[0].fingerprint, "Accepted one occurrence");
  applyDismissals(report, current.context, dismissal);
  expect(report.findings.filter(f => f.dismissal)).toHaveLength(1);
});
it("rejects malformed state, duplicate IDs, dangerous object keys, blank reasons and unknown fingerprints", () => {
  const root = temp(); const { state } = snapshot(root); const file = path.join(root, "state.json");
  const bad: unknown[] = [null, [], { ...state, unexpected: 1 }, { ...state, coverage: { complete: true, reasons: ["contradiction"] } }, { ...state, findings: [...state.findings, state.findings[0]] }, { ...state, findings: [{ ...state.findings[0], id: "__proto__" }] }, { ...state, findings: [{ ...state.findings[0], fingerprint: "bad" }] }, { ...state, findings: [{ ...state.findings[0], message: "\u001b[31mevil" }] }];
  for (const value of bad) { fs.writeFileSync(file, JSON.stringify(value)); expect(() => readBaseline(file)).toThrow(); }
  expect(() => createDismissals(state, "a".repeat(64), "not in snapshot")).toThrow(/does not exist/);
  expect(() => createDismissals(state, state.findings[0].fingerprint, "  ")).toThrow();
  expect(() => createDismissals(state, state.findings[0].fingerprint, "x".repeat(2001))).toThrow();
  const accepted = createDismissals(state, state.findings[0].fingerprint, "Reviewed");
  for (const value of [{ ...accepted, entries: [...accepted.entries, ...accepted.entries] }, { ...accepted, entries: [{ ...accepted.entries[0], reason: null }] }, JSON.parse('{"schema":"skillcrit-dismissals-v1","__proto__":{"polluted":true}}')]) {
    fs.writeFileSync(file, JSON.stringify(value)); expect(() => readDismissals(file)).toThrow();
  }
  expect(({} as any).polluted).toBeUndefined();
  expect(() => serializeHistory({ ...state, findings: Array(10001).fill(state.findings[0]) })).toThrow();
});
it("history publication never overwrites files, hard links, protected filenames or dangling symlinks", () => {
  const root = temp(); const file = path.join(root, "state.json"); writeNewFile(file, "original");
  expect(() => writeNewFile(file, "replacement")).toThrow(/already exists/); expect(fs.readFileSync(file, "utf8")).toBe("original");
  const hardlink = path.join(root, "hard.json"); fs.linkSync(file, hardlink); expect(() => writeNewFile(hardlink, "replacement")).toThrow();
  for (const name of ["SKILL.md", "package.json", "LICENSE", ".env"]) expect(() => writeNewFile(path.join(root, name), "blocked")).toThrow(/refusing/);
  if (process.platform !== "win32") {
    const link = path.join(root, "link.json"); const target = path.join(root, "uncreated"); fs.symlinkSync(target, link);
    expect(() => writeNewFile(link, "replacement")).toThrow(); expect(fs.existsSync(target)).toBe(false); expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  }
  expect(fs.readdirSync(root).some(name => name.startsWith(".skillcrit-report-"))).toBe(false);
});
it("includes custom Codex roots and API scan options in compatibility identity", () => {
  const root = temp();
  vi.stubEnv("CODEX_HOME", path.join(root, "codex-one")); const first = historyContext(root, DEFAULT_CONFIG, true);
  vi.stubEnv("CODEX_HOME", path.join(root, "codex-two")); expect(historyContext(root, DEFAULT_CONFIG, true)).not.toEqual(first);
  const defaults = historyContext(root, DEFAULT_CONFIG);
  expect(historyContext(root, DEFAULT_CONFIG, { extraRoots: [path.join(root, "extra")] })).not.toEqual(defaults);
  expect(historyContext(root, DEFAULT_CONFIG, { risks: false })).not.toEqual(defaults);
  expect(historyContext(root, DEFAULT_CONFIG, { maxDepth: 2 })).not.toEqual(defaults);
});
it("binds nonempty ignores to requested and canonical root locations while preserving relocation without ignores", () => {
  const root = temp(); const clone = temp(); const config = { ...DEFAULT_CONFIG, ignore: ["**/archive/**"] };
  expect(historyContext(root, config)).not.toEqual(historyContext(clone, config));
  expect(historyContext(root, DEFAULT_CONFIG)).toEqual(historyContext(clone, DEFAULT_CONFIG));
  fs.mkdirSync(path.join(root, "archive"));
  const alias = `${root}${path.sep}archive${path.sep}..`;
  expect(fs.realpathSync(alias)).toBe(root);
  expect(historyContext(root, config)).not.toEqual(historyContext(alias, config));
  expect(historyContext(root, DEFAULT_CONFIG)).toEqual(historyContext(alias, DEFAULT_CONFIG));
});
