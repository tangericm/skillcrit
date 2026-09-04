import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { main } from "../src/command.ts";
import { cleanupPlan, lint } from "../src/lint.ts";
import { scan } from "../src/scan.ts";
import type { SkillRecord } from "../src/types.ts";

const stacked = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/repos/stacked"
);

function rec(
  name: string,
  dir: string,
  extra: Partial<SkillRecord> = {}
): SkillRecord {
  return {
    name,
    skillDir: dir,
    skillFile: `${dir}/SKILL.md`,
    description: extra.description ?? `${name} skill for converting tables to RFC 4180 CSV only.`,
    body: extra.body ?? name,
    pack: extra.pack ?? null,
    version: extra.version ?? null,
    origin: extra.origin ?? "project",
    commands: extra.commands ?? [],
    hooks: extra.hooks ?? false,
    alwaysOn: extra.alwaysOn ?? false,
    descriptionTokens: extra.descriptionTokens ?? 1,
    alwaysOnTokens: extra.alwaysOnTokens ?? 1,
    specIssues: extra.specIssues ?? []
  };
}

async function run(args: string[]) {
  const captured = { stdout: "", stderr: "" };
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  const tap =
    (store: "stdout" | "stderr"): typeof process.stdout.write =>
    (chunk, encoding, cb) => {
      captured[store] += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      const done = typeof encoding === "function" ? encoding : cb;
      done?.();
      return true;
    };
  process.stdout.write = tap("stdout");
  process.stderr.write = tap("stderr");
  try {
    const status = await main(["node", "skillcrit", ...args]);
    return { status, ...captured };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

describe("cleanup markdown", () => {
  it("lists the super directory and orphan copies for duplicates", () => {
    const keep = rec("csv-transform", "/tmp/live", {
      origin: "project",
      version: "2.0.0",
      body: "same"
    });
    const orphan = rec("csv-transform", "/tmp/old-copy", {
      origin: "user",
      version: "2.0.0",
      body: "same"
    });
    const md = cleanupPlan(lint([keep, orphan]));
    expect(md).toMatch(/^# skillcrit cleanup/m);
    expect(md).toMatch(/dry-run/i);
    expect(md).toMatch(/\*\*Keep\*\*/);
    expect(md).toMatch(/\*\*Orphans\*\*/);
    expect(md).toMatch(/\/tmp\/live/);
    expect(md).toMatch(/\/tmp\/old-copy/);
    expect(md).toMatch(/project/);
    expect(md).toMatch(/identical copy/i);
    expect(md).not.toMatch(/no files deleted[\s\S]*rm /);
  });

  it("keeps the higher-rank version as super and labels the older orphan", () => {
    const md = cleanupPlan(
      lint([
        rec("csv-transform", "/tmp/v1", {
          version: "1.0.0",
          origin: "user",
          description: "v1 csv",
          body: "a"
        }),
        rec("csv-transform", "/tmp/v2", {
          version: "2.0.0",
          origin: "user",
          description: "v2 csv",
          body: "b"
        })
      ])
    );
    const keepAt = md.indexOf("/tmp/v2");
    const dropAt = md.indexOf("/tmp/v1");
    expect(keepAt).toBeGreaterThan(-1);
    expect(dropAt).toBeGreaterThan(-1);
    expect(keepAt).toBeLessThan(dropAt);
    expect(md).toMatch(/@2\.0\.0/);
    expect(md).toMatch(/older|@1\.0\.0/);
  });

  it("lists spec-error skill directories as orphans to review", () => {
    const md = cleanupPlan(lint(scan(stacked)));
    expect(md).toMatch(/## Spec errors/);
    expect(md).toMatch(/bad-name/);
  });

  it("writes only the markdown file and refuses to overwrite package.json", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-cleanup-doc-"));
    const out = path.join(dir, "skillcrit-cleanup.md");
    const pkg = path.join(dir, "package.json");
    fs.writeFileSync(pkg, '{"name":"app"}\n');
    const result = await run(["lint", stacked, "--fix", "--out", out]);
    expect(result.status).toBe(1);
    expect(fs.readFileSync(out, "utf8")).toMatch(/\*\*Keep\*\*/);
    expect(fs.readFileSync(out, "utf8")).toMatch(/\*\*Orphans\*\*/);
    expect(fs.readFileSync(pkg, "utf8")).toBe('{"name":"app"}\n');

    await expect(run(["lint", stacked, "--fix", "--out", pkg])).rejects.toThrow(
      /package\.json/
    );
    expect(fs.readFileSync(pkg, "utf8")).toBe('{"name":"app"}\n');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
