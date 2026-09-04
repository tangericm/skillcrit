import type { LintFinding, LintReport, SkillRecord } from "./types.js";

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "when",
  "use",
  "used",
  "user",
  "asks",
  "ask",
  "from",
  "that",
  "this",
  "skill",
  "agent",
  "into",
  "as",
  "is",
  "be"
]);

export function lint(skills: SkillRecord[]): LintReport {
  const findings: LintFinding[] = [];

  for (const skill of skills) {
    for (const issue of skill.specIssues) {
      findings.push({
        rule: "spec",
        severity: "error",
        skills: [skill.name],
        message: issue
      });
    }
  }

  findings.push(...triggerOverlaps(skills));
  findings.push(...duplicateCommands(skills));

  let alwaysOnTokens = 0;
  for (const skill of skills) {
    alwaysOnTokens += skill.alwaysOn
      ? skill.alwaysOnTokens
      : skill.descriptionTokens;
    if (skill.alwaysOn) {
      const why = skill.hooks
        ? "plugin hooks stay loaded"
        : "always-on body phrasing";
      findings.push({
        rule: "always-on",
        severity: "warning",
        skills: [skill.name],
        message: `${skill.name} is always-on (${why}); ~${skill.alwaysOnTokens} tokens`
      });
    }
  }

  findings.push({
    rule: "always-loaded-tokens",
    severity: "info",
    skills: skills.map((s) => s.name),
    message: `~${alwaysOnTokens} always-loaded tokens across ${skills.length} skills (description frontmatter plus always-on bodies)`
  });

  return { findings, alwaysOnTokens };
}

function triggerOverlaps(skills: SkillRecord[]): LintFinding[] {
  const findings: LintFinding[] = [];
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const left = skills[i];
      const right = skills[j];
      const shared = sharedPhrases(left.description, right.description);
      if (shared.length === 0) continue;
      findings.push({
        rule: "trigger-overlap",
        severity: "warning",
        skills: [left.name, right.name],
        message: `${left.name} and ${right.name} both fire on “${shared[0]}”`
      });
    }
  }
  return findings;
}

function duplicateCommands(skills: SkillRecord[]): LintFinding[] {
  const owners = new Map<string, Set<string>>();
  for (const skill of skills) {
    const owner = skill.pack ?? skill.name;
    for (const command of skill.commands) {
      const set = owners.get(command) ?? new Set<string>();
      set.add(owner);
      owners.set(command, set);
    }
  }
  const findings: LintFinding[] = [];
  for (const [command, packs] of owners) {
    if (packs.size < 2) continue;
    findings.push({
      rule: "duplicate-command",
      severity: "warning",
      skills: [...packs].sort(),
      message: `/${command} is registered by ${[...packs].sort().join(" and ")}`
    });
  }
  return findings;
}

export function sharedPhrases(a: string, b: string): string[] {
  const left = new Set(contentNgrams(a, 3));
  const right = contentNgrams(b, 3);
  return right.filter((phrase) => left.has(phrase));
}

function contentNgrams(text: string, n: number): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const phrases: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    const slice = words.slice(i, i + n);
    const content = slice.filter((w) => !STOP.has(w) && w.length >= 4);
    if (content.length < 2) continue;
    phrases.push(slice.join(" "));
  }
  return phrases;
}
