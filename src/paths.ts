import path from "node:path";

/**
 * How a file is printed once a scanned root is known.
 *
 * Paths under the root print relative with forward slashes: that is the form a
 * reader can paste, and the form SARIF upload and GitHub annotations compare
 * against the checkout — an absolute Windows path annotates nothing. Paths
 * outside the root have no repo-relative form and stay absolute, which is also
 * how a user-scope skill is distinguishable at a glance.
 */
export function displayPath(file: string, root: string | undefined): string {
  if (!root) return file;
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return file;
  return rel.split(path.sep).join("/");
}
