import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { matchesIgnore, matchesIgnoredDirectory } from "./config.js";

export const FILE_COMPARISON_LIMITS = { files: 128, entries: 1024, depth: 3, fileBytes: 512 * 1024, totalBytes: 8 * 1024 * 1024 } as const;
export type FileComparison = {
  left: string; right: string; status: "equal-inspected" | "different" | "unknown";
  complete: boolean; inspectedFiles: { left: number; right: number }; differences: string[]; reasons: string[];
  scope: string;
};
type Inventory = { files: Map<string, { hash: string; mode: number }>; reasons: string[] };

/** Read-only comparison of bounded regular-file bytes and POSIX mode bits; never a deletion recommendation. */
export function compareSkillFiles(left: string, right: string, ignore: string[] = []): FileComparison {
  const a = inspect(left, ignore); const b = inspect(right, ignore);
  const differences: string[] = [];
  for (const file of [...new Set([...a.files.keys(), ...b.files.keys()])].sort()) {
    const x = a.files.get(file); const y = b.files.get(file);
    if (!x || !y) {
      const missing = x ? b : a;
      // An incomplete traversal cannot establish absence.
      if (missing.reasons.length === 0) differences.push(`${file}: only in ${x ? "left" : "right"}`);
      continue;
    }
    if (x.hash !== y.hash) differences.push(`${file}: bytes differ`);
    if (x.mode !== y.mode) differences.push(`${file}: permissions differ`);
  }
  const reasons = [...a.reasons.map(r => `left: ${r}`), ...b.reasons.map(r => `right: ${r}`)];
  const complete = reasons.length === 0;
  return { left, right, status: differences.length ? "different" : complete ? "equal-inspected" : "unknown", complete,
    inspectedFiles: { left: a.files.size, right: b.files.size }, differences, reasons,
    scope: "Regular-file bytes and POSIX permission bits within limits; no symlinks, ignored content, ACLs, external dependencies or runtime enablement. Equality is not a deletion recommendation." };
}
function inspect(root: string, ignore: string[]): Inventory {
  const out: Inventory = { files: new Map(), reasons: [] };
  let entriesSeen = 0; let bytesRead = 0; let filesSeen = 0;
  const limits = FILE_COMPARISON_LIMITS;
  const reason = (text: string) => { if (out.reasons.length < limits.entries) out.reasons.push(text); };
  function walk(dir: string, depth: number): void {
    const rel = path.relative(root, dir).replace(/\\/g, "/") || ".";
    if (depth > limits.depth) { reason(`${rel}: depth limit ${limits.depth}`); return; }
    if (matchesIgnoredDirectory(dir, ignore)) { reason(`${rel}: ignored directory`); return; }
    let entries: fs.Dirent[];
    try {
      if (!fs.lstatSync(dir).isDirectory()) { reason(`${rel}: symlink or non-directory`); return; }
      if (fs.realpathSync(dir) !== dir) { reason(`${rel}: symlinked directory path`); return; }
      entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch { reason(`${rel}: unreadable directory`); return; }
    for (const entry of entries) {
      if (++entriesSeen > limits.entries) { reason(`entry limit ${limits.entries}`); return; }
      const file = path.join(dir, entry.name); const name = path.relative(root, file).replace(/\\/g, "/");
      if (matchesIgnore(file, ignore) || entry.name === ".git" || entry.name === "node_modules") { reason(`${name}: ignored content`); continue; }
      if (entry.isDirectory()) { walk(file, depth + 1); continue; }
      if (!entry.isFile()) { reason(`${name}: symlink or non-regular file`); continue; }
      if (++filesSeen > limits.files) { reason(`file limit ${limits.files}`); return; }
      let fd: number | undefined;
      try {
        if (fs.realpathSync(file) !== file) throw new Error("symlinked path");
        const before = fs.lstatSync(file);
        if (!before.isFile()) throw new Error("not a regular file");
        fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | (fs.constants.O_NOFOLLOW ?? 0));
        const stat = fs.fstatSync(fd);
        if (fs.realpathSync(file) !== file) throw new Error("path changed during inspection");
        if (!stat.isFile() || stat.ino !== before.ino || stat.dev !== before.dev) throw new Error("file changed during inspection");
        if (stat.size > limits.fileBytes || bytesRead + stat.size > limits.totalBytes) throw new Error("byte limit exceeded");
        const buffer = Buffer.allocUnsafe(Math.min(limits.fileBytes, limits.totalBytes - bytesRead) + 1);
        let count = 0;
        while (count < buffer.length) { const n = fs.readSync(fd, buffer, count, buffer.length - count, count); if (!n) break; count += n; }
        bytesRead += count;
        if (count > limits.fileBytes || bytesRead > limits.totalBytes) throw new Error("byte limit exceeded");
        const after = fs.fstatSync(fd);
        const finalPath = fs.lstatSync(file);
        if (finalPath.ino !== stat.ino || finalPath.dev !== stat.dev || fs.realpathSync(file) !== file) throw new Error("path changed during inspection");
        if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.mode !== stat.mode) throw new Error("file changed during inspection");
        out.files.set(name, { hash: createHash("sha256").update(buffer.subarray(0, count)).digest("hex"), mode: stat.mode & 0o7777 });
      } catch (error) { reason(`${name}: ${String(error)}`); }
      finally { if (fd !== undefined) fs.closeSync(fd); }
    }
  }
  try {
    if (!fs.lstatSync(root).isDirectory()) { reason("root is a symlink or non-directory"); return out; }
    root = fs.realpathSync(root);
  } catch { reason("unreadable root directory"); return out; }
  walk(root, 0); return out;
}
