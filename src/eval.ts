import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCommand } from "./run-command.js";
import type { Adapter, EvalSummary, Metrics, TaskResult } from "./types.js";

export type EvalOptions = {
  tasksDir: string;
  packDir: string | null;
  adapter: Adapter;
};

export async function evalPack(options: EvalOptions): Promise<EvalSummary> {
  const tasks = fs
    .readdirSync(options.tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const results: TaskResult[] = [];
  for (const task of tasks) {
    const taskDir = path.join(options.tasksDir, task);
    const off = await runTask(taskDir, null, options.adapter);
    const on = await runTask(taskDir, options.packDir, options.adapter);
    results.push({ task, off, on });
  }

  return {
    results,
    testsOn: results.filter((r) => r.on.testsPassed).length,
    testsOff: results.filter((r) => r.off.testsPassed).length,
    overbuildDelta:
      results.reduce((sum, r) => sum + r.on.overbuild, 0) -
      results.reduce((sum, r) => sum + r.off.overbuild, 0)
  };
}

async function runTask(
  taskDir: string,
  skillsPath: string | null,
  adapter: Adapter
): Promise<Metrics> {
  const repoSrc = path.join(taskDir, "repo");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-"));
  copyDir(repoSrc, tmp);
  const prompt = fs.existsSync(path.join(taskDir, "prompt.md"))
    ? fs.readFileSync(path.join(taskDir, "prompt.md"), "utf8")
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
}

function runTests(repo: string): boolean {
  const pkg = path.join(repo, "package.json");
  if (fs.existsSync(pkg)) {
    const result = runCommand("npm", ["test", "--silent"], { cwd: repo });
    return result.status === 0;
  }
  return false;
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
