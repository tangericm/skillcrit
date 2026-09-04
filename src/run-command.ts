import {
  spawnSync,
  type SpawnSyncOptions,
  type SpawnSyncReturns
} from "node:child_process";

/**
 * spawnSync that can launch npm/npx on Windows.
 *
 * `npm` and `npx` are `.cmd` shims there. uv_spawn cannot execute `.cmd`
 * without a shell, so status comes back `null` and eval/CLI tests fail.
 */
export function runCommand(
  command: string,
  args: readonly string[] = [],
  options: SpawnSyncOptions = {}
): SpawnSyncReturns<string> {
  return spawnSync(command, [...args], {
    encoding: "utf8",
    windowsHide: true,
    ...options,
    shell: options.shell ?? process.platform === "win32"
  }) as SpawnSyncReturns<string>;
}
