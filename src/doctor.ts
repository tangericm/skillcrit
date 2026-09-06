import path from "node:path";
import { compareSkillFiles } from "./compare-files.js";
import { compareSkills, compareVersions, labelSkill } from "./origin.js";
import { displayPath } from "./paths.js";
import { listSkillLocations } from "./roots.js";
import { RULES } from "./rules.js";
import type {
  DoctorReport,
  SkillRecommendation,
  SkillRecord
} from "./types.js";

/** Cleanup recommendations only; runtime selection requires client-specific evidence. */
export function doctor(
  skills: SkillRecord[],
  root: string,
  options: { user?: boolean; compareFiles?: boolean; ignore?: string[] } = {}
): DoctorReport {
  const byName = new Map<string, SkillRecord[]>();
  for (const skill of skills) {
    const list = byName.get(skill.name) ?? [];
    list.push(skill);
    byName.set(skill.name, list);
  }

  const recommendations: SkillRecommendation[] = [];
  for (const [name, group] of [...byName.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const ranked = [...group].sort((a, b) => compareSkills(b, a));
    const recommended = ranked[0];
    const rest = ranked.slice(1);
    const identicalInstructions = rest.filter((s) => s.hash === recommended.hash);
    const alternatives = rest
      .filter((s) => s.hash !== recommended.hash)
      .map((skill) => ({ skill, why: shadowReason(recommended, skill) }));
    recommendations.push({
      name,
      recommended,
      reason: winReason(recommended, rest),
      alternatives,
      identicalInstructions,
      ...(options.compareFiles ? { fileComparisons: rest.map(s => compareSkillFiles(recommended.skillDir, s.skillDir, options.ignore)) } : {})
    });
  }

  const recommendedCatalogTokens = recommendations.reduce(
    (sum, row) => sum + row.recommended.descriptionTokens,
    0
  );
  const recommendedAlwaysOnTokens = recommendations.reduce(
    (sum, row) =>
      sum +
      (row.recommended.alwaysOn
        ? row.recommended.alwaysOnTokens
        : row.recommended.descriptionTokens),
    0
  );

  const risks: DoctorReport["risks"] = [];
  for (const skill of skills) {
    for (const finding of skill.risks) {
      risks.push({ skill: skill.name, skillFile: skill.skillFile, finding });
    }
  }

  return {
    root,
    recommendations,
    scanned: skills.length,
    runtimeResolution: "unknown",
    limitations: [
      "Cleanup ranking is not runtime precedence. Client namespaces, enablement and validity are not resolved.",
      options.compareFiles ? "Supporting comparisons inspect bounded regular-file bytes and POSIX permissions; unknowns and exclusions are reported. Equality is not a deletion recommendation." : "Identical instructions means equal SKILL.md bytes; scripts and references are not compared.",
      "Token estimates describe the recommended set, not a measured session."
    ],
    alternatives: recommendations.reduce((sum, row) => sum + row.alternatives.length, 0),
    recommendedCatalogTokens,
    recommendedAlwaysOnTokens,
    risks,
    roots: rootUsage(skills, root, options.user === true)
  };
}

function winReason(recommended: SkillRecord, rest: SkillRecord[]): string {
  if (rest.length === 0) return `only copy (${recommended.origin})`;
  const loser = rest[0];
  if (recommended.origin !== loser.origin) {
    return `${recommended.origin} scope outranks ${loser.origin}`;
  }
  const ver = compareVersions(recommended.version, loser.version);
  if (ver > 0) {
    return `version ${recommended.version ?? "unversioned"} beats ${loser.version ?? "unversioned"}`;
  }
  if (recommended.alwaysOn !== loser.alwaysOn) {
    return "the other copy is always-on and costs more context";
  }
  if (recommended.description.length !== loser.description.length) {
    return "more specific description";
  }
  return "path order, after every other tiebreak drew";
}

function shadowReason(recommended: SkillRecord, loser: SkillRecord): string {
  const bits: string[] = [];
  if (loser.origin !== recommended.origin) {
    bits.push(`${loser.origin} loses to ${recommended.origin}`);
  }
  if (compareVersions(recommended.version, loser.version) > 0) {
    bits.push(`older than ${labelSkill(recommended)}`);
  }
  if (bits.length === 0) bits.push(`outranked by ${labelSkill(recommended)}`);
  return bits.join("; ");
}

function rootUsage(
  skills: SkillRecord[],
  root: string,
  user: boolean
): DoctorReport["roots"] {
  const locations = listSkillLocations(root, { user });
  const out: DoctorReport["roots"] = [];
  for (const loc of locations) {
    if (!loc.exists) continue;
    const count = skills.filter((s) => isUnder(s.skillFile, loc.path)).length;
    if (count === 0) continue;
    out.push({
      path: loc.path,
      harness: loc.harness,
      scope: loc.scope,
      skills: count
    });
  }
  return out.sort((a, b) => b.skills - a.skills);
}

function isUnder(file: string, dir: string): boolean {
  const rel = path.relative(dir, file);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function formatDoctor(report: DoctorReport): string {
  const lines = ["# skillcrit doctor", "", "Runtime selection: unknown", ...report.limitations, ""];
  lines.push(
    `${report.recommendations.length} recommendations, ${report.alternatives} alternatives, ${report.scanned} files scanned`
  );
  lines.push(
    `Recommended set estimate: ~${report.recommendedCatalogTokens} catalogue tokens; ~${report.recommendedAlwaysOnTokens} including flagged always-on bodies`
  );
  lines.push("");

  if (report.roots.length > 0) {
    lines.push("## where they come from", "");
    for (const root of report.roots) {
      lines.push(
        `${String(root.skills).padStart(4)}  ${root.scope.padEnd(7)}  ${root.harness.padEnd(9)}  ${displayPath(root.path, report.root)}`
      );
    }
    lines.push("");
  }

  lines.push("## cleanup recommendations", "");
  for (const row of report.recommendations) {
    const ver = row.recommended.version ? `@${row.recommended.version}` : "";
    const flags = [
      row.recommended.alwaysOn ? "always-on" : null,
      row.identicalInstructions.length > 0 ? `${row.identicalInstructions.length} identical instruction file(s)` : null
    ].filter(Boolean);
    lines.push(
      `${row.name}${ver}  ${row.recommended.origin}  ~${row.recommended.descriptionTokens} tok${flags.length ? `  [${flags.join(", ")}]` : ""}`
    );
    lines.push(`    ${displayPath(row.recommended.skillFile, report.root)}`);
    lines.push(`    recommendation: ${row.reason}`);
    for (const identical of row.identicalInstructions) {
      lines.push(`    identical instructions: ${displayPath(identical.skillFile, report.root)} — ${row.fileComparisons ? "see supporting-file comparison" : "supporting files not compared"}`);
    }
    for (const comparison of row.fileComparisons ?? []) {
      lines.push(`    supporting files: ${comparison.status} — ${displayPath(comparison.right, report.root)}`);
      for (const detail of [...comparison.differences, ...comparison.reasons]) lines.push(`      ${detail}`);
      lines.push(`      ${comparison.scope}`);
    }
    for (const shadow of row.alternatives) {
      lines.push(
        `    alternative: ${displayPath(shadow.skill.skillFile, report.root)} — ${shadow.why}`
      );
    }
  }
  lines.push("");

  if (report.risks.length > 0) {
    lines.push("## risk inventory (all scanned copies)", "");
    lines.push(
      "Signals for human review. Not a security audit and not a verdict — a clean list does not mean a skill is safe.",
      ""
    );
    for (const { skill, skillFile, finding } of report.risks) {
      const file = displayPath(path.resolve(path.dirname(skillFile), finding.file), report.root);
      const at = finding.line ? `${file}:${finding.line}` : file;
      lines.push(
        `${finding.id}  ${skill}  ${RULES[finding.id].title}  ${at}  ${finding.evidence}`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
