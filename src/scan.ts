import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import { estimateTokens, type SkillRecord } from "./types.js";

const PROJECT_SKILL_DIRS = [
  ".agents/skills",
  ".claude/skills",
  ".cursor/skills",
  ".codex/skills",
  "skills"
];

const PLUGIN_MANIFESTS = [
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".codex-plugin/plugin.json"
];

const ALWAYS_ON_BODY = /ACTIVE EVERY RESPONSE|every turn/i;

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ScanOptions = {
  user?: boolean;
  extraRoots?: string[];
};

export function scan(root: string, options: ScanOptions = {}): SkillRecord[] {
  const files = new Set<string>();
  for (const dir of collectRoots(root, options)) {
    walkSkillFiles(dir, files);
  }
  return [...files].map(parseSkill).sort((a, b) =>
    a.skillFile.localeCompare(b.skillFile)
  );
}

function collectRoots(root: string, options: ScanOptions): string[] {
  const roots = [
    root,
    ...PROJECT_SKILL_DIRS.map((rel) => path.join(root, rel)),
    path.join(root, "plugins"),
    ...(options.extraRoots ?? [])
  ];
  if (options.user) {
    roots.push(
      path.join(os.homedir(), ".agents/skills"),
      path.join(os.homedir(), ".claude/plugins"),
      path.join(os.homedir(), ".cursor/plugins"),
      path.join(os.homedir(), ".codex/plugins")
    );
  }
  return roots;
}

function walkSkillFiles(dir: string, out: Set<string>): void {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkSkillFiles(full, out);
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      out.add(full);
    }
  }
}

function parseSkill(skillFile: string): SkillRecord {
  const raw = fs.readFileSync(skillFile, "utf8");
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  const name = String(data.name ?? "");
  const description = String(data.description ?? "").trim();
  const body = parsed.content.trim();
  const skillDir = path.dirname(skillFile);
  const folder = path.basename(skillDir);
  const packRoot = findPackRoot(skillDir);
  const pack = packRoot ? packName(packRoot) : null;
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

function findPackRoot(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (PLUGIN_MANIFESTS.some((rel) => fs.existsSync(path.join(dir, rel)))) {
      return dir;
    }
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
