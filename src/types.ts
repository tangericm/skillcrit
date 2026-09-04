import type { RuleId } from "./rules.js";

export type SkillOrigin = "project" | "user" | "marketplace" | "cache";

export type Severity = "error" | "warning" | "info";

/** One spec/budget defect found while parsing a single SKILL.md. */
export type SpecFinding = {
  id: RuleId;
  severity: Severity;
  /** Frontmatter field or `body`; empty when the whole file failed to parse. */
  field: string;
  message: string;
  /** 1-indexed line in SKILL.md, when it can be located. */
  line: number | null;
};

export type SkillRecord = {
  name: string;
  skillDir: string;
  skillFile: string;
  description: string;
  body: string;
  pack: string | null;
  version: string | null;
  origin: SkillOrigin;
  commands: string[];
  hooks: boolean;
  alwaysOn: boolean;
  descriptionTokens: number;
  bodyTokens: number;
  bodyLines: number;
  /** sha256 of the raw SKILL.md bytes — the provenance handle for a copy. */
  hash: string;
  alwaysOnTokens: number;
  /** Human-readable spec messages. Kept for compatibility; see specFindings. */
  specIssues: string[];
  specFindings: SpecFinding[];
  risks: RiskFinding[];
};

export type RiskFinding = {
  id: RuleId;
  severity: Severity;
  /** File the signal was seen in, relative to the skill directory. */
  file: string;
  line: number | null;
  /** The matched text, trimmed and truncated. */
  evidence: string;
};

export type LintRule =
  | "spec"
  | "budget"
  | "trigger-overlap"
  | "contention"
  | "duplicate-command"
  | "duplicate-copy"
  | "version-conflict"
  | "shadowed"
  | "risk"
  | "always-on"
  | "always-loaded-tokens";

export type CleanupKind =
  | "drop-copy"
  | "ignore-mirror"
  | "pick-version"
  | "prefer-skill";

export type CleanupOrphan = {
  dir: string;
  origin: SkillOrigin;
  version: string | null;
  why: string;
};

export type CleanupAction = {
  kind: CleanupKind;
  name: string;
  keep: string;
  drop: string[];
  reason: string;
  harmful: boolean;
  keepDirs: string[];
  keepOrigin: SkillOrigin;
  keepVersion: string | null;
  orphans: CleanupOrphan[];
};

export type LintFinding = {
  /** Stable rule ID. Safe to gate CI on; see src/rules.ts. */
  id: RuleId;
  rule: LintRule;
  severity: Severity;
  skills: string[];
  message: string;
  /** Absolute path the finding is anchored to, for editor and CI links. */
  file?: string;
  line?: number | null;
  /** What to do about it. */
  remediation?: string;
  keep?: string;
  drop?: string[];
};

export type CleanupQuestion = {
  id: number;
  kind: CleanupKind;
  prompt: string;
  keep: string;
  drop: string[];
  harmful: boolean;
};

export type TokenComparison = {
  scanned: number;
  unique: number;
  alwaysOnNow: number;
  afterCleanup: number;
  saved: number;
  descriptionOnly: number;
};

export type LintReport = {
  /**
   * Scanned root, when the caller knew one. Renderers print paths relative to
   * it; SARIF and GitHub annotations need repo-relative paths to line up with
   * a diff at all.
   */
  root?: string;
  findings: LintFinding[];
  cleanup: CleanupAction[];
  questions: CleanupQuestion[];
  tokens: TokenComparison;
  alwaysOnTokens: number;
  scanned: number;
  unique: number;
};

/** One same-name cleanup group, not a runtime namespace. */
export type SkillRecommendation = {
  name: string;
  recommended: SkillRecord;
  reason: string;
  alternatives: { skill: SkillRecord; why: string }[];
  /** Equal SKILL.md bytes only; supporting files may differ. */
  identicalInstructions: SkillRecord[];
};

export type DoctorReport = {
  root: string;
  runtimeResolution: "unknown";
  limitations: string[];
  recommendations: SkillRecommendation[];
  scanned: number;
  alternatives: number;
  recommendedCatalogTokens: number;
  recommendedAlwaysOnTokens: number;
  risks: { skill: string; skillFile: string; finding: RiskFinding }[];
  roots: { path: string; harness: string; scope: string; skills: number }[];
};

export type Metrics = {
  testsPassed: boolean;
  linesAdded: number;
  overbuild: number;
  wallMs: number;
  tokens?: number;
  /** Trials this row averages. */
  trials?: number;
  /** Spread across those trials; 0 for a deterministic adapter. */
  wallMsStdDev?: number;
};

export type TaskResult = {
  task: string;
  off: Metrics;
  on: Metrics;
};

export type EvalSummary = {
  /** Adapter that produced these numbers. */
  adapter: string;
  /** True when the adapter does not call a model; see adapters/. */
  synthetic: boolean;
  experimental: boolean;
  limitations: string[];
  results: TaskResult[];
  testsOn: number;
  testsOff: number;
  overbuildDelta: number;
};

export type AdapterRun = {
  repo: string;
  taskDir: string;
  prompt: string;
  skillsPath: string | null;
};

export type Adapter = {
  name: string;
  /** One line for `skillcrit eval --agent list`. */
  summary: string;
  /** A synthetic adapter replays fixtures; it measures nothing about a model. */
  synthetic: boolean;
  run(opts: AdapterRun): Promise<{ tokens?: number }>;
};

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
