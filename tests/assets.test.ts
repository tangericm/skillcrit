import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");
const svgs = fs.readdirSync(docs).filter((f) => f.endsWith(".svg"));

describe("brand assets", () => {
  it("ships the SVGs the README references", () => {
    expect(svgs.sort()).toEqual(["badge.svg", "banner.svg", "logo.svg"]);
    expect(fs.statSync(path.join(docs, "icon.png")).size).toBeGreaterThan(0);
  });

  for (const file of svgs) {
    describe(file, () => {
      const svg = fs.readFileSync(path.join(docs, file), "utf8");

      it("has no replacement characters", () => {
        // U+FFFD means a glyph was lost in an earlier encoding round-trip;
        // it renders as a black diamond in the README.
        expect(svg.includes("�")).toBe(false);
      });

      it("scales and is labelled", () => {
        expect(svg).toMatch(/<svg[^>]*viewBox="/);
        expect(svg).toMatch(/<title>/);
        expect(svg).toMatch(/aria-label="|role="img"/);
      });

      it("embeds no remote references", () => {
        expect(svg).not.toMatch(/<image[^>]+href="https?:/);
        expect(svg).not.toMatch(/<script/);
      });
    });
  }
});
