import os from "node:os";

/**
 * Home directory used to resolve user-scope skill roots.
 *
 * `SKILLCRIT_HOME` overrides it. The override exists because `os.homedir()`
 * reads `USERPROFILE` on Windows and `HOME` on POSIX, so there is no single
 * portable variable a caller can set to point skillcrit at another profile —
 * a CI fixture, a container image, or a support session auditing someone
 * else's install.
 */
export function homeDir(): string {
  const override = process.env.SKILLCRIT_HOME;
  if (override && override.trim()) return stripTrailingSep(override.trim());
  return os.homedir();
}

function stripTrailingSep(value: string): string {
  return value.replace(/[\\/]+$/, "") || value;
}
