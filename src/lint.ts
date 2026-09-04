import { compareSkills, compareVersions, labelSkill } from "./origin.js";
import { cleanupQuestions, tokenComparison } from "./summary.js";
import type {
  CleanupAction,
  CleanupKind,
  LintFinding,
  LintReport,
  SkillOrigin,
  SkillRecord
} from "./types.js";

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

export function identityKey(skill: SkillRecord): string {
  return `${skill.name}\n${skill.description}\n${skill.body}`;
}

export function lint(skills: SkillRecord[]): LintReport {
  const groups = new Map<string, SkillRecord[]>();
  for (const skill of skills) {
    const key = identityKey(skill);
    const list = groups.get(key) ?? [];
    list.push(skill);
    groups.set(key, list);
  }

  const unique = [...groups.values()].map(
    (group) => [...group].sort(byRankDesc)[0]
  );
  const findings: LintFinding[] = [];
  const cleanup: CleanupAction[] = [];

  findings.push(...duplicateCopies(groups, cleanup));
  findings.push(...versionConflicts(skills, cleanup));

  for (const skill of unique) {
    for (const issue of skill.specIssues) {
      findings.push({
        rule: "spec",
        severity: "error",
        skills: [skill.name],
        message: issue,
        keep: skill.skillDir
      });
    }
  }

  findings.push(...contentionClusters(unique, cleanup));
  findings.push(...duplicateCommands(unique));

  let alwaysOnTokens = 0;
  for (const skill of unique) {
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
    skills: unique.map((s) => s.name),
    message: `~${alwaysOnTokens} always-loaded tokens across ${unique.length} unique skills (${skills.length} scanned)`
  });

  return {
    findings,
    cleanup,
    questions: cleanupQuestions(cleanup),
    tokens: tokenComparison(unique, cleanup, skills.length),
    alwaysOnTokens,
    scanned: skills.length,
    unique: unique.length
  };
}

function duplicateCopies(
  groups: Map<string, SkillRecord[]>,
  cleanup: CleanupAction[]
): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort(byRankDesc);
    const keep = ranked[0];
    const drop = ranked.slice(1);
    const extrasAreMirrors = drop.every(
      (s) => s.origin === "cache" || s.origin === "marketplace"
    );
    const n = drop.length;
    const copyWord = n === 1 ? "copy" : "copies";
    findings.push({
      rule: "duplicate-copy",
      severity: extrasAreMirrors ? "info" : "warning",
      skills: ranked.map((s) => s.name),
      message: extrasAreMirrors
        ? `${keep.name} has ${n} harmless mirror ${copyWord} (cache/marketplace). Keep ${keep.skillFile}`
        : `${keep.name} is installed at ${ranked.length} paths — organize to one copy. Keep ${keep.skillFile}. Also: ${drop.map((s) => s.skillFile).join(", ")}`,
      keep: keep.skillFile,
      drop: drop.map((s) => s.skillFile)
    });
    cleanup.push(
      cleanupFrom(
        extrasAreMirrors ? "ignore-mirror" : "drop-copy",
        [keep],
        drop,
        extrasAreMirrors
          ? "identical cache/marketplace mirrors; safe to ignore or delete extras"
          : `identical copies of ${keep.name}; keep the ${keep.origin} path and remove extras to cut always-on tokens`,
        !extrasAreMirrors
      )
    );
  }
  return findings;
}

