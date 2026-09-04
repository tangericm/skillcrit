export type SkillRecord = {
  name: string;
  skillDir: string;
  skillFile: string;
  description: string;
  body: string;
  pack: string | null;
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
  | "duplicate-command"
  | "duplicate-copy"
  | "always-on"
  | "always-loaded-tokens";

export type LintFinding = {
  rule: LintRule;
  severity: "error" | "warning" | "info";
  skills: string[];
  message: string;
};

export type LintReport = {
  findings: LintFinding[];
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
