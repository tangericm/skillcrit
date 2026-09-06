import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./run-command.js";
import type { Adapter, EvalSummary, Metrics, TaskResult } from "./types.js";

export type EvalOptions = {
  tasksDir?: string;
  packDir: string | null;
  adapter: Adapter;
  /** Trials per configuration. More than one gives a spread to report. */
  repeat?: number;
  onProgress?: (n: number, total: number, task: string) => void;
};

const bundledTasks = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures/tasks"
);

/**
 * Limitations that belong in every report this command produces. The official
 * evaluation guidance compares with/without in clean contexts over repeated
 * trials and grades assertions; this harness does one coarse proxy (does the
 * task's own test suite pass, and how much extra code was written), so saying
 * so is part of the output rather than a footnote in the docs.
 */
const BASE_LIMITATIONS = [
  "Metrics are a proxy: the task's own test suite plus source-line overbuild, not graded assertions.",
  "Runs are not isolated per model context; there is no token or cost capture.",
  "Task fixtures are bundled examples, not a representative benchmark."
];

const SYNTHETIC_LIMITATION =
  "The adapter is synthetic: it replays recorded fixtures and never calls a model, so these numbers say nothing about agent behaviour.";

export async function evalPack(options: EvalOptions): Promise<EvalSummary> {
  const tasksDir = options.tasksDir ?? bundledTasks;
  if (!fs.existsSync(tasksDir) || !fs.statSync(tasksDir).isDirectory()) {
    throw new Error(`tasks dir not found: ${tasksDir}`);
  }
  const repeat = Math.max(1, options.repeat ?? 1);
  const tasks = fs
    .readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const results: TaskResult[] = [];
  let i = 0;
  for (const task of tasks) {
    i += 1;
    options.onProgress?.(i, tasks.length, task);
    const taskDir = path.join(tasksDir, task);
    const off = await runTrials(taskDir, null, options.adapter, repeat);
    const on = await runTrials(taskDir, options.packDir, options.adapter, repeat);
    results.push({ task, off, on });
  }

  const limitations = options.adapter.synthetic
    ? [SYNTHETIC_LIMITATION, ...BASE_LIMITATIONS]
    : [...BASE_LIMITATIONS];
  if (repeat === 1) {
    limitations.push("Single trial per configuration; no variance was measured.");
  }

  return {
    adapter: options.adapter.name,
    synthetic: options.adapter.synthetic,
    experimental: true,
    limitations,
    results,
    testsOn: results.filter((r) => r.on.testsPassed).length,
    testsOff: results.filter((r) => r.off.testsPassed).length,
    overbuildDelta:
      results.reduce((sum, r) => sum + r.on.overbuild, 0) -
      results.reduce((sum, r) => sum + r.off.overbuild, 0)
  };
}

async function runTrials(
  taskDir: string,
  skillsPath: string | null,
  adapter: Adapter,
  repeat: number
): Promise<Metrics> {
  const trials: Metrics[] = [];
  for (let i = 0; i < repeat; i++) {
    trials.push(await runTask(taskDir, skillsPath, adapter));
  }
  if (trials.length === 1) return { ...trials[0], trials: 1, wallMsStdDev: 0 };
  const wall = trials.map((t) => t.wallMs);
  return {
    testsPassed: trials.every((t) => t.testsPassed),
    linesAdded: Math.round(mean(trials.map((t) => t.linesAdded))),
    overbuild: Math.round(mean(trials.map((t) => t.overbuild))),
    wallMs: Math.round(mean(wall)),
    tokens: trials[0].tokens,
    trials: trials.length,
    wallMsStdDev: Math.round(stdDev(wall))
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

async function runTask(
  taskDir: string,
  skillsPath: string | null,
  adapter: Adapter
): Promise<Metrics> {
  const repoSrc = path.join(taskDir, "repo");
  // realpath so the work dir is already canonical: macOS hands out /var/…
  // for a /private/var/… temp root, and callers compare these paths.
  const tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-"))
  );
  try {
    copyDir(repoSrc, tmp);
    const promptFile = path.join(taskDir, "prompt.md");
    const prompt = fs.existsSync(promptFile)
      ? fs.readFileSync(promptFile, "utf8")
      : "";
    const started = Date.now();
    const adapterResult = await adapter.run({
      repo: tmp,
      taskDir,
      prompt,
      skillsPath
    });
    const testsPassed = runTests(tmp);
    const linesAdded = sourceLineCount(tmp);
    const golden = sourceLineCount(path.join(taskDir, "on"));
    return {
      testsPassed,
      linesAdded,
      overbuild: Math.max(0, linesAdded - golden),
      wallMs: Date.now() - started,
      tokens: adapterResult.tokens
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Run the task repo's own tests.
 *
 * `npm test` is avoided: spawning npm costs seconds per trial on Windows and
 * the task fixtures only need the script's command. When the script is a plain
 * `node …` invocation it is run directly with the current Node binary, which
 * is both faster and immune to npm's shim resolution.
 */
function runTests(repo: string): boolean {
  const pkgFile = path.join(repo, "package.json");
  if (!fs.existsSync(pkgFile)) return false;
  let script: string | undefined;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8")) as {
      scripts?: Record<string, string>;
    };
    script = pkg.scripts?.test;
  } catch {
    return false;
  }
  if (!script) return false;
  const direct = /^node\s+([^\s&|;><]+)\s*$/.exec(script.trim());
  if (direct) {
    const result = runCommand(process.execPath, [direct[1]], {
      cwd: repo,
      shell: false
    });
    return result.status === 0;
  }
  return runCommand("npm", ["test", "--silent"], { cwd: repo }).status === 0;
}

function sourceLineCount(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let lines = 0;
  for (const file of listFiles(dir)) {
    if (!/\.(mjs|js|ts|py)$/.test(file)) continue;
    if (file.endsWith(".test.mjs") || file.endsWith(".test.js")) continue;
    const text = fs.readFileSync(file, "utf8");
    lines += text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  }
  return lines;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

export function formatEval(summary: EvalSummary): string {
  const lines = ["# skillcrit eval", ""];
  lines.push(
    `adapter: ${summary.adapter}${summary.synthetic ? " (synthetic — replays fixtures, no model call)" : ""}`
  );
  lines.push("status: experimental");
  lines.push("");
  for (const row of summary.results) {
    const spread =
      row.on.trials && row.on.trials > 1
        ? `  trials=${row.on.trials} wall±${row.on.wallMsStdDev ?? 0}ms`
        : "";
    lines.push(
      `${row.task}  off overbuild=${row.off.overbuild}  on overbuild=${row.on.overbuild}  tests off=${row.off.testsPassed ? "pass" : "fail"} on=${row.on.testsPassed ? "pass" : "fail"}${spread}`
    );
  }
  lines.push("");
  lines.push(
    `overbuild delta ${summary.overbuildDelta}  (negative means the pack wrote less code)`
  );
  lines.push("");
  lines.push("## limitations", "");
  for (const limit of summary.limitations) lines.push(`- ${limit}`);
  lines.push("");
  return lines.join("\n");
}
