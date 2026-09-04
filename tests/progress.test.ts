import { describe, expect, it } from "vitest";
import { createProgress } from "../src/progress.ts";

describe("progress", () => {
  it("is silent when disabled", () => {
    let out = "";
    const stream = { write: (chunk: string) => { out += chunk; return true; } };
    const progress = createProgress(false, stream as unknown as NodeJS.WritableStream);
    progress.phase("scan");
    progress.tick("scan", 3, 10);
    progress.done("ok");
    expect(out).toBe("");
  });

  it("writes a status bar and a done line when enabled", () => {
    let out = "";
    const stream = { write: (chunk: string) => { out += chunk; return true; } };
    const progress = createProgress(true, stream as unknown as NodeJS.WritableStream);
    progress.phase("scan");
    progress.tick("scan", 8, 16);
    progress.done("scanned 16 skills");
    expect(out).toMatch(/\[skillcrit\] scan/);
    expect(out).toMatch(/8\/16/);
    expect(out).toMatch(/\[skillcrit\] scanned 16 skills\n/);
  });
});
