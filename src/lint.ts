import path from "node:path";
import { DEFAULT_CONFIG, severityFor, type SkillcritConfig } from "./config.js";
import { compareSkills, compareVersions, labelSkill } from "./origin.js";
import { displayPath } from "./paths.js";
import { RULES, type RuleId } from "./rules.js";
import { cleanupQuestions, tokenComparison } from "./summary.js";
import type {
  CleanupAction,
  CleanupKind,
  LintFinding,
  LintReport,
  LintRule,
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

function identityKey(skill: SkillRecord): string {
  // Include all frontmatter, including client controls. Matching bodies alone
  // cannot establish identical instructions or equivalent permissions.
  return `${skill.name}\n${skill.hash}`;
}

export function lint(
  skills: SkillRecord[],
  config: SkillcritConfig = DEFAULT_CONFIG,
  root?: string
): LintReport {
  const emit = findingEmitter(config);
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

  findings.push(...duplicateCopies(groups, cleanup, emit));
  findings.push(...versionConflicts(skills, cleanup, emit));

  // Equal instruction text does not imply equal metadata or bundled scripts.
  for (const skill of skills) {
    for (const issue of skill.specFindings) {
      const rule: LintRule = issue.id.startsWith("SC2") ? "budget" : "spec";
      const finding = emit(issue.id, rule, [skill.name], issue.message, {
        file: skill.skillFile,
        line: issue.line,
        keep: skill.skillDir
      });
      if (finding) findings.push(finding);
    }
    for (const risk of skill.risks) {
      const finding = emit(
        risk.id,
        "risk",
        [skill.name],
        `${skill.name}: ${RULES[risk.id].title} — \`${risk.evidence}\``,
        { file: path.join(skill.skillDir, risk.file), line: risk.line }
      );
      if (finding) findings.push(finding);
    }
  }

  for (const finding of contentionClusters(unique, cleanup, emit)) findings.push(finding);
  findings.push(...duplicateCommands(unique, emit));

  let alwaysOnTokens = 0;
  for (const skill of unique) {
    alwaysOnTokens += skill.alwaysOn
      ? skill.alwaysOnTokens
      : skill.descriptionTokens;
    if (skill.alwaysOn) {
      const why = skill.hooks
        ? "plugin declares hooks"
        : "always-on body phrasing";
      const finding = emit(
        "SC2003",
        "always-on",
        [skill.name],
        `${skill.name} has an always-on signal (${why}); ~${skill.alwaysOnTokens} estimated tokens if its body is loaded`,
        { file: skill.skillFile }
      );
      if (finding) findings.push(finding);
    }
  }

  const budget = config.budget.alwaysOnTokens;
  const overBudget = budget != null && alwaysOnTokens > budget;
  const total = emit(
    "SC2004",
    "always-loaded-tokens",
    unique.map((s) => s.name),
    overBudget
      ? `~${alwaysOnTokens} estimated tokens for the hypothetical set of ${unique.length} unique instruction files (${skills.length} scanned) — over the configured budget of ${budget}`
      : `~${alwaysOnTokens} estimated tokens for the hypothetical set of ${unique.length} unique instruction files (${skills.length} scanned)`,
    {},
    overBudget ? "warning" : undefined
  );
  if (total) findings.push(total);

  return {
    root,
    runtimeResolution: "unknown",
    limitations: [
      "Cleanup ranking is not runtime precedence. Verify client namespaces, enablement and validity before removing a copy.",
      "Identical instructions means equal SKILL.md bytes; scripts, references and other package files may differ.",
      "Token totals and savings estimate a hypothetical set, not a measured session. Hooks and body phrasing do not prove loading."
    ],
    findings,
    cleanup,
    questions: cleanupQuestions(cleanup),
    tokens: tokenComparison(unique, cleanup, skills.length),
    alwaysOnTokens,
    scanned: skills.length,
    unique: unique.length
  };
}

type Emit = (
  id: RuleId,
  rule: LintRule,
  skills: string[],
  message: string,
  extra?: { file?: string; line?: number | null; keep?: string; drop?: string[] },
  severityOverride?: LintFinding["severity"]
) => LintFinding | null;

/**
 * Builds a finding with its stable ID and remediation attached, or returns
 * null when `.skillcrit.json` switched the rule off.
 */
function findingEmitter(config: SkillcritConfig): Emit {
  return (id, rule, skills, message, extra = {}, severityOverride) => {
    const severity = severityFor(config, id, severityOverride);
    if (!severity) return null;
    return {
      id,
      rule,
      severity,
      skills,
      message,
      remediation: RULES[id].remediation,
      ...extra
    };
  };
}

function duplicateCopies(
  groups: Map<string, SkillRecord[]>,
  cleanup: CleanupAction[],
  emit: Emit
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
    const finding = emit(
      "SC3001",
      "duplicate-copy",
      ranked.map((s) => s.name),
      // Paths live in `keep` and `drop`; renderers print them, and the JSON
      // consumer has them structured. Repeating them here just makes the line
      // unreadable in a terminal.
      extrasAreMirrors
        ? `${keep.name} has ${n} identical instruction ${copyWord} (cache/marketplace); keeping the ${keep.origin} copy`
        : `${keep.name} has identical instruction files at ${ranked.length} paths — review supporting files and client usage before cleanup`,
      {
        file: keep.skillFile,
        keep: keep.skillFile,
        drop: drop.map((s) => s.skillFile)
      },
      extrasAreMirrors ? "info" : undefined
    );
    if (finding) findings.push(finding);
    cleanup.push(
      cleanupFrom(
        extrasAreMirrors ? "ignore-mirror" : "drop-copy",
        [keep],
        drop,
        extrasAreMirrors
          ? "identical instruction files in cache/marketplace; supporting files and client usage must be checked before cleanup"
          : `identical instructions for ${keep.name}; review supporting files and client usage before removing any path`,
        !extrasAreMirrors
      )
    );
  }
  return findings;
}