function versionConflicts(
  skills: SkillRecord[],
  cleanup: CleanupAction[]
): LintFinding[] {
  const byName = new Map<string, SkillRecord[]>();
  for (const skill of skills) {
    const list = byName.get(skill.name) ?? [];
    list.push(skill);
    byName.set(skill.name, list);
  }
  const findings: LintFinding[] = [];
  for (const [name, group] of byName) {
    const variants = new Map<string, SkillRecord>();
    for (const skill of group) {
      const key = identityKey(skill);
      const prev = variants.get(key);
      if (!prev || compareSkills(skill, prev) > 0) variants.set(key, skill);
    }
    const distinct = [...variants.values()];
    if (distinct.length < 2) continue;
    const ranked = distinct.sort(byRankDesc);
    const keep = ranked[0];
    const drop = ranked.slice(1);
    const versions = ranked
      .map((s) => s.version ?? "unversioned")
      .filter((v, i, all) => all.indexOf(v) === i);
    findings.push({
      rule: "version-conflict",
      severity: "warning",
      skills: ranked.map((s) => s.name),
      message: `${name} has ${ranked.length} variants (${versions.join(" vs ")}). Prefer ${labelSkill(keep)} at ${keep.skillFile}`,
      keep: keep.skillFile,
      drop: drop.map((s) => s.skillFile)
    });
    cleanup.push(
      cleanupFrom(
        "pick-version",
        [keep],
        drop,
        `multiple versions of ${name}; disable or remove older/lower-rank copies`,
        true
      )
    );
  }
  return findings;
}

function contentionClusters(
  skills: SkillRecord[],
  cleanup: CleanupAction[]
): LintFinding[] {
  const clusters = overlapClusters(skills);
  const findings: LintFinding[] = [];
  for (const members of clusters) {
    const ranked = [...members].sort(byRankDesc);
    const { keep, drop } = independentSet(members);
    const phrase = firstOverlapPhrase(members) ?? "the same trigger";
    const order = ranked.map((s) => labelSkill(s)).join(" > ");
    const keepNames = keep.map((s) => s.name).join(", ");
    findings.push({
      rule: "contention",
      severity: "warning",
      skills: ranked.map((s) => s.name),
      message: `${ranked.length} skills contend on “${phrase}”. Suggested order: ${order}. Keep ${keepNames}.`,
      keep: keep[0].skillFile,
      drop: drop.map((s) => s.skillFile)
    });
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const shared = sharedPhrases(members[i].description, members[j].description);
        if (shared.length === 0) continue;
        findings.push({
          rule: "trigger-overlap",
          severity: "warning",
          skills: [members[i].name, members[j].name],
          message: `${members[i].name} / ${members[j].name} share “${shared[0]}”`
        });
      }
    }
    if (drop.length === 0) continue;
    cleanup.push(
      cleanupFrom(
        "prefer-skill",
        keep,
        drop,
        `overlapping triggers; keep ${keep.map(labelSkill).join(", ")} enabled and consider disabling the rest`,
        true
      )
    );
  }
  return findings;
}

function byRankDesc(a: SkillRecord, b: SkillRecord): number {
  return compareSkills(b, a);
}

function independentSet(members: SkillRecord[]): {
  keep: SkillRecord[];
  drop: SkillRecord[];
} {
  const keep: SkillRecord[] = [];
  const drop: SkillRecord[] = [];
  for (const skill of [...members].sort(byRankDesc)) {
    const conflicts = keep.some(
      (kept) => sharedPhrases(kept.description, skill.description).length > 0
    );
    if (conflicts) drop.push(skill);
    else keep.push(skill);
  }
  return { keep, drop };
}

function firstOverlapPhrase(members: SkillRecord[]): string | undefined {
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const shared = sharedPhrases(members[i].description, members[j].description);
      if (shared[0]) return shared[0];
    }
  }
  return undefined;
}

function overlapClusters(skills: SkillRecord[]): SkillRecord[][] {
  const n = skills.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (sharedPhrases(skills[i].description, skills[j].description).length === 0) {
        continue;
      }
      adj[i].push(j);
      adj[j].push(i);
    }
  }
  const seen = new Set<number>();
  const clusters: SkillRecord[][] = [];
  for (let i = 0; i < n; i++) {
    if (seen.has(i) || adj[i].length === 0) continue;
    const stack = [i];
    const members: SkillRecord[] = [];
    seen.add(i);
    while (stack.length) {
      const u = stack.pop()!;
      members.push(skills[u]);
      for (const v of adj[u]) {
        if (seen.has(v)) continue;
        seen.add(v);
        stack.push(v);
      }
    }
    if (members.length >= 2) clusters.push(members);
  }
  return clusters;
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

