import path from "node:path";
import { pathToFileURL } from "node:url";
import { displayPath } from "./paths.js";
import { RULES, ruleIds, SEVERITY_ORDER } from "./rules.js";
import { formatSummary } from "./summary.js";
import type { LintFinding, LintReport, Severity } from "./types.js";
import { packageVersion } from "./version.js";

export const FORMATS = ["text", "json", "markdown", "sarif", "github"] as const;
export type Format = (typeof FORMATS)[number];

export function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value);
}

/** Severity first, then structural validity and actionable risk/budget issues. */
export function prioritizeFindings(findings: LintFinding[]): LintFinding[] {
  const category = (f: LintFinding) => f.rule === "spec" && f.id !== "SC1012" ? 0 : f.rule === "risk" ? 1 : f.rule === "budget" ? 2 : 3;
  return [...findings].sort((a, b) => Number(Boolean(a.dismissal)) - Number(Boolean(b.dismissal)) ||
    SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] || category(a) - category(b) ||
    a.id.localeCompare(b.id) || (a.file ?? "").localeCompare(b.file ?? "") || (a.line ?? 0) - (b.line ?? 0) || a.message.localeCompare(b.message));
}

function comparisonStates(report: LintReport): Map<string, "new" | "updated" | "unchanged"> {
  const states = new Map<string, "new" | "updated" | "unchanged">();
  for (const f of report.comparison?.new ?? []) states.set(f.fingerprint, "new");
  for (const f of report.comparison?.unchanged ?? []) states.set(f.fingerprint, "unchanged");
  for (const change of report.comparison?.changed ?? []) for (const f of change.after) states.set(f.fingerprint, "updated");
  return states;
}

export function formatText(report: LintReport): string {
  let out = coverageWarning(report) + maintenanceSummary(report);
  const ordered = prioritizeFindings(report.findings);
  const states = comparisonStates(report);
  let dismissedHeading = false;
  for (const finding of ordered) {
    if (finding.dismissal && !dismissedHeading) { out += "Dismissed findings (excluded from gate)\n"; dismissedHeading = true; }
    const where = location(finding, report.root);
    out += `${finding.severity} ${finding.id} ${finding.rule}: ${finding.message}\n`;
    if (where) out += `  at ${where}\n`;
    const state = finding.fingerprint ? states.get(finding.fingerprint) : undefined;
    if (state) out += `  baseline: ${state === "updated" ? "changed" : state}\n`;
    if (finding.fingerprint) out += `  fingerprint: ${finding.fingerprint}\n`;
    if (finding.dismissal) out += `  accepted: ${finding.dismissal.reason}\n`;
    else if (finding.remediation && finding.severity !== "info") out += `  fix: ${finding.remediation}\n`;
  }
  for (const entry of report.dismissals?.stale ?? []) out += `Stale dismissal ${entry.fingerprint}: ${entry.reason}\n`;
  return out + formatSummary(report);
}

function maintenanceSummary(report: LintReport): string {
  const c = report.comparison;
  if (!c) return "";
  return `Baseline: ${c.new.length} new, ${c.changed.length} changed groups, ${c.resolved.length} resolved, ${c.unchanged.length} unchanged, ${c.unverified.length} unverified\n` +
    (!c.resolutionComplete ? "Resolution not verified: one or both scans are incomplete.\n" : "") +
    c.resolved.map(f => `  resolved ${f.id}: ${f.message}\n`).join("") +
    c.unverified.map(f => `  unverified ${f.id}: ${f.message}\n`).join("");
}

