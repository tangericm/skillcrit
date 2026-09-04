import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { DEFAULT_CONFIG, matchesIgnore, type SkillcritConfig } from "./config.js";
import { detectOrigin } from "./origin.js";
import { collectRoots } from "./roots.js";
import { RULES, type RuleId } from "./rules.js";
import { allowedToolsRisk, scanRisks } from "./risk.js";
import {
  estimateTokens,
  type RiskFinding,
  type Severity,
  type SkillRecord,
  type SpecFinding
} from "./types.js";

const PLUGIN_MANIFESTS = [
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".codex-plugin/plugin.json"
];

/** Agent Plugins 1.0 puts the manifest at the package root. */
const ROOT_MANIFEST = "plugin.json";

const ALWAYS_ON_BODY = /ACTIVE EVERY RESPONSE|every turn/i;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  "fixtures"
]);

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Frontmatter keys the Agent Skills specification defines. Anything else is
 * reported as SC1010 so client-specific keys move under `metadata:`.
 */
const SPEC_KEYS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools"
]);

/**
 * Walk bounds, so a scan of a large home directory terminates instead of
 * walking the world. The client-implementation guide suggests 4-6 levels for a
 * plain skills folder; the depth here is larger because plugin caches nest
 * (`plugins/marketplaces/<mp>/<plugin>/skills/<name>/SKILL.md`) and a silent
 * miss there would make the inventory wrong rather than slow.
 */
export const MAX_WALK_DEPTH = 8;
export const MAX_WALK_DIRS = 20_000;

export type ScanOptions = {
  user?: boolean;
  extraRoots?: string[];
  config?: SkillcritConfig;
  /** Skip the risk inventory when only structure is needed. */
  risks?: boolean;
  maxDepth?: number;
  maxDirs?: number;
  onProgress?: (n: number) => void;
  /** Called once if a walk bound cut the scan short, so callers can say so. */
  onTruncated?: (reason: string) => void;
};

export function scan(root: string, options: ScanOptions = {}): SkillRecord[] {
  const config = options.config ?? DEFAULT_CONFIG;
  const files = new Map<string, string>();
  const seenReal = new Set<string>();
  const budget = {
    dirs: options.maxDirs ?? MAX_WALK_DIRS,
    depth: options.maxDepth ?? MAX_WALK_DEPTH,
    truncated: ""
  };
  let n = 0;
  for (const dir of collectRoots(root, options.extraRoots ?? [], options.user)) {
    walkSkillFiles(dir, files, dir, seenReal, budget, 0, () => {
      n += 1;
      options.onProgress?.(n);
    });
  }
  if (budget.truncated) options.onTruncated?.(budget.truncated);
  return [...files.entries()]
    .filter(([file]) => !matchesIgnore(file, config.ignore))
    .map(([file, walkRoot]) => parseSkill(file, walkRoot, config, options.risks !== false))
    .sort((a, b) => a.skillFile.localeCompare(b.skillFile));
}

type WalkBudget = { dirs: number; depth: number; truncated: string };

function walkSkillFiles(
  dir: string,
  out: Map<string, string>,
  walkRoot: string,
  seenReal: Set<string>,
  budget: WalkBudget,
  depth: number,
  onFile: () => void
): void {
  if (depth > budget.depth) {
    budget.truncated ||= `walk stopped at depth ${budget.depth} under ${walkRoot}`;
    return;
  }
  if (budget.dirs <= 0) {
    budget.truncated ||= `walk stopped after ${MAX_WALK_DIRS} directories`;
    return;
  }
  let real: string;
  try {
    if (!fs.existsSync(dir)) return;
    real = fs.realpathSync(dir);
  } catch {
    return;
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(real);
  } catch {
    return;
  }
  if (!stat.isDirectory()) return;
  if (!isInsideRoot(real, walkRoot)) return;
  if (seenReal.has(real)) return;
  seenReal.add(real);
  budget.dirs -= 1;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(real, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(real, entry.name);
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name === "SKILL.md") {
      try {
        if (
          isInsideRoot(full, walkRoot) &&
          fs.statSync(full).isFile() &&
          !out.has(full)
        ) {
          out.set(full, walkRoot);
          onFile();
        }
      } catch {
        // unreadable
      }
      continue;
    }
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      walkSkillFiles(full, out, walkRoot, seenReal, budget, depth + 1, onFile);
    }
  }
}

