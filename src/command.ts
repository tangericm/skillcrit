import { stubAdapter } from "./adapters/stub.js";
import { evalPack } from "./eval.js";
import { cleanupPlan, lint } from "./lint.js";
import { scan } from "./scan.js";
import type { Adapter } from "./types.js";
import { packageVersion } from "./version.js";

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  const { command, target, json, user, tasks, agent, help, version } = parsed;

  if (version || command === "version") {
    process.stdout.write(`skillcrit ${packageVersion()}\n`);
    return 0;
  }

  if (help || !command || command === "help" || command === "--help") {
    process.stdout.write(usage());
    return help || command ? 0 : 2;
  }

  if (command === "scan") {
    const skills = scan(target ?? process.cwd(), { user });
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
    const report = lint(scan(target ?? process.cwd(), { user }));
    if (parsed.fix && !json) {
      process.stdout.write(cleanupPlan(report));
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
      process.stdout.write(
        `~${report.alwaysOnTokens} always-on tokens  ${report.unique} unique / ${report.scanned} scanned\n`
      );
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
    const summary = await evalPack({
      tasksDir: tasks,
      packDir: target,
      adapter
    });
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
    `agent "${agent}" is not wired in v0.3; use --agent stub (claude/codex adapters come later)`
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
    } else if (arg === "--tasks" || arg === "--agent") {
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
    tasks: kv.get("--tasks"),
    agent: kv.get("--agent") ?? "stub"
  };
}

function usage(): string {
  return `skillcrit ${packageVersion()} — lint stacked Agent Skills and eval a pack on vs off

  skillcrit --version
  skillcrit scan [path] [--user] [--json]
  skillcrit lint [path] [--user] [--json] [--fix]
  skillcrit eval <pack-dir> [--tasks <dir>] [--agent stub] [--json]

  Default path is the current project. --user also scans installed
  user-level skills. cache/ and marketplaces/ copies are tagged, not
  treated as extra unique skills. --fix prints a dry-run cleanup plan.
`;
}
