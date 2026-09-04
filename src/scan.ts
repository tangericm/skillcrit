import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { detectOrigin } from "./origin.js";
import { collectRoots } from "./roots.js";
import { estimateTokens, type SkillRecord } from "./types.js";

const PLUGIN_MANIFESTS = [
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".codex-plugin/plugin.json"
];

const ALWAYS_ON_BODY = /ACTIVE EVERY RESPONSE|every turn/i;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  "fixtures"
]);

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ScanOptions = {
  user?: boolean;
  extraRoots?: string[];
  onProgress?: (n: number) => void;
};

export function scan(root: string, options: ScanOptions = {}): SkillRecord[] {
  const files = new Map<string, string>();
  const seenReal = new Set<string>();
  let n = 0;
  for (const dir of collectRoots(root, options.extraRoots ?? [], options.user)) {
    walkSkillFiles(dir, files, dir, seenReal, () => {
      n += 1;
      options.onProgress?.(n);
    });
  }
  return [...files.entries()]
    .map(([file, walkRoot]) => parseSkill(file, walkRoot))
    .sort((a, b) => a.skillFile.localeCompare(b.skillFile));
}

function walkSkillFiles(
  dir: string,
  out: Map<string, string>,
  walkRoot: string,
  seenReal: Set<string>,
  onFile: () => void
): void {
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
      walkSkillFiles(full, out, walkRoot, seenReal, onFile);
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

function parseSkill(skillFile: string, walkRoot: string): SkillRecord {
  const raw = fs.readFileSync(skillFile, "utf8");
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
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
  const specIssues = specIssuesFor(name, folder, description);
  const descriptionTokens = estimateTokens(description);
  const alwaysOnTokens = alwaysOn
    ? descriptionTokens + estimateTokens(body)
    : descriptionTokens;

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
    alwaysOnTokens,
    specIssues
  };
}

function specIssuesFor(
  name: string,
  folder: string,
  description: string
): string[] {
  const issues: string[] = [];
  if (!name) issues.push("missing name");
  else {
    if (name !== folder) {
      issues.push(`name "${name}" does not match folder "${folder}"`);
    }
    if (name.length > 64) issues.push("name longer than 64 characters");
    if (!NAME_RE.test(name)) {
      issues.push("name must be lowercase alphanumeric with single hyphens");
    }
  }
  if (!description) issues.push("missing description");
  else if (description.length > 1024) {
    issues.push("description longer than 1024 characters");
  }
  return issues;
}

function findPackRoot(start: string, stopAt: string): string | null {
  const stop = path.resolve(stopAt);
  let dir = path.resolve(start);
  for (let i = 0; i < 16; i++) {
    if (PLUGIN_MANIFESTS.some((rel) => fs.existsSync(path.join(dir, rel)))) {
      return dir;
    }
    if (dir === stop) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function packName(packRoot: string): string {
  for (const rel of PLUGIN_MANIFESTS) {
    const file = path.join(packRoot, rel);
    if (!fs.existsSync(file)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(file, "utf8")) as {
        name?: string;
      };
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
    const v = (meta as { version?: unknown }).version;
    if (v != null && String(v).trim()) return String(v).trim();
  }
  if (packRoot) {
    for (const rel of PLUGIN_MANIFESTS) {
      const file = path.join(packRoot, rel);
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
  for (const rel of PLUGIN_MANIFESTS) {
    const file = path.join(packRoot, rel);
    if (!fs.existsSync(file)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(file, "utf8")) as {
        hooks?: unknown;
      };
      if (json.hooks && Object.keys(json.hooks as object).length > 0) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}