function isInsideRoot(candidate: string, root: string): boolean {
  let realCandidate: string;
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(root);
    realCandidate = fs.realpathSync(candidate);
  } catch {
    return false;
  }
  const rel = path.relative(realRoot, realCandidate);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel))
  );
}

type Parsed = {
  data: Record<string, unknown>;
  content: string;
  /** True when the YAML only parsed after the unquoted-colon repair. */
  repaired: boolean;
  failed: boolean;
};

/**
 * Passing options at all opts out of gray-matter's module-level cache. That
 * cache is keyed by file content and is populated *before* the YAML is parsed,
 * so a file that throws on the first parse is served from cache with empty
 * `data` on every later parse — the repair below would then run once and never
 * again in the same process.
 */
const MATTER_OPTIONS = { language: "yaml" } as const;

/**
 * gray-matter throws on YAML that other clients accept — most often an
 * unquoted `description:` containing a colon. The spec's own guidance for
 * client authors is to retry with the value quoted rather than drop the skill,
 * so that is what happens here; the repair is still reported as SC1011-adjacent
 * noise via the `repaired` flag.
 */
function parseFrontmatter(raw: string): Parsed {
  try {
    const parsed = matter(raw, MATTER_OPTIONS);
    return {
      data: parsed.data as Record<string, unknown>,
      content: parsed.content,
      repaired: false,
      failed: false
    };
  } catch {
    // fall through to the repair
  }
  const repaired = quoteColonValues(raw);
  if (repaired !== raw) {
    try {
      const parsed = matter(repaired, MATTER_OPTIONS);
      return {
        data: parsed.data as Record<string, unknown>,
        content: parsed.content,
        repaired: true,
        failed: false
      };
    } catch {
      // fall through
    }
  }
  return { data: {}, content: bodyAfterFrontmatter(raw), repaired: false, failed: true };
}