export function cleanupPlan(report: LintReport): string {
  const spec = report.findings.filter((f) => f.rule === "spec");
  const lines = [
    "# skillcrit cleanup",
    "",
    "Dry-run. No skill files were deleted or modified.",
    "",
    `${report.unique} unique / ${report.scanned} scanned`,
    ""
  ];
  if (report.cleanup.length === 0 && spec.length === 0) {
    lines.push("Nothing to organize.", "");
    return lines.join("\n");
  }
  for (const action of report.cleanup) {
    lines.push(`## ${action.name} — ${sectionTitle(action)}`);
    lines.push("");
    lines.push(action.reason);
    lines.push("");
    lines.push(`**Keep** (${labelKeep(action)})`);
    lines.push("");
    for (const dir of action.keepDirs) lines.push(`- \`${dir}\``);
    lines.push("");
    if (action.orphans.length > 0) {
      const verb =
        action.kind === "ignore-mirror"
          ? "optional ignore/delete"
          : "delete or disable";
      lines.push(`**Orphans** (${verb})`);
      lines.push("");
      for (const orphan of action.orphans) {
        lines.push(`- \`${orphan.dir}\` — ${orphan.why}`);
      }
      lines.push("");
    }
  }
  if (spec.length > 0) {
    lines.push("## Spec errors");
    lines.push("");
    lines.push("**Orphans** (fix or delete)");
    lines.push("");
    for (const finding of spec) {
      const dir = finding.keep ?? finding.skills[0];
      lines.push(`- \`${dir}\` — ${finding.message}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function cleanupFrom(
  kind: CleanupKind,
  keepers: SkillRecord[],
  drop: SkillRecord[],
  reason: string,
  harmful: boolean
): CleanupAction {
  const keep = keepers[0];
  return {
    kind,
    name: keepers.map((s) => s.name).join(", "),
    keep: keep.skillFile,
    drop: drop.map((s) => s.skillFile),
    reason,
    harmful,
    keepDirs: keepers.map((s) => s.skillDir),
    keepOrigin: keep.origin,
    keepVersion: keep.version,
    orphans: drop.map((s) => ({
      dir: s.skillDir,
      origin: s.origin,
      version: s.version,
      why: orphanWhy(kind, keep, s)
    }))
  };
}

function sectionTitle(action: CleanupAction): string {
  switch (action.kind) {
    case "drop-copy":
      return "identical copies";
    case "ignore-mirror":
      return "cache/marketplace mirrors";
    case "pick-version":
      return "version conflict";
    case "prefer-skill":
      return "overlapping triggers";
  }
}

function labelKeep(action: CleanupAction): string {
  const ver = action.keepVersion ? `@${action.keepVersion}` : "unversioned";
  return `${action.keepOrigin} ${ver}`;
}

function orphanWhy(
  kind: CleanupKind,
  keep: SkillRecord,
  drop: SkillRecord
): string {
  const dropVer = formatVer(drop.origin, drop.version);
  if (kind === "ignore-mirror") {
    return `${drop.origin} mirror of ${keep.origin}`;
  }
  if (kind === "drop-copy") {
    return `identical copy (${dropVer})`;
  }
  if (kind === "pick-version") {
    const bits: string[] = [];
    if (drop.origin !== keep.origin) {
      bits.push(`${drop.origin} outranked by ${keep.origin}`);
    }
    if (compareVersions(keep.version, drop.version) > 0) {
      bits.push(`older ${formatVer(drop.origin, drop.version)}`);
    } else if (drop.version && keep.version && drop.version !== keep.version) {
      bits.push(`${dropVer} vs keep ${formatVer(keep.origin, keep.version)}`);
    }
    if (drop.specIssues[0]) bits.push(drop.specIssues[0]);
    return bits.join("; ") || dropVer;
  }
  return `overlapping triggers; ${dropVer}, lower rank than ${keep.name}`;
}

function formatVer(origin: SkillOrigin, version: string | null): string {
  return version ? `${origin} @${version}` : origin;
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
