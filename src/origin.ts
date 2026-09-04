import os from "node:os";
import type { SkillOrigin, SkillRecord } from "./types.js";

const USER_HOME_ROOTS = [
  "/.agents/",
  "/.claude/",
  "/.cursor/",
  "/.codex/"
];

export function detectOrigin(skillFile: string): SkillOrigin {
  const n = skillFile.replace(/\\/g, "/").toLowerCase();
  if (n.includes("/plugins/cache/") || n.includes("/plugin-cache/")) {
    return "cache";
  }
  if (n.includes("/plugins/marketplaces/") || n.includes("/marketplaces/")) {
    return "marketplace";
  }
  const home = os.homedir().replace(/\\/g, "/").toLowerCase();
  const prefix = home.endsWith("/") ? home : `${home}/`;
  if (n.startsWith(prefix)) {
    const rest = n.slice(home.length);
    if (USER_HOME_ROOTS.some((root) => rest.startsWith(root))) {
      return "user";
    }
  }
  return "project";
}

export function compareVersions(a: string | null, b: string | null): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

const ORIGIN_RANK: Record<SkillOrigin, number> = {
  project: 4,
  user: 3,
  marketplace: 1,
  cache: 0
};

export function rankSkill(skill: SkillRecord): number {
  const originScore = ORIGIN_RANK[skill.origin] * 1_000_000;
  const versionScore = versionRank(skill.version);
  const alwaysPenalty = skill.alwaysOn ? -8 : 0;
  const specificity = Math.min(skill.description.length, 400) / 40;
  return originScore + versionScore + alwaysPenalty + specificity;
}

export function labelSkill(skill: SkillRecord): string {
  const ver = skill.version ? `@${skill.version}` : "";
  const flags = skill.alwaysOn ? ", always-on" : "";
  return `${skill.name}${ver} (${skill.origin}${flags})`;
}

function parseSemver(version: string | null): [number, number, number] | null {
  if (!version) return null;
  const m = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function versionRank(version: string | null): number {
  const p = parseSemver(version);
  if (!p) return 0;
  return p[0] * 10000 + p[1] * 100 + p[2];
}
