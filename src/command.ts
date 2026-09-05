import fs from "node:fs";
import path from "node:path";
import { formatAdapters, resolveAdapter } from "./adapters/index.js";
import { loadConfig, type SkillcritConfig } from "./config.js";
import { doctor, formatDoctor } from "./doctor.js";
import { evalPack, formatEval } from "./eval.js";
import { cleanupPlan, lint } from "./lint.js";
import { createProgress } from "./progress.js";
import {
  formatGithub,
  formatMarkdown,
  formatSarif,
  formatText,
  isFormat,
  type Format
} from "./report.js";
import { formatRoots, listSkillLocations } from "./roots.js";
import { RULES, SEVERITY_ORDER, ruleIds } from "./rules.js";
import { scan } from "./scan.js";
import { formatSummary } from "./summary.js";
import type { LintReport, ScanCoverage, Severity } from "./types.js";
import { packageVersion } from "./version.js";

/**
 * Exit codes are part of the contract; CI scripts branch on them.
 *
 *   0  command completed; lint findings are below the configured gate
 *   1  lint findings at or above the gate (default: warning)
 *   2  usage error — bad flag, missing argument, unknown command
 *   3  the run itself failed (unreadable config, adapter error)
 */
export const EXIT = { ok: 0, findings: 1, usage: 2, error: 3 } as const;

export async function main(argv: string[]): Promise<number> {
  try {
    return await runMain(argv);
  } catch (err) {
    process.stderr.write(`skillcrit: ${String(err)}\n`);
    return EXIT.error;
  }
}

