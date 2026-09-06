import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { scanRisks } from "../src/risk.ts";
const roots: string[] = [];
function dir() { const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-comment-")); roots.push(root); return root; }
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
it("suppresses explicit shell comments but retains active commands and unknown code fences", () => {
  const root = dir();
  expect(scanRisks(root, "```sh\n# rm -rf scratch\n```\n")).toEqual([]);
  expect(scanRisks(root, "```sh\nrm -rf scratch # remove temporary data\n```\n").some(f => f.id === "SC4004")).toBe(true);
  expect(scanRisks(root, "```\n# rm -rf scratch\n```\n").some(f => f.id === "SC4004")).toBe(true);
});
it("suppresses JavaScript standalone comments but retains active code and ambiguous multiline contexts", () => {
  const root = dir(); const file = path.join(root, "run.js");
  fs.writeFileSync(file, '// fetch("https://example.test")\n'); expect(scanRisks(root, "")).toEqual([]);
  fs.writeFileSync(file, 'fetch("https://example.test") // active\n'); expect(scanRisks(root, "").some(f => f.id === "SC4001")).toBe(true);
  fs.writeFileSync(file, 'const source = `\n// fetch("https://example.test")\n`;\n'); expect(scanRisks(root, "").some(f => f.id === "SC4001")).toBe(true);
});
it("retains signals in multiline strings and JavaScript template strings inside fences", () => {
  const root = dir();
  expect(scanRisks(root, "```sh\nsource='\n# rm -rf scratch\n'\n```\n").some(f => f.id === "SC4004")).toBe(true);
  expect(scanRisks(root, '```js\nconst source = `\n// fetch("https://example.test")\n`;\n```\n').some(f => f.id === "SC4001")).toBe(true);
});
it("retains ambiguity in languages with unsupported custom string delimiters", () => {
  const root = dir(); fs.writeFileSync(path.join(root, "run.pl"), "my $source = q{\n# rm -rf scratch\n};\n");
  expect(scanRisks(root, "").some(f => f.id === "SC4004")).toBe(true);
});
