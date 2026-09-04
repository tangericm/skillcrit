export type SkillOrigin = "project" | "user" | "marketplace" | "cache";

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
  alwaysOnTokens: number;
  specIssues: string[];
};

export type LintRule =
  | "spec"
  | "trigger-overlap"
  | "contention"
  | "duplicate-command"
  | "duplicate-copy"
  | "version-conflict"
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
  rule: LintRule;
  severity: "error" | "warning" | "info";
  skills: string[];
  message: string;
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
  findings: LintFinding[];
  cleanup: CleanupAction[];
  questions: CleanupQuestion[];
  tokens: TokenComparison;
  alwaysOnTokens: number;
  scanned: number;
  unique: number;
};

export type Metrics = {
  testsPassed: boolean;
  linesAdded: number;
  overbuild: number;
  wallMs: number;
  tokens?: number;
};

export type TaskResult = {
  task: string;
  off: Metrics;
  on: Metrics;
};

export type EvalSummary = {
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
  run(opts: AdapterRun): Promise<{ tokens?: number }>;
};

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
