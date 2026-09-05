import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubAdapter } from "../src/adapters/stub.ts";
import { evalPack } from "../src/eval.ts";
import { cleanupPlan, lint } from "../src/lint.ts";
import { collectRoots } from "../src/roots.ts";
import { scan } from "../src/scan.ts";
import { runCli } from "./support/cli.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temps: string[] = [];

const WRITE_FNS = [
  "unlinkSync",
  "unlink",
  "rmSync",
  "rmdirSync",
  "writeFileSync",
  "appendFileSync",
  "renameSync",
  "copyFileSync",
  "mkdirSync",
  "truncateSync",
  "chmodSync",
  "chownSync",
  "createWriteStream"
] as const;

afterEach(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
  temps.length = 0;
  vi.restoreAllMocks();
});

function tmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function writeSkill(dir: string, name: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---
name: ${name}
description: Unique ${name} skill for converting tables to RFC 4180 CSV only.
---
# ${name}
`
  );
}

function snapshot(root: string): { files: string[]; hashes: Record<string, string> } {
  const files: string[] = [];
  const hashes: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const rel = path.relative(root, full);
        files.push(rel);
        hashes[rel] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
      }
    }
  };
  walk(root);
  files.sort();
  return { files, hashes };
}

function canSymlink(): boolean {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-symlink-probe-"));
  try {
    const target = path.join(dir, "target");
    const link = path.join(dir, "link");
    fs.mkdirSync(target);
    fs.symlinkSync(target, link);
    return fs.lstatSync(link).isSymbolicLink();
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function freezeUserTree<T>(fn: () => T): T {
  const spies = WRITE_FNS.map((name) => {
    const orig = (fs as Record<string, unknown>)[name];
    if (typeof orig !== "function") return null;
    return vi.spyOn(fs, name as keyof typeof fs).mockImplementation((...args: unknown[]) => {
      throw new Error(`unexpected fs.${name}(${String(args[0])})`);
    });
  });
  try {
    return fn();
  } finally {
    for (const spy of spies) spy?.mockRestore();
  }
}

describe("scan and lint stay inside the target tree", () => {
  it("does not follow a skill directory symlink out of the scan root", () => {
    if (!canSymlink()) return;
    const root = tmp("skillcrit-safety-");
    const project = path.join(root, "project");
    const secret = path.join(root, "secret");
    writeSkill(path.join(project, ".agents", "skills", "in-scope"), "in-scope");
    writeSkill(secret, "leaked");
    fs.symlinkSync(secret, path.join(project, ".agents", "skills", "escape"));
    const names = scan(project).map((s) => s.name).sort();
    expect(names).toEqual(["in-scope"]);
    expect(names).not.toContain("leaked");
  });

  it("does not read a SKILL.md symlink that points outside the scan root", () => {
    if (!canSymlink()) return;
    const root = tmp("skillcrit-safety-file-");
    const project = path.join(root, "project");
    const secret = path.join(root, "secret");
    writeSkill(path.join(project, ".agents", "skills", "in-scope"), "in-scope");
    writeSkill(secret, "leaked");
    const leakDir = path.join(project, ".agents", "skills", "file-leak");
    fs.mkdirSync(leakDir, { recursive: true });
    fs.symlinkSync(path.join(secret, "SKILL.md"), path.join(leakDir, "SKILL.md"));
    const names = scan(project).map((s) => s.name).sort();
    expect(names).toEqual(["in-scope"]);
  });

  it("still sees an in-project symlink to another in-project skill dir", () => {
    if (!canSymlink()) return;
    const project = tmp("skillcrit-safety-inside-");
    writeSkill(path.join(project, ".agents", "skills", "ok"), "ok");
    fs.mkdirSync(path.join(project, ".cursor", "skills"), { recursive: true });
    fs.symlinkSync(
      path.join(project, ".agents", "skills", "ok"),
      path.join(project, ".cursor", "skills", "ok")
    );
    const skills = scan(project).filter((s) => s.name === "ok");
    expect(skills.length).toBeGreaterThanOrEqual(1);
    // macOS temp paths may use /var while the scanner returns /private/var.
    // Compare canonical containment, not the spelling of the path alias.
    for (const skill of skills) {
      const relative = path.relative(fs.realpathSync(project), fs.realpathSync(skill.skillFile));
      expect(path.isAbsolute(relative)).toBe(false);
      expect(relative === ".." || relative.startsWith(`..${path.sep}`)).toBe(false);
    }
  });

  it("does not pick up parent or sibling SKILL.md files", () => {
    const root = tmp("skillcrit-safety-scope-");
    const project = path.join(root, "project");
    writeSkill(path.join(root, "parent-skill"), "parent-skill");
    writeSkill(path.join(root, "sibling", "skills", "sib"), "sib");
    writeSkill(path.join(project, ".agents", "skills", "child"), "child");
    expect(scan(project).map((s) => s.name)).toEqual(["child"]);
  });

  it("without --user, does not walk $HOME or /etc", () => {
    const root = tmp("skillcrit-safety-home-");
    const project = path.join(root, "project");
    const home = path.join(root, "home");
    writeSkill(path.join(project, "skills", "proj"), "proj");
    writeSkill(path.join(home, ".claude", "skills", "home-one"), "home-one");
    writeSkill(path.join(home, "Documents", "secret"), "secret-home");
    const prevHome = process.env.SKILLCRIT_HOME;
    process.env.SKILLCRIT_HOME = home;
    try {
      const roots = collectRoots(project, [], false);
      expect(roots.some((r) => r === "/etc/codex/skills")).toBe(false);
      expect(roots.every((r) => r === project || r.startsWith(project + path.sep))).toBe(
        true
      );
      expect(scan(project).map((s) => s.name)).toEqual(["proj"]);
    } finally {
      if (prevHome === undefined) delete process.env.SKILLCRIT_HOME;
      else process.env.SKILLCRIT_HOME = prevHome;
    }
  });

  it("with --user, reads only documented home skill dirs, not Documents", () => {
    const root = tmp("skillcrit-safety-user-");
    const project = path.join(root, "project");
    const home = path.join(root, "home");
    writeSkill(path.join(project, "skills", "proj"), "proj");
    writeSkill(path.join(home, ".claude", "skills", "home-one"), "home-one");
    writeSkill(path.join(home, "Documents", "secret"), "secret-home");
    const prevHome = process.env.SKILLCRIT_HOME;
    process.env.SKILLCRIT_HOME = home;
    try {
      const roots = collectRoots(project, [], true);
      expect(roots.filter((r) => r.startsWith("/etc"))).toEqual(["/etc/codex/skills"]);
      expect(roots.some((r) => r.includes(`${path.sep}Documents`))).toBe(false);
      const names = scan(project, { user: true }).map((s) => s.name).sort();
      expect(names).toEqual(["home-one", "proj"]);
    } finally {
      if (prevHome === undefined) delete process.env.SKILLCRIT_HOME;
      else process.env.SKILLCRIT_HOME = prevHome;
    }
  });
});

describe("lint --fix never deletes or rewrites user files", () => {
  it("leaves package.json, .env, source, and skills byte-identical after scan/lint/--fix", async () => {
    const project = tmp("skillcrit-safety-immutable-");
    writeSkill(path.join(project, ".agents", "skills", "alpha"), "alpha");
    writeSkill(path.join(project, ".agents", "skills", "alpha-copy"), "alpha");
    fs.writeFileSync(
      path.join(project, "package.json"),
      JSON.stringify({ name: "app", version: "1.0.0" }, null, 2)
    );
    fs.writeFileSync(path.join(project, ".env"), "SECRET=do-not-delete\n");
    fs.mkdirSync(path.join(project, "src"), { recursive: true });
    fs.writeFileSync(path.join(project, "src", "index.js"), "export const n = 1;\n");
    fs.writeFileSync(path.join(project, "LICENSE"), "keep me\n");
    const before = snapshot(project);

    freezeUserTree(() => {
      const skills = scan(project);
      const report = lint(skills);
      expect(cleanupPlan(report)).toMatch(/Dry-run\. No skill files were deleted/);
    });

    const out = path.join(project, "skillcrit-cleanup.md");
    const result = await runCli(["lint", project, "--fix", "--out", out]);
    expect(result.stdout).toMatch(/Dry-run\. No skill files were deleted/);
    expect(result.stdout).toMatch(/\*\*Keep\*\*/);
    expect(result.stdout).toMatch(/\*\*Alternatives\*\*/);
    const after = snapshot(project);
    expect(after.files.filter((f) => f !== "skillcrit-cleanup.md").sort()).toEqual(
      before.files
    );
    expect(after.hashes["package.json"]).toBe(before.hashes["package.json"]);
    expect(after.hashes[".env"]).toBe(before.hashes[".env"]);
    expect(after.hashes["src/index.js"]).toBe(before.hashes["src/index.js"]);
    expect(after.hashes["LICENSE"]).toBe(before.hashes["LICENSE"]);
    expect(fs.readFileSync(out, "utf8")).toMatch(/\*\*Keep\*\*/);
    expect(fs.readFileSync(out, "utf8")).toMatch(/alpha/);
  });

  it("does not call unlink/rm/write during scan or lint --fix", async () => {
    const project = tmp("skillcrit-safety-nowrite-");
    writeSkill(path.join(project, "skills", "one"), "one");
    freezeUserTree(() => {
      scan(project);
      lint(scan(project));
    });
    const before = snapshot(project);
    await runCli(["lint", project, "--fix", "--out", "-"]);
    await runCli(["scan", project, "--json"]);
    expect(snapshot(project)).toEqual(before);
  });
});

describe("eval writes only under os.tmpdir", () => {
  it("does not change the pack or tasks tree", async () => {
    const tasksDir = path.join(repoRoot, "fixtures/tasks");
    const packDir = path.join(
      repoRoot,
      "fixtures/repos/stacked/.agents/skills/tdd-kit"
    );
    const beforePack = snapshot(packDir);
    const beforeTasks = snapshot(tasksDir);
    const writes: string[] = [];
    const track = (name: (typeof WRITE_FNS)[number]) => {
      const orig = (fs as unknown as Record<string, (...a: unknown[]) => unknown>)[name];
      if (typeof orig !== "function") return;
      vi.spyOn(fs, name as keyof typeof fs).mockImplementation((...args: unknown[]) => {
        const dest = name === "copyFileSync" ? args[1] : args[0];
        if (typeof dest === "string") writes.push(path.resolve(dest));
        return orig.apply(fs, args);
      });
    };
    for (const name of WRITE_FNS) track(name);

    await evalPack({ tasksDir, packDir, adapter: stubAdapter });

    expect(snapshot(packDir)).toEqual(beforePack);
    expect(snapshot(tasksDir)).toEqual(beforeTasks);
    const tmpRoot = fs.realpathSync(os.tmpdir());
    for (const dest of writes) {
      let real: string;
      try {
        real = fs.existsSync(dest) ? fs.realpathSync(dest) : dest;
      } catch {
        real = dest;
      }
      expect(
        real === tmpRoot || real.startsWith(tmpRoot + path.sep),
        `eval wrote outside tmp: ${real}`
      ).toBe(true);
      expect(real.startsWith(packDir)).toBe(false);
      expect(real.startsWith(tasksDir)).toBe(false);
    }
  });
});
