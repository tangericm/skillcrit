import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isCliEntry } from "../src/entry.ts";

describe("isCliEntry", () => {
  it("matches import.meta.url to a resolved argv[1]", () => {
    const argv1 = fileURLToPath(import.meta.url);
    expect(isCliEntry(import.meta.url, argv1)).toBe(true);
  });

  it("matches a relative argv[1] from cwd", () => {
    const abs = fileURLToPath(import.meta.url);
    const rel = path.relative(process.cwd(), abs);
    expect(isCliEntry(import.meta.url, rel)).toBe(true);
  });

  it("rejects a different file", () => {
    expect(isCliEntry(import.meta.url, path.resolve("package.json"))).toBe(
      false
    );
  });

  it("does not treat file://${argv} as equal to a file URL with backslashes", () => {
    const winPath = "C:\\Users\\etang\\cli.js";
    expect(`file://${winPath}`).not.toBe(pathToFileURL(winPath).href);
  });
});
