import {
  spawnSync,
  type SpawnSyncOptions,
  type SpawnSyncReturns
} from "node:child_process";

/**
 * spawnSync that can launch npm/npx on Windows.
 *
 * `npm` and `npx` are `.cmd` shims there. uv_spawn cannot execute `.cmd`
 * without a shell, so status comes back `null`.
 *
 * Node DEP0190 forbids passing an args *array* when `shell` is true (the
 * pieces are concatenated unescaped). Flatten to one quoted command string
 * instead.
 */
export function runCommand(
  command: string,
  args: readonly string[] = [],
  options: SpawnSyncOptions = {}
): SpawnSyncReturns<string> {
  const shell = options.shell ?? process.platform === "win32";
  const base: SpawnSyncOptions = {
    encoding: "utf8",
    windowsHide: true,
    ...options,
    shell
  };

  if (shell) {
    const line = [command, ...args].map(quoteShellArg).join(" ");
    return spawnSync(line, base) as SpawnSyncReturns<string>;
  }

  return spawnSync(command, [...args], base) as SpawnSyncReturns<string>;
}

export function quoteShellArg(arg: string): string {
  if (process.platform === "win32") {
    if (arg.length === 0) return '""';
    if (!/[\s"&|<>^%()]/.test(arg)) return arg;
    return `"${arg.replace(/"/g, '""')}"`;
  }
  if (arg.length === 0) return "''";
  if (!/[^A-Za-z0-9_./:=-]/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}
