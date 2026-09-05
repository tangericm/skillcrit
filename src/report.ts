import path from "node:path";
import { pathToFileURL } from "node:url";
import { displayPath } from "./paths.js";
import { RULES, ruleIds } from "./rules.js";
import { formatSummary } from "./summary.js";
import type { LintFinding, LintReport, Severity } from "./types.js";
import { packageVersion } from "./version.js";

export const FORMATS = ["text", "json", "markdown", "sarif", "github"] as const;
export type Format = (typeof FORMATS)[number];

export function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value);
}

export function formatText(report: LintReport): string {
  let out = coverageWarning(report);
  for (const finding of report.findings) {
    const where = location(finding, report.root);
    out += `${finding.severity} ${finding.id} ${finding.rule}: ${finding.message}\n`;
    if (where) out += `  at ${where}\n`;
    if (finding.remediation && finding.severity !== "info") {
      out += `  fix: ${finding.remediation}\n`;
    }
  }
  return out + formatSummary(report);
}

export function formatMarkdown(report: LintReport): string {
  const lines = [
    "# skillcrit lint",
    "",
    coverageWarning(report).trim(),
    "Runtime selection: unknown",
    ...(report.limitations ?? ["Token totals estimate a hypothetical set; client loading has not been verified."]),
    `${report.unique} unique / ${report.scanned} scanned — ~${report.tokens.alwaysOnNow} estimated tokens for a hypothetical set`,
    ""
  ];
  if (report.findings.length === 0) {
    lines.push("No findings.", "");
    return lines.join("\n");
  }
  lines.push("| Rule | Severity | Skill | Where | Finding |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const finding of report.findings) {
    lines.push(
      `| ${finding.id} | ${finding.severity} | ${cell(finding.skills.slice(0, 3).join(", "))} | ${cell(location(finding, report.root) ?? "")} | ${cell(finding.message)} |`
    );
  }
  lines.push("");
  const actionable = report.findings.filter((f) => f.severity !== "info" && f.remediation);
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
  for (const finding of report.findings) {
    const level = finding.severity === "info" ? "notice" : finding.severity;
    const bits = [
      finding.file ? `file=${escapeProperty(displayPath(finding.file, report.root))}` : null,
      finding.line ? `line=${finding.line}` : null,
      `title=${escapeProperty(`${finding.id} ${RULES[finding.id].title}`)}`
    ].filter(Boolean);
    out += `::${level} ${bits.join(",")}::${escapeData(finding.message)}\n`;
  }
  return out;
}

const SARIF_LEVEL: Record<Severity, string> = {
  error: "error",
  warning: "warning",
  info: "note"
};

export function formatSarif(report: LintReport): string {
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
