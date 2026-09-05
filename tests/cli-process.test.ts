import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommand } from "../src/run-command.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "src/cli.ts");

describe("cli process entry", () => {
  it.each([
    ["scan", 0, true],
    ["lint", 1, true],
    ["doctor", 3, false]
  ] as const)("flushes a large piped %s report before exiting", (command, status, complete) => {
    const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-output-")));
    try {
      for (let i = 0; i < 256; i++) {
        const dir = path.join(project, "skills", `review-${i}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "SKILL.md"),
          `---\nname: review-${i}\ndescription: Review changes when asked.\nallowed-tools: Bash\n---\n` +
          "Review café changes carefully.\n".repeat(128));
      }
      if (!complete) {
        fs.mkdirSync(path.join(project, ...Array(11).fill("deep")), { recursive: true });
      }
      const result = runCommand(process.execPath,
        ["--import", "tsx", cli, command, project, "--json"],
        { cwd: root, shell: false, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(status);
      const report = JSON.parse(result.stdout);
      expect(Buffer.byteLength(result.stdout)).toBeGreaterThan(128 * 1024);
      expect(report.coverage.complete).toBe(complete);
      if (command === "scan") {
        expect(report.skills).toHaveLength(256);
        expect(report.skills.find((s: { name: string }) => s.name === "review-255").body)
          .toContain("Review café changes carefully.");
      } else {
        expect(report.scanned).toBe(256);
      }
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });

  it("prints usage when executed as a process", () => {
    const result = runCommand(
      process.execPath,
      ["--import", "tsx", cli, "--help"],
      { cwd: root, shell: false }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/skillcrit scan/);
  });

  it("scan writes inventory to stdout", () => {
    const stacked = path.join(root, "fixtures/repos/stacked");
    const result = runCommand(
      process.execPath,
      ["--import", "tsx", cli, "scan", stacked],
      { cwd: root, shell: false }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/tdd-kit/);
    expect(result.stdout).not.toBe("");
  });
});