function quoteColonValues(raw: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!match) return raw;
  const fixed = match[1]
    .split(/\r?\n/)
    .map((line) => {
      const kv = /^([A-Za-z0-9_-]+):[ \t]+(.*\S)\s*$/.exec(line);
      if (!kv) return line;
      const value = kv[2];
      if (!value.includes(":")) return line;
      if (/^["'|>]/.test(value)) return line;
      return `${kv[1]}: ${JSON.stringify(value)}`;
    })
    .join("\n");
  return raw.replace(match[1], fixed);
}

function bodyAfterFrontmatter(raw: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
  return match ? raw.slice(match[0].length) : raw;
}

function parseSkill(
  skillFile: string,
  walkRoot: string,
  config: SkillcritConfig,
  withRisks: boolean
): SkillRecord {
  const raw = fs.readFileSync(skillFile, "utf8");
  const parsed = parseFrontmatter(raw);
  const data = parsed.data;
  const name = String(data.name ?? "");
  const description = String(data.description ?? "").trim();
  const body = parsed.content.trim();
  const skillDir = path.dirname(skillFile);
  const folder = path.basename(skillDir);
  const packRoot = findPackRoot(skillDir, walkRoot);
  const pack = packRoot ? packName(packRoot) : null;
  const version = readVersion(data, packRoot, skillFile);
  const origin = detectOrigin(skillFile);
  const commands = packRoot ? listCommands(packRoot) : [];
  const hooks = packRoot ? packHasHooks(packRoot) : false;
  const alwaysOn = hooks || ALWAYS_ON_BODY.test(body);
  const descriptionTokens = estimateTokens(description);
  const bodyTokens = estimateTokens(body);
  const bodyLines = body ? body.split(/\r?\n/).length : 0;
  const specFindings = specFindingsFor({
    raw,
    data,
    name,
    folder,
    description,
    bodyTokens,
    bodyLines,
    parseFailed: parsed.failed,
    config
  });
  const risks = withRisks
    ? collectRisks(skillDir, body, data, bodyLineOffset(raw, body))
    : [];

  return {
    name: name || folder,
    skillDir,
    skillFile,
    description,
    body,
    pack,
    version,
    origin,
    commands,
    hooks,
    alwaysOn,
    descriptionTokens,
    bodyTokens,
    bodyLines,
    hash: crypto.createHash("sha256").update(raw).digest("hex"),
    alwaysOnTokens: alwaysOn ? descriptionTokens + bodyTokens : descriptionTokens,
    specIssues: specFindings
      .filter((f) => f.id.startsWith("SC1"))
      .map((f) => f.message),
    specFindings,
    risks
  };
}

/**
 * Lines the frontmatter occupies, so a risk found in the body reports a line
 * number a reader can jump to in SKILL.md rather than one relative to the
 * trimmed body.
 */
function bodyLineOffset(raw: string, body: string): number {
  if (!body) return 0;
  const idx = raw.indexOf(body);
  if (idx < 0) return 0;
  return raw.slice(0, idx).split(/\r?\n/).length - 1;
}

function collectRisks(
  skillDir: string,
  body: string,
  data: Record<string, unknown>,
  offset: number
): RiskFinding[] {
  const risks = scanRisks(skillDir, body, offset);
  const allowed = data["allowed-tools"];
  if (typeof allowed === "string") {
    const broad = allowedToolsRisk(allowed);
    if (broad) risks.unshift(broad);
  }
  return risks;
}

type SpecInput = {
  raw: string;
  data: Record<string, unknown>;
  name: string;
  folder: string;
  description: string;
  bodyTokens: number;
  bodyLines: number;
  parseFailed: boolean;
  config: SkillcritConfig;
};

/** Words that make a description say *when* to reach for the skill. */
const TRIGGER_WORDS = /\b(?:use when|use this|when the user|when you|triggers? on|for when|invoke)\b/i;

function specFindingsFor(input: SpecInput): SpecFinding[] {
  const out: SpecFinding[] = [];
  const add = (id: RuleId, field: string, message: string): void => {
    out.push({ id, severity: RULES[id].severity as Severity, field, message, line: fieldLine(input.raw, field) });
  };

  if (input.parseFailed) {
    add("SC1011", "", "frontmatter could not be parsed as YAML");
    return out;
  }

  if (!input.name) add("SC1001", "name", "missing name");
  else {
    if (input.name !== input.folder) {
      add(
        "SC1002",
        "name",
        `name "${input.name}" does not match folder "${input.folder}"`
      );
    }
    if (input.name.length > 64) add("SC1003", "name", "name longer than 64 characters");
    if (!NAME_RE.test(input.name)) {
      add(
        "SC1004",
        "name",
        "name must be lowercase alphanumeric with single hyphens"
      );
    }
  }

  if (!input.description) add("SC1005", "description", "missing description");
  else {
    if (input.description.length > 1024) {
      add("SC1006", "description", "description longer than 1024 characters");
    }
    if (!TRIGGER_WORDS.test(input.description)) {
      add(
        "SC1012",
        "description",
        "description does not say when to use the skill"
      );
    }
  }

  const compatibility = input.data.compatibility;
  if (typeof compatibility === "string" && compatibility.length > 500) {
    add("SC1007", "compatibility", "compatibility longer than 500 characters");
  }

  const metadata = input.data.metadata;
  if (metadata !== undefined) {
    const bad = metadataProblem(metadata);
    if (bad) add("SC1008", "metadata", bad);
  }

  const allowedTools = input.data["allowed-tools"];
  if (allowedTools !== undefined && typeof allowedTools !== "string") {
    add(
      "SC1009",
      "allowed-tools",
      "allowed-tools must be one space-separated string"
    );
  }

  for (const key of Object.keys(input.data)) {
    if (!SPEC_KEYS.has(key)) {
      add("SC1010", key, `frontmatter key "${key}" is not in the Agent Skills spec`);
    }
  }

  if (input.bodyTokens > input.config.budget.bodyTokens) {
    add(
      "SC2001",
      "body",
      `body is ~${input.bodyTokens} tokens, over the ${input.config.budget.bodyTokens}-token instruction budget`
    );
  }
  if (input.bodyLines > input.config.budget.bodyLines) {
    add(
      "SC2002",
      "body",
      `body is ${input.bodyLines} lines, over the recommended ${input.config.budget.bodyLines}`
    );
  }

  return out;
}

function metadataProblem(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return "metadata must be a map of string keys to string values";
  }
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (typeof value !== "string") {
      return `metadata.${key} must be a string (found ${describeType(value)})`;
    }
  }
  return null;
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

