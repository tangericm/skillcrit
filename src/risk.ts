import fs from "node:fs";
import path from "node:path";
import { readInventoryText } from "./read.js";
import { matchesIgnore, matchesIgnoredDirectory } from "./config.js";
import { RULES, type RuleId } from "./rules.js";
import type { RiskFinding } from "./types.js";

/**
 * Risk inventory, not a security verdict.
 *
 * These are deterministic text signals in a skill's instructions and bundled
 * scripts: the things a human should look at before trusting an installed
 * skill. Pattern matching cannot decide whether a network call is malicious,
 * and a skill that trips nothing here is not thereby safe. Hand anything that
 * matters to a real scanner.
 */

type RiskPattern = {
  id: RuleId;
  re: RegExp;
};

const PATTERNS: RiskPattern[] = [
  { id: "SC4003", re: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|d|k)?sh\b/i },
  { id: "SC4003", re: /\b(?:iwr|invoke-webrequest|irm|invoke-restmethod)\b[^\n|]*\|\s*iex\b/i },
  { id: "SC4003", re: /\beval\s*\(\s*(?:await\s+)?fetch\s*\(/i },
  {
    id: "SC4002",
    re: /\b(?:AWS_SECRET_ACCESS_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY|GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN)\b/
  },
  { id: "SC4002", re: /(?:^|[\s"'`(])(?:~|\$HOME|%USERPROFILE%)[\\/]\.(?:ssh|aws|netrc|npmrc|kube)\b/i },
  { id: "SC4002", re: /\bcat\b[^\n]*\.env\b|\bprocess\.env\.[A-Z_]*(?:TOKEN|SECRET|PASSWORD|KEY)\b/ },
  { id: "SC4004", re: /\brm\s+(?:-[a-z]*\s+)*-[a-z]*[rR][a-z]*f|\brm\s+-[a-z]*f[a-z]*[rR]/ },
  { id: "SC4004", re: /\bgit\s+(?:push\s+(?:--force|-f)\b|reset\s+--hard\b|clean\s+-[a-z]*f)/i },
  { id: "SC4004", re: /\bRemove-Item\b[^\n]*-Recurse[^\n]*-Force|\bdel\s+\/[sfq]/i },
  { id: "SC4001", re: /\b(?:curl|wget)\s+(?:-[^\s]+\s+)*https?:\/\//i },
  { id: "SC4001", re: /\bfetch\s*\(\s*["'`]https?:\/\// },
  { id: "SC4005", re: /\b(?:npm\s+i(?:nstall)?|npx|pnpm\s+add|yarn\s+add|pip\s+install|uvx?\s+(?:pip\s+)?install)\s+(?:-[^\s]+\s+)*(?!.*[@=]\d)[a-z@][\w@/.-]*/i }
];

const SCRIPT_EXT = /\.(?:sh|bash|zsh|ps1|py|js|mjs|cjs|ts|rb|pl)$/i;
const MAX_FILES = 64;
const MAX_BYTES = 512 * 1024;
const MAX_EVIDENCE = 120;

/**
 * Scan a skill's body plus its bundled scripts. `body` is passed in because
 * the caller has already read and parsed SKILL.md.
 */
export function scanRisks(
  skillDir: string,
  body: string,
  bodyLineOffset = 0,
  onIncomplete: (reason: string) => void = reason => { throw new Error(`incomplete risk scan: ${reason}`); },
  ignore: string[] = []
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  // In SKILL.md only fenced code counts. Prose that mentions `rm -rf` while
  // warning against it is not a signal, and flagging it trains readers to
  // ignore the whole inventory.
  collect(findings, "SKILL.md", body, true, bodyLineOffset);
  for (const file of bundledScripts(skillDir, onIncomplete, ignore)) {
    let text: string;
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile()) {
        onIncomplete(`script is no longer a regular file: ${file}`);
        continue;
      }
      text = readInventoryText(file, MAX_BYTES);
    } catch {
      onIncomplete(`could not read script within ${MAX_BYTES}-byte limit: ${file}`);
      continue;
    }
    const rel = path.relative(skillDir, file).replace(/\\/g, "/");
    collect(findings, rel, text);
  }
  return findings;
}

/** Broad `allowed-tools` grants are read from frontmatter, not file text. */
export function allowedToolsRisk(allowedTools: string): RiskFinding | null {
  const tools = allowedTools.split(/\s+/).filter(Boolean);
  const broad = tools.filter((tool) => /^(?:Bash|Shell|Execute|Write|Edit)$/i.test(tool));
  if (broad.length === 0) return null;
  return {
    id: "SC4006",
    severity: RULES.SC4006.severity,
    file: "SKILL.md",
    line: null,
    evidence: `allowed-tools grants ${broad.join(", ")} without a command filter`
  };
}

function collect(
  out: RiskFinding[],
  file: string,
  text: string,
  fencedOnly = false,
  lineOffset = 0
): void {
  if (!text) return;
  const lines = text.split(/\r?\n/);
  const seen = new Set<string>();
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!line.trim()) continue;
    if (fencedOnly && !inFence) continue;
    for (const pattern of PATTERNS) {
      const match = pattern.re.exec(line);
      if (!match) continue;
      const key = `${pattern.id}\n${file}\n${match[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: pattern.id,
        severity: RULES[pattern.id].severity,
        file,
        line: i + 1 + lineOffset,
        evidence: truncate(match[0].trim())
      });
    }
  }
}

function truncate(text: string): string {
  return text.length > MAX_EVIDENCE ? `${text.slice(0, MAX_EVIDENCE - 1)}…` : text;
}

function bundledScripts(skillDir: string, onIncomplete: (reason: string) => void, ignore: string[]): string[] {
  const out: string[] = [];
  walk(skillDir, 0);
  return out;

  function walk(dir: string, depth: number): void {
    if (matchesIgnoredDirectory(dir, ignore)) return;
    if (depth > 3) {
      onIncomplete(`script walk stopped at depth 3 under ${skillDir}`);
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      onIncomplete(`could not read script directory: ${dir}`);
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        walk(full, depth + 1);
      } else if (entry.isFile() && SCRIPT_EXT.test(entry.name)) {
        if (matchesIgnore(full, ignore)) continue;
        if (out.length >= MAX_FILES) {
          onIncomplete(`script walk stopped after ${MAX_FILES} files under ${skillDir}`);
        } else {
          out.push(full);
        }
      }
    }
  }
}
