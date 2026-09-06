import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { runCli } from "./support/cli.ts";
const roots: string[] = [];
function copies() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-compare-")); roots.push(root);
  const dirs = ["a", "b"].map(x => path.join(root, x, "sample"));
  dirs.forEach(dir => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "SKILL.md"), "---\nname: sample\ndescription: Convert special tables into binary output.\n---\nRead the input.\n"); });
  return { root, dirs };
}
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
it("compares supporting bytes and permissions without claiming full package equivalence", async () => {
  const { root, dirs } = copies(); dirs.forEach(dir => fs.writeFileSync(path.join(dir, "asset.bin"), Buffer.from([0xff, 0x00])));
  let result = await runCli(["doctor", root, "--compare-files", "--json"]);
  expect(result.status).toBe(0);
  let comparison = JSON.parse(result.stdout).recommendations[0].fileComparisons[0];
  expect(comparison.status).toBe("equal-inspected"); expect(comparison.complete).toBe(true);
  fs.writeFileSync(path.join(dirs[1], "asset.bin"), Buffer.from([0xfe, 0x00]));
  result = await runCli(["doctor", root, "--compare-files", "--json"]);
  comparison = JSON.parse(result.stdout).recommendations[0].fileComparisons[0];
  expect(comparison.status).toBe("different"); expect(comparison.differences).toContain("asset.bin: bytes differ");
});
it("does not call ignored, symlinked, oversized or deep supporting files equal", async () => {
  const { root, dirs } = copies();
  fs.writeFileSync(path.join(root, ".skillcrit.json"), JSON.stringify({ ignore: ["**/secret.bin"] }));
  dirs.forEach(dir => {
    fs.writeFileSync(path.join(dir, "secret.bin"), "uninspected");
    fs.writeFileSync(path.join(dir, "large.bin"), Buffer.alloc(512 * 1024 + 1));
    fs.mkdirSync(path.join(dir, "a/b/c/d"), { recursive: true });
  });
  const result = await runCli(["doctor", root, "--compare-files", "--json"]);
  expect(result.status).toBe(3);
  const comparison = JSON.parse(result.stdout).recommendations[0].fileComparisons[0];
  expect(comparison.status).toBe("unknown"); expect(comparison.complete).toBe(false);
  expect(comparison.reasons.join(" ")).toMatch(/ignored/); expect(comparison.reasons.join(" ")).toMatch(/limit/);
});

it.skipIf(process.platform === "win32")("compares SKILL.md permission bits and leaves symlinks uninspected", async () => {
  const { root, dirs } = copies();
  fs.chmodSync(path.join(dirs[0], "SKILL.md"), 0o600); fs.chmodSync(path.join(dirs[1], "SKILL.md"), 0o644);
  let report = JSON.parse((await runCli(["doctor", root, "--compare-files", "--json"])).stdout);
  expect(report.recommendations[0].fileComparisons[0].differences).toContain("SKILL.md: permissions differ");
  fs.chmodSync(path.join(dirs[1], "SKILL.md"), 0o2600);
  report = JSON.parse((await runCli(["doctor", root, "--compare-files", "--json"])).stdout);
  expect(report.recommendations[0].fileComparisons[0].differences).toContain("SKILL.md: permissions differ");
  fs.chmodSync(path.join(dirs[1], "SKILL.md"), 0o600);
  const outside = path.join(root, "outside.bin"); fs.writeFileSync(outside, "not inspected");
  dirs.forEach(dir => fs.symlinkSync(outside, path.join(dir, "linked.bin")));
  const result = await runCli(["doctor", root, "--compare-files", "--json"]); report = JSON.parse(result.stdout);
  expect(result.status).toBe(3); expect(report.recommendations[0].fileComparisons[0].status).toBe("unknown");
  expect(report.recommendations[0].fileComparisons[0].inspectedFiles).toEqual({ left: 1, right: 1 });
});

it("reports missing supporting files as differences and file-count limits as unknowns", async () => {
  const { root, dirs } = copies(); fs.writeFileSync(path.join(dirs[0], "one.bin"), "one");
  let report = JSON.parse((await runCli(["doctor", root, "--compare-files", "--json"])).stdout);
  expect(report.recommendations[0].fileComparisons[0].differences.join(" ")).toMatch(/one.bin: only in/);
  dirs.forEach(dir => { for (let i = 0; i < 129; i++) fs.writeFileSync(path.join(dir, `${i}.bin`), "same"); });
  const result = await runCli(["doctor", root, "--compare-files", "--json"]); report = JSON.parse(result.stdout);
  expect(result.status).toBe(3); expect(report.recommendations[0].fileComparisons[0].complete).toBe(false);
  expect(report.recommendations[0].fileComparisons[0].reasons.join(" ")).toMatch(/file limit/);
});
