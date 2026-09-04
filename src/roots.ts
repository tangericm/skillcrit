import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type Harness =
  | "agents"
  | "claude"
  | "cursor"
  | "codex"
  | "qwen"
  | "gemini"
  | "hermes"
  | "pi"
  | "opencode"
  | "copilot"
  | "continue"
  | "goose"
  | "deepseek"
  | "generic";

export type LocationScope = "project" | "user" | "admin";

export type SkillLocationSpec = {
  harness: Harness;
  scope: LocationScope;
  /** Path relative to the project root, $HOME, or absolute when admin. */
  rel: string;
  plugins?: boolean;
};

export type SkillLocation = SkillLocationSpec & {
  path: string;
  exists: boolean;
};

/**
 * Documented discovery roots (agentskills.io `.agents/skills` plus
 * client-specific `.<harness>/skills`). Project scan still walks the
 * repo; these rows power `skillcrit roots` and `--user`.
 */
export const LOCATION_SPECS: SkillLocationSpec[] = [
  { harness: "agents", scope: "project", rel: ".agents/skills" },
  { harness: "claude", scope: "project", rel: ".claude/skills" },
  { harness: "cursor", scope: "project", rel: ".cursor/skills" },
  { harness: "codex", scope: "project", rel: ".codex/skills" },
  { harness: "qwen", scope: "project", rel: ".qwen/skills" },
  { harness: "gemini", scope: "project", rel: ".gemini/skills" },
  { harness: "pi", scope: "project", rel: ".pi/skills" },
  { harness: "opencode", scope: "project", rel: ".opencode/skills" },
  { harness: "copilot", scope: "project", rel: ".github/skills" },
  { harness: "continue", scope: "project", rel: ".continue/skills" },
  { harness: "goose", scope: "project", rel: ".goose/skills" },
  { harness: "deepseek", scope: "project", rel: ".deepseek/skills" },
  { harness: "hermes", scope: "project", rel: ".hermes/skills" },
  { harness: "generic", scope: "project", rel: "skills" },
  { harness: "generic", scope: "project", rel: "plugins", plugins: true },
  { harness: "agents", scope: "user", rel: ".agents/skills" },
  { harness: "claude", scope: "user", rel: ".claude/skills" },
  { harness: "claude", scope: "user", rel: ".claude/plugins", plugins: true },
  { harness: "cursor", scope: "user", rel: ".cursor/skills" },
  { harness: "cursor", scope: "user", rel: ".cursor/plugins", plugins: true },
  { harness: "codex", scope: "user", rel: ".codex/skills" },
  { harness: "codex", scope: "user", rel: ".codex/plugins", plugins: true },
  { harness: "qwen", scope: "user", rel: ".qwen/skills" },
  { harness: "gemini", scope: "user", rel: ".gemini/skills" },
  { harness: "hermes", scope: "user", rel: ".hermes/skills" },
  { harness: "pi", scope: "user", rel: ".pi/agent/skills" },
  { harness: "opencode", scope: "user", rel: ".config/opencode/skills" },
  { harness: "opencode", scope: "user", rel: ".opencode/skills" },
  { harness: "copilot", scope: "user", rel: ".copilot/skills" },
  { harness: "continue", scope: "user", rel: ".continue/skills" },
  { harness: "goose", scope: "user", rel: ".goose/skills" },
  { harness: "deepseek", scope: "user", rel: ".deepseek/skills" },
  { harness: "codex", scope: "admin", rel: "/etc/codex/skills" }
];

export const USER_HOME_PREFIXES = [
  "/.agents/",
  "/.claude/",
  "/.cursor/",
  "/.codex/",
  "/.qwen/",
  "/.gemini/",
  "/.hermes/",
  "/.pi/",
  "/.opencode/",
  "/.config/opencode/",
  "/.continue/",
  "/.goose/",
  "/.deepseek/",
  "/.copilot/"
];

export function listSkillLocations(
  root: string,
  options: { user?: boolean } = {}
): SkillLocation[] {
  const home = os.homedir();
  const specs = LOCATION_SPECS.filter(
    (spec) => spec.scope === "project" || options.user
  );
  return specs.map((spec) => {
    const resolved = resolveLocation(spec, root, home);
    return {
      ...spec,
      path: resolved,
      exists: fs.existsSync(resolved)
    };
  });
}

export function collectRoots(root: string, extraRoots: string[] = [], user = false): string[] {
  const home = os.homedir();
  const roots = [root, ...extraRoots];
  for (const spec of LOCATION_SPECS) {
    if (spec.scope === "project") {
      roots.push(resolveLocation(spec, root, home));
    } else if (user) {
      roots.push(resolveLocation(spec, root, home));
    }
  }
  const codexHome = process.env.CODEX_HOME;
  if (user && codexHome) {
    roots.push(path.join(codexHome, "skills"));
  }
  return roots;
}

export function formatRoots(locations: SkillLocation[]): string {
  const lines = ["# skillcrit skill locations", ""];
  for (const loc of locations) {
    const mark = loc.exists ? "yes" : "no";
    const kind = loc.plugins ? "plugins" : "skills";
    lines.push(
      `${mark.padEnd(3)}  ${loc.scope.padEnd(7)}  ${loc.harness.padEnd(9)}  ${kind.padEnd(7)}  ${loc.path}`
    );
  }
  const present = locations.filter((l) => l.exists).length;
  lines.push("", `${present}/${locations.length} present`);
  return lines.join("\n") + "\n";
}

function resolveLocation(
  spec: SkillLocationSpec,
  root: string,
  home: string
): string {
  if (spec.scope === "admin") return spec.rel;
  if (spec.scope === "user") return path.join(home, spec.rel);
  return path.join(root, spec.rel);
}
