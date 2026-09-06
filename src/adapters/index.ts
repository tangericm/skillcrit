import type { Adapter } from "../types.js";
import { stubAdapter } from "./stub.js";

/**
 * Adapter registry. `skillcrit eval` is experimental: only the synthetic
 * fixture-replay adapter ships today, so the command can prove the harness
 * works end to end but cannot yet answer "does this skill improve outcomes".
 * Live adapters land behind this same interface.
 */
export const ADAPTERS: Record<string, Adapter> = {
  stub: stubAdapter
};

/** Adapters named but not yet implemented, with the reason, for honest errors. */
export const PLANNED_ADAPTERS: Record<string, string> = {
  claude: "needs an isolated Claude Code run per trial and a token/duration capture",
  codex: "needs an isolated Codex run per trial and a token/duration capture"
};

export function resolveAdapter(name: string): Adapter {
  const key = name || "stub";
  const adapter = ADAPTERS[key];
  if (adapter) return adapter;
  const planned = PLANNED_ADAPTERS[key];
  if (planned) {
    throw new Error(
      `adapter "${key}" is not implemented yet (${planned}). Available: ${Object.keys(ADAPTERS).join(", ")}`
    );
  }
  throw new Error(
    `unknown adapter "${key}". Available: ${Object.keys(ADAPTERS).join(", ")}`
  );
}

export function formatAdapters(): string {
  const lines = ["# skillcrit eval adapters", ""];
  for (const [name, adapter] of Object.entries(ADAPTERS)) {
    const kind = adapter.synthetic ? "synthetic" : "live";
    lines.push(`${name.padEnd(8)} ${kind.padEnd(10)} ${adapter.summary}`);
  }
  for (const [name, why] of Object.entries(PLANNED_ADAPTERS)) {
    lines.push(`${name.padEnd(8)} ${"planned".padEnd(10)} ${why}`);
  }
  lines.push("");
  return lines.join("\n");
}

export { stubAdapter };
