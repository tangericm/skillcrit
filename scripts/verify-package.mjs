#!/usr/bin/env node
// Verify the distributable in an isolated consumer. Run after npm run build.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const source = fileURLToPath(new URL("../", import.meta.url));
const version = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8")).version;
const npmCli = process.env.npm_execpath;
assert.ok(npmCli && fs.existsSync(npmCli), "Run with npm run verify:package");
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-package-")));
const env = { ...process.env, SKILLCRIT_HOME: path.join(root, "empty-home") };
function run(cwd, args, status = 0) {
  const result = spawnSync(process.execPath, args, {
    cwd, env, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024
  });
  assert.ifError(result.error);
  assert.equal(result.status, status, result.stderr || result.stdout);
  return result.stdout;
}
function hash(file) { return createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
try {
  const [pack] = JSON.parse(run(source, [npmCli, "pack", "--json", "--ignore-scripts", "--pack-destination", root]));
  const files = pack.files.map(file => file.path);
  for (const required of ["dist/cli.js", "dist/index.d.ts", "skills/skillcrit/SKILL.md",
    "skills/skillcrit/LICENSE", "skills/skillcrit/references/commands.md", "docs/icon.png",
    "README.md", "LICENSE", "SECURITY.md", "scripts/simulate.mjs"]) {
    assert.ok(files.includes(required), `Missing package file: ${required}`);
  }
  assert.ok(files.every(file => !/^(?:node_modules|output|docs\/superpowers)\//u.test(file)),
    "Package contains local work output; use a clean source checkout");
  const parentPackage = path.join(root, "package.json");
  fs.writeFileSync(parentPackage, JSON.stringify({ name: "unrelated-parent-project", private: true }));
  const parentBefore = hash(parentPackage);
  const consumer = path.join(root, "consumer café space");
  fs.mkdirSync(consumer);
  // Follow the pilot guide from an empty folder. npm init rejects Unicode
  // package names; an explicit prefix also avoids installing into an ancestor.
  run(consumer, [npmCli, "install", "--prefix", ".", "--save-dev", "--save-exact", "--ignore-scripts", "--no-audit", "--no-fund", path.join(root, pack.filename)]);
  run(consumer, [npmCli, "ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
  assert.equal(hash(parentPackage), parentBefore);
  assert.equal(fs.existsSync(path.join(root, "node_modules")), false);
  assert.equal(fs.existsSync(path.join(root, "package-lock.json")), false);
  const installed = path.join(consumer, "node_modules", "skillcrit");
  const cli = path.join(installed, "dist", "cli.js");
  assert.equal(run(consumer, [npmCli, "exec", "--offline", "--", "skillcrit", "--version"]).trim(), `skillcrit ${version}`);
  assert.equal(run(consumer, ["--input-type=module", "-e",
    "import {packageVersion} from 'skillcrit'; console.log(packageVersion());"]).trim(), version);

  const project = path.join(root, "project café space");
  const skill = path.join(project, ".agents", "skills", "review", "SKILL.md");
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.writeFileSync(skill, "---\nname: review\ndescription: Review changes when asked.\nallowed-tools: Read\n---\nReview café changes carefully.\n");
  const before = hash(skill);
  const doctor = JSON.parse(run(consumer, [cli, "doctor", project, "--json"]));
  assert.equal(doctor.scanned, 1);
  assert.equal(doctor.coverage.complete, true);
  assert.equal(doctor.runtimeResolution, "unknown");
  const sarif = JSON.parse(run(consumer, [cli, "lint", project, "--format", "sarif"]));
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs.length, 1);
  const out = path.join(project, "cleanup.md");
  run(consumer, [cli, "lint", project, "--fix", "--out", out]);
  const original = hash(out);
  run(consumer, [cli, "lint", project, "--fix", "--out", out], 3);
  assert.equal(hash(out), original);
  assert.equal(hash(skill), before);
  const simulations = JSON.parse(run(consumer, [path.join(installed, "scripts", "simulate.mjs")]));
  assert.equal(simulations.passed, simulations.total);
  assert.ok(simulations.total >= 19);
  process.stdout.write(JSON.stringify({ version, node: process.version, platform: process.platform,
    packageFiles: files.length, npmIntegrity: pack.integrity, isolatedInstall: true, lockfileReinstall: true,
    firstTimeInstallFromEmptyFolder: true, ancestorProjectUnchanged: true,
    executableAndLibraryImports: true, unicodePaths: true, doctorAndSarif: true,
    existingExportPreserved: true, skillUnchanged: true, simulations }, null, 2) + "\n");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
