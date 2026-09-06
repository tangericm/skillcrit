import { createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import type { SkillcritConfig } from "./config.js";
import { readInventoryText } from "./read.js";
import { RULES } from "./rules.js";
import type { LintFinding, LintReport, ScanCoverage, SkillRecord } from "./types.js";
import { packageVersion } from "./version.js";
import { collectRoots } from "./roots.js";
import { MAX_WALK_DEPTH, MAX_WALK_DIRS, type ScanOptions } from "./scan.js";

export const MAX_HISTORY_BYTES = 4 * 1024 * 1024;
const MAX_ENTRIES = 10000;
export type HistoryContext = { engine: string; scope: "project" | "project-and-user"; config: string };
export type SnapshotFinding = { fingerprint: string; identity: string; id: LintFinding["id"]; severity: LintFinding["severity"]; file: string | null; message: string };
export type Baseline = { schema: "skillcrit-baseline-v1"; context: HistoryContext; coverage: ScanCoverage; findings: SnapshotFinding[] };
export type Dismissal = { fingerprint: string; reason: string };
export type DismissalFile = { schema: "skillcrit-dismissals-v1"; context: HistoryContext; entries: Dismissal[] };
export type BaselineComparison = {
  new: SnapshotFinding[]; resolved: SnapshotFinding[]; changed: { before: SnapshotFinding[]; after: SnapshotFinding[] }[];
  unchanged: SnapshotFinding[]; unverified: SnapshotFinding[]; resolutionComplete: boolean;
};

function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function portable(file: string, root: string): string {
  const absolute = path.resolve(file); const relative = path.relative(root, absolute);
  return (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
    ? `project:${relative}` : `external:${absolute}`).replace(/\\/g, "/");
}

export type HistoryScanOptions = Pick<ScanOptions, "user" | "extraRoots" | "risks" | "maxDepth" | "maxDirs">;

/** Pass the same scan options used to build the report; config source and gate do not affect evidence. */
export function historyContext(root: string, config: SkillcritConfig, scanOptions: boolean | HistoryScanOptions = false): HistoryContext {
  const options = typeof scanOptions === "boolean" ? { user: scanOptions } : scanOptions;
  const user = options.user === true;
  const canonical = (file: string) => { try { return fs.realpathSync(file); } catch { return path.resolve(file); } };
  const resolvedRoot = canonical(root);
  return { engine: packageVersion(), scope: user ? "project-and-user" : "project", config: hash({
    ignore: [...config.ignore].sort(),
    // Ignore globs match absolute ancestors, and directory pruning also checks
    // the requested spelling before realpath. Bind both when ignores are set:
    // equal patterns alone cannot establish equal coverage after relocation.
    ignoreLocations: config.ignore.length > 0
      ? collectRoots(root, options.extraRoots ?? [], user)
          .map(file => [file.replace(/\\/g, "/"), canonical(file)])
          .sort(([a], [b]) => a.localeCompare(b))
      : [],
    rules: Object.entries(config.rules).sort(([a], [b]) => a.localeCompare(b)),
    budget: { alwaysOnTokens: config.budget.alwaysOnTokens, bodyTokens: config.budget.bodyTokens, bodyLines: config.budget.bodyLines },
    roots: [...new Set(collectRoots(resolvedRoot, options.extraRoots ?? [], user).map(file => portable(canonical(file), resolvedRoot)))].sort(),
    risks: options.risks !== false, maxDepth: options.maxDepth ?? MAX_WALK_DEPTH, maxDirs: options.maxDirs ?? MAX_WALK_DIRS
  }) };
}

/** Attach exact occurrence IDs without removing findings. Full instruction hashes invalidate stale acceptance. */
export function createBaseline(report: LintReport, skills: SkillRecord[], context: HistoryContext): Baseline {
  if (!report.root) throw new Error("baseline requires an explicit scan root");
  let root = path.resolve(report.root);
  try { root = fs.realpathSync(root); } catch { /* API reports can refer to unavailable roots. */ }
  const sourceByDirectory = new Map(skills.map(s => [s.skillDir, s]));
  const normalized = new Map<string, string>();
  const location = (file: string) => { let value = normalized.get(file); if (!value) { value = portable(file, root); normalized.set(file, value); } return value; };
  const sourceFor = (file: string): SkillRecord | undefined => {
    let dir = path.dirname(file);
    while (true) { const source = sourceByDirectory.get(dir); if (source) return source; const parent = path.dirname(dir); if (parent === dir) return undefined; dir = parent; }
  };
  const findings = report.findings.map(finding => {
    const participants = finding.relatedFiles ?? (finding.file ? [finding.file] : skills.map(s => s.skillFile));
    const paths = [...new Set(participants.map(location))].sort();
    const identity = hash({ rule: finding.id, paths, skills: [...finding.skills].sort() });
    const sources = [...new Set(participants.map(sourceFor).filter((s): s is SkillRecord => Boolean(s)))];
    const evidence = sources.map(s => [location(s.skillFile), s.hash]).sort(([a], [b]) => a.localeCompare(b));
    const fingerprint = hash({ identity, severity: finding.severity, message: finding.message, evidence, evidenceHash: finding.evidenceHash ?? null });
    finding.fingerprint = fingerprint;
    return { fingerprint, identity, id: finding.id, severity: finding.severity, file: finding.file ? location(finding.file) : null, message: finding.message };
  });
  // Identical occurrences can arise from distinct lines. Preserve their identity
  // using a deterministic occurrence suffix instead of collapsing or waiving all.
  const counts = new Map<string, number>();
  for (const finding of findings) counts.set(finding.fingerprint, (counts.get(finding.fingerprint) ?? 0) + 1);
  const seen = new Map<string, number>();
  findings.forEach((finding, i) => {
    if ((counts.get(finding.fingerprint) ?? 0) < 2) return;
    const occurrence = (seen.get(finding.fingerprint) ?? 0) + 1; seen.set(finding.fingerprint, occurrence);
    finding.fingerprint = hash([finding.fingerprint, occurrence, counts.get(finding.fingerprint)]);
    report.findings[i].fingerprint = finding.fingerprint;
  });
  const baseline: Baseline = { schema: "skillcrit-baseline-v1", context, coverage: report.coverage ?? { complete: false, reasons: ["scan coverage was not supplied"] }, findings };
  return baseline;
}

export function compareBaseline(current: Baseline, previous: Baseline): BaselineComparison {
  validateBaseline(current); validateBaseline(previous); compatible(current.context, previous.context);
  const old = new Map(previous.findings.map(f => [f.fingerprint, f]));
  const unchanged = current.findings.filter(f => old.has(f.fingerprint));
  const exact = new Set(unchanged.map(f => f.fingerprint));
  const remainingOld = previous.findings.filter(f => !exact.has(f.fingerprint));
  const remainingNew = current.findings.filter(f => !exact.has(f.fingerprint));
  const oldGroups = group(remainingOld); const newGroups = group(remainingNew);
  const changed: BaselineComparison["changed"] = [];
  for (const [identity, after] of newGroups) {
    const before = oldGroups.get(identity);
    if (before) { changed.push({ before, after }); oldGroups.delete(identity); newGroups.delete(identity); }
  }
  const absent = [...oldGroups.values()].flat();
  const resolutionComplete = current.coverage.complete && previous.coverage.complete;
  return { new: [...newGroups.values()].flat(), resolved: resolutionComplete ? absent : [], changed, unchanged,
    unverified: resolutionComplete ? [] : absent, resolutionComplete };
}
function group(findings: SnapshotFinding[]): Map<string, SnapshotFinding[]> {
  const groups = new Map<string, SnapshotFinding[]>();
  for (const f of findings) { const rows = groups.get(f.identity) ?? []; rows.push(f); groups.set(f.identity, rows); }
  return groups;
}

export function createDismissals(baseline: Baseline, fingerprint: string, reason: string, existing?: DismissalFile): DismissalFile {
  validateBaseline(baseline);
  if (!baseline.findings.some(f => f.fingerprint === fingerprint)) throw new Error("finding fingerprint does not exist in this baseline");
  if (existing) { validateDismissals(existing); compatible(baseline.context, existing.context); }
  if (existing?.entries.some(e => e.fingerprint === fingerprint)) throw new Error("finding is already dismissed; choose a different fingerprint");
  const result: DismissalFile = { schema: "skillcrit-dismissals-v1", context: baseline.context,
    entries: [...(existing?.entries ?? []), { fingerprint, reason: reason.trim() }] };
  validateDismissals(result); return result;
}
export function applyDismissals(report: LintReport, context: HistoryContext, dismissals: DismissalFile): void {
  validateDismissals(dismissals); compatible(context, dismissals.context);
  const entries = new Map(dismissals.entries.map(entry => [entry.fingerprint, entry]));
  const applied: Dismissal[] = [];
  for (const finding of report.findings) {
    delete finding.dismissal;
    const entry = finding.fingerprint ? entries.get(finding.fingerprint) : undefined;
    if (entry) { finding.dismissal = { reason: entry.reason }; applied.push(entry); entries.delete(entry.fingerprint); }
  }
  report.dismissals = { applied, stale: [...entries.values()] };
}
export function readBaseline(file: string): Baseline { const value: unknown = JSON.parse(readInventoryText(file, MAX_HISTORY_BYTES)); validateBaseline(value); return value; }
export function readDismissals(file: string): DismissalFile { const value: unknown = JSON.parse(readInventoryText(file, MAX_HISTORY_BYTES)); validateDismissals(value); return value; }
export function serializeHistory(value: Baseline | DismissalFile): string {
  if (value.schema === "skillcrit-baseline-v1") validateBaseline(value); else validateDismissals(value);
  const text = JSON.stringify(value, null, 2) + "\n";
  if (Buffer.byteLength(text) > MAX_HISTORY_BYTES) throw new Error("history exceeds 4 MiB limit");
  return text;
}
function invalid(): never { throw new Error("invalid skillcrit history: unsupported schema, malformed field or limit exceeded"); }
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) invalid();
}
function string(value: unknown, max = 16384): asserts value is string { if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) invalid(); }
function digest(value: unknown): asserts value is string { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) invalid(); }
function validateContext(value: unknown): asserts value is HistoryContext {
  object(value, ["engine", "scope", "config"]); string(value.engine, 100); digest(value.config);
  if (value.scope !== "project" && value.scope !== "project-and-user") invalid();
}
function compatible(a: HistoryContext, b: HistoryContext): void {
  if (a.engine !== b.engine || a.scope !== b.scope || a.config !== b.config) throw new Error("incompatible history: CLI version, scan scope or effective config differs; save a new baseline");
}
function validateBaseline(value: unknown): asserts value is Baseline {
  object(value, ["schema", "context", "coverage", "findings"]); if (value.schema !== "skillcrit-baseline-v1") invalid(); validateContext(value.context);
  object(value.coverage, ["complete", "reasons"]);
  if (typeof value.coverage.complete !== "boolean" || !Array.isArray(value.coverage.reasons) || value.coverage.reasons.length > MAX_ENTRIES) invalid();
  value.coverage.reasons.forEach(reason => string(reason));
  if (value.coverage.complete && value.coverage.reasons.length) invalid();
  if (!Array.isArray(value.findings) || value.findings.length > MAX_ENTRIES) invalid();
  const ids = new Set<string>();
  for (const row of value.findings) {
    object(row, ["fingerprint", "identity", "id", "severity", "file", "message"]); digest(row.fingerprint); digest(row.identity);
    if (ids.has(row.fingerprint)) invalid(); ids.add(row.fingerprint);
    if (typeof row.id !== "string" || !Object.hasOwn(RULES, row.id) || !["error", "warning", "info"].includes(row.severity as string)) invalid();
    if (row.file !== null) string(row.file); string(row.message);
  }
}
function validateDismissals(value: unknown): asserts value is DismissalFile {
  object(value, ["schema", "context", "entries"]); if (value.schema !== "skillcrit-dismissals-v1") invalid(); validateContext(value.context);
  if (!Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES) invalid();
  const ids = new Set<string>();
  for (const entry of value.entries) {
    object(entry, ["fingerprint", "reason"]); digest(entry.fingerprint); string(entry.reason, 2000);
    if (ids.has(entry.fingerprint)) invalid(); ids.add(entry.fingerprint);
  }
}
