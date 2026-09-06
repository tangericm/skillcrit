import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { collectRoots, listSkillLocations } from "./roots.js";
import { packageVersion } from "./version.js";
import type { ScanCoverage } from "./types.js";

export function setupDiagnostics(root: string, scanned: number, coverage: ScanCoverage, expectedVersion?: string, user = false) {
  const version = packageVersion();
  return { version, expectedVersion: expectedVersion ?? null, versionMatches: expectedVersion ? version === expectedVersion : null,
    nodeVersion: process.version, nodeExecutable: process.execPath, cliLocation: fileURLToPath(new URL(fs.existsSync(new URL("./cli.js", import.meta.url)) ? "./cli.js" : "./cli.ts", import.meta.url)),
    root: path.resolve(root), scope: user ? "project-and-user" : "project", scanned, coverage,
    scanRoots: [...new Set(collectRoots(path.resolve(root), [], user))].map(p => ({ path: p, exists: fs.existsSync(p) })),
    locations: listSkillLocations(path.resolve(root), { user }), runtimeResolution: "unknown" as const,
    notes: ["Filesystem discovery does not establish client loading or plugin enablement.",
      ...(scanned === 0 ? ["No skills found in the requested scan scope."] : [])] };
}
export function formatSetup(report: ReturnType<typeof setupDiagnostics>): string {
  return [`skillcrit setup`, `CLI: ${report.version} at ${report.cliLocation}`, `Node: ${report.nodeVersion} at ${report.nodeExecutable}`,
    ...(report.expectedVersion ? [`Expected CLI: ${report.expectedVersion} — ${report.versionMatches ? "matches" : "MISMATCH"}`] : []),
    `${report.scanned} skills found (${report.scope}); runtime selection: unknown`, ...report.notes,
    ...report.locations.filter(l => l.exists).map(l => `${l.harness} ${l.scope}: ${l.path}`),
    ...report.scanRoots.filter(r => r.exists && !report.locations.some(l => l.path === r.path)).map(r => `Scan root: ${r.path}`),
    ...report.coverage.reasons.map(r => `Incomplete scan: ${r}`), ""].join("\n");
}