export function formatMarkdown(report: LintReport): string {
  const states = comparisonStates(report);
  const lines = [
    "# skillcrit lint",
    "",
    coverageWarning(report).trim(),
    maintenanceSummary(report).trim(),
    "Runtime selection: unknown",
    ...(report.limitations ?? ["Token totals estimate a hypothetical set; client loading has not been verified."]),
    `${report.unique} unique / ${report.scanned} scanned — ~${report.tokens.alwaysOnNow} estimated tokens for a hypothetical set`,
    ""
  ];
  for (const entry of report.dismissals?.stale ?? []) lines.push(`Stale dismissal ${entry.fingerprint}: ${cell(entry.reason)}`, "");
  if (report.findings.length === 0) {
    lines.push("No findings.", "");
    return lines.join("\n");
  }
  lines.push("| Rule | Severity | Skill | Where | Finding |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const finding of prioritizeFindings(report.findings)) {
    lines.push(
      `| ${finding.id} | ${finding.severity} | ${cell(finding.skills.slice(0, 3).join(", "))} | ${cell(location(finding, report.root) ?? "")} | ${finding.fingerprint && states.has(finding.fingerprint) ? `[${states.get(finding.fingerprint) === "updated" ? "changed" : states.get(finding.fingerprint)}] ` : ""}${cell(finding.message)}${finding.dismissal ? ` — Dismissed: ${cell(finding.dismissal.reason)}` : ""}${finding.fingerprint ? `<br>Fingerprint: ${finding.fingerprint}` : ""} |`
    );
  }
  lines.push("");
  const actionable = prioritizeFindings(report.findings).filter((f) => !f.dismissal && f.severity !== "info" && f.remediation);
  if (actionable.length > 0) {
    lines.push("## How to fix", "");
    const seen = new Set<string>();
    for (const finding of actionable) {
      if (seen.has(finding.id)) continue;
      seen.add(finding.id);
      lines.push(`- **${finding.id}** ${RULES[finding.id].title} — ${finding.remediation}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** GitHub Actions workflow-command annotations, one line per finding. */
export function formatGithub(report: LintReport): string {
  let out = report.coverage?.complete === false
    ? `::error title=Incomplete scan::${escapeData(coverageWarning(report).trim())}\n` : "";
  for (const finding of prioritizeFindings(report.findings)) {
    const level = finding.dismissal || finding.severity === "info" ? "notice" : finding.severity;
    const bits = [
      finding.file ? `file=${escapeProperty(displayPath(finding.file, report.root))}` : null,
      finding.line ? `line=${finding.line}` : null,
      `title=${escapeProperty(`${finding.id} ${RULES[finding.id].title}`)}`
    ].filter(Boolean);
    out += `::${level} ${bits.join(",")}::${escapeData(finding.message + (finding.dismissal ? ` — Dismissed: ${finding.dismissal.reason}` : ""))}\n`;
  }
  for (const entry of report.dismissals?.stale ?? []) out += `::notice title=Stale dismissal::${escapeData(`${entry.fingerprint}: ${entry.reason}`)}\n`;
  return out;
}

const SARIF_LEVEL: Record<Severity, string> = {
  error: "error",
  warning: "warning",
  info: "note"
};

export function formatSarif(report: LintReport): string {
  const states = comparisonStates(report);
  const used = new Set(report.findings.map((f) => f.id));
  // GitHub rejects results without a physical location. Inventory-wide totals
  // belong to the run, so preserve them without inventing a source-file anchor.
  const located = report.findings.filter((f): f is LintFinding & { file: string } => Boolean(f.file));
  const aggregateFindings = report.findings.filter(f => !f.file);
  const sarif = {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        properties: {
          ...(report.coverage ? { coverage: report.coverage } : {}),
          comparison: report.comparison,
          dismissals: report.dismissals,
          aggregateFindings
        },
        ...(report.coverage ? {
          invocations: [{
            executionSuccessful: report.coverage.complete,
            toolExecutionNotifications: report.coverage.reasons.map(reason => ({ level: "error", message: { text: reason } }))
          }]
        } : {}),
        tool: {
          driver: {
            name: "skillcrit",
            version: packageVersion(),
            informationUri: "https://github.com/tangericm/skillcrit",
            rules: ruleIds()
              .filter((id) => used.has(id))
              .map((id) => ({
                id,
                name: RULES[id].title,
                shortDescription: { text: RULES[id].title },
                fullDescription: { text: RULES[id].remediation },
                defaultConfiguration: { level: SARIF_LEVEL[RULES[id].severity] },
                help: { text: RULES[id].remediation }
              }))
          }
        },
        results: located.map((finding) => ({
          ruleId: finding.id,
          ...(finding.fingerprint && states.has(finding.fingerprint) ? { baselineState: states.get(finding.fingerprint) } : {}),
          ...(finding.fingerprint ? { partialFingerprints: { "skillcrit/v1": finding.fingerprint } } : {}),
          ...(finding.dismissal ? { suppressions: [{ kind: "external", status: "accepted", justification: finding.dismissal.reason }] } : {}),
          level: SARIF_LEVEL[finding.severity],
          message: { text: finding.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: fileUri(finding.file, report.root) },
                ...(finding.line
                  ? { region: { startLine: finding.line } }
                  : {})
              }
            }
          ]
        }))
      }
    ]
  };
  return JSON.stringify(sarif, null, 2) + "\n";
}

function coverageWarning(report: LintReport): string {
  return report.coverage?.complete === false
    ? `Incomplete scan: ${report.coverage.reasons.join("; ")}\n` : "";
}

function fileUri(file: string, root: string | undefined): string {
  const rel = displayPath(file, root);
  if (rel !== file) return rel.split("/").map(encodeURIComponent).join("/");
  try {
    return pathToFileURL(path.resolve(file)).href;
  } catch {
    return file.split("\\").join("/");
  }
}

function location(finding: LintFinding, root?: string): string | null {
  if (!finding.file) return null;
  const file = displayPath(finding.file, root);
  return finding.line ? `${file}:${finding.line}` : file;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function escapeData(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeProperty(text: string): string {
  return escapeData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
