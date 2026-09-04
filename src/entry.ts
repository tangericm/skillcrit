import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * True when this module is the process entry point.
 * `file://${process.argv[1]}` is wrong on Windows: argv uses backslashes
 * (`C:\\foo\\cli.js`) while import.meta.url is `file:///C:/foo/cli.js`.
 */
export function isCliEntry(
  metaUrl: string,
  argv1: string | undefined
): boolean {
  if (!argv1) return false;
  try {
    return (
      path.normalize(fileURLToPath(metaUrl)) ===
      path.normalize(path.resolve(argv1))
    );
  } catch {
    return false;
  }
}
