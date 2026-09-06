import fs from "node:fs";
import path from "node:path";

const BLOCKED_OUT = new Set(["skill.md", "package.json", ".env", "license"]);

export function writeNewFile(out: string, content: string, label = "history"): void {
  const resolved = path.resolve(out);
  const basename = path.basename(resolved);
  const base = (process.platform === "win32" ? basename.replace(/[. ]+$/u, "") : basename).toLowerCase();
  if (process.platform === "win32") {
    const withoutRoot = resolved.slice(path.parse(resolved).root.length);
    if (withoutRoot.includes(":")) {
      throw new Error(`${label} output must be a standalone file, not an NTFS alternate data stream`);
    }
    if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(base)) {
      throw new Error(`${label} output must be a file, not a reserved Windows device name`);
    }
  }
  if (BLOCKED_OUT.has(base)) {
    throw new Error(`refusing to write ${label} doc over ${path.basename(resolved)}`);
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(resolved), ".skillcrit-report-"));
  try {
    const staged = path.join(staging, "report.md");
    fs.writeFileSync(staged, content, { flag: "wx", mode: 0o600 });
    // Publish a completed file without following or replacing the destination.
    // Windows exclusive-open can follow dangling links; link creation cannot.
    fs.linkSync(staged, resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`${label} output already exists: ${resolved}; choose a new path${label === "cleanup" ? " or use --out -" : ""}`);
    }
    throw new Error(`could not safely create ${label} output: ${String(error)}${label === "cleanup" ? "; use --out - for stdout" : ""}`);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
