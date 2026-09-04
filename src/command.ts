import fs from "node:fs";
import path from "node:path";
import { stubAdapter } from "./adapters/stub.js";
import { evalPack } from "./eval.js";
import { cleanupPlan, lint } from "./lint.js";
import { createProgress } from "./progress.js";
import { formatRoots, listSkillLocations } from "./roots.js";
import { scan } from "./scan.js";
import { formatSummary } from "./summary.js";
import type { Adapter } from "./types.js";
import { packageVersion } from "./version.js";

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  const { command, target, json, user, tasks, agent, help, version } = parsed;
  const progress = createProgress(!json && Boolean(process.stderr.isTTY));

  if (version || command === "version") {
    process.stdout.write(`skillcrit ${packageVersion()}\n`);
    return 0;
  }

  if (help || !command || command === "help" || command === "--help") {
    process.stdout.write(usage());
    return help || command ? 0 : 2;
  }

  if (command === "roots") {
    const locations = listSkillLocations(target ?? process.cwd(), { user: true });
    if (json) {
      process.stdout.write(JSON.stringify({ locations }, null, 2) + "\n");
    } else {
      process.stdout.write(formatRoots(locations));
    }
    return 0;
  }

  if (command === "scan") {
    progress.phase("scan");
    const skills = scan(target ?? process.cwd(), {
      user,
      onProgress: (n) => progress.tick("scan", n)
    });
    progress.done(`scanned ${skills.length} skills`);
    if (json) {
      process.stdout.write(JSON.stringify({ skills }, null, 2) + "\n");
    } else {
      for (const skill of skills) {
        const pack = skill.pack ? ` [${skill.pack}]` : "";
        const ver = skill.version ? `@${skill.version}` : "";
        process.stdout.write(
          `${skill.name}${ver}${pack}  ${skill.origin}  ${skill.descriptionTokens} tok\n`
        );
      }
      process.stdout.write(`${skills.length} skills\n`);
    }
    return 0;
  }

  if (command === "lint") {
    progress.phase("scan");
    const skills = scan(target ?? process.cwd(), {
      user,
      onProgress: (n) => progress.tick("scan", n)
    });
    progress.phase("lint");
    const report = lint(skills);
    progress.done(
      `${report.unique} unique / ${report.scanned} scanned  ~${report.tokens.alwaysOnNow} tok`
    );
    if (parsed.fix && !json) {
      const md = cleanupPlan(report);
      process.stdout.write(md);
      process.stdout.write(formatSummary(report));
      writeCleanupDoc(parsed.out, md);
      const blocking = report.findings.filter((f) => f.severity !== "info");
      return blocking.length > 0 ? 1 : 0;
    }
    if (json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      for (const finding of report.findings) {
        process.stdout.write(
          `${finding.severity} ${finding.rule}: ${finding.message}\n`
        );
      }
      process.stdout.write(formatSummary(report));
    }
    const blocking = report.findings.filter((f) => f.severity !== "info");
    return blocking.length > 0 ? 1 : 0;
  }

  if (command === "eval") {
    if (!target) {
      process.stderr.write("skillcrit eval <pack-dir>\n");
      return 2;
    }
    const adapter = resolveAdapter(agent);
    progress.phase("eval");
    const summary = await evalPack({
      tasksDir: tasks,
      packDir: target,
      adapter,
      onProgress: (n, total, task) => progress.tick(task, n, total)
    });
    progress.done(
      `eval ${summary.results.length} tasks  overbuild Δ ${summary.overbuildDelta}`
    );
    if (json) {
      process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    } else {
      for (const row of summary.results) {
        process.stdout.write(
          `${row.task}  off overbuild=${row.off.overbuild}  on overbuild=${row.on.overbuild}\n`
        );
      }
    }
    return 0;
  }

  process.stderr.write(`unknown command: ${command}\n${usage()}`);
  return 2;
}

function resolveAdapter(agent: string): Adapter {
  if (agent === "stub" || agent === "") return stubAdapter;
  throw new Error(
    `agent "${agent}" is not wired in v0.4; use --agent stub (claude/codex adapters come later)`
  );
}

function parseArgs(argv: string[]) {
  const rest = argv.slice(2);
  const flags = new Set<string>();
  const kv = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (
      arg === "--json" ||
      arg === "--user" ||
      arg === "--help" ||
      arg === "--version" ||
      arg === "-V" ||
      arg === "--fix"
    ) {
      flags.add(arg === "-V" ? "--version" : arg);
    } else if (arg === "--tasks" || arg === "--agent" || arg === "--out") {
      kv.set(arg, rest[++i] ?? "");
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown flag ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  return {
    command: positional[0],
    target: positional[1],
    json: flags.has("--json"),
    user: flags.has("--user"),
    help: flags.has("--help"),
    version: flags.has("--version"),
    fix: flags.has("--fix"),
    out: kv.get("--out") ?? (flags.has("--fix") && !flags.has("--json") ? "skillcrit-cleanup.md" : "-"),
    tasks: kv.get("--tasks"),
    agent: kv.get("--agent") ?? "stub"
  };
}

function usage(): string {
  return `skillcrit ${packageVersion()} — lint stacked Agent Skills and eval a pack on vs off

  skillcrit --version
  skillcrit roots [path] [--json]
  skillcrit scan [path] [--user] [--json]
  skillcrit lint [path] [--user] [--json] [--fix] [--out <file>]
  skillcrit eval <pack-dir> [--tasks <dir>] [--agent stub] [--json]

  Default path is the current project. --user also scans installed
  user-level skills (Claude, Cursor, Codex, Qwen, Gemini, Hermes, Pi,
  OpenCode, Copilot, Continue, Goose, DeepSeek). cache/ and
  marketplaces/ copies are tagged, not treated as extra unique skills.
  --fix prints a dry-run markdown inventory (keep vs orphans) and writes
  skillcrit-cleanup.md. --out <file> chooses the path; --out - skips the
  write. Progress writes to stderr when the terminal is a TTY.
`;
}

const BLOCKED_OUT = new Set(["skill.md", "package.json", ".env", "license"]);

function writeCleanupDoc(out: string | undefined, markdown: string): void {
  if (!out || out === "-") return;
  const resolved = path.resolve(out);
  const base = path.basename(resolved).toLowerCase();
  if (BLOCKED_OUT.has(base)) {
    throw new Error(`refusing to write cleanup doc over ${path.basename(resolved)}`);
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, markdown);
}
