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
  const lines = [
    "# skillcrit summary",
    `${report.unique} unique / ${report.scanned} scanned`,
    `~${t.alwaysOnNow} always-on tokens now`,
    t.saved > 0
      ? `~${t.afterCleanup} after recommended cleanup (−${t.saved})`
      : `~${t.afterCleanup} after recommended cleanup (no token change)`,
    `~${t.descriptionOnly} if always-on skills were description-only`,
    `${errors} errors  ${warnings} warnings  ${info} info`,
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
      lines.push(`   drop: ${displayPath(drop, report.root)}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function promptFor(action: CleanupAction): string {
  switch (action.kind) {
    case "prefer-skill":
      return `Keep the higher-ranked skill and disable overlapping copies?`;
    case "pick-version":
      return `Keep this version and remove the other variants?`;
    case "drop-copy":
      return `Review supporting files and client usage before removing identical instruction copies?`;
    case "ignore-mirror":
      return `Leave cache/marketplace instruction copies in place pending package and client review?`;
  }
}

function count(report: LintReport, severity: "error" | "warning" | "info"): number {
  return report.findings.filter((f) => f.severity === severity).length;
}