/** 1-indexed line of `key:` inside the frontmatter block, when findable. */
function fieldLine(raw: string, field: string): number | null {
  if (!field) return null;
  const lines = raw.split(/\r?\n/);
  const needle = new RegExp(`^\\s*${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "---" && i > 0) break;
    if (needle.test(lines[i])) return i + 1;
  }
  return null;
}

function findPackRoot(start: string, stopAt: string): string | null {
  const stop = path.resolve(stopAt);
  let dir = path.resolve(start);
  for (let i = 0; i < 16; i++) {
    if (PLUGIN_MANIFESTS.some((rel) => fs.existsSync(path.join(dir, rel)))) {
      return dir;
    }
    if (isAgentPluginRoot(dir)) return dir;
    if (dir === stop) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * An Agent Plugins 1.0 package is a directory whose root `plugin.json` carries
 * a `name`. The check reads the file rather than trusting the filename, since
 * `plugin.json` is a common name in unrelated tooling.
 */
function isAgentPluginRoot(dir: string): boolean {
  const file = path.join(dir, ROOT_MANIFEST);
  if (!fs.existsSync(file)) return false;
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as { name?: unknown };
    return typeof json.name === "string" && json.name.length > 0;
  } catch {
    return false;
  }
}

function manifestFiles(packRoot: string): string[] {
  return [...PLUGIN_MANIFESTS, ROOT_MANIFEST].map((rel) => path.join(packRoot, rel));
}

function packName(packRoot: string): string {
  for (const file of manifestFiles(packRoot)) {
    if (!fs.existsSync(file)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(file, "utf8")) as { name?: string };
      if (json.name) return json.name;
    } catch {
      // fall through to directory name
    }
  }
  return path.basename(packRoot);
}

function readVersion(
  data: Record<string, unknown>,
  packRoot: string | null,
  skillFile: string
): string | null {
  const meta = data.metadata;
  if (meta && typeof meta === "object" && meta !== null) {
    // Only a string counts. YAML turns an unquoted `version: 1.0` into the
    // number 1, and reporting "@1" would be worse than reporting nothing —
    // SC1008 already tells the author to quote it.
    const v = (meta as { version?: unknown }).version;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (packRoot) {
    for (const file of manifestFiles(packRoot)) {
      if (!fs.existsSync(file)) continue;
      try {
        const json = JSON.parse(fs.readFileSync(file, "utf8")) as {
          version?: unknown;
        };
        if (json.version != null && String(json.version).trim()) {
          return String(json.version).trim();
        }
      } catch {
        // keep looking
      }
    }
    const pkg = path.join(packRoot, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        const json = JSON.parse(fs.readFileSync(pkg, "utf8")) as {
          version?: unknown;
        };
        if (json.version != null && String(json.version).trim()) {
          return String(json.version).trim();
        }
      } catch {
        // ignore
      }
    }
  }
  const fromPath = skillFile
    .replace(/\\/g, "/")
    .match(/@v?(\d+\.\d+\.\d+[\w.-]*)/);
  return fromPath ? fromPath[1] : null;
}

function listCommands(packRoot: string): string[] {
  const dir = path.join(packRoot, "commands");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""));
}

function packHasHooks(packRoot: string): boolean {
  for (const file of manifestFiles(packRoot)) {
    if (!fs.existsSync(file)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(file, "utf8")) as { hooks?: unknown };
      if (json.hooks && Object.keys(json.hooks as object).length > 0) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}
