import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function packageVersion(): string {
  const pkgPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "package.json"
  );
  try {
    const json = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      version?: string;
    };
    return json.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
