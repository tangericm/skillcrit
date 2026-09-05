import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { readInventoryText } from "../src/read.ts";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
it("rejects non-regular paths before opening and uses nonblocking descriptor validation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-read-"));
  dirs.push(dir);
  const file = path.join(dir, "data.txt");
  fs.writeFileSync(file, "hello");
  const open = vi.spyOn(fs, "openSync");
  expect(() => readInventoryText(dir)).toThrow(/regular/);
  expect(open).not.toHaveBeenCalled();
  expect(readInventoryText(file)).toBe("hello");
  expect(open).toHaveBeenCalledWith(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
});
