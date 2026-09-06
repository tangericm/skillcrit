import { displayPath } from "./paths.js";
import type {
  CleanupAction,
  CleanupQuestion,
  LintReport,
  SkillRecord,
  TokenComparison
} from "./types.js";

export function tokenComparison(
  unique: SkillRecord[],
  cleanup: CleanupAction[],
  scanned: number
): TokenComparison {
  const drop = new Set(
    cleanup.filter((action) => action.harmful).flatMap((action) => action.drop)
  );
  const now = unique.reduce(
    (sum, skill) =>
      sum + (skill.alwaysOn ? skill.alwaysOnTokens : skill.descriptionTokens),
    0
  );
  const after = unique
    .filter((skill) => !drop.has(skill.skillFile))
    .reduce(
      (sum, skill) =>
        sum + (skill.alwaysOn ? skill.alwaysOnTokens : skill.descriptionTokens),
      0
    );
  const descriptionOnly = unique.reduce(
    (sum, skill) => sum + skill.descriptionTokens,
    0
  );
  return {
    scanned,
    unique: unique.length,
    alwaysOnNow: now,
    afterCleanup: after,
    saved: Math.max(0, now - after),
    descriptionOnly
  };
}

export function cleanupQuestions(cleanup: CleanupAction[]): CleanupQuestion[] {
  return cleanup.map((action, i) => ({
    id: i + 1,
    kind: action.kind,
    prompt: promptFor(action),
    keep: action.keep,
    drop: action.drop,
    harmful: action.harmful
  }));
}

export function formatSummary(report: LintReport): string {
  const errors = count(report, "error");
  const warnings = count(report, "warning");
  const info = count(report, "info");
  const t = report.tokens;
  const active = report.findings.filter(f => !f.dismissal);
  const structural = active.filter(f => f.rule === "spec" && f.id !== "SC1012").length;
  const signals = active.filter(f => f.rule === "risk" || f.rule === "contention" || f.rule === "trigger-overlap" || f.rule === "always-on" || f.id === "SC1012").length;
  const lines = [
    "# skillcrit summary",
    "Runtime selection: unknown",
    ...(report.limitations ?? ["Token totals estimate a hypothetical set; client loading has not been verified."]),
    `${report.unique} unique / ${report.scanned} scanned`,
    `~${t.alwaysOnNow} estimated tokens for the hypothetical inventory set`,
    t.saved > 0
      ? `~${t.afterCleanup} after recommended cleanup (−${t.saved})`
      : `~${t.afterCleanup} after recommended cleanup (no token change)`,
    `~${t.descriptionOnly} estimated catalogue tokens with descriptions only`,
    `${errors} errors  ${warnings} warnings  ${info} info`,
    `${structural} structural findings; ${signals} heuristic signals; ${active.length - structural - signals} inventory/budget findings`,
    ...(report.dismissals ? [`${report.dismissals.applied.length} dismissed; ${report.dismissals.stale.length} stale dismissals`] : []),
    ""
  ];
  if (report.questions.length === 0) {
    lines.push("## questions", "none — nothing to organize", "");
    return lines.join("\n");
  }
  lines.push("## questions");
  for (const q of report.questions) {
    const tag = q.harmful ? "review" : "optional";
    lines.push(`${q.id}. [${q.kind} / ${tag}] ${q.prompt}`);
    lines.push(`   keep: ${displayPath(q.keep, report.root)}`);
    for (const drop of q.drop) {
      lines.push(`   alternative: ${displayPath(drop, report.root)}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function promptFor(action: CleanupAction): string {
  switch (action.kind) {
    case "prefer-skill":
      return `Compare intended tasks and actual client triggering for these skills?`;
    case "pick-version":
      return `Compare versions, permissions, supporting files and client namespaces before choosing a copy?`;
    case "drop-copy":
      return `Review supporting files and client usage before removing identical instruction copies?`;
    case "ignore-mirror":
      return `Leave cache/marketplace instruction copies in place pending package and client review?`;
  }
}

function count(report: LintReport, severity: "error" | "warning" | "info"): number {
  return report.findings.filter((f) => !f.dismissal && f.severity === severity).length;
}