async function runMain(argv: string[]): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${usage()}`);
    return EXIT.usage;
  }
  const { command, target, json, user, tasks, agent, help, version } = parsed;

  if (version || command === "version") {
    process.stdout.write(`skillcrit ${packageVersion()}\n`);
    return EXIT.ok;
  }

  if (help || !command || command === "help" || command === "--help") {
    const topic = help ? command : positionalHelpTopic(command, target);
    process.stdout.write(commandHelp(topic) ?? usage());
    return help || command ? EXIT.ok : EXIT.usage;
  }

  const root = target ?? process.cwd();
  const format: Format = json ? "json" : parsed.format;
  if (!COMMANDS.has(command)) {
    process.stderr.write(`unknown command: ${command}\n${usage()}`);
    return EXIT.usage;
  }
  if (command !== "lint" && format !== "text" && format !== "json") {
    process.stderr.write(`skillcrit ${command} does not support --format ${format}; use text or json\n`);
    return EXIT.usage;
  }
  if (parsed.fix && (command !== "lint" || format !== "text")) {
    process.stderr.write("--fix requires lint with --format text\n");
    return EXIT.usage;
  }
  if (command === "rules") {
    process.stdout.write(format === "json" ? rulesJson() : rulesTable());
    return EXIT.ok;
  }
  if (command !== "eval" && !fs.statSync(root).isDirectory()) {
    throw new Error(`target must be a directory: ${root}`);
  }
  const progress = createProgress(
    format === "text" && Boolean(process.stderr.isTTY)
  );

  if (command === "roots") {
    const locations = listSkillLocations(root, { user: true });
    if (format === "json") {
      process.stdout.write(JSON.stringify({ locations }, null, 2) + "\n");
    } else {
      process.stdout.write(formatRoots(locations));
    }
    return EXIT.ok;
  }

  let config: SkillcritConfig;
  try {
    const loaded = loadConfig(root, parsed.config);
    config = loaded.config;
    for (const warning of loaded.warnings) {
      process.stderr.write(`skillcrit: ${warning}\n`);
    }
    if (loaded.warnings.length > 0) return EXIT.error;
  } catch (err) {
    process.stderr.write(`skillcrit: ${String(err)}\n`);
    return EXIT.error;
  }
  if (parsed.failOn) config = { ...config, failOn: parsed.failOn };

  const coverage: ScanCoverage = { complete: true, reasons: [] };
  const runScan = (risks: boolean) => {
    progress.phase("scan");
    return scan(root, {
      user,
      config,
      risks,
      onProgress: (n) => progress.tick("scan", n),
      onTruncated: (reason) => {
        coverage.complete = false;
        coverage.reasons.push(reason);
        process.stderr.write(`skillcrit: incomplete scan: ${reason}\n`);
      }
    });
  };

  if (command === "scan") {
    const skills = runScan(false);
    progress.done(`scanned ${skills.length} skills`);
    if (format === "json") {
      process.stdout.write(JSON.stringify({ skills, coverage }, null, 2) + "\n");
    } else {
      for (const skill of skills) {
        const pack = skill.pack ? ` [${skill.pack}]` : "";
        const ver = skill.version ? `@${skill.version}` : "";
        process.stdout.write(
          `${skill.name}${ver}${pack}  ${skill.origin}  ${skill.descriptionTokens} tok\n`
        );
      }
      process.stdout.write(`${skills.length} skills${coverage.complete ? "" : " (incomplete scan)"}\n`);
    }
    return coverage.complete ? EXIT.ok : EXIT.error;
  }

  if (command === "doctor" || command === "inspect") {
    const skills = runScan(true);
    progress.phase("resolve");
    const report = doctor(skills, root, { user });
    progress.done(
      `${report.recommendations.length} recommendations / ${report.alternatives} alternatives; runtime unknown`
    );
    if (format === "json") {
      process.stdout.write(JSON.stringify({ ...report, coverage }, null, 2) + "\n");
    } else {
      process.stdout.write((coverage.complete ? "" : "Incomplete scan\n") + formatDoctor(report));
    }
    return coverage.complete ? EXIT.ok : EXIT.error;
  }

  if (command === "lint") {
    const skills = runScan(true);
    progress.phase("lint");
    const report = lint(skills, config, root);
    report.coverage = coverage;
    progress.done(
      `${report.unique} unique / ${report.scanned} scanned  ~${report.tokens.alwaysOnNow} tok`
    );
    if (parsed.fix && format === "text") {
      if (!coverage.complete) {
        process.stdout.write(renderLint(report, format));
        return EXIT.error;
      }
      const md = cleanupPlan(report);
      process.stdout.write(md);
      process.stdout.write(formatSummary(report));
      try {
        writeCleanupDoc(parsed.out, md);
      } catch (err) {
        process.stderr.write(`skillcrit: ${(err as Error).message}\n`);
        return EXIT.error;
      }
      return gate(report, config.failOn);
    }
    process.stdout.write(renderLint(report, format));
    return coverage.complete ? gate(report, config.failOn) : EXIT.error;
  }

  if (command === "eval") {
    if (agent === "list") {
      process.stdout.write(formatAdapters());
      return EXIT.ok;
    }
    if (!target) {
      process.stderr.write("skillcrit eval <pack-dir>\n");
      return EXIT.usage;
    }
    let summary;
    try {
      const adapter = resolveAdapter(agent);
      progress.phase("eval");
      summary = await evalPack({
        tasksDir: tasks,
        packDir: target,
        adapter,
        repeat: parsed.repeat,
        onProgress: (n, total, task) => progress.tick(task, n, total)
      });
    } catch (err) {
      process.stderr.write(`skillcrit: ${(err as Error).message}\n`);
      return EXIT.error;
    }
    progress.done(
      `eval ${summary.results.length} tasks  overbuild Δ ${summary.overbuildDelta}`
    );
    if (format === "json") {
      process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    } else {
      process.stdout.write(formatEval(summary));
    }
    return EXIT.ok;
  }

  process.stderr.write(`unknown command: ${command}\n${usage()}`);
  return EXIT.usage;
}

function renderLint(report: LintReport, format: Format): string {
  switch (format) {
    case "json":
      return JSON.stringify(report, null, 2) + "\n";
    case "sarif":
      return formatSarif(report);
    case "github":
      return formatGithub(report);
    case "markdown":
      return formatMarkdown(report);
    default:
      return formatText(report);
  }
}

/** Exit 1 only for findings at or above the configured severity gate. */
function gate(report: LintReport, failOn: Severity): number {
  const threshold = SEVERITY_ORDER[failOn];
  const blocking = report.findings.filter(
    (f) => SEVERITY_ORDER[f.severity] >= threshold
  );
  return blocking.length > 0 ? EXIT.findings : EXIT.ok;
}

const FLAGS = new Set([
  "--json",
  "--user",
  "--help",
  "-h",
  "--version",
  "-V",
  "--fix"
]);
const OPTIONS = new Set([
  "--tasks",
  "--agent",
  "--out",
  "--format",
  "--fail-on",
  "--config",
  "--repeat"
]);
const SEVERITIES = new Set(["error", "warning", "info"]);

function parseArgs(argv: string[]) {
  const rest = argv.slice(2);
  const flags = new Set<string>();
  const kv = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const eq = arg.indexOf("=");
    const name = arg.startsWith("--") && eq > 0 ? arg.slice(0, eq) : arg;
    if (FLAGS.has(name)) {
      if (eq > 0) throw new Error(`${name} does not take a value`);
      flags.add(name === "-V" ? "--version" : name === "-h" ? "--help" : name);
    } else if (OPTIONS.has(name)) {
      const value = eq > 0 ? arg.slice(eq + 1) : rest[++i];
      if (value === undefined || value === "" ||
          (eq < 0 && value.startsWith("-") && !(name === "--out" && value === "-"))) {
        throw new Error(`${name} requires a value`);
      }
      kv.set(name, value);
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown flag ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  const format = kv.get("--format") ?? "text";
  if (!isFormat(format)) {
    throw new Error(`unknown --format ${format} (text, json, markdown, sarif, github)`);
  }
  const failOn = kv.get("--fail-on");
  if (failOn !== undefined && !SEVERITIES.has(failOn)) {
    throw new Error(`unknown --fail-on ${failOn} (error, warning, info)`);
  }
  const repeatRaw = kv.get("--repeat");
  const repeat = repeatRaw === undefined ? 1 : Number(repeatRaw);
  if (!Number.isInteger(repeat) || repeat < 1) {
    throw new Error(`--repeat must be a positive integer, got ${repeatRaw}`);
  }

  return {
    command: positional[0],
    target: positional[1],
    json: flags.has("--json"),
    user: flags.has("--user"),
    help: flags.has("--help"),
    version: flags.has("--version"),
    fix: flags.has("--fix"),
    format: format as Format,
    failOn: failOn as Severity | undefined,
    config: kv.get("--config"),
    repeat,
    out:
      kv.get("--out") ??
      (flags.has("--fix") && !flags.has("--json") ? "skillcrit-cleanup.md" : "-"),
    tasks: kv.get("--tasks"),
    agent: kv.get("--agent") ?? "stub"
  };
}

const COMMANDS = new Set(["roots", "scan", "doctor", "inspect", "lint", "eval", "rules"]);

function positionalHelpTopic(
  command: string | undefined,
  target: string | undefined
): string | undefined {
  if (command !== "help") return undefined;
  return target && COMMANDS.has(target) ? target : undefined;
}

function usage(): string {
  return `skillcrit ${packageVersion()} — audit installed agent skills, conflicts, and context costs

  skillcrit doctor [path] [--user]   cleanup recommendations, estimated cost, risk inventory
  skillcrit lint   [path] [--user]   conflicts, duplicates, spec, budget, risk
  skillcrit scan   [path] [--user]   raw inventory of every SKILL.md found
  skillcrit roots  [path]            skill/plugin locations per harness
  skillcrit eval   <pack> [--agent]  pack on vs off (experimental)
  skillcrit rules                    the rule catalogue and default severities