function versionConflicts(
  skills: SkillRecord[],
  cleanup: CleanupAction[],
  emit: Emit
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
    const finding = emit(
      "SC3002",
      "version-conflict",
      ranked.map((s) => s.name),
      // No path in the message: every renderer prints the `file` anchor
      // itself, and repeating an absolute path doubles the line length.
      `${name} has ${ranked.length} variants (${versions.join(" vs ")}). Prefer ${labelSkill(keep)}`,
      {
        file: keep.skillFile,
        keep: keep.skillFile,
        drop: drop.map((s) => s.skillFile)
      }
    );
    if (finding) findings.push(finding);
    cleanup.push(
      cleanupFrom(
        "pick-version",
        [keep],
        drop,
        `alternative instruction files or metadata for ${name}; verify client namespaces, permissions and supporting files before changing any copy`,
        true
      )
    );
  }
  return findings;
}

function contentionClusters(
  skills: SkillRecord[],
  cleanup: CleanupAction[],
  emit: Emit
): LintFinding[] {
  const clusters = overlapClusters(skills);
  const findings: LintFinding[] = [];
  for (const members of clusters) {
    // Dense clusters carry no evidence that hundreds of skills should be
    // disabled. Summarize membership instead of emitting every pair or
    // computing a speculative cleanup set.
    if (members.length > 20) {
      const summary = emit("SC3003", "contention", members.map(s => s.name),
        `${members.length} skills share trigger phrases (heuristic). Review this cluster; pair details and cleanup ranking omitted above 20 members.`,
        { file: members[0].skillFile });
      if (summary) findings.push(summary);
      continue;
    }
    const ranked = [...members].sort(byRankDesc);
    const { keep, drop } = independentSet(members);
    const phrase = firstOverlapPhrase(members) ?? "the same trigger";
    const order = ranked.map((s) => labelSkill(s)).join(" > ");
    const keepNames = keep.map((s) => s.name).join(", ");
    const cluster = emit(
      "SC3003",
      "contention",
      ranked.map((s) => s.name),
      `${ranked.length} skills share “${phrase}” (heuristic, not measured contention). Review suggested order: ${order}. Candidate: ${keepNames}.`,
      {
        file: keep[0].skillFile,
        keep: keep[0].skillFile,
        drop: drop.map((s) => s.skillFile)
      }
    );
    if (cluster) findings.push(cluster);
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        if (members[i].name === members[j].name) continue;
        const shared = sharedPhrases(members[i].description, members[j].description);
        if (shared.length === 0) continue;
        const overlap = emit(
          "SC3004",
          "trigger-overlap",
          [members[i].name, members[j].name],
          `${members[i].name} / ${members[j].name} share “${shared[0]}”`,
          { file: members[i].skillFile }
        );
        if (overlap) findings.push(overlap);
      }
    }
    if (drop.length === 0) continue;
    cleanup.push(
      cleanupFrom(
        "prefer-skill",
        keep,
        drop,
        `shared trigger phrases; compare intended tasks and measure client triggering before changing any skill`,
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
  // Index phrases once and union their owners. No quadratic adjacency graph.
  const parent = skills.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const owners = new Map<string, number[]>();
  skills.forEach((skill, i) => {
    for (const phrase of new Set(contentNgrams(skill.description, 3))) {
      const group = owners.get(phrase);
      if (group) group.push(i);
      else owners.set(phrase, [i]);
    }
  });
  for (const group of owners.values()) {
    const first = group[0];
    // Same-name versions alone are not trigger contention. Once another name
    // shares the phrase, every owner belongs to the same connected component.
    if (!group.some(i => skills[i].name !== skills[first].name)) continue;
    const root = find(first);
    for (const i of group) parent[find(i)] = root;
  }
  const groups = new Map<number, SkillRecord[]>();
  skills.forEach((skill, i) => {
    const key = find(i);
    const members = groups.get(key);
    if (members) members.push(skill);
    else groups.set(key, [skill]);
  });
  return [...groups.values()].filter(members => members.length > 1);
}

function duplicateCommands(skills: SkillRecord[], emit: Emit): LintFinding[] {
  const owners = new Map<string, Set<string>>();
  const where = new Map<string, string>();
  for (const skill of skills) {
    const owner = skill.pack ?? skill.name;
    for (const command of skill.commands) {
      const set = owners.get(command) ?? new Set<string>();
      set.add(owner);
      owners.set(command, set);
      if (!where.has(command)) where.set(command, skill.skillFile);
    }
  }
  const findings: LintFinding[] = [];
  for (const [command, packs] of owners) {
    if (packs.size < 2) continue;
    const finding = emit(
      "SC3005",
      "duplicate-command",
      [...packs].sort(),
      `/${command} is registered by ${[...packs].sort().join(" and ")}`,
      { file: where.get(command) }
    );
    if (finding) findings.push(finding);
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
    "Runtime selection: unknown. Cleanup ranking and token estimates do not establish what a client loads.",
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
    for (const dir of action.keepDirs) {
      lines.push(`- \`${displayPath(dir, report.root)}\``);
    }
    lines.push("");
    if (action.orphans.length > 0) {
      lines.push("**Alternatives** (review supporting files and client usage before changes)");
      lines.push("");
      for (const orphan of action.orphans) {
        lines.push(`- \`${displayPath(orphan.dir, report.root)}\` — ${orphan.why}`);
      }
      lines.push("");
    }
  }
  for (const [title, findings] of [
    ["Spec findings to review", spec.filter(f => f.severity !== "info")],
    ["Informational notes", spec.filter(f => f.severity === "info")]
  ] as const) {
    if (findings.length === 0) continue;
    lines.push(`## ${title}`, "");
    for (const finding of findings) {
      const dir = finding.keep ?? finding.skills[0];
      lines.push(`- \`${displayPath(dir, report.root)}\` — ${finding.severity} ${finding.id} ${finding.message}`);
      if (finding.remediation) lines.push(`  ${finding.remediation}`);
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
    return `${drop.origin} has identical instructions to ${keep.origin}; supporting files not compared`;
  }
  if (kind === "drop-copy") {
    return `identical instructions (${dropVer}); supporting files not compared`;
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
