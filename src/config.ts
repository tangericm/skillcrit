import fs from "node:fs";
import path from "node:path";
import { readInventoryText } from "./read.js";
import { RULES, type RuleId } from "./rules.js";
import type { Severity } from "./types.js";

export const CONFIG_FILENAME = ".skillcrit.json";

export type SeverityOverride = Severity | "off";

export type SkillcritConfig = {
  /** Glob-ish patterns matched against the absolute SKILL.md path. */
  ignore: string[];
  /** Per-rule severity, or "off" to drop the finding entirely. */
  rules: Partial<Record<RuleId, SeverityOverride>>;
  budget: {
    /** Warn above this many always-loaded tokens for the whole estate. */
    alwaysOnTokens: number | null;
    /** Recommended tier-2 instruction budget for one SKILL.md body. */
    bodyTokens: number;
    bodyLines: number;
  };
  /** Lowest severity that still makes `lint` exit non-zero. */
  failOn: Severity;
  /** Where the config was read from, or null for the built-in defaults. */
  source: string | null;
};

export const DEFAULT_CONFIG: SkillcritConfig = {
  ignore: [],
  rules: {},
  budget: { alwaysOnTokens: null, bodyTokens: 5000, bodyLines: 500 },
  failOn: "warning",
  source: null
};

function defaults(): SkillcritConfig {
  return { ...DEFAULT_CONFIG, ignore: [...DEFAULT_CONFIG.ignore], rules: { ...DEFAULT_CONFIG.rules }, budget: { ...DEFAULT_CONFIG.budget } };
}

/**
 * Read `.skillcrit.json` from `root`, then from each ancestor up to the
 * filesystem root. First hit wins; nothing found means defaults. Unknown keys
 * are reported rather than ignored, so a typo in a CI gate is visible.
 */
export function loadConfig(
  root: string,
  explicit?: string
): { config: SkillcritConfig; warnings: string[] } {
  const warnings: string[] = [];
  const file = explicit ? path.resolve(explicit) : findConfig(root);
  if (!file) return { config: defaults(), warnings };
  if (!fs.existsSync(file)) {
    warnings.push(`config not found: ${file}`);
    return { config: defaults(), warnings };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readInventoryText(file));
  } catch (err) {
    warnings.push(`config is not valid JSON (${file}): ${String(err)}`);
    return { config: defaults(), warnings };
  }
  return { config: applyConfig(raw, file, warnings), warnings };
}

function findConfig(root: string): string | null {
  let dir = path.resolve(root);
  for (let i = 0; i < 32; i++) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const KNOWN_KEYS = new Set(["$schema", "ignore", "rules", "budget", "failOn"]);
const SEVERITIES = new Set(["error", "warning", "info"]);

function applyConfig(
  raw: unknown,
  file: string,
  warnings: string[]
): SkillcritConfig {
  const config: SkillcritConfig = {
    ...DEFAULT_CONFIG,
    ignore: [],
    rules: {},
    budget: { ...DEFAULT_CONFIG.budget },
    source: file
  };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    warnings.push(`config must be a JSON object (${file})`);
    return config;
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`unknown config key "${key}" in ${file}`);
  }
  if (Array.isArray(obj.ignore)) {
    if (obj.ignore.some(v => typeof v !== "string")) warnings.push(`config "ignore" must contain only strings (${file})`);
    config.ignore = obj.ignore.filter((v): v is string => typeof v === "string");
  } else if (obj.ignore !== undefined) {
    warnings.push(`config "ignore" must be an array of strings (${file})`);
  }
  if (obj.rules && typeof obj.rules === "object" && !Array.isArray(obj.rules)) {
    for (const [id, value] of Object.entries(obj.rules as Record<string, unknown>)) {
      if (!Object.hasOwn(RULES, id)) {
        warnings.push(`unknown rule id "${id}" in ${file}`);
        continue;
      }
      if (typeof value !== "string" || (value !== "off" && !SEVERITIES.has(value))) {
        warnings.push(`rule "${id}" must be error, warning, info or off (${file})`);
        continue;
      }
      config.rules[id as RuleId] = value as SeverityOverride;
    }
  } else if (obj.rules !== undefined) {
    warnings.push(`config "rules" must be an object (${file})`);
  }
  if (obj.budget && typeof obj.budget === "object" && !Array.isArray(obj.budget)) {
    const budget = obj.budget as Record<string, unknown>;
    for (const [key, value] of Object.entries(budget)) {
      if (key !== "alwaysOnTokens" && key !== "bodyTokens" && key !== "bodyLines") {
        warnings.push(`unknown budget key "${key}" in ${file}`);
      } else if (key === "alwaysOnTokens" && value === null) {
        config.budget.alwaysOnTokens = null;
      } else if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        warnings.push(`budget "${key}" must be a non-negative safe integer (${file})`);
      } else {
        config.budget[key] = value;
      }
    }
  } else if (obj.budget !== undefined) {
    warnings.push(`config "budget" must be an object (${file})`);
  }
  if (typeof obj.failOn === "string" && SEVERITIES.has(obj.failOn)) {
    config.failOn = obj.failOn as Severity;
  } else if (obj.failOn !== undefined) {
    warnings.push(`config "failOn" must be error, warning or info (${file})`);
  }
  return config;
}

/** Effective severity for a rule, or null when the rule is switched off. */
export function severityFor(
  config: SkillcritConfig,
  id: RuleId,
  fallback?: Severity
): Severity | null {
  const override = config.rules[id];
  if (override === "off") return null;
  if (override) return override;
  return fallback ?? RULES[id].severity;
}

/**
 * `*` matches within a path segment, `**` across segments, `?` one character.
 * Matching is case-insensitive and runs on forward-slash paths so one pattern
 * works on Windows and POSIX alike.
 */
export function matchesIgnore(file: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const target = file.replace(/\\/g, "/").toLowerCase();
  return patterns.some((pattern) => globToRegExp(pattern).test(target));
}

/** Only a subtree glob permits pruning; a file glob must not hide siblings. */
export function matchesIgnoredDirectory(dir: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    const normalized = pattern.replace(/\\/g, "/");
    if (normalized === "**") return true;
    if (!normalized.endsWith("/**")) return false;
    return matchesIgnore(dir, [normalized, normalized.slice(0, -3)]);
  });
}

const globCache = new Map<string, RegExp>();

const REGEX_META = /[.+^${}()|[\]\\]/g;

function globToRegExp(pattern: string): RegExp {
  const cached = globCache.get(pattern);
  if (cached) return cached;
  const normalized = pattern.replace(/\\/g, "/").toLowerCase();
  let out = "";
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === "*" && normalized[i + 1] === "*") {
      if (normalized[i + 2] === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else {
        out += ".*";
        i += 1;
      }
    } else if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(REGEX_META, "\\$&");
    }
  }
  // Patterns are matched against any path suffix, so `skills/foo` and a bare
  // `foo` both hit `/home/me/.claude/skills/foo`.
  const re = new RegExp(`^(?:.*/)?${out}$`);
  globCache.set(pattern, re);
  return re;
}