Common flags
  --user                also read the documented $HOME skill roots
  --format <f>          text (default), json; lint also markdown, sarif, github
  --json                shorthand for --format json
  --fail-on <severity>  error | warning (default) | info
  --config <file>       use this .skillcrit.json instead of searching upward
  --help                this text; \`skillcrit help <command>\` for one command

Exit codes
  0  command completed; for lint, no findings reached its gate
  1  lint findings at or above --fail-on
  2  usage error
  3  run failed or incomplete (bad input/config, skipped files, traversal limit)

Audit with an installed CLI
  skillcrit doctor . --user

Installation instructions and current release status
  https://github.com/tangericm/skillcrit#install
`;
}

const HELP: Record<string, string> = {
  doctor: `skillcrit doctor [path] [--user] [--format text|json]

Recommend a copy per skill name for cleanup review. Runtime selection is unknown:
client namespaces and enablement are not resolved. Token counts estimate the
recommended set; risk inventory covers all scanned copies.

  skillcrit doctor . --user
  skillcrit doctor . --user --json > estate.json

\`inspect\` is an alias. Exits 0 for a complete report, 3 for failed/incomplete input.`,

  lint: `skillcrit lint [path] [--user] [--fix] [--out <file>]
                    [--format text|json|markdown|sarif|github]
                    [--fail-on error|warning|info] [--config <file>]

Findings carry a stable rule ID (see \`skillcrit rules\`), the file and line they
came from, and a remediation line.

  skillcrit lint .                          project skills only
  skillcrit lint . --user                   plus the $HOME roots
  skillcrit lint . --format sarif > out.sarif
  skillcrit lint . --format github          GitHub Actions annotations
  skillcrit lint . --fail-on error          only errors break the build
  skillcrit lint . --fix --out cleanup.md   dry-run keep/orphan plan

--fix never deletes or edits a skill. It writes one markdown plan and refuses
to overwrite SKILL.md, package.json, LICENSE or .env.

Exit 1 means findings at or above the gate, not a crash.`,

  scan: `skillcrit scan [path] [--user] [--json]

Every SKILL.md found, before any resolution: name, version, pack, origin and
description tokens. Use \`doctor\` when the question is which copy to review for cleanup.`,

  roots: `skillcrit roots [path] [--json]

Every documented project, user and admin skill/plugin directory per harness,
and whether it exists. Always includes user scope so the output is a complete
map of where a skill could be installed.`,

  eval: `skillcrit eval <pack-dir> [--tasks <dir>] [--agent <name>] [--repeat <n>]

Experimental. Runs each bundled task twice — pack off, pack on — and reports
whether the task's own tests passed and how much extra source was written.

  skillcrit eval --agent list       adapters, and which are synthetic
  skillcrit eval ./my-pack --repeat 3

Only the synthetic \`stub\` adapter ships today: it replays recorded fixtures
and never calls a model, so it proves the harness works and nothing else. Every
report restates its own limitations.`,

  rules: `skillcrit rules [--json]

The rule catalogue: stable IDs, default severities and remediation. IDs are the
contract — use them in \`.skillcrit.json\` to re-grade or switch off a rule:

  { "rules": { "SC1012": "off", "SC3001": "error" }, "failOn": "error" }`
};

function commandHelp(topic: string | undefined): string | null {
  if (!topic) return null;
  const key = topic === "inspect" ? "doctor" : topic;
  return HELP[key] ? `${HELP[key]}\n` : null;
}

function rulesTable(): string {
  const lines = ["# skillcrit rules", ""];
  for (const id of ruleIds()) {
    const rule = RULES[id];
    lines.push(`${id}  ${rule.severity.padEnd(7)}  ${rule.title}`);
    lines.push(`         ${rule.remediation}`);
  }
  lines.push("");
  lines.push("Override any of these in .skillcrit.json under \"rules\".");
  lines.push("");
  return lines.join("\n");
}

function rulesJson(): string {
  return JSON.stringify({ rules: ruleIds().map((id) => RULES[id]) }, null, 2) + "\n";
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
