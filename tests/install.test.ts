import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommand } from "../src/run-command.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
  name: string;
  version: string;
  description: string;
  license: string;
  bin: { skillcrit: string };
  engines: { node: string };
  files: string[];
};

describe("install surface", () => {
  it("ships a Node 22+ CLI pointing at dist/cli.js", () => {
    expect(pkg.name).toBe("skillcrit");
    expect(pkg.bin.skillcrit).toBe("./dist/cli.js");
    expect(pkg.engines.node).toMatch(/>=22/);
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "skills", "fixtures/tasks"]));
    expect(pkg.license).toBe("MIT");
  });

  it("has a valid skill and plugin manifests", () => {
    const skill = fs.readFileSync(path.join(root, "skills/skillcrit/SKILL.md"), "utf8");
    expect(skill).toMatch(/^---\nname: skillcrit\n/);
    expect(skill).toMatch(/^license: MIT$/m);
    expect(skill).toMatch(/skillcrit roots/);
    const skillLicense = fs.readFileSync(
      path.join(root, "skills/skillcrit/LICENSE"),
      "utf8"
    );
    const rootLicense = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
    expect(skillLicense).toBe(rootLicense);
    expect(rootLicense).toMatch(/MIT License/);
    expect(rootLicense).toMatch(/Copyright \(c\) 2026 Eric Tang/);
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    expect(readme).toMatch(/npx skills add tangericm\/skillcrit/);
    expect(readme).toMatch(/docs\/icon\.png/);
    expect(readme).toMatch(/docs\/logo\.svg|docs\/banner\.svg|docs\/badge\.svg/);
    expect(readme).toMatch(/\]\(docs\/badge\.svg\)|src="docs\/badge\.svg"/);
    expect(readme).toMatch(/skills\.sh\/tangericm\/skillcrit/);
    expect(readme).not.toMatch(/skills\.sh\/b\//);
    expect(readme).toMatch(/\[MIT\]\(LICENSE\)/);
    const logo = fs.readFileSync(path.join(root, "docs/logo.svg"), "utf8");
    const badge = fs.readFileSync(path.join(root, "docs/badge.svg"), "utf8");
    expect(logo).toMatch(/aria-label="skillcrit"/);
    expect(badge).toMatch(/aria-label="skillcrit"/);
    expect(logo).toMatch(/#c8ff3d/);
    expect(badge).toMatch(/#c8ff3d/);
    expect(badge).not.toMatch(/resource not found/i);
    expect(fs.existsSync(path.join(root, "docs/icon.png"))).toBe(true);
    expect(fs.statSync(path.join(root, "docs/icon.png")).size).toBeGreaterThan(1000);
    expect(pkg.description).toBe(
      "Audit installed agent skills, conflicts, and context costs."
    );
    expect(readme).not.toMatch(/durable session position/);
    const cursor = JSON.parse(
      fs.readFileSync(path.join(root, ".cursor-plugin/plugin.json"), "utf8")
    ) as { version: string; skills: string };
    expect(cursor.version).toBe(pkg.version);
    expect(cursor.skills).toBe("./skills/");
    const claude = JSON.parse(
      fs.readFileSync(path.join(root, ".claude-plugin/plugin.json"), "utf8")
    ) as { name: string; version?: string; license?: string };
    expect(claude.name).toBe("skillcrit");
    expect(claude.version).toBe(pkg.version);
    expect(claude.license).toBe("MIT");
    // The Agent Plugins 1.0 manifest does carry one, so it has to track.
    const agentPlugin = JSON.parse(
      fs.readFileSync(path.join(root, "plugin.json"), "utf8")
    ) as { name: string; version: string; description: string };
    expect(agentPlugin.name).toBe("skillcrit");
    expect(agentPlugin.version).toBe(pkg.version);
    expect(agentPlugin.description).toBe(pkg.description);
  });

  it("builds and the dist CLI scan/lint/eval/roots", () => {
    const build = runCommand("npm", ["run", "build"], { cwd: root });
    expect(build.status).toBe(0);
    const cli = path.join(root, "dist/cli.js");
    expect(fs.existsSync(cli)).toBe(true);
    const version = runCommand(process.execPath, [cli, "--version"], {
      cwd: root,
      shell: false
    });
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe(`skillcrit ${pkg.version}`);
    const stacked = path.join(root, "fixtures/repos/stacked");
    const scan = runCommand(process.execPath, [cli, "scan", stacked], {
      cwd: root,
      shell: false
    });
    expect(scan.status).toBe(0);
    expect(scan.stdout).toMatch(/tdd-kit/);
    const roots = runCommand(process.execPath, [cli, "roots", stacked], {
      cwd: root,
      shell: false
    });
    expect(roots.status).toBe(0);
    // roots prints native paths, so normalize separators before matching.
    expect(roots.stdout.replace(/\\/g, "/")).toMatch(/\.agents\/skills/);
    const lint = runCommand(process.execPath, [cli, "lint", stacked, "--fix", "--out", "-"], {
      cwd: root,
      shell: false
    });
    expect(lint.status).toBe(1);
    expect(lint.stdout).toMatch(/skillcrit summary/);
    const pack = path.join(stacked, ".agents/skills/tdd-kit");
    const ev = runCommand(
      process.execPath,
      [cli, "eval", pack, "--tasks", path.join(root, "fixtures/tasks"), "--agent", "stub"],
      { cwd: root, shell: false }
    );
    expect(ev.status).toBe(0);
    expect(ev.stdout).toMatch(/add-greet/);

    // Exercise the distributable outside the checkout, without a global CLI.
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-install-"));
    try {
      const packed = runCommand("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temp], {
        cwd: root, timeout: 30_000
      });
      expect(packed.status, packed.stderr).toBe(0);
      const archive = JSON.parse(packed.stdout)[0];
      expect(archive.files.some((f: { path: string }) => f.path === "docs/icon.png")).toBe(true);
      for (const reference of ["commands", "interpreting", "rules"]) {
        expect(archive.files.some((f: { path: string }) =>
          f.path === `skills/skillcrit/references/${reference}.md`
        )).toBe(true);
      }
      const installed = runCommand("npm", ["install", "--prefix", temp,
        path.join(temp, archive.filename), "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], {
        cwd: temp, timeout: 30_000
      });
      expect(installed.status, installed.stderr).toBe(0);
      const installedRoot = path.join(temp, "node_modules/skillcrit");
      const installedCli = path.join(installedRoot, "dist/cli.js");
      const project = path.join(temp, "project");
      fs.mkdirSync(project);
      fs.cpSync(path.join(installedRoot, "skills/skillcrit"),
        path.join(project, ".agents/skills/skillcrit"), { recursive: true });
      const audit = runCommand(process.execPath, [installedCli, "doctor", ".", "--json"], {
        cwd: project, shell: false,
        env: { ...process.env, SKILLCRIT_HOME: path.join(temp, "empty-home") }
      });
      expect(audit.status, audit.stderr).toBe(0);
      const report = JSON.parse(audit.stdout);
      expect(report.runtimeResolution).toBe("unknown");
      expect(report.recommendations[0].name).toBe("skillcrit");
      expect(report).not.toHaveProperty("loaded");
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }, 60_000);
});
