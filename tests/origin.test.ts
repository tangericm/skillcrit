import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareVersions, detectOrigin, rankSkill } from "../src/origin.ts";
import type { SkillRecord } from "../src/types.ts";

function fake(partial: Partial<SkillRecord> & Pick<SkillRecord, "skillFile">): SkillRecord {
  return {
    name: "x",
    skillDir: "/tmp",
    description: "desc",
    body: "body",
    pack: null,
    version: null,
    origin: "project",
    commands: [],
    hooks: false,
    alwaysOn: false,
    descriptionTokens: 1,
    alwaysOnTokens: 1,
    specIssues: [],
    ...partial
  };
}

describe("detectOrigin", () => {
  it("tags Claude plugin cache and marketplace paths", () => {
    expect(
      detectOrigin(
        "/home/u/.claude/plugins/cache/caveman/skills/caveman/SKILL.md"
      )
    ).toBe("cache");
    expect(
      detectOrigin(
        "C:\\Users\\etang\\.cursor\\plugins\\marketplaces\\foo\\SKILL.md"
      )
    ).toBe("marketplace");
  });

  it("tags home agent dirs as user", () => {
    const home = os.homedir();
    expect(detectOrigin(path.join(home, ".agents", "skills", "x", "SKILL.md"))).toBe(
      "user"
    );
  });

  it("tags project .agents/.claude trees as project, even under $HOME", () => {
    expect(
      detectOrigin("/workspace/fixtures/repos/stacked/.agents/skills/tdd-kit/SKILL.md")
    ).toBe("project");
    const nested = path.join(
      os.homedir(),
      "Projects",
      "app",
      ".claude",
      "skills",
      "x",
      "SKILL.md"
    );
    expect(detectOrigin(nested)).toBe("project");
  });
});

describe("rankSkill", () => {
  it("prefers project over cache and newer semver", () => {
    const project = fake({
      skillFile: "/proj/SKILL.md",
      origin: "project",
      version: "0.1.0"
    });
    const cache = fake({
      skillFile: "/home/u/.claude/plugins/cache/x/SKILL.md",
      origin: "cache",
      version: "9.0.0"
    });
    expect(rankSkill(project)).toBeGreaterThan(rankSkill(cache));
    expect(compareVersions("0.3.0", "0.2.1")).toBeGreaterThan(0);
  });
});
